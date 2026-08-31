export type InstallmentPeriodicity = 'Mensal' | 'Quinzenal' | 'Semanal';

export type EffectiveInstallmentStatus = 'Paga' | 'A vencer' | 'Vence hoje' | 'Atrasada';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_IN_MS = 86_400_000;

function assertISODate(value: string, fieldName: string): void {
  if (!ISO_DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${fieldName} inválida`);
  }
}

function toISODateUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toISODateUTC(date);
}

function addMonthsPreservingDay(isoDate: string, months: number): string {
  const source = new Date(`${isoDate}T00:00:00Z`);
  const originalDay = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(originalDay, lastDay));
  return toISODateUTC(target);
}

export function generateInstallmentDates(
  firstDueDate: string,
  count: number,
  periodicity: InstallmentPeriodicity,
): string[] {
  assertISODate(firstDueDate, 'Primeiro vencimento');
  if (!Number.isInteger(count) || count < 1 || count > 600) {
    throw new Error('Número de parcelas inválido');
  }

  return Array.from({ length: count }, (_, index) => {
    if (periodicity === 'Semanal') return addDays(firstDueDate, index * 7);
    if (periodicity === 'Quinzenal') return addDays(firstDueDate, index * 15);
    return addMonthsPreservingDay(firstDueDate, index);
  });
}

export function calculateInstallmentPlan(principal: number, count: number, installmentAmount: number) {
  const normalizedPrincipal = Number(principal);
  const normalizedAmount = Number(installmentAmount);

  if (!Number.isFinite(normalizedPrincipal) || normalizedPrincipal <= 0) {
    throw new Error('Valor principal inválido');
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Número de parcelas inválido');
  }
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error('Valor da parcela inválido');
  }

  const total = Number((count * normalizedAmount).toFixed(2));
  const interestAmount = Number((total - normalizedPrincipal).toFixed(2));
  const interestPercentage = Number(((interestAmount / normalizedPrincipal) * 100).toFixed(4));

  return { total, interestAmount, interestPercentage };
}

export function getEffectiveInstallmentStatus(
  dueDate: string,
  paidAt: string | null,
  today: string,
): EffectiveInstallmentStatus {
  if (paidAt) return 'Paga';
  if (dueDate < today) return 'Atrasada';
  if (dueDate === today) return 'Vence hoje';
  return 'A vencer';
}

export function daysOverdue(dueDate: string, today: string): number {
  assertISODate(dueDate, 'Vencimento');
  assertISODate(today, 'Data atual');
  if (dueDate >= today) return 0;
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const current = Date.parse(`${today}T00:00:00Z`);
  return Math.floor((current - due) / DAY_IN_MS);
}

export function sameEntityId(left: string | number, right: string | number): boolean {
  return String(left) === String(right);
}

export function asAmount(value: number | string | null | undefined): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}
