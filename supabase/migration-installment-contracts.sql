-- CRED • Migration segura para contratos parcelados
-- Execute uma vez no SQL Editor do projeto Supabase já usado pelo CRED.
-- É idempotente e preserva contratos, pagamentos e parcelas existentes.

begin;

create extension if not exists pgcrypto;

-- =========================================================
-- 1. CONTRATO PRINCIPAL E ESTRUTURA DE PARCELAS
-- =========================================================

do $migration$
declare
  loan_id_type text;
  installment_contract_id_type text;
  installment_user_id_type text;
  existing_rows bigint;
  contract_id_attnum smallint;
  constraint_row record;
begin
  if to_regclass('public.emprestimos') is null then
    raise exception 'public.emprestimos não existe. Execute esta migration somente no banco atual do CRED.';
  end if;

  select format_type(a.atttypid, a.atttypmod)
    into loan_id_type
  from pg_attribute a
  where a.attrelid = 'public.emprestimos'::regclass
    and a.attname = 'id'
    and not a.attisdropped;

  if loan_id_type not in ('uuid', 'bigint', 'integer') then
    raise exception 'Tipo incompatível em public.emprestimos.id: %. Esperado UUID, BIGINT ou INTEGER.', loan_id_type;
  end if;

  alter table public.emprestimos
    add column if not exists contract_type text default 'normal';

  update public.emprestimos
  set contract_type = 'normal'
  where contract_type is null;

  if exists (
    select 1
    from public.emprestimos
    where contract_type not in ('normal', 'installment')
  ) then
    raise exception 'Existem valores inválidos em public.emprestimos.contract_type. Corrija-os antes de continuar.';
  end if;

  alter table public.emprestimos
    alter column contract_type set default 'normal',
    alter column contract_type set not null;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.emprestimos'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%contract_type%'
      and pg_get_constraintdef(c.oid) ilike '%normal%'
      and pg_get_constraintdef(c.oid) ilike '%installment%'
  ) then
    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.emprestimos'::regclass
        and conname = 'emprestimos_contract_type_check'
    ) then
      raise exception 'A constraint emprestimos_contract_type_check existe, mas não possui a regra esperada.';
    end if;

    alter table public.emprestimos
      add constraint emprestimos_contract_type_check
      check (contract_type in ('normal', 'installment'));
  end if;

  if to_regclass('public.installments') is null then
    execute format(
      'create table public.installments (
        id uuid primary key default gen_random_uuid(),
        contract_id %s not null,
        user_id uuid not null,
        installment_number integer not null,
        amount numeric(14,2) not null,
        due_date date not null,
        paid_at timestamptz,
        status text not null default ''A vencer'',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )',
      loan_id_type
    );
  else
    select count(*) into existing_rows from public.installments;

    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'id' and not attisdropped
    ) then
      alter table public.installments add column id uuid default gen_random_uuid();
      update public.installments set id = gen_random_uuid() where id is null;
      alter table public.installments alter column id set not null;
    end if;

    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'contract_id' and not attisdropped
    ) then
      if existing_rows > 0 then
        raise exception 'public.installments possui registros, mas não possui contract_id. Nenhum dado foi alterado.';
      end if;
      execute format('alter table public.installments add column contract_id %s', loan_id_type);
    else
      select format_type(a.atttypid, a.atttypmod), a.attnum
        into installment_contract_id_type, contract_id_attnum
      from pg_attribute a
      where a.attrelid = 'public.installments'::regclass
        and a.attname = 'contract_id'
        and not a.attisdropped;

      if installment_contract_id_type <> loan_id_type then
        if existing_rows > 0 then
          raise exception 'Tipo incompatível: installments.contract_id é %, mas emprestimos.id é %. A tabela possui dados e não será convertida automaticamente.', installment_contract_id_type, loan_id_type;
        end if;

        for constraint_row in
          select c.conname
          from pg_constraint c
          where c.conrelid = 'public.installments'::regclass
            and contract_id_attnum = any(c.conkey)
        loop
          execute format('alter table public.installments drop constraint %I', constraint_row.conname);
        end loop;

        execute 'alter table public.installments alter column contract_id drop default';
        execute format(
          'alter table public.installments alter column contract_id type %s using null::%s',
          loan_id_type,
          loan_id_type
        );
      end if;
    end if;

    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'user_id' and not attisdropped
    ) then
      alter table public.installments add column user_id uuid;
      update public.installments i
      set user_id = e.user_id
      from public.emprestimos e
      where e.id = i.contract_id;
    else
      select format_type(a.atttypid, a.atttypmod)
        into installment_user_id_type
      from pg_attribute a
      where a.attrelid = 'public.installments'::regclass
        and a.attname = 'user_id'
        and not a.attisdropped;

      if installment_user_id_type <> 'uuid' then
        raise exception 'Tipo incompatível em public.installments.user_id: %. Esperado UUID.', installment_user_id_type;
      end if;
    end if;

    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'installment_number' and not attisdropped
    ) then
      if existing_rows > 0 then
        raise exception 'public.installments possui registros, mas não possui installment_number. Nenhum número será inventado.';
      end if;
      alter table public.installments add column installment_number integer;
    end if;

    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'amount' and not attisdropped
    ) then
      if existing_rows > 0 then
        raise exception 'public.installments possui registros, mas não possui amount. Nenhum valor será inventado.';
      end if;
      alter table public.installments add column amount numeric(14,2);
    end if;

    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'due_date' and not attisdropped
    ) then
      if existing_rows > 0 then
        raise exception 'public.installments possui registros, mas não possui due_date. Nenhuma data será inventada.';
      end if;
      alter table public.installments add column due_date date;
    end if;

    alter table public.installments
      add column if not exists paid_at timestamptz,
      add column if not exists status text default 'A vencer',
      add column if not exists created_at timestamptz default now(),
      add column if not exists updated_at timestamptz default now();
  end if;
