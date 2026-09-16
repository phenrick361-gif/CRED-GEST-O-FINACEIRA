import { isValid } from 'date-fns';
import type { Loan, InstallmentStatus } from '@/types';

export const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

export const localDate = (value: string) => {
  if (!value) return '—';
  const d = new Date(`${value}T00:00:00Z`);
  return isValid(d) ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(d) : '—';
};

export const interest = (loan: Pick<Loan, 'valor_emprestado' | 'porcentagem_juros'>) =>
  Number(loan.valor_emprestado) * (Number(loan.porcentagem_juros) / 100);

export const total = (loan: Pick<Loan, 'valor_emprestado' | 'porcentagem_juros'>) =>
  Number(loan.valor_emprestado) + interest(loan);

export const isZeroInterest = (loan: Pick<Loan, 'porcentagem_juros'>) =>
  Number(loan.porcentagem_juros) === 0;

export const hasInterest = (loan: Pick<Loan, 'porcentagem_juros'>) =>
  Number(loan.porcentagem_juros) > 0;

export function localISODate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const isoToday = () => localISODate();

export const addMonth = (iso: string) => {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (!isValid(d)) return localISODate();
  const originalDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(originalDay, lastDay));
  return localISODate(d);
};

export function parseCurrencyBR(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const original = String(value).trim();
  if (!original) return null;

  const cleaned = original.replace(/R\$/gi, '').replace(/\s/g, '');

  if (cleaned.includes(',')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const result = Number(normalized);
    return Number.isFinite(result) ? result : null;
  }

  const result = Number(cleaned);
  return Number.isFinite(result) ? result : null;
}

export function parsePercentageBR(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const original = String(value).trim();
  if (!original) return null;

  const cleaned = original.replace(/%/g, '').replace(/\s/g, '');

  if (cleaned.includes(',')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const result = Number(normalized);
    return Number.isFinite(result) ? result : null;
  }

  const result = Number(cleaned);
  return Number.isFinite(result) ? result : null;
}

export function formatName(name: string): string {
  if (!name) return '';
  const preps = ['de', 'da', 'do', 'das', 'dos', 'e'];
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(w => {
      if (!w) return '';
      const lower = w.toLowerCase();
      if (preps.includes(lower)) return lower;
      if (w === w.toUpperCase() && w.length > 1) return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

export function situation(loan: Loan) {
  if (loan.status === 'Pago') return 'Pago';
  if (loan.status === 'Cancelado') return 'Cancelado';
  const today = isoToday();
  if (loan.data_vencimento < today) return 'Atrasado';
  if (loan.data_vencimento === today) return 'Vence hoje';
  return 'Em dia';
}

export function installmentStatus(installment: { paid_at: string | null; due_date: string }): InstallmentStatus {
  if (installment.paid_at) return 'Paga';
  const today = isoToday();
  const due = installment.due_date;
  if (due < today) return 'Atrasada';
  if (due === today) return 'Vence hoje';
  return 'A vencer';
}

export function getInstallmentStatus(dueDate: string, paidAt: string | null): InstallmentStatus {
  if (paidAt) return 'Paga';
  const today = isoToday();
  if (dueDate < today) return 'Atrasada';
  if (dueDate === today) return 'Vence hoje';
  return 'A vencer';
}

export function generateInstallmentDates(
  firstDueDate: string,
  count: number,
  monthly: boolean = true
): string[] {
  const dates: string[] = [];
  const base = new Date(`${String(firstDueDate).slice(0, 10)}T12:00:00`);
  if (!isValid(base)) return dates;
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setMonth(d.getMonth() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
  }
  return dates;
}
