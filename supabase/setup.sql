-- CRED • Banco seguro com Supabase Auth + RLS
-- VERSÃO CORRIGIDA:
-- compatível com uma tabela emprestimos cujo id seja UUID ou BIGINT.
-- Execute no Supabase: SQL Editor > New query > Run.

begin;

create extension if not exists pgcrypto;

-- =========================================================
-- 1. PERFIS DAS CONTAS
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default 'Usuário',
  plano text not null default 'Profissional',
  status_assinatura text not null default 'teste',
  teste_ate timestamptz not null default (now() + interval '14 days'),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

-- Não existe política de update para o usuário comum.
-- Plano, assinatura e privilégio administrativo devem ser alterados
-- somente por um backend seguro que use a service role.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Subtransaction: se falhar, o signUp continua sem rollback.
  begin
    insert into public.profiles (id, nome)
    values (
      new.id,
      coalesce(
        new.raw_user_meta_data ->> 'nome',
        split_part(new.email, '@', 1),
        'Usuário'
      )
    )
    on conflict (id) do nothing;
  exception
    when others then
      raise warning 'handle_new_user: profile insert quebrou para user %: % (SQLSTATE %)',
        new.id, SQLERRM, SQLSTATE;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- Cria perfil para usuários que já existiam antes deste script.
insert into public.profiles (id, nome)
select
  id,
  coalesce(
    raw_user_meta_data ->> 'nome',
    split_part(email, '@', 1),
    'Usuário'
  )
from auth.users
on conflict (id) do nothing;

-- =========================================================
-- 2. CONTRATOS / EMPRÉSTIMOS
-- =========================================================

-- Em uma instalação nova, o id será UUID.
-- Se a tabela já existir com id UUID ou BIGINT, ela será preservada.
create table if not exists public.emprestimos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  cliente text not null,
  telefone text,
  observacao text,
  descricao text not null default 'Empréstimo',
  valor_emprestado numeric(14,2) not null check (valor_emprestado >= 0),
  porcentagem_juros numeric(7,2) not null default 40 check (porcentagem_juros >= 0),
  juros_aplicado text not null default 'Sobre Total',
  modalidade text not null default 'Pag. Único',
  periodicidade text not null default 'Mensal',
  prazo_meses integer not null default 1 check (prazo_meses > 0),
  data_emprestimo date not null default current_date,
  data_vencimento date not null,
  status text not null default 'Pendente'
    check (status in ('Pendente', 'Pago', 'Cancelado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Compatibilidade com tabelas antigas.
alter table public.emprestimos
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.emprestimos
  add column if not exists telefone text;

alter table public.emprestimos
  add column if not exists observacao text;

alter table public.emprestimos
  add column if not exists updated_at timestamptz not null default now();

-- Se o id já for UUID e não tiver valor padrão, usa UUID automático.
do $$
declare
  tipo_id text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into tipo_id
  from pg_attribute a
  where a.attrelid = 'public.emprestimos'::regclass
    and a.attname = 'id'
    and not a.attisdropped;

  if tipo_id = 'uuid' then
    execute
      'alter table public.emprestimos alter column id set default gen_random_uuid()';
  elsif tipo_id not in ('bigint', 'integer') then
    raise exception
      'Tipo incompatível em public.emprestimos.id: %. Use UUID, BIGINT ou INTEGER.',
      tipo_id;
  end if;
end;
$$;

create index if not exists emprestimos_user_id_idx
  on public.emprestimos(user_id);

create index if not exists emprestimos_vencimento_idx
  on public.emprestimos(user_id, data_vencimento);

create index if not exists emprestimos_status_idx
  on public.emprestimos(user_id, status);

alter table public.emprestimos enable row level security;

drop policy if exists "emprestimos_select_own" on public.emprestimos;
create policy "emprestimos_select_own"
on public.emprestimos
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "emprestimos_insert_own" on public.emprestimos;
create policy "emprestimos_insert_own"
on public.emprestimos
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "emprestimos_update_own" on public.emprestimos;
create policy "emprestimos_update_own"
on public.emprestimos
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "emprestimos_delete_own" on public.emprestimos;
create policy "emprestimos_delete_own"
on public.emprestimos
for delete
to authenticated
using (auth.uid() = user_id);

-- =========================================================
-- 3. HISTÓRICO DE PAGAMENTOS
-- =========================================================
-- O tipo de pagamentos.emprestimo_id é criado automaticamente
-- com o MESMO tipo de public.emprestimos.id.
-- Isso corrige o erro: bigint e uuid são incompatíveis.

do $$
declare
  tipo_emprestimo_id text;
  tipo_pagamento_emprestimo_id text;
  total_pagamentos bigint;
begin
  select format_type(a.atttypid, a.atttypmod)
    into tipo_emprestimo_id
  from pg_attribute a
  where a.attrelid = 'public.emprestimos'::regclass
    and a.attname = 'id'
    and not a.attisdropped;

  if tipo_emprestimo_id is null then
    raise exception 'A coluna public.emprestimos.id não foi encontrada.';
  end if;

  if to_regclass('public.pagamentos') is null then
    execute format(
      'create table public.pagamentos (
        id bigint generated by default as identity primary key,
        user_id uuid not null references auth.users(id) on delete cascade,
        emprestimo_id %s not null,
        tipo text not null check (tipo in (''Juros'', ''Total'', ''Parcial'')),
        valor numeric(14,2) not null check (valor >= 0),
        pago_em timestamptz not null default now(),
        observacao text
      )',
      tipo_emprestimo_id
    );
  else
    -- Garante as demais colunas, caso pagamentos já exista.
    alter table public.pagamentos
      add column if not exists user_id uuid references auth.users(id) on delete cascade;

    alter table public.pagamentos
      add column if not exists tipo text;

    alter table public.pagamentos
      add column if not exists valor numeric(14,2);

    alter table public.pagamentos
      add column if not exists pago_em timestamptz not null default now();

    alter table public.pagamentos
      add column if not exists observacao text;

    select format_type(a.atttypid, a.atttypmod)
      into tipo_pagamento_emprestimo_id
    from pg_attribute a
    where a.attrelid = 'public.pagamentos'::regclass
      and a.attname = 'emprestimo_id'
      and not a.attisdropped;

    if tipo_pagamento_emprestimo_id is null then
      execute format(
        'alter table public.pagamentos add column emprestimo_id %s',
        tipo_emprestimo_id
      );
    elsif tipo_pagamento_emprestimo_id <> tipo_emprestimo_id then
      execute 'select count(*) from public.pagamentos'
        into total_pagamentos;

      if total_pagamentos = 0 then
        alter table public.pagamentos
          drop constraint if exists pagamentos_emprestimo_id_fkey;

        alter table public.pagamentos
          drop column emprestimo_id;

        execute format(
          'alter table public.pagamentos add column emprestimo_id %s not null',
          tipo_emprestimo_id
        );
      else
        raise exception
          'public.pagamentos.emprestimo_id é %, mas public.emprestimos.id é %. A tabela pagamentos possui dados e não foi alterada automaticamente.',
          tipo_pagamento_emprestimo_id,
          tipo_emprestimo_id;
      end if;
    end if;
  end if;

  -- Cria a chave estrangeira somente depois de os tipos estarem iguais.
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pagamentos'::regclass
      and conname = 'pagamentos_emprestimo_id_fkey'
  ) then
    alter table public.pagamentos
      add constraint pagamentos_emprestimo_id_fkey
      foreign key (emprestimo_id)
      references public.emprestimos(id)
      on delete cascade;
  end if;