end
$migration$;

-- Completa apenas dados técnicos determinísticos; nunca inventa dono, contrato,
-- valor, número ou vencimento.
update public.installments
set created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now()),
    status = case
      when paid_at is not null then 'Paga'
      when due_date < current_date then 'Atrasada'
      when due_date = current_date then 'Vence hoje'
      else 'A vencer'
    end;

do $validate$
begin
  if exists (
    select 1 from public.installments
    where id is null
       or contract_id is null
       or user_id is null
       or installment_number is null
       or amount is null
       or due_date is null
  ) then
    raise exception 'Há parcelas incompletas em public.installments. A migration foi cancelada sem apagar dados.';
  end if;

  if exists (select 1 from public.installments where installment_number <= 0) then
    raise exception 'Há números de parcela inválidos (<= 0) em public.installments.';
  end if;

  if exists (select 1 from public.installments where amount <= 0) then
    raise exception 'Há valores de parcela inválidos (<= 0) em public.installments.';
  end if;

  if exists (
    select 1
    from public.installments i
    left join public.emprestimos e on e.id = i.contract_id
    where e.id is null
  ) then
    raise exception 'Há parcelas sem contrato principal correspondente.';
  end if;

  if exists (
    select 1
    from public.installments i
    join public.emprestimos e on e.id = i.contract_id
    where i.user_id is distinct from e.user_id
  ) then
    raise exception 'Há parcelas cujo user_id não corresponde ao dono do contrato principal.';
  end if;

  if exists (
    select 1
    from public.installments
    group by contract_id, installment_number
    having count(*) > 1
  ) then
    raise exception 'Há números de parcela duplicados no mesmo contrato.';
  end if;

  if exists (
    select 1 from public.installments
    group by id
    having count(*) > 1
  ) then
    raise exception 'Há IDs duplicados em public.installments.';
  end if;
end
$validate$;

-- Se já existem parcelas válidas, o registro que as agrupa é necessariamente
-- um contrato parcelado.
update public.emprestimos e
set contract_type = 'installment'
where exists (
  select 1 from public.installments i where i.contract_id = e.id
);

