'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LOAN_COLUMNS } from '@/lib/supabase/columns';
import { interest, isoToday, localDate, money, total, hasInterest } from '@/lib/finance';
import type { Loan } from '@/types';
import AppShell from '@/components/AppShell';
import { BarChartCard, DonutChartCard, MonthlyChartCard } from '@/components/DashboardCharts';
import { DollarSign, Briefcase, TrendingUp, PiggyBank, FileText, Percent, CheckCircle, AlertTriangle, Award } from 'lucide-react';

export default function BalancoGeral() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [pagamentos, setPagamentos] = useState<{ valor: number }[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const load = () => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('emprestimos')
        .select(LOAN_COLUMNS)
        .eq('user_id', user.id)
        .order('data_emprestimo', { ascending: false })
        .then(({ data, error }) => {
          if (error) { setErrorMsg(error.message); return; }
          setLoans((data || []) as Loan[]);
        });
      supabase.from('pagamentos').select('valor').eq('user_id', user.id).eq('tipo', 'Juros').then(({ data, error }) => {
        if (error) { setErrorMsg(error.message); return; }
        setPagamentos((data || []) as { valor: number }[]);
      });
    });
  };

  useEffect(() => {
    load();
    const onChanged = () => load();
    window.addEventListener('cred-data-changed', onChanged);
    window.addEventListener('focus', onChanged);
    document.addEventListener('visibilitychange', onChanged);
    return () => {
      window.removeEventListener('cred-data-changed', onChanged);
      window.removeEventListener('focus', onChanged);
      document.removeEventListener('visibilitychange', onChanged);
    };
  }, []);

  const today = isoToday();
  const pendentes = loans.filter(l => l.status === 'Pendente');
  const pagos = loans.filter(l => l.status === 'Pago');
  const semJuros = pendentes.filter(l => !hasInterest(l));
  const comJuros = pendentes.filter(l => hasInterest(l));

  let capitalInvestido = 0;
  let jurosPrevistos = 0;
  let totalCarteira = 0;
  let contratosAtrasados = 0;
  let maxTotal = 0;

  pendentes.forEach(loan => {
    const c = Number(loan.valor_emprestado);
    const j = interest(loan);
    const t = total(loan);
    capitalInvestido += c;
    totalCarteira += t;
    maxTotal = Math.max(maxTotal, t);
    if (hasInterest(loan)) jurosPrevistos += j;
    if (loan.data_vencimento < today) contratosAtrasados++;
  });

  const jurosRecebidos = pagamentos.reduce((s, p) => s + Number(p.valor), 0);
  const contratosAtivos = pendentes.length;
  const contratosPagos = pagos.length;
  const emDiaCount = pendentes.filter(l => l.data_vencimento >= today).length;
  const atrasadosCount = contratosAtrasados;

  const monthlyMap = new Map<string, { principal: number; total: number }>();
  loans.forEach(loan => {
    const month = loan.data_emprestimo.slice(0, 7);
    const prev = monthlyMap.get(month) || { principal: 0, total: 0 };
    prev.principal += Number(loan.valor_emprestado);
    prev.total += total(loan);
    monthlyMap.set(month, prev);
  });
  const sortedMonths = [...monthlyMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  let cumTotal = 0;
  const monthlyChartData = sortedMonths.map(([month, data]) => {
    cumTotal += data.total;
    return { month, principal: data.principal, total: cumTotal, newTotal: data.total };
  });

  const topLoans = [...pendentes].sort((a, b) => total(b) - total(a)).slice(0, 10);

  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-header-title">Balanço Geral</h1>
          <p className="page-header-subtitle">Visão completa do patrimônio, juros e desempenho da carteira.</p>
        </div>
        <div className="page-header-right">
          <span className="badge badge-green">Acesso liberado</span>
        </div>
      </div>

      {/* Primeira linha - valores principais */}
      <section className="grid kpi-grid-4">
        <div className="kpi">
          <div className="kpi-icon-wrap"><DollarSign size={18} /></div>
          <div className="kpi-label">Capital Investido</div>
          <div className="kpi-value">{money(capitalInvestido)}</div>
          <div className="muted">Principal total atualmente em aberto.</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon-wrap"><Briefcase size={18} /></div>
          <div className="kpi-label">Total da Carteira</div>
          <div className="kpi-value">{money(totalCarteira)}</div>
          <div className="muted">Soma do principal e dos juros.</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon-wrap"><TrendingUp size={18} /></div>
          <div className="kpi-label">Juros Previstos</div>
          <div className="kpi-value">{money(jurosPrevistos)}</div>
          <div className="muted">Juros previstos nos contratos com juros.</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon-wrap"><PiggyBank size={18} /></div>
          <div className="kpi-label">Juros Recebidos</div>
          <div className="kpi-value">{money(jurosRecebidos)}</div>
          <div className="muted">Total já recebido em juros.</div>
        </div>
      </section>

      <div className="section-spacer" />

      {/* Segunda linha - situação dos contratos (compactos) */}
      <section className="grid kpi-grid-4">
        <div className="kpi-compact">
          <div className="kpi-compact-header">
            <div className="kpi-compact-icon"><Percent size={16} /></div>
            <div className="kpi-compact-label">Contratos com juros</div>
          </div>
          <div className="kpi-compact-value">{comJuros.length}</div>
          <div className="muted">Contratos com taxa superior a 0%.</div>
        </div>
        <div className="kpi-compact">
          <div className="kpi-compact-header">
            <div className="kpi-compact-icon"><FileText size={16} /></div>
            <div className="kpi-compact-label">Contratos sem juros</div>
          </div>
          <div className="kpi-compact-value">{semJuros.length}</div>
          <div className="muted">Contratos cadastrados com taxa de 0%.</div>
        </div>
        <div className="kpi-compact">
          <div className="kpi-compact-header">
            <div className="kpi-compact-icon"><CheckCircle size={16} /></div>
            <div className="kpi-compact-label">Contratos pagos</div>
          </div>
          <div className="kpi-compact-value">{contratosPagos}</div>
          <div className="muted">Contratos totalmente quitados.</div>
        </div>
        <div className="kpi-compact">
          <div className="kpi-compact-header">
            <div className="kpi-compact-icon" style={{ background: 'rgba(239,68,68,0.08)' }}>
              <AlertTriangle size={16} style={{ color: 'var(--red)' }} />
            </div>
            <div className="kpi-compact-label">Contratos atrasados</div>
          </div>
          <div className="kpi-compact-value" style={{ color: 'var(--red)' }}>{atrasadosCount}</div>
          <div className="muted">Contratos com vencimento ultrapassado.</div>
        </div>
      </section>

      <div className="section-spacer-lg" />

      {/* Evolução mensal + Distribuição */}
      <section className="grid two-col">
        <MonthlyChartCard data={monthlyChartData} />
        <DonutChartCard emDia={emDiaCount} atrasados={atrasadosCount} pagos={contratosPagos} semJuros={semJuros.length} />
      </section>

      <div className="section-spacer-lg" />

      {/* Ranking dos maiores contratos */}
      <section className="panel">
        <div className="panel-title">
          <span className="panel-title-left"><Award size={18} /> Maiores contratos</span>
        </div>
        {topLoans.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">📋</span>
            <span className="empty-state-text">Nenhum contrato em aberto</span>
            <span className="empty-state-sub">Os maiores contratos aparecerão aqui.</span>
          </div>
        ) : (
          <>
          <div className="table-wrap desktop-table">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>Cliente</th>
                  <th className="text-right">Principal</th>
                  <th className="text-right">Juros</th>
                  <th className="text-right">Total</th>
                  <th style={{ textAlign: 'center' }}>Situação</th>
                  <th>Vencimento</th>
                </tr>
              </thead>
              <tbody>
                {topLoans.map((l, i) => {
                  const sit = l.data_vencimento < today ? 'Atrasado' : 'Em dia';
                  const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
                  return (
                    <tr key={l.id}>
                      <td>
                        <span className={`rank-badge ${rankClass}`}>
                          {['🥇', '🥈', '🥉'][i] || i + 1}
                        </span>
                      </td>
                      <td><strong>{l.cliente}</strong></td>
                      <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(l.valor_emprestado)}</td>
                      <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(interest(l))}</td>
                      <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: 'var(--gold)' }}>{money(total(l))}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${sit === 'Atrasado' ? 'badge-red' : 'badge-green'}`}>{sit}</span>
                      </td>
                      <td>{localDate(l.data_vencimento)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mobile-only">
            {topLoans.map((l, i) => {
              const sit = l.data_vencimento < today ? 'Atrasado' : 'Em dia';
              const corBadge = sit === 'Atrasado' ? 'badge-red' : 'badge-green';
              const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-num';
              const rankContent = i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`;
              return (
                <div key={l.id} className="mobile-rank-card">
                  <div className="mobile-rank-top">
                    <span className={`mobile-rank-pos ${rankClass}`}>{rankContent}</span>
                    <span className="mobile-rank-name">{l.cliente}</span>
                    <span className={`badge ${corBadge} mobile-rank-badge`}>{sit}</span>
                  </div>
                  <div className="mobile-rank-body">
                    <div className="mobile-rank-row">
                      <span className="label">Principal</span>
                      <span className="val">{money(l.valor_emprestado)}</span>
                    </div>
                    <div className="mobile-rank-row">
                      <span className="label">Juros</span>
                      <span className="val">{money(interest(l))}</span>
                    </div>
                    <div className="mobile-rank-row">
                      <span className="label">Total</span>
                      <span className="val gold">{money(total(l))}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}
      </section>

      <div className="section-spacer-lg" />

      {/* Indicadores financeiros */}
      <section className="panel">
        <div className="panel-title">
          <span className="panel-title-left"><FileText size={18} /> Indicadores financeiros</span>
        </div>
        <div className="grid kpi-grid-4" style={{ gap: 16 }}>
          <div className="kpi-compact">
            <div className="kpi-compact-header">
              <div className="kpi-compact-icon"><Percent size={16} /></div>
              <div className="kpi-compact-label">Carteira atrasada</div>
            </div>
            <div className="kpi-compact-value">{contratosAtivos > 0 ? ((atrasadosCount / contratosAtivos) * 100).toFixed(1) : 0}%</div>
            <div className="muted">Percentual de contratos vencidos.</div>
          </div>
          <div className="kpi-compact">
            <div className="kpi-compact-header">
              <div className="kpi-compact-icon"><CheckCircle size={16} /></div>
              <div className="kpi-compact-label">Carteira paga</div>
            </div>
            <div className="kpi-compact-value">{loans.length > 0 ? ((contratosPagos / loans.length) * 100).toFixed(1) : 0}%</div>
            <div className="muted">Percentual de contratos quitados.</div>
          </div>
          <div className="kpi-compact">
            <div className="kpi-compact-header">
              <div className="kpi-compact-icon"><DollarSign size={16} /></div>
              <div className="kpi-compact-label">Média dos contratos</div>
            </div>
            <div className="kpi-compact-value">{contratosAtivos > 0 ? money(capitalInvestido / contratosAtivos) : money(0)}</div>
            <div className="muted">Valor médio do principal.</div>
          </div>
          <div className="kpi-compact">
            <div className="kpi-compact-header">
              <div className="kpi-compact-icon"><FileText size={16} /></div>
              <div className="kpi-compact-label">Total de contratos</div>
            </div>
            <div className="kpi-compact-value">{loans.length}</div>
            <div className="muted">Todos os contratos cadastrados.</div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
