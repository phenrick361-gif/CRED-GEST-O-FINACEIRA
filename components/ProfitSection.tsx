'use client';

import { useMemo, useState } from 'react';
import type { Loan, Pagamento } from '@/types';
import { money } from '@/lib/finance';
import {
  buildSeries, formatPercent, monthRange, obtidoPorMes, periodSummary, previstoPorMes,
  type PeriodFilter,
} from '@/lib/lucro';
import LucroLineChart from '@/components/LucroLineChart';
import { TrendingUp, DollarSign, ArrowLeftRight, Activity } from 'lucide-react';

const FILTERS: { key: PeriodFilter; label: string }[] = [
  { key: '6m', label: 'Últimos 6 meses' },
  { key: '12m', label: 'Últimos 12 meses' },
  { key: 'year', label: 'Ano atual' },
  { key: 'lastYear', label: 'Ano anterior' },
];

const GOLD = 'var(--gold)';
const GREEN = 'var(--green)';
const RED = 'var(--red)';

export default function ProfitSection({ loans, pagamentos }: { loans: Loan[]; pagamentos: Pagamento[] }) {
  const [filter, setFilter] = useState<PeriodFilter>('12m');

  const { series, summary, hasData } = useMemo(() => {
    const previsto = previstoPorMes(loans);
    const obtido = obtidoPorMes(loans, pagamentos);
    const series = buildSeries(previsto, obtido, monthRange(filter));
    return {
      series,
      summary: periodSummary(previsto, obtido, series),
      hasData: series.some(s => s.previsto > 0 || s.obtido > 0),
    };
  }, [loans, pagamentos, filter]);

  const diferenca = summary ? summary.diferenca : 0;
  const diferencaNote =
    diferenca > 0 ? `R$ ${money(diferenca).replace('R$', '').trim()} acima do previsto`
      : diferenca < 0 ? `R$ ${money(Math.abs(diferenca)).replace('R$', '').trim()} abaixo do previsto`
        : 'igual ao previsto';

  return (
    <section className="profit-section">
      <div className="panel-title profit-title">
        <span className="panel-title-left"><Activity size={18} /> Lucro mensal</span>
        <div className="chip-group profit-filters">
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={`chip ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid kpi-grid-4">
        <div className="kpi">
          <div className="kpi-icon-wrap"><TrendingUp size={18} /></div>
          <div className="kpi-label">Lucro previsto no mês</div>
          <div className="kpi-value">{summary ? money(summary.previstoMes) : money(0)}</div>
          <div className="muted">Juros que deveriam vencer em {summary ? summary.rotulo : '—'}.</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon-wrap" style={{ background: 'rgba(34,197,94,0.08)' }}>
            <DollarSign size={18} style={{ color: GREEN }} />
          </div>
          <div className="kpi-label">Lucro obtido no mês</div>
          <div className="kpi-value" style={{ color: GREEN }}>{summary ? money(summary.obtidoMes) : money(0)}</div>
          <div className="muted">Juros recebidos em {summary ? summary.rotulo : '—'}.</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon-wrap"><ArrowLeftRight size={18} /></div>
          <div className="kpi-label">Diferença</div>
          <div className="kpi-value" style={{ color: summary && summary.diferenca !== 0 ? (summary.diferenca > 0 ? GREEN : RED) : GOLD }}>
            {summary ? money(Math.abs(summary.diferenca)) : money(0)}
          </div>
          <div className="muted">{diferencaNote}</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon-wrap" style={{ background: 'rgba(212,175,55,0.08)' }}>
            <Activity size={18} />
          </div>
          <div className="kpi-label">Comparação mensal</div>
          <div className="kpi-value" style={{ color: summary && summary.comparacao !== null ? (summary.comparacao >= 0 ? GREEN : RED) : GOLD, fontSize: 'clamp(14px,1.1vw,22px)' }}>
            {summary && summary.comparacao !== null ? formatPercent(summary.comparacao) : 'Sem mês anterior'}
          </div>
          <div className="muted">Obtido vs mês anterior.</div>
        </div>
      </div>

      <div className="section-spacer" />

      <div className="chart-card">
        <div className="chart-title">📈 Lucro mensal — previsto vs obtido</div>
        <div className="profit-headline">
          <span className="profit-headline-value">Lucro obtido no mês <strong>{summary ? money(summary.obtidoMes) : money(0)}</strong></span>
          {summary && summary.comparacao !== null && (
            <span className={`profit-headline-delta ${summary.comparacao >= 0 ? 'up' : 'down'}`}>
              {summary.comparacao >= 0 ? '▲' : '▼'} {formatPercent(summary.comparacao)} em relação ao mês anterior
            </span>
          )}
          {summary && summary.comparacao === null && (
            <span className="profit-headline-delta muted">— sem mês anterior para comparar</span>
          )}
        </div>

        {!hasData ? (
          <div className="chart-empty">
            <span className="chart-empty-icon">📈</span>
            <span className="chart-empty-text">Nenhum dado de lucro</span>
            <span className="chart-empty-sub">O gráfico aparecerá quando houver contratos com juros e pagamentos</span>
          </div>
        ) : (
          <>
            <LucroLineChart series={series} />
            <div className="chart-legend">
              <span className="chart-legend-item">
                <span className="chart-dot" style={{ background: GOLD }} />
                Lucro previsto
              </span>
              <span className="chart-legend-item">
                <span className="chart-dot" style={{ background: GREEN }} />
                Lucro obtido
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}