alter table public.installments
  alter column contract_id set not null,
  alter column user_id set not null,
  alter column installment_number set not null,
  alter column amount set not null,
  alter column due_date set not null,
  alter column status set default 'A vencer',
  alter column status set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $id_default$
declare
  installment_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into installment_id_type
  from pg_attribute a
  where a.attrelid = 'public.installments'::regclass
    and a.attname = 'id'
    and not a.attisdropped;

  if installment_id_type = 'uuid' then
    alter table public.installments
      alter column id set default gen_random_uuid();
  elsif installment_id_type not in ('bigint', 'integer') then
    raise exception 'Tipo incompatível em public.installments.id: %. Esperado UUID, BIGINT ou INTEGER.', installment_id_type;
  end if;
end
$id_default$;

do $constraints$
declare
  id_attnum smallint;
  contract_attnum smallint;
  user_attnum smallint;
  loan_id_attnum smallint;
  auth_id_attnum smallint;
begin
  select attnum into id_attnum
  from pg_attribute
  where attrelid = 'public.installments'::regclass and attname = 'id' and not attisdropped;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.installments'::regclass and contype = 'p'
  ) then
    alter table public.installments
      add constraint installments_pkey primary key (id);
  elsif not exists (
    select 1 from pg_constraint
    where conrelid = 'public.installments'::regclass
      and contype = 'p'
      and conkey = array[id_attnum]::smallint[]
  ) then
    raise exception 'public.installments possui chave primária em outra coluna; nenhuma alteração automática foi feita.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.installments'::regclass
      and conname = 'installments_number_positive_check'
  ) then
    alter table public.installments
      add constraint installments_number_positive_check
      check (installment_number > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.installments'::regclass
      and conname = 'installments_amount_positive_check'
  ) then
    alter table public.installments
      add constraint installments_amount_positive_check
      check (amount > 0);
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.installments'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
      and pg_get_constraintdef(c.oid) ilike '%Vence hoje%'
  ) then
    alter table public.installments
      add constraint installments_status_check
      check (status in ('Paga', 'A vencer', 'Vence hoje', 'Atrasada'));
  end if;

  select attnum into contract_attnum
  from pg_attribute
  where attrelid = 'public.installments'::regclass and attname = 'contract_id' and not attisdropped;

  select attnum into user_attnum
  from pg_attribute
  where attrelid = 'public.installments'::regclass and attname = 'user_id' and not attisdropped;

  select attnum into loan_id_attnum
  from pg_attribute
  where attrelid = 'public.emprestimos'::regclass and attname = 'id' and not attisdropped;

  select attnum into auth_id_attnum
  from pg_attribute
  where attrelid = 'auth.users'::regclass and attname = 'id' and not attisdropped;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.installments'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.emprestimos'::regclass
      and c.conkey = array[contract_attnum]::smallint[]
      and c.confkey = array[loan_id_attnum]::smallint[]
  ) then
    alter table public.installments
      add constraint installments_contract_id_fkey
      foreign key (contract_id)
      references public.emprestimos(id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.installments'::regclass
      and c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.conkey = array[user_attnum]::smallint[]
      and c.confkey = array[auth_id_attnum]::smallint[]
  ) then
    alter table public.installments
      add constraint installments_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade;
  end if;
end
$constraints$;

create unique index if not exists installments_contract_number_uidx
  on public.installments(contract_id, installment_number);

create index if not exists installments_contract_id_idx
  on public.installments(contract_id);

create index if not exists installments_user_id_idx
  on public.installments(user_id);

create index if not exists installments_open_due_idx
  on public.installments(user_id, due_date)
  where paid_at is null;

-- =========================================================
-- 2. STATUS DINÂMICO E SINCRONIZAÇÃO DO CONTRATO
-- =========================================================

create or replace function public.get_installment_effective_status(
  p_paid_at timestamptz,
  p_due_date date
)
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select case
    when p_paid_at is not null then 'Paga'
    when p_due_date < current_date then 'Atrasada'
    when p_due_date = current_date then 'Vence hoje'
    else 'A vencer'
  end;
