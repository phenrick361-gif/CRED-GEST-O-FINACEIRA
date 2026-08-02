'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isoToday, localDate, money, situation, total, formatName } from '@/lib/finance';
import type { Loan } from '@/types';
import AppShell from '@/components/AppShell';
import {
  DollarSign, Briefcase, FileText, Clock, AlertTriangle, CheckCircle,
  ArrowRight, UserPlus, PlusCircle, BarChart3, ChevronRight, Phone, Calendar
} from 'lucide-react';
import Link from 'next/link';

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export default function Dashboard() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('nome').eq('id', user.id).maybeSingle().then(({ data }) => {
        setUserName(data?.nome || '');
      });
      supabase.from('emprestimos').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data }) => {
        setLoans((data || []) as Loan[]);
      });
    });
  }, []);


  const today = isoToday();
  const pendentes = loans.filter(l => l.status === 'Pendente');
  const pagos = loans.filter(l => l.status === 'Pago');

  let capitalInvestido = 0;
  let totalCarteira = 0;
  let contratosAtrasados = 0;
  const dueTodayLoans: Loan[] = [];

  pendentes.forEach(loan => {
    capitalInvestido += Number(loan.valor_emprestado);
    totalCarteira += total(loan);
    if (loan.data_vencimento < today) contratosAtrasados++;
    if (loan.data_vencimento === today) dueTodayLoans.push(loan);
  });

  const contratosPagos = pagos.length;
  const contratosAtivos = pendentes.length;
  const venceHojeCount = dueTodayLoans.length;
  const contratosAtrasadosCount = contratosAtrasados;
  const ultimosContratos = loans.slice(0, 4);
  const dueTodayPreview = dueTodayLoans.slice(0, 5);

  const cards = [
    { icon: DollarSign, label: 'Capital Investido', value: money(capitalInvestido), aux: 'Total principal em aberto', href: '/contratos', action: 'Abrir Carteira' },
    { icon: Briefcase, label: 'Total da Carteira', value: money(totalCarteira), aux: 'Principal + juros', href: '/contratos', action: 'Abrir Carteira' },
    { icon: FileText, label: 'Contratos Ativos', value: contratosAtivos, aux: 'Contratos em aberto', href: '/contratos', action: 'Ver contratos' },
    { icon: Clock, label: 'Vencem Hoje', value: venceHojeCount, aux: 'Cobrar hoje', href: '/contratos', action: 'Ver cobranças' },
    { icon: AlertTriangle, label: 'Contratos Atrasados', value: contratosAtrasadosCount, aux: 'Contratos vencidos', href: '/contratos', action: 'Abrir atrasados' },
    { icon: CheckCircle, label: 'Contratos Pagos', value: contratosPagos, aux: 'Contratos quitados', href: '/contratos', action: 'Ver pagos' },
  ];

  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-header-title">Olá, {formatName(userName) || 'Usuário'}! 👋</h1>
          <p className="page-header-subtitle">Bem-vindo ao CRED • Gestão Financeira</p>
        </div>
        <div className="page-header-right">
          <span className="badge badge-green">Acesso liberado</span>
        </div>
      </div>

      <section className="grid kpi-grid-6">
        {cards.map(c => (
          <div key={c.label} className="kpi">
            <div className="kpi-icon-wrap">
              <c.icon size={18} />
            </div>
            <div className="kpi-label">{c.label}</div>
            <div className="kpi-value">{c.value}</div>
            <div className="muted">{c.aux}</div>
            <div className="kpi-footer">
              <Link href={c.href} className="btn">{c.action}</Link>
            </div>
          </div>
        ))}
      </section>

      <section className="dashboard-lower-grid">
        <div className="panel dashboard-charges-card">
          <div className="panel-title">
            <span className="panel-title-left"><Clock size={18} /> Cobranças do dia</span>
            <span className="panel-title-right">
              <Link href="/contratos" className="btn btn-ghost btn-sm">
                Ver todas ({dueTodayLoans.length}) <ArrowRight size={14} />
              </Link>
            </span>
          </div>
          {dueTodayLoans.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">✅</span>
              <span className="empty-state-text">Nenhuma cobrança para hoje</span>
              <span className="empty-state-sub">Não existem contratos vencendo nesta data.</span>
            </div>
          ) : (
            <>
              <div className="dashboard-charges-table-wrapper desktop-table">
                <table className="dashboard-charges-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Telefone</th>
                      <th className="text-right">Principal</th>
                      <th className="text-right">Total</th>
                      <th>Vencimento</th>
                      <th>Situação</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dueTodayPreview.map(l => {
                      const name = formatName(l.cliente);
                      const initials = getInitials(name);
                      return (
                        <tr key={l.id}>
                          <td>
                            <div className="client-name-cell">
                              <span className="client-initials">{initials}</span>
                              <span className="client-name-text">{name}</span>
                            </div>
                          </td>
                          <td className="muted">{l.telefone || '—'}</td>
                          <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(l.valor_emprestado)}</td>
                          <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--gold)' }}>{money(total(l))}</td>
                          <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 13 }}><Calendar size={13} />{localDate(l.data_vencimento)}</span></td>
                          <td><span className="badge badge-gold">Vence hoje</span></td>
                          <td>
                            <Link href={`/contratos/${l.id}`} className="btn btn-dark btn-sm" style={{ whiteSpace: 'nowrap' }}>Abrir</Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards for due today */}
              <div className="mobile-only">
                {dueTodayLoans.slice(0, 5).map(l => {
                  const name = formatName(l.cliente);
                  const initials = getInitials(name);
                  return (
                    <div key={l.id} className="mobile-card">
                      <div className="mobile-card-header">
                        <span className="client-initials">{initials}</span>
                        <div className="mobile-card-client">
                          <div className="mobile-card-client-name">{name}</div>
                          <div className="mobile-card-client-desc">Vence hoje</div>
                        </div>
                        <span className="badge badge-gold" style={{ flexShrink: 0 }}>Vence hoje</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Principal</span>
                        <span className="mobile-card-value">{money(l.valor_emprestado)}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Total</span>
                        <span className="mobile-card-value" style={{ color: 'var(--gold)' }}>{money(total(l))}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Vencimento</span>
                        <span className="mobile-card-value">{localDate(l.data_vencimento)}</span>
                      </div>
                      <div className="mobile-card-actions">
                        <Link href={`/contratos/${l.id}`} className="btn btn-dark btn-sm" style={{ flex: 1, textAlign: 'center' }}>Abrir</Link>
                      </div>
                    </div>
                  );
                })}
                {dueTodayLoans.length > 5 && (
                  <div style={{ textAlign: 'center', marginTop: 8 }}>
                    <Link href="/contratos" className="btn btn-ghost btn-sm">
                      Ver todas ({dueTodayLoans.length}) <ChevronRight size={14} />
                    </Link>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="panel dashboard-recent-card">
          <div className="panel-title">
            <span className="panel-title-left"><FileText size={18} /> Últimos contratos</span>
            <span className="panel-title-right">
              <Link href="/contratos" className="btn btn-ghost btn-sm">
                Ver todos <ArrowRight size={14} />
              </Link>
            </span>
          </div>
          {ultimosContratos.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">📋</span>
              <span className="empty-state-text">Nenhum contrato cadastrado</span>
              <span className="empty-state-sub">Os últimos contratos aparecerão aqui.</span>
            </div>
          ) : (
            <div className="dashboard-recent-list">
              {ultimosContratos.map(l => {
                const sit = situation(l);
                const name = formatName(l.cliente);
                const initials = getInitials(name);
                const corBadge = sit === 'Atrasado' ? 'badge-red' : sit === 'Vence hoje' ? 'badge-gold' : sit === 'Pago' || sit === 'Cancelado' ? 'badge-gray' : 'badge-green';
                const classe = `badge ${corBadge}`;
                return (
                  <Link key={l.id} href={`/contratos/${l.id}`} className="dashboard-recent-item">
                    <div className="dashboard-recent-item-header">
                      <div className="dashboard-recent-item-left">
                        <span className="client-initials">{initials}</span>
                        <div className="dashboard-recent-item-info">
                          <div className="dashboard-recent-client-name">{name}</div>
                          <div className="dashboard-recent-item-sub">Empréstimo</div>
                        </div>
                      </div>
                      <span className={classe}>{sit}</span>
                    </div>
                    <div className="dashboard-recent-item-footer">
                      <span className="dashboard-recent-value">{money(total(l))}</span>
                      <span className="dashboard-recent-date"><Calendar size={12} />{localDate(l.data_vencimento)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="dashboard-quick-actions">
        <h3 className="section-title"><Briefcase size={18} /> Ações rápidas</h3>
        <div className="quick-actions">
          <Link href="/clientes" className="quick-action-btn">
            <div className="quick-action-icon"><UserPlus size={22} /></div>
            <div className="quick-action-info">
              <div className="quick-action-title">Novo Cliente</div>
              <div className="quick-action-desc">Cadastrar novo cliente</div>
            </div>
            <ChevronRight className="quick-action-arrow" size={20} />
          </Link>
          <Link href="/novo-emprestimo" className="quick-action-btn">
            <div className="quick-action-icon"><PlusCircle size={22} /></div>
            <div className="quick-action-info">
              <div className="quick-action-title">Novo Empréstimo</div>
              <div className="quick-action-desc">Criar novo contrato</div>
            </div>
            <ChevronRight className="quick-action-arrow" size={20} />
          </Link>
          <Link href="/relatorios" className="quick-action-btn">
            <div className="quick-action-icon"><BarChart3 size={22} /></div>
            <div className="quick-action-info">
              <div className="quick-action-title">Relatórios</div>
              <div className="quick-action-desc">Exportar dados financeiros</div>
            </div>
            <ChevronRight className="quick-action-arrow" size={20} />
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
