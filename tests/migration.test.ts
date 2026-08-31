import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL('../supabase/migration-installment-contracts.sql', import.meta.url);

test('migration de parcelados é atômica e usa contract_id dinâmico', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.equal((sql.match(/^begin;$/gim) || []).length, 1);
  assert.equal((sql.match(/^commit;$/gim) || []).length, 1);
  assert.match(sql, /contract_id %s not null/);
  assert.match(sql, /loan_id_type not in \('uuid', 'bigint', 'integer'\)/);
  assert.doesNotMatch(sql, /contract_id uuid not null/);
});

test('migration protege RLS e calcula atrasos dinamicamente', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /security invoker/);
  assert.match(sql, /stable\s+security invoker/);
  assert.match(sql, /auth\.uid\(\) = user_id/);
  assert.match(sql, /e\.contract_type = 'installment'/);
  assert.match(sql, /paid_at is null\s+and due_date < current_date/);
  assert.doesNotMatch(sql, /security definer/i);
  assert.doesNotMatch(sql, /on all sequences in schema public/i);
});

test('migration mantém pares de delimitadores PostgreSQL balanceados', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  const tags = sql.match(/\$[A-Za-z_][A-Za-z0-9_]*\$/g) || [];
  const counts = new Map<string, number>();
  for (const tag of tags) counts.set(tag, (counts.get(tag) || 0) + 1);
  for (const [tag, count] of counts) {
    assert.equal(count % 2, 0, `delimitador ${tag} deve aparecer em pares`);
  }
});