$function$;

create or replace function public.prepare_installment_write()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  new.status := public.get_installment_effective_status(new.paid_at, new.due_date);
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
  end if;
  return new;
end;
$function$;

drop trigger if exists update_installment_status_trigger on public.installments;
drop trigger if exists installments_prepare_write on public.installments;

create trigger installments_prepare_write
before insert or update on public.installments
for each row
execute function public.prepare_installment_write();

drop trigger if exists trg_refresh_installment_statuses on public.emprestimos;

create or replace function public.sync_installment_contract_status()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.contract_id is distinct from new.contract_id) then
    update public.emprestimos e
    set status = case
      when exists (select 1 from public.installments i where i.contract_id = old.contract_id)
       and not exists (select 1 from public.installments i where i.contract_id = old.contract_id and i.paid_at is null)
      then 'Pago'
      else 'Pendente'
    end
    where e.id = old.contract_id
      and e.contract_type = 'installment';
  end if;

  if tg_op <> 'DELETE' then
    update public.emprestimos e
    set status = case
      when exists (select 1 from public.installments i where i.contract_id = new.contract_id)
       and not exists (select 1 from public.installments i where i.contract_id = new.contract_id and i.paid_at is null)
      then 'Pago'
      else 'Pendente'
    end
    where e.id = new.contract_id
      and e.contract_type = 'installment';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists installments_sync_contract_status on public.installments;

create trigger installments_sync_contract_status
after insert or update or delete on public.installments
for each row
execute function public.sync_installment_contract_status();

update public.emprestimos e
set status = case
  when not exists (
    select 1
    from public.installments i
    where i.contract_id = e.id
      and i.paid_at is null
  ) then 'Pago'
  else 'Pendente'
end
where e.contract_type = 'installment'
  and exists (
    select 1 from public.installments i where i.contract_id = e.id
  );

revoke all on function public.prepare_installment_write() from public;
revoke all on function public.sync_installment_contract_status() from public;

-- =========================================================
-- 3. RLS E PERMISSÕES
-- =========================================================

alter table public.installments enable row level security;

drop policy if exists "installments_select_own" on public.installments;
create policy "installments_select_own"
on public.installments
for select
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.emprestimos e
    where e.id = contract_id
      and e.user_id = auth.uid()
      and e.contract_type = 'installment'
  )
);

drop policy if exists "installments_insert_own" on public.installments;
create policy "installments_insert_own"
on public.installments
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.emprestimos e
    where e.id = contract_id
      and e.user_id = auth.uid()
      and e.contract_type = 'installment'
  )
);

drop policy if exists "installments_update_own" on public.installments;
create policy "installments_update_own"
on public.installments
for update
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.emprestimos e
    where e.id = contract_id
      and e.user_id = auth.uid()
      and e.contract_type = 'installment'
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.emprestimos e
    where e.id = contract_id
      and e.user_id = auth.uid()
      and e.contract_type = 'installment'
  )
);

drop policy if exists "installments_delete_own" on public.installments;
create policy "installments_delete_own"
on public.installments
for delete
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.emprestimos e
    where e.id = contract_id
      and e.user_id = auth.uid()
      and e.contract_type = 'installment'
  )
);

create or replace function public.get_installment_overdue_count()
returns bigint
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select count(*)
  from public.installments
  where user_id = auth.uid()
    and paid_at is null
    and due_date < current_date;
$function$;

grant select, insert, update, delete
on public.installments
to authenticated;

grant execute on function public.get_installment_overdue_count() to authenticated;
grant execute on function public.get_installment_effective_status(timestamptz, date) to authenticated;

do $sequence_grant$
declare
  sequence_name text;
begin
  select pg_get_serial_sequence('public.installments', 'id')
    into sequence_name;

  if sequence_name is not null then
    execute format('grant usage, select on sequence %s to authenticated', sequence_name::regclass);
  end if;
end
$sequence_grant$;

commit;
