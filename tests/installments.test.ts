import assert from 'node:assert/strict';
import test from 'node:test';
import {
  asAmount,
  calculateInstallmentPlan,
  daysOverdue,
  generateInstallmentDates,
  getEffectiveInstallmentStatus,
  sameEntityId,
} from '../lib/installments.ts';

test('gera cinco parcelas mensais preservando o dia quando possível', () => {
  assert.deepEqual(generateInstallmentDates('2024-01-31', 4, 'Mensal'), [
    '2024-01-31',
    '2024-02-29',
    '2024-03-31',
    '2024-04-30',
  ]);
});

test('respeita periodicidade semanal e quinzenal', () => {
  assert.deepEqual(generateInstallmentDates('2026-08-31', 3, 'Semanal'), [
    '2026-08-31',
    '2026-09-07',
    '2026-09-14',
  ]);
  assert.deepEqual(generateInstallmentDates('2026-08-31', 3, 'Quinzenal'), [
    '2026-08-31',
    '2026-09-15',
    '2026-09-30',
  ]);
});

test('calcula o cenário de R$ 1.000 em cinco parcelas de R$ 250', () => {
  assert.deepEqual(calculateInstallmentPlan(1000, 5, 250), {
    total: 1250,
    interestAmount: 250,
    interestPercentage: 25,
  });
});

test('calcula status dinamicamente sem depender do texto salvo no banco', () => {
  assert.equal(getEffectiveInstallmentStatus('2026-08-30', null, '2026-08-31'), 'Atrasada');
  assert.equal(getEffectiveInstallmentStatus('2026-08-31', null, '2026-08-31'), 'Vence hoje');
  assert.equal(getEffectiveInstallmentStatus('2026-09-01', null, '2026-08-31'), 'A vencer');
  assert.equal(getEffectiveInstallmentStatus('2026-08-20', '2026-08-21T12:00:00Z', '2026-08-31'), 'Paga');
  assert.equal(daysOverdue('2026-08-28', '2026-08-31'), 3);
});

test('normaliza valores e IDs vindos do PostgREST', () => {
  assert.equal(asAmount('250.50'), 250.5);
  assert.equal(asAmount(undefined), 0);
  assert.equal(sameEntityId('42', 42), true);
});
