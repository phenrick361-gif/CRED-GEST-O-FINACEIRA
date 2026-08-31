-- CRED • Migration: Contratos Parcelados
-- Execute no Supabase SQL Editor após setup.sql original
-- NÃO DROP NENHUMA TABELA EXISTENTE
-- Mantém compatibilidade total com contratos antigos
-- Idempotente: pode ser executada múltiplas vezes sem erros

begin;

-- =========================================================
-- 1. ADICIONAR TIPO DE CONTRATO NA TABELA EMPRESTIMOS
-- =========================================================

-- Garantir que a coluna existe com default 'normal'
alter table public.emprestimos
  add column if not exists contract_type text not null default 'normal';

-- Garantir a CHECK constraint mesmo se a coluna já existia sem ela
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.emprestimos'::regclass
      and conname = 'emprestimos_contract_type_check'
  ) then
    alter table public.emprestimos
      add constraint emprestimos_contract_type_check
      check (contract_type in ('normal', 'installment'));
  end if;
end
$$;

-- Garantir que contratos antigos continuam como 'normal'
-- (null já é tratado como 'normal' pelo default acima)
-- Atualizar quaisquer valores nulos que possam existir após ADD COLUMN
update public.emprestimos
set contract_type = 'normal'
where contract_type is null;

-- =========================================================
-- 2. CRIAR TABELA DE PARCELAS (INSTALLMENTS)
-- =========================================================

do $$
begin
  if not to_regclass('public.installments') is null then
    -- Tabela já existe: verificar/criar TODAS as colunas necessárias

    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'contract_id' and not attisdropped
    ) then
      alter table public.installments add column contract_id uuid references public.emprestimos(id) on delete cascade;
    end if;

    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'user_id' and not attisdropped
    ) then
      alter table public.installments add column user_id uuid references auth.users(id) on delete cascade;
    end if;

    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'installment_number' and not attisdropped
    ) then
      alter table public.installments add column installment_number integer not null default 0;
    end if;

    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'amount' and not attisdropped
    ) then
      alter table public.installments add column amount numeric(14,2) not null default 0;
    end if;

    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'due_date' and not attisdropped
    ) then
      alter table public.installments add column due_date date not null default current_date;
    end if;

    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'paid_at' and not attisdropped
    ) then
      alter table public.installments add column paid_at timestamptz;
    end if;

    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'status' and not attisdropped
    ) then
      alter table public.installments add column status text not null default 'A vencer'
        check (status in ('Paga', 'A vencer', 'Vence hoje', 'Atrasada'));
    end if;

    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'created_at' and not attisdropped
    ) then
      alter table public.installments add column created_at timestamptz not null default now();
    end if;

    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'updated_at' and not attisdropped
    ) then
      alter table public.installments add column updated_at timestamptz not null default now();
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
-- 3. FOREIGN KEYS (idempotentes)
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
      foreign key (contract_id)
      references public.emprestimos(id)
      on delete cascade;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.installments'::regclass
      and conname = 'installments_user_id_fkey'
  ) then
    alter table public.installments
      add constraint installments_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade;
  end if;
end
$$;

-- =========================================================
-- 4. ÍNDICES
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
-- 5. FUNÇÃO set_updated_at() — verificar existência
-- =========================================================

do $$
begin
  if not exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    create or replace function public.set_updated_at()
    returns trigger
    language plpgsql
    as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$;
  end if;
end
$$;

-- Trigger para atualizar updated_at ao atualizar uma parcela
drop trigger if exists update_installment_status_trigger on public.installments;
create trigger update_installment_status_trigger
before update on public.installments
for each row
execute function public.set_updated_at();

-- Remover trigger antiga que dependia de atualização de emprestimos
-- O status das parcelas NÃO é mais atualizado por triggers automáticas.
-- A aplicação calcula o status efetivo dinamicamente a partir de:
--   paid_at, due_date e current_date.
drop trigger if exists trg_refresh_installment_statuses on public.emprestimos;

-- =========================================================
-- 6. FUNÇÃO DE STATUS EFETIVO (dinâmico, baseado em dados reais)
-- =========================================================

create or replace function public.get_installment_effective_status(
  p_paid_at timestamptz,
  p_due_date date
)
returns text
language sql
immutable
security invoker
set search_path = public, pg_temp
as $$
  select case
    when p_paid_at is not null then 'Paga'
    when p_due_date < current_date then 'Atrasada'
    when p_due_date = current_date then 'Vence hoje'
    else 'A vencer'
  end;
$$;

-- =========================================================
-- 7. RLS — TABLE PERMISSIONS
-- =========================================================

alter table public.installments enable row level security;

-- SELECT: usuário só vê suas próprias parcelas
drop policy if exists "installments_select_own" on public.installments;
create policy "installments_select_own"
on public.installments
for select
to authenticated
using (auth.uid() = user_id);

-- INSERT: usuário só pode inserir para seus próprios contratos
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

-- UPDATE: usuário só pode atualizar suas próprias parcelas
-- E não pode alterar o contract_id para um contrato de outro usuário
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

-- DELETE: usuário só pode excluir suas próprias parcelas
drop policy if exists "installments_delete_own" on public.installments;
create policy "installments_delete_own"
on public.installments
for delete
to authenticated
using (auth.uid() = user_id);

-- =========================================================
-- 8. FUNÇÃO DE CONTAGEM DE PARCELAS ATRASADAS
--    security invoker (não definer) — mais seguro
--    Usa search_path explícito e schema qualificado
-- =========================================================

create or replace function public.get_installment_overdue_count()
returns bigint
language sql
security invoker
set search_path = public, pg_temp
as $$
  select count(*)
  from public.installments
  where user_id = auth.uid()
    and paid_at is null
    and due_date < current_date;
$$;

grant execute on function public.get_installment_overdue_count() to authenticated;

-- =========================================================
-- 9. PERMISSÕES ESPECÍFICAS (sem grants amplos)
-- =========================================================

grant select, insert, update, delete
on public.installments
to authenticated;

-- Apenas a sequence da tabela installments, não todas as sequences do schema
do $$
declare
  v_seq_name text;
begin
  for v_seq_name in
    select pg_get_serial_sequence('public.installments', 'id')::regclass::text
  loop
    execute format('grant usage, select on %I to authenticated', v_seq_name);
  end loop;
end
$$;

commit;