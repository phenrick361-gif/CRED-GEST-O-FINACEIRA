import type { Loan } from '@/types';

export const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

export const localDate = (value: string) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
};

export const interest = (loan: Pick<Loan, 'valor_emprestado' | 'porcentagem_juros'>) =>
  Number(loan.valor_emprestado) * (Number(loan.porcentagem_juros) / 100);

export const total = (loan: Pick<Loan, 'valor_emprestado' | 'porcentagem_juros'>) =>
  Number(loan.valor_emprestado) + interest(loan);

export const isZeroInterest = (loan: Pick<Loan, 'porcentagem_juros'>) =>
  Number(loan.porcentagem_juros) === 0;

export const hasInterest = (loan: Pick<Loan, 'porcentagem_juros'>) =>
  Number(loan.porcentagem_juros) > 0;

export const isoToday = () => new Date().toISOString().slice(0, 10);

export const addMonth = (iso: string) => {
  const date = new Date(`${iso}T12:00:00`);
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(originalDay, lastDay));
  return date.toISOString().slice(0, 10);
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
  const today = isoToday();
  if (loan.data_vencimento < today) return 'Atrasado';
  if (loan.data_vencimento === today) return 'Vence hoje';
  return 'Em dia';
}