end;
$$;

create index if not exists pagamentos_user_id_idx
  on public.pagamentos(user_id);

create index if not exists pagamentos_emprestimo_id_idx
  on public.pagamentos(emprestimo_id);

alter table public.pagamentos enable row level security;

drop policy if exists "pagamentos_select_own" on public.pagamentos;
create policy "pagamentos_select_own"
on public.pagamentos
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "pagamentos_insert_own" on public.pagamentos;
create policy "pagamentos_insert_own"
on public.pagamentos
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.emprestimos e
    where e.id = emprestimo_id
      and e.user_id = auth.uid()
  )
);

drop policy if exists "pagamentos_update_own" on public.pagamentos;
create policy "pagamentos_update_own"
on public.pagamentos
for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.emprestimos e
    where e.id = emprestimo_id
      and e.user_id = auth.uid()
  )
);

drop policy if exists "pagamentos_delete_own" on public.pagamentos;
create policy "pagamentos_delete_own"
on public.pagamentos
for delete
to authenticated
using (auth.uid() = user_id);

-- =========================================================
-- 4. UPDATED_AT AUTOMÁTICO
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists emprestimos_set_updated_at on public.emprestimos;
create trigger emprestimos_set_updated_at
before update on public.emprestimos
for each row
execute function public.set_updated_at();

-- =========================================================
-- 5. PERMISSÕES
-- =========================================================
-- RLS continua sendo a proteção principal.

grant select on public.profiles to authenticated;

grant select, insert, update, delete
on public.emprestimos
to authenticated;

grant select, insert, update, delete
on public.pagamentos
to authenticated;

-- Necessário quando pagamentos.id usa identity.
grant usage, select
on all sequences in schema public
to authenticated;

commit;

-- =========================================================
-- DADOS ANTIGOS
-- =========================================================
-- Contratos antigos cujo user_id está vazio ficam invisíveis por causa do RLS.
-- Depois de criar sua conta:
--
-- 1. Abra Authentication > Users e copie o UUID do seu usuário.
-- 2. Execute, trocando o texto abaixo pelo UUID verdadeiro:
--
-- update public.emprestimos
-- set user_id = 'COLE-SEU-UUID-AQUI'
-- where user_id is null;
--
-- Depois que todos os contratos tiverem dono, você pode tornar obrigatório:
--
-- alter table public.emprestimos
-- alter column user_id set not null;


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