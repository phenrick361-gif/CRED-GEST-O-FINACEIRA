-- CRED • Migration: Contratos Parcelados
-- Execute no Supabase SQL Editor após setup.sql original
-- NÃO DROP NENHUMA TABELA EXISTENTE
-- Mantém compatibilidade total com contratos antigos

begin;

-- =========================================================
-- 1. ADICIONAR TIPO DE CONTRATO NA TABELA EMPRESTIMOS
-- =========================================================

alter table public.emprestimos
  add column if not exists contract_type text not null default 'normal'
  check (contract_type in ('normal', 'installment'));

-- Garantir que contratos antigos continuam como 'normal'
-- (null já é tratado como 'normal' pelo default)

-- =========================================================
-- 2. CRIAR TABELA DE PARCELAS (INSTALLMENTS)
-- =========================================================

do $$
begin
  if not to_regclass('public.installments') is null then
    -- Tabela já existe, verificar se tem as colunas necessárias
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
        and attname = 'installment_number' and not attisdropped
    ) then
      alter table public.installments add column installment_number integer;
    end if;
    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'amount' and not attisdropped
    ) then
      alter table public.installments add column amount numeric(14,2);
    end if;
    if not exists (
      select 1 from pg_attribute
      where attrelid = 'public.installments'::regclass
        and attname = 'due_date' and not attisdropped
    ) then
      alter table public.installments add column due_date date;
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
      alter table public.installments add column status text;
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

-- Garantir que a FK existe
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

-- Garantir FK para user_id
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

-- Índices para performance
create index if not exists installments_contract_id_idx
  on public.installments(contract_id);

create index if not exists installments_user_id_idx
  on public.installments(user_id);

create index if not exists installments_due_date_idx
  on public.installments(contract_id, due_date);

create index if not exists installments_status_idx
  on public.installments(contract_id, status);

-- Habilitar RLS
alter table public.installments enable row level security;

-- Políticas RLS para installments
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
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "installments_delete_own" on public.installments;
create policy "installments_delete_own"
on public.installments
for delete
to authenticated
using (auth.uid() = user_id);

-- =========================================================
-- 3. FUNÇÃO PARA ATUALIZAR STATUS DAS PARCELAS
-- =========================================================

create or replace function public.update_installment_statuses()
returns void
language plpgsql
as $$
begin
  update public.installments
  set status = case
    when paid_at is not null then 'Paga'
    when due_date < current_date then 'Atrasada'
    when due_date = current_date then 'Vence hoje'
    else 'A vencer'
  end,
  updated_at = now();
end;
$$;

-- Trigger para atualizar status automaticamente
drop trigger if exists update_installment_status_trigger on public.installments;
create trigger update_installment_status_trigger
before update on public.installments
for each row
execute function public.set_updated_at();

-- Criar função e trigger para atualizar status das parcelas
create or replace function public.refresh_installment_statuses()
returns trigger
language plpgsql
as $$
begin
  update public.installments
  set status = case
    when paid_at is not null then 'Paga'
    when due_date < current_date then 'Atrasada'
    when due_date = current_date then 'Vence hoje'
    else 'A vencer'
  end
  where contract_id = NEW.contract_id;
  return NEW;
end;
$$;

drop trigger if exists trg_refresh_installment_statuses on public.emprestimos;
create trigger trg_refresh_installment_statuses
after update on public.emprestimos
for each row
execute function public.refresh_installment_statuses();

-- =========================================================
-- 4. PERMISSÕES
-- =========================================================

grant select, insert, update, delete
on public.installments
to authenticated;

grant usage, select
on all sequences in schema public
to authenticated;

-- =========================================================
-- 5. FUNÇÃO PARA CONTAGEM DE PARCELAS ATRASADAS
-- =========================================================

create or replace function public.get_installment_overdue_count()
returns bigint
language sql
security definer
as $$
  select count(*)
  from public.installments
  where user_id = auth.uid()
    and paid_at is null
    and due_date < current_date;
$$;

commit;