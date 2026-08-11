import type { Loan, Pagamento } from '@/types';

export type PeriodFilter = '6m' | '12m' | 'year' | 'lastYear';

export type MonthBucket = {
  month: string;
  rotulo: string;
  previsto: number;
  obtido: number;
};

export type PeriodSummary = {
  monthKey: string;
  rotulo: string;
  previstoMes: number;
  obtidoMes: number;
  diferenca: number;
  obtidoAnterior: number;
  comparacao: number | null;
};

const MESES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function monthKey(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function monthRotulo(key: string): string {
  const m = Number(String(key).slice(5, 7));
  return MESES_SHORT[Number.isFinite(m) && m >= 1 && m <= 12 ? m - 1 : 0];
}

export function addMonthsKey(key: string, delta: number): string {
  const [y, m] = String(key).split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function interestOf(loan: Pick<Loan, 'valor_emprestado' | 'porcentagem_juros'>): number {
  return round2(Number(loan.valor_emprestado) * (Number(loan.porcentagem_juros) / 100));
}

/**
 * Lucro previsto por mês: somatório dos juros que DEVERIAM vencer naquele mês,
 * agrupado pela DATA DE VENCIMENTO do contrato. O principal nunca entra no lucro.
 */
export function previstoPorMes(loans: Loan[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const l of loans || []) {
    if (!l || l.status === 'Cancelado') continue;
    const j = interestOf(l);
    if (j <= 0 || !l.data_vencimento) continue;
    const k = monthKey(`${l.data_vencimento}T12:00:00`);
    map.set(k, (map.get(k) || 0) + j);
  }
  return map;
}

/**
 * Lucro obtido por mês: somatório dos juros REALMENTE recebidos naquele mês,
 * agrupado pela DATA DO PAGAMENTO registrada (pago_em).
 * - tipo 'Juros'  -> o valor do pagamento inteiro é lucro.
 * - tipo 'Total'  -> só a parcela de juros do contrato é lucro (nunca o principal).
 * - outros tipos  -> não há regra segura de separar principal de juros => 0.
 */
export function obtidoPorMes(loans: Loan[], pagamentos: Pagamento[]): Map<string, number> {
  const byId = new Map<string, Loan>();
  for (const l of loans || []) if (l && l.id) byId.set(l.id, l);

  const map = new Map<string, number>();
  for (const p of pagamentos || []) {
    if (!p || !p.pago_em) continue;
    const tipo = String(p.tipo || '').toLowerCase();
    let profit = 0;
    if (tipo === 'juros') {
      profit = Number(p.valor) || 0;
    } else if (tipo === 'total') {
      const loan = p.emprestimo_id ? byId.get(p.emprestimo_id) : undefined;
      if (loan) {
        const jurosContrato = interestOf(loan);
        const pago = Number(p.valor) || 0;
        profit = Math.max(0, Math.min(jurosContrato, pago));
      }
    }
    if (profit <= 0) continue;
    const k = monthKey(p.pago_em);
    map.set(k, (map.get(k) || 0) + profit);
  }
  return map;
}

export function monthRange(filter: PeriodFilter, now: Date = new Date()): string[] {
  const keys: string[] = [];
  const today = new Date(now.getFullYear(), now.getMonth(), 1);

  if (filter === '6m' || filter === '12m') {
    const count = filter === '6m' ? 6 : 12;
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setMonth(d.getMonth() - i);
      keys.push(monthKey(d));
    }
    return keys;
  }

  const year = filter === 'year' ? now.getFullYear() : now.getFullYear() - 1;
  for (let m = 1; m <= 12; m++) keys.push(`${year}-${String(m).padStart(2, '0')}`);
  return keys;
}

export function buildSeries(
  previsto: Map<string, number>,
  obtido: Map<string, number>,
  keys: string[]
): MonthBucket[] {
  return keys.map(k => ({
    month: k,
    rotulo: monthRotulo(k),
    previsto: round2(previsto.get(k) || 0),
    obtido: round2(obtido.get(k) || 0),
  }));
}

export function periodSummary(
  previsto: Map<string, number>,
  obtido: Map<string, number>,
  series: MonthBucket[]
): PeriodSummary | null {
  if (!series || series.length === 0) return null;
  const lastKey = series[series.length - 1].month;
  const prevKey = addMonthsKey(lastKey, -1);

  const previstoMes = round2(previsto.get(lastKey) || 0);
  const obtidoMes = round2(obtido.get(lastKey) || 0);
  const diferenca = round2(obtidoMes - previstoMes);
  const obtidoAnterior = round2(obtido.get(prevKey) || 0);

  let comparacao: number | null = null;
  if (obtidoAnterior > 0) {
    comparacao = ((obtidoMes - obtidoAnterior) / obtidoAnterior) * 100;
  }

  return {
    monthKey: lastKey,
    rotulo: monthRotulo(lastKey),
    previstoMes,
    obtidoMes,
    diferenca,
    obtidoAnterior,
    comparacao,
  };
}

export function formatPercent(number: number | null): string {
  if (number === null || !Number.isFinite(number)) return '—';
  const signal = number > 0 ? '+' : number < 0 ? '-' : '';
  const abs = Math.abs(number);
  return `${signal}${abs.toFixed(1).replace('.', ',')}%`;
}