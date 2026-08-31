'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { INSTALLMENT_COLUMNS } from '@/lib/supabase/columns';
import { LOAN_COLUMNS } from '@/lib/supabase/columns';
import { fetchAllRows } from '@/lib/supabase/fetchAll';
import { money, localDate, isoToday, getInstallmentStatus } from '@/lib/finance';
import type { Loan, Installment } from '@/types';
import { asAmount, daysOverdue, sameEntityId } from '@/lib/installments';
import AppShell from '@/components/AppShell';
import { InstallmentPieChart } from '@/components/InstallmentPieChart';
import { InstallmentStats } from '@/components/InstallmentStats';
import {
  AlertTriangle, CheckCircle,
  Search, ChevronDown, PlusCircle,
  Receipt, BarChart3, X, Zap
} from 'lucide-react';
import Link from 'next/link';

type InstallmentContractView = Loan & {
  installments: Installment[];
  total_paid: number;
  total_amount: number;
  remaining_amount: number;
  paid_count: number;
  total_count: number;
  next_due_date: string | null;
  next_amount: number;
  progress: number;
};

export default function ParceladosPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Todos');
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<{ loan: InstallmentContractView; installments: Installment[] } | null>(null);
  const [payModal, setPayModal] = useState<{ installment: Installment; loan: Loan } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setLoading(false);
        return;
      }
      Promise.all([
        fetchAllRows(supabase.from('emprestimos').select(LOAN_COLUMNS).eq('user_id', user.id).eq('contract_type', 'installment').order('data_emprestimo', { ascending: false })),
        fetchAllRows(supabase.from('installments').select(INSTALLMENT_COLUMNS).eq('user_id', user.id).order('due_date')),
      ]).then(([loansData, installmentsData]) => {
        const installmentLoans = loansData as Loan[];
        const contractIds = new Set(installmentLoans.map(loan => String(loan.id)));
        const relatedInstallments = (installmentsData as Installment[])
          .filter(installment => contractIds.has(String(installment.contract_id)))
          .map(installment => ({
            ...installment,
            installment_number: Number(installment.installment_number),
            amount: asAmount(installment.amount),
          }));
        setLoans(installmentLoans);
        setInstallments(relatedInstallments);
        setErrorMsg('');
        setLoading(false);
      }).catch((error: any) => {
        setErrorMsg(error?.message || 'Erro ao carregar dados');
        setLoading(false);
      });
    });
  }, []);

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
  }, [load, reloadKey]);

  const handlePaid = useCallback(async (installmentId: string) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setPayingId(installmentId);
    setErrorMsg('');
    try {
      const now = new Date().toISOString();
      const { data: paidInstallment, error: paymentError } = await supabase
        .from('installments')
        .update({ paid_at: now, status: 'Paga' })
        .eq('id', installmentId)
        .eq('user_id', user.id)
        .is('paid_at', null)
        .select('contract_id')
        .maybeSingle();
      if (paymentError) throw new Error(paymentError.message);
      if (!paidInstallment) throw new Error('Esta parcela já foi recebida ou não está mais disponível.');

      const { count: pendingCount, error: countError } = await supabase
        .from('installments')
        .select('id', { count: 'exact', head: true })
        .eq('contract_id', paidInstallment.contract_id)
        .eq('user_id', user.id)
        .is('paid_at', null);

      if (!countError) {
        const { error: contractStatusError } = await supabase
          .from('emprestimos')
          .update({ status: (pendingCount || 0) === 0 ? 'Pago' : 'Pendente' })
          .eq('id', paidInstallment.contract_id)
          .eq('user_id', user.id)
          .eq('contract_type', 'installment');
        if (contractStatusError) {
          setErrorMsg('A parcela foi recebida, mas o status geral do contrato não pôde ser sincronizado.');
        }
      }
      setPayModal(null);
      setDetails(null);
      setReloadKey(k => k + 1);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('cred-data-changed'));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao registrar pagamento');
    } finally {
      setPayingId(null);
    }
  }, []);

  const contractsWithInstallments = useMemo(() => {
    return loans.map(loan => {
      const insts = installments
        .filter(i => sameEntityId(i.contract_id, loan.id))
        .sort((a, b) => a.installment_number - b.installment_number);
      const paid = insts.filter(i => getInstallmentStatus(i.due_date, i.paid_at) === 'Paga');
      const totalAmount = insts.reduce((sum, installment) => sum + asAmount(installment.amount), 0);
      const totalPaid = paid.reduce((sum, installment) => sum + asAmount(installment.amount), 0);
      const progress = insts.length > 0 ? Math.round((paid.length / insts.length) * 100) : 0;
      const nextInst = insts.filter(i => getInstallmentStatus(i.due_date, i.paid_at) !== 'Paga').sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
      return {
        ...loan,
        installments: insts,
        total_paid: totalPaid,
        total_amount: totalAmount,
        remaining_amount: Math.max(totalAmount - totalPaid, 0),
        paid_count: paid.length,
        total_count: insts.length,
        next_due_date: nextInst?.due_date || null,
        next_amount: nextInst?.amount || 0,
        progress,
      } as InstallmentContractView;
    });
  }, [loans, installments]);

  const filteredContracts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contractsWithInstallments.filter(contract => {
      const statuses = contract.installments.map(installment => getInstallmentStatus(installment.due_date, installment.paid_at));
      const isPaid = statuses.length > 0 && statuses.every(status => status === 'Paga');
      const hasOverdue = statuses.includes('Atrasada');
      const hasDueToday = statuses.includes('Vence hoje');
      const hasOpen = statuses.some(status => status !== 'Paga');

      const matchesSearch = !term || `${contract.cliente} ${contract.telefone || ''} ${contract.descricao} ${contract.id} ${contract.installments.map(i => i.installment_number).join(' ')}`
        .toLowerCase()
        .includes(term);
      if (!matchesSearch) return false;
      if (filter === 'Em dia') return hasOpen && !hasOverdue && !hasDueToday;
      if (filter === 'Vence hoje') return hasDueToday;
      if (filter === 'Atrasados') return hasOverdue;
      if (filter === 'Quitados') return isPaid;
      return true;
    });
  }, [contractsWithInstallments, filter, search]);

  const today = isoToday();
  const vencemHoje = installments.filter(i => getInstallmentStatus(i.due_date, i.paid_at) === 'Vence hoje');
  const atrasadas = installments.filter(i => getInstallmentStatus(i.due_date, i.paid_at) === 'Atrasada');
  const sortedContracts = useMemo(() => {
    return [...filteredContracts].sort((a, b) => {
      const aAtrasada = a.installments.some(i => getInstallmentStatus(i.due_date, i.paid_at) === 'Atrasada');
      const bAtrasada = b.installments.some(i => getInstallmentStatus(i.due_date, i.paid_at) === 'Atrasada');
      const aVenceHoje = a.installments.some(i => getInstallmentStatus(i.due_date, i.paid_at) === 'Vence hoje');
      const bVenceHoje = b.installments.some(i => getInstallmentStatus(i.due_date, i.paid_at) === 'Vence hoje');
      if (aAtrasada && !bAtrasada) return -1;
      if (!aAtrasada && bAtrasada) return 1;
      if (aVenceHoje && !bVenceHoje) return -1;
      if (!aVenceHoje && bVenceHoje) return 1;
      const aNext = a.next_due_date || '9999-99-99';
      const bNext = b.next_due_date || '9999-99-99';
      return aNext.localeCompare(bNext);
    });
  }, [filteredContracts]);

  const pagaCount = installments.filter(i => getInstallmentStatus(i.due_date, i.paid_at) === 'Paga').length;
  const totalInstallments = installments.length;

  const filters = ['Todos', 'Em dia', 'Vence hoje', 'Atrasados', 'Quitados'];

  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-header-title">PARCELADOS</h1>
          <p className="page-header-subtitle">Controle de contratos parcelados, recebimentos, parcelas e vencimentos.</p>
        </div>
        <div className="page-header-right">
          <Link href="/novo-emprestimo" className="btn btn-gold">
            <PlusCircle size={18} /> Novo Parcelado
          </Link>
        </div>
      </div>

      {errorMsg && (
        <div className="error" style={{ marginBottom: 16 }}>{errorMsg}</div>
      )}

      {loading ? (
        <div className="panel" style={{ textAlign: 'center', padding: 48 }}>
          <div className="empty-state">
            <span className="empty-state-icon">⏳</span>
            <span className="empty-state-text">Carregando...</span>
          </div>
        </div>
      ) : (
        <>
          <InstallmentStats installments={installments} loans={loans} />

          <section className="grid two-col" style={{ marginBottom: 20 }}>
            <InstallmentPieChart installments={installments} />
            <div className="panel">
              <div className="panel-title">
                <span className="panel-title-left"><BarChart3 size={18} /> Resumo</span>
              </div>
              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Total de parcelas</span>
                  <span style={{ fontWeight: 800 }}>{totalInstallments}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Pagas</span>
                  <span style={{ fontWeight: 800, color: 'var(--green)' }}>{pagaCount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Pendentes</span>
                  <span style={{ fontWeight: 800, color: 'var(--gold)' }}>{totalInstallments - pagaCount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Taxa de pagamento</span>
                  <span style={{ fontWeight: 800 }}>{totalInstallments > 0 ? Math.round((pagaCount / totalInstallments) * 100) : 0}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Vencem hoje</span>
                  <span style={{ fontWeight: 800, color: vencemHoje.length > 0 ? 'var(--yellow)' : 'var(--text)' }}>{vencemHoje.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Atrasadas</span>
                  <span style={{ fontWeight: 800, color: atrasadas.length > 0 ? 'var(--red)' : 'var(--text)' }}>{atrasadas.length}</span>
                </div>
              </div>
            </div>
          </section>

          {/* VENCEM HOJE */}
          {vencemHoje.length > 0 && (
            <section className="panel" style={{ marginBottom: 20, borderColor: 'rgba(234,179,8,0.3)' }}>
              <div className="panel-title">
                <span className="panel-title-left"><Zap size={18} /> Vencem Hoje</span>
                <span className="badge" style={{ background: 'rgba(234,179,8,0.08)', color: 'var(--yellow)', borderColor: 'rgba(234,179,8,0.25)' }}>{vencemHoje.length}</span>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {vencemHoje.map(inst => {
                  const loan = loans.find(l => sameEntityId(l.id, inst.contract_id));
                  if (!loan) return null;
                  const totalCount = contractsWithInstallments.find(contract => sameEntityId(contract.id, loan.id))?.total_count || 0;
                  return (
                    <div key={inst.id} className="contract-mini" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <span style={{ fontWeight: 700 }}>{loan.cliente}</span>
                        <span className="muted" style={{ marginLeft: 12 }}>Parcela {inst.installment_number}/{totalCount}</span>
                      </div>
                      <span style={{ fontWeight: 800, color: 'var(--gold)' }}>{money(inst.amount)}</span>
                      <span className="badge" style={{ background: 'rgba(234,179,8,0.08)', color: 'var(--yellow)', borderColor: 'rgba(234,179,8,0.25)' }}>Vence hoje</span>
                      <button className="btn btn-gold btn-sm" onClick={() => setPayModal({ installment: inst, loan })}>
                        <Receipt size={14} /> Receber
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ATRASADOS */}
          {atrasadas.length > 0 && (
            <section className="panel" style={{ marginBottom: 20, borderColor: 'rgba(239,68,68,0.3)' }}>
              <div className="panel-title">
                <span className="panel-title-left"><AlertTriangle size={18} /> Parceladas Atrasadas</span>
                <span className="badge" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--red)', borderColor: 'rgba(239,68,68,0.25)' }}>{atrasadas.length}</span>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {atrasadas.map(inst => {
                  const loan = loans.find(l => sameEntityId(l.id, inst.contract_id));
                  if (!loan) return null;
                  const totalCount = contractsWithInstallments.find(contract => sameEntityId(contract.id, loan.id))?.total_count || 0;
                  const diasAtraso = daysOverdue(inst.due_date, today);
                  return (
                    <div key={inst.id} className="contract-mini" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <span style={{ fontWeight: 700 }}>{loan.cliente}</span>
                        <span className="muted" style={{ marginLeft: 12 }}>Parcela {inst.installment_number}/{totalCount}</span>
                      </div>
                      <span style={{ fontWeight: 800, color: 'var(--red)' }}>{money(inst.amount)}</span>
                      <span className="badge" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--red)', borderColor: 'rgba(239,68,68,0.25)' }}>Atrasada há {diasAtraso}d</span>
                      <button className="btn btn-gold btn-sm" onClick={() => setPayModal({ installment: inst, loan })}>
                        <Receipt size={14} /> Receber
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* BUSCA E FILTROS */}
          <div className="filter-row">
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                className="input"
                placeholder="Buscar parcelado por cliente, telefone ou contrato..."
                value={search}
                onChange={e => { setSearch(e.target.value); setFilter('Todos'); }}
                style={{ paddingLeft: 40 }}
              />
            </div>
            <div className="chip-group">
              {filters.map(f => (
                <button
                  key={f}
                  className={`chip ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {filteredContracts.length === 0 ? (
            <div className="panel" style={{ textAlign: 'center', padding: 48 }}>
              <div className="empty-state">
                <span className="empty-state-icon" style={{ fontSize: 48 }}>📋</span>
                <span className="empty-state-text">Nenhum contrato parcelado encontrado</span>
                <span className="empty-state-sub">Tente alterar os filtros ou crie um novo contrato parcelado.</span>
              </div>
            </div>
          ) : (
            <>
              <div className="table-wrap desktop-table">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Principal</th>
                      <th>Total</th>
                      <th>Parcelas</th>
                      <th>Pagas</th>
                      <th>Recebido</th>
                      <th>Restante</th>
                      <th>Próx. Venc.</th>
                      <th>Próx. Valor</th>
                      <th>Progresso</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedContracts.map(loan => {
                      const status = loan.total_count === 0 ? 'SEM PARCELAS' : loan.progress === 100 ? 'QUITADO' :
                        loan.installments.some(i => getInstallmentStatus(i.due_date, i.paid_at) === 'Atrasada') ? 'ATRASADO' : 'EM DIA';
                      const statusColor = status === 'QUITADO' ? 'badge-gray' :
                        status === 'ATRASADO' || status === 'SEM PARCELAS' ? 'badge-red' : 'badge-green';
                      return (
                        <tr key={loan.id}>
                          <td>
                            <div className="client-name-cell">
                              <span className="client-initials">{loan.cliente.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</span>
                              <div>
                                <span className="client-name-text">{loan.cliente}</span>
                                <div className="muted" style={{ fontSize: 12 }}>Parcelado</div>
                              </div>
                            </div>
                          </td>
                          <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(loan.valor_emprestado)}</td>
                          <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--gold)' }}>{money(loan.total_amount)}</td>
                          <td style={{ textAlign: 'center' }}>{loan.paid_count}/{loan.total_count}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ color: 'var(--green)', fontWeight: 700 }}>{loan.paid_count}</span>
                          </td>
                          <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(loan.total_paid)}</td>
                          <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{money(loan.remaining_amount)}</td>
                          <td style={{ textAlign: 'center' }}>{loan.next_due_date ? localDate(loan.next_due_date) : '—'}</td>
                          <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(loan.next_amount)}</td>
                          <td style={{ minWidth: 120 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div className="bar" style={{ flex: 1 }}>
                                <span style={{ width: `${loan.progress}%`, background: loan.progress === 100 ? 'var(--green)' : 'var(--gold)' }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 700, minWidth: 36 }}>{loan.progress}%</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`badge ${statusColor}`}>{status}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                              <button className="btn btn-dark btn-sm" onClick={() => setDetails({ loan, installments: loan.installments })} aria-label="Ver detalhes">
                                <ChevronDown size={14} />
                              </button>
                              <Link href={`/contratos/${loan.id}`} className="btn btn-ghost btn-sm">Editar</Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="mobile-only">
                {sortedContracts.map(loan => {
                  const status = loan.total_count === 0 ? 'SEM PARCELAS' : loan.progress === 100 ? 'QUITADO' :
                    loan.installments.some(i => getInstallmentStatus(i.due_date, i.paid_at) === 'Atrasada') ? 'ATRASADO' : 'EM DIA';
                  const statusColor = status === 'QUITADO' ? 'badge-gray' :
                    status === 'ATRASADO' || status === 'SEM PARCELAS' ? 'badge-red' : 'badge-green';
                  return (
                    <div key={loan.id} className="mobile-card">
                      <div className="mobile-card-header">
                        <span className="client-initials">{loan.cliente.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</span>
                        <div className="mobile-card-client">
                          <div className="mobile-card-client-name">{loan.cliente}</div>
                          <div className="mobile-card-client-desc">Parcelado • {loan.paid_count}/{loan.total_count} parcelas</div>
                        </div>
                        <span className={`badge ${statusColor}`} style={{ flexShrink: 0 }}>{status}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Principal</span>
                        <span className="mobile-card-value">{money(loan.valor_emprestado)}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Total</span>
                        <span className="mobile-card-value" style={{ color: 'var(--gold)' }}>{money(loan.total_amount || 0)}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Recebido</span>
                        <span className="mobile-card-value" style={{ color: 'var(--green)' }}>{money(loan.total_paid)}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Restante</span>
                        <span className="mobile-card-value">{money(loan.remaining_amount)}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Próximo venc.</span>
                        <span className="mobile-card-value">{loan.next_due_date ? localDate(loan.next_due_date) : '—'}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Progresso</span>
                        <span className="mobile-card-value">{loan.progress}%</span>
                      </div>
                      <div className="mobile-card-actions">
                        <button className="btn btn-gold btn-sm" style={{ flex: 1 }} onClick={() => setDetails({ loan, installments: loan.installments })}>
                          <BarChart3 size={14} /> Ver detalhes
                        </button>
                        <Link href={`/contratos/${loan.id}`} className="btn btn-dark btn-sm" style={{ flex: 1, textAlign: 'center' }}>Editar</Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* DETAIL PANEL */}
          {details && (
            <div className="modal-overlay" onClick={() => setDetails(null)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
                <div className="modal-title">
                  <span>Detalhes do Parcelado</span>
                  <button className="modal-close" onClick={() => setDetails(null)}><X size={16} /></button>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ color: 'var(--gold-light)', fontWeight: 800, fontSize: 18, marginBottom: 8 }}>{details.loan.cliente}</h3>
                  <div className="client-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                    <div className="client-stat">
                      <div className="client-stat-label">Principal</div>
                      <div className="client-stat-value">{money(details.loan.valor_emprestado)}</div>
                    </div>
                    <div className="client-stat">
                      <div className="client-stat-label">Total</div>
                      <div className="client-stat-value" style={{ color: 'var(--gold)' }}>{money(details.loan.total_amount || 0)}</div>
                    </div>
                    <div className="client-stat">
                      <div className="client-stat-label">Parcelas</div>
                      <div className="client-stat-value">{details.loan.paid_count}/{details.loan.total_count}</div>
                    </div>
                    <div className="client-stat">
                      <div className="client-stat-label">Recebido</div>
                      <div className="client-stat-value" style={{ color: 'var(--green)' }}>{money(details.loan.total_paid)}</div>
                    </div>
                    <div className="client-stat">
                      <div className="client-stat-label">Restante</div>
                      <div className="client-stat-value">{money(details.loan.remaining_amount)}</div>
                    </div>
                  </div>
                </div>

                <h4 style={{ color: 'var(--gold-light)', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Histórico de Parcelas</h4>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Valor</th>
                        <th>Vencimento</th>
                        <th>Status</th>
                        <th>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.installments.map(inst => (
                        <tr key={inst.id}>
                          <td style={{ textAlign: 'center' }}>{inst.installment_number}</td>
                          <td style={{ fontWeight: 700 }}>{money(inst.amount)}</td>
                          <td style={{ textAlign: 'center' }}>{localDate(inst.due_date)}</td>
                          <td style={{ textAlign: 'center' }}>
                             <span className={`badge ${getInstallmentStatus(inst.due_date, inst.paid_at) === 'Paga' ? 'badge-green' : getInstallmentStatus(inst.due_date, inst.paid_at) === 'Atrasada' ? 'badge-red' : getInstallmentStatus(inst.due_date, inst.paid_at) === 'Vence hoje' ? 'badge-gold' : 'badge-gray'}`}>
                               {getInstallmentStatus(inst.due_date, inst.paid_at)}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {getInstallmentStatus(inst.due_date, inst.paid_at) !== 'Paga' && (
                              <button className="btn btn-gold btn-sm" onClick={() => setPayModal({ installment: inst, loan: details.loan })}>
                                <Receipt size={14} /> Receber
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* PAYMENT MODAL */}
          {payModal && (
            <div className="modal-overlay" onClick={() => setPayModal(null)}>
              <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
                <div className="modal-title">
                  <span>Receber Parcela</span>
                  <button className="modal-close" onClick={() => setPayModal(null)}><X size={16} /></button>
                </div>
                <div style={{ padding: '16px 0' }}>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Cliente</div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{payModal.loan.cliente}</div>
                  </div>
                  <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Parcela</span>
                      <span style={{ fontWeight: 700 }}>{payModal.installment.installment_number}/{contractsWithInstallments.find(contract => sameEntityId(contract.id, payModal.loan.id))?.total_count || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Valor</span>
                      <span style={{ fontWeight: 700, color: 'var(--gold)' }}>{money(payModal.installment.amount)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Vencimento</span>
                      <span style={{ fontWeight: 700 }}>{localDate(payModal.installment.due_date)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-gold" style={{ flex: 1 }} onClick={() => handlePaid(payModal.installment.id)} disabled={payingId === payModal.installment.id}>
                      <CheckCircle size={16} /> {payingId === payModal.installment.id ? 'Registrando...' : 'Confirmar Recebimento'}
                    </button>
                    <button className="btn btn-dark" onClick={() => setPayModal(null)}>Cancelar</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
