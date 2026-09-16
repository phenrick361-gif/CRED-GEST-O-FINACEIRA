-- CRED • Migração: Garantir coluna amount na tabela installments
-- Execute no Supabase SQL Editor
-- NÃO DROP NENHUMA TABELA EXISTENTE
-- Idempotente: pode ser executada múltiplas vezes sem erros

begin;

-- =========================================================
-- 1. GARANTIR QUE A COLUNA amount EXISTE COM AS CONSTRAINTS CORRETAS
-- =========================================================

do $$
begin
  -- Se a tabela installments NÃO existe, criar do zero
  if to_regclass('public.installments') is not null then

    -- Verificar e adicionar coluna amount se não existir
    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'amount' and not attisdropped
    ) then
      alter table public.installments add column amount numeric(14,2) not null default 0;
    end if;

    -- Verificar se a coluna amount tem a check constraint
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.installments'::regclass
        and conname = 'installments_amount_check'
    ) then
      alter table public.installments add constraint installments_amount_check check (amount >= 0);
    end if;

    -- Se a coluna amount existe mas é NULL, preencher com 0
    update public.installments set amount = 0 where amount is null;

    -- Se a coluna amount existe mas não tem NOT NULL, alterar
    if exists (
      select 1 from information_schema.columns
      where table_name = 'installments'
        and column_name = 'amount'
        and is_nullable = 'YES'
    ) then
      alter table public.installments alter column amount set not null;
      alter table public.installments add constraint installments_amount_check check (amount >= 0);
    end if;
  else
    -- Criar tabela do zero
    create table public.installments (
      id uuid primary key default gen_random_uuid(),
      contract_id uuid not null references public.emprestimos(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      installment_number integer not null,
      amount numeric(14,2) not null check (amount >= 0),
      due_date date not null,
      paid_at timestamptz,
      status text not null default 'A vencer'
        check (status in ('Paga', 'A vencer', 'Vence hoje', 'Atrasada')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  end if;
end
$$;

-- =========================================================
-- 2. GARANTIR TODAS AS COLUNAS NECESSÁRIAS
-- =========================================================

do $$
begin
  if to_regclass('public.installments') is not null then

    -- contract_id
    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'contract_id' and not attisdropped
    ) then
      alter table public.installments add column contract_id uuid references public.emprestimos(id) on delete cascade;
    end if;

    -- user_id
    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'user_id' and not attisdropped
    ) then
      alter table public.installments add column user_id uuid references auth.users(id) on delete cascade;
    end if;

    -- installment_number
    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'installment_number' and not attisdropped
    ) then
      alter table public.installments add column installment_number integer not null default 0;
    end if;

    -- due_date
    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'due_date' and not attisdropped
    ) then
      alter table public.installments add column due_date date not null default current_date;
    end if;

    -- paid_at
    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'paid_at' and not attisdropped
    ) then
      alter table public.installments add column paid_at timestamptz;
    end if;

    -- status
    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'status' and not attisdropped
    ) then
      alter table public.installments add column status text not null default 'A vencer';
      if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.installments'::regclass
          and conname = 'installments_status_check'
      ) then
        alter table public.installments add constraint installments_status_check
          check (status in ('Paga', 'A vencer', 'Vence hoje', 'Atrasada'));
      end if;
    end if;

    -- updated_at
    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'updated_at' and not attisdropped
    ) then
      alter table public.installments add column updated_at timestamptz not null default now();
    end if;
  end if;
end
$$;

-- =========================================================
-- 3. BACKFILL: Preencher valores de amount para dados antigos
-- =========================================================

do $$
declare
  inst record;
  loan_valor numeric(14,2);
  loan_juros_pct numeric(7,2);
  loan_parcelas integer;
  calculated_amount numeric(14,2);
begin
  for inst in
    select i.id, i.contract_id, i.amount, i.installment_number
    from public.installments i
    left join public.emprestimos e on e.id = i.contract_id
    where (i.amount = 0 or i.amount is null)
    order by i.contract_id, i.installment_number
  loop
    select e.valor_emprestado, e.porcentagem_juros, e.prazo_meses
    into loan_valor, loan_juros_pct, loan_parcelas
    from public.emprestimos e
    where e.id = inst.contract_id;

    if found and loan_valor > 0 and loan_parcelas > 0 then
      calculated_amount := round((loan_valor * (1 + loan_juros_pct / 100)) / loan_parcelas, 2);
      update public.installments
      set amount = calculated_amount
      where id = inst.id;
    else
      update public.installments
      set amount = 0
      where id = inst.id;
    end if;
  end loop;
end
$$;

-- =========================================================
-- 4. FOREIGN KEYS
-- =========================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.installments'::regclass
      and conname = 'installments_contract_id_fkey'
  ) then
    alter table public.installments
      add constraint installments_contract_id_fkey
      foreign key (contract_id) references public.emprestimos(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.installments'::regclass
      and conname = 'installments_user_id_fkey'
  ) then
    alter table public.installments
      add constraint installments_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end
$$;

-- =========================================================
-- 5. ÍNDICES
-- =========================================================

create index if not exists installments_contract_id_idx
  on public.installments(contract_id);

create index if not exists installments_user_id_idx
  on public.installments(user_id);

create index if not exists installments_due_date_idx
  on public.installments(contract_id, due_date);

create index if not exists installments_status_idx
  on public.installments(contract_id, status);

-- =========================================================
-- 6. TRIGGER updated_at
-- =========================================================

drop trigger if exists update_installment_status_trigger on public.installments;
create trigger update_installment_status_trigger
before update on public.installments
for each row
execute function public.set_updated_at();

drop trigger if exists trg_refresh_installment_statuses on public.emprestimos;

-- =========================================================
-- 7. RLS
-- =========================================================

alter table public.installments enable row level security;

-- Políticas: usar DROP POLICY IF EXISTS + CREATE POLICY (sem IF NOT EXISTS no CREATE)
drop policy if exists "installments_select_own" on public.installments;
create policy "installments_select_own"
on public.installments
for select
to authenticated
using (auth.uid() = user_id);

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
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.emprestimos e
    where e.id = contract_id
      and e.user_id = auth.uid()
  )
);

drop policy if exists "installments_delete_own" on public.installments;
create policy "installments_delete_own"
on public.installments
for delete
to authenticated
using (auth.uid() = user_id);

-- =========================================================
-- 8. PERMISSÕES
-- =========================================================

grant select, insert, update, delete
on public.installments
to authenticated;

commit;
