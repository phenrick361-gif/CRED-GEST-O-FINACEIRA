'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { addMonth, interest, localDate, money, situation, total, hasInterest, formatName } from '@/lib/finance';
import type { Loan } from '@/types';
import { Edit, Calendar, DollarSign, RefreshCw, CheckCircle, Copy, Trash2, MoreHorizontal, ChevronDown, ChevronUp } from 'lucide-react';

export default function ContractsTable({ loans, onChanged }: { loans: Loan[]; onChanged?: () => void }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Todos');
  const [busy, setBusy] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [cardDetails, setCardDetails] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);
  const itemsPerPage = 10;

  const reload = () => onChanged?.();

  function toggleCardDetails(id: string) {
    setCardDetails(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(null);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const filtered = useMemo(() => {
    return loans.filter(l => {
      const hay = `${l.cliente} ${l.telefone || ''} ${l.descricao} ${l.id}`.toLowerCase();
      const match = hay.includes(search.toLowerCase());
      const sit = situation(l);
      let statusMatch = true;
      if (filter === 'Em dia') statusMatch = sit === 'Em dia';
      else if (filter === 'Vence hoje') statusMatch = sit === 'Vence hoje';
      else if (filter === 'Atrasados') statusMatch = sit === 'Atrasado';
      else if (filter === 'Pagos') statusMatch = sit === 'Pago';
      else if (filter === 'Com juros') statusMatch = hasInterest(l);
      else if (filter === 'Sem juros') statusMatch = !hasInterest(l);
      return match && statusMatch;
    });
  }, [loans, search, filter]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentItems = filtered.slice(startIndex, startIndex + itemsPerPage);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(Math.max(1, totalPages));
  }, [totalPages, currentPage]);

  function toggleMenu(id: string) {
    setOpenMenu(openMenu === id ? null : id);
  }

  async function act(loan: Loan, kind: 'paid' | 'interest' | 'renew' | 'delete' | 'duplicate') {
    if (kind === 'delete' && !confirm(`Excluir o contrato de ${loan.cliente}?`)) return;
    setBusy(loan.id + kind);
    setOpenMenu(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }

    try {
      if (kind === 'delete') {
        await supabase.from('emprestimos').delete().eq('id', loan.id).eq('user_id', user.id);
      }
      if (kind === 'paid') {
        await supabase.from('pagamentos').insert({
          user_id: user.id, emprestimo_id: loan.id, tipo: 'Total', valor: total(loan)
        });
        await supabase.from('emprestimos').update({ status: 'Pago' }).eq('id', loan.id).eq('user_id', user.id);
      }
      if (kind === 'interest') {
        await supabase.from('pagamentos').insert({
          user_id: user.id, emprestimo_id: loan.id, tipo: 'Juros', valor: interest(loan)
        });
        await supabase.from('emprestimos').update({
          status: 'Pendente', data_vencimento: addMonth(loan.data_vencimento)
        }).eq('id', loan.id).eq('user_id', user.id);
      }
      if (kind === 'renew') {
        await supabase.from('emprestimos').update({
          data_vencimento: addMonth(loan.data_vencimento), status: 'Pendente'
        }).eq('id', loan.id).eq('user_id', user.id);
      }
      if (kind === 'duplicate') {
        const { id, created_at, updated_at, ...rest } = loan;
        await supabase.from('emprestimos').insert({
          ...rest, user_id: user.id, status: 'Pendente',
          data_emprestimo: new Date().toISOString().slice(0, 10),
          data_vencimento: addMonth(new Date().toISOString().slice(0, 10))
        });
      }
    } catch (error) {
      console.error('Erro ao executar ação:', error);
    } finally {
      setBusy('');
      reload();
    }
  }

  async function changeDueDate(loan: Loan) {
    setOpenMenu(null);
    const newDate = prompt('Nova data de vencimento (AAAA-MM-DD):', loan.data_vencimento);
    if (!newDate || !newDate.match(/^\d{4}-\d{2}-\d{2}$/)) return;
    setBusy('date_' + loan.id);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    const { error } = await supabase.from('emprestimos')
      .update({ data_vencimento: newDate })
      .eq('id', loan.id)
      .eq('user_id', user.id);
    setBusy('');
    if (error) {
      console.error('Erro ao alterar vencimento:', error);
      return;
    }
    reload();
  }

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) { setCurrentPage(page); }
  };

  const filters = ['Todos', 'Em dia', 'Vence hoje', 'Atrasados', 'Pagos', 'Com juros', 'Sem juros'];

  return (
    <>
      <div className="filter-row">
        <input
          className="input"
          placeholder="Buscar por cliente, telefone ou contrato..."
          value={search}
          onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
        />
        <div className="chip-group">
          {filters.map(f => (
            <button
              key={f}
              className={`chip ${filter === f ? 'active' : ''}`}
              onClick={() => { setFilter(f); setCurrentPage(1); }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center', padding: 48 }}>
          <div className="empty-state">
            <span className="empty-state-icon" style={{ fontSize: 48 }}>📋</span>
            <span className="empty-state-text">Nenhum contrato encontrado</span>
            <span className="empty-state-sub">Tente alterar os filtros ou cadastre um novo empréstimo.</span>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrap desktop-table">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Telefone</th>
                  <th className="text-right">Principal</th>
                  <th className="text-right">Juros</th>
                  <th className="text-right">Total</th>
                  <th style={{ textAlign: 'center' }}>Vencimento</th>
                  <th style={{ textAlign: 'center' }}>Situação</th>
                  <th style={{ textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                  {currentItems.map(l => {
                  const sit = situation(l);
                  const name = formatName(l.cliente);
                  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
                  const corBadge = sit === 'Atrasado' ? 'badge-red' : sit === 'Vence hoje' ? 'badge-gold' : sit === 'Pago' ? 'badge-gray' : 'badge-green';
                  return (
                    <tr key={l.id}>
                      <td>
                        <div className="client-name-cell">
                          <span className="client-initials">{initials}</span>
                          <div>
                            <span className="client-name-text">{name}</span>
                            <div className="muted" style={{ fontSize: 12 }}>{l.descricao}</div>
                          </div>
                        </div>
                      </td>
                      <td className="muted">{l.telefone || '—'}</td>
                      <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(l.valor_emprestado)}</td>
                      <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(interest(l))}</td>
                      <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: 'var(--gold)' }}>{money(total(l))}</td>
                      <td style={{ textAlign: 'center' }}>{localDate(l.data_vencimento)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${corBadge}`}>{sit}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="action-menu-wrap">
                          <button className="action-menu-btn" onClick={() => toggleMenu(l.id)} disabled={!!busy}>
                            <MoreHorizontal size={18} />
                          </button>
                          {openMenu === l.id && (
                            <div className="action-menu open" ref={menuRef}>
                              <Link href={`/contratos/${l.id}`} className="action-menu-item" onClick={() => setOpenMenu(null)}>
                                <Edit size={16} /> Editar contrato
                              </Link>
                              <button className="action-menu-item" onClick={() => changeDueDate(l)} disabled={!!busy}>
                                <Calendar size={16} /> Alterar vencimento
                              </button>
                              {l.status === 'Pendente' && (
                                <>
                                  <button className="action-menu-item" disabled={!!busy} onClick={() => act(l, 'interest')}>
                                    <DollarSign size={16} /> Receber juros
                                  </button>
                                  <button className="action-menu-item" disabled={!!busy} onClick={() => act(l, 'renew')}>
                                    <RefreshCw size={16} /> Renovar contrato
                                  </button>
                                  <button className="action-menu-item" disabled={!!busy} onClick={() => act(l, 'paid')}>
                                    <CheckCircle size={16} /> Quitar contrato
                                  </button>
                                </>
                              )}
                              <button className="action-menu-item" disabled={!!busy} onClick={() => act(l, 'duplicate')}>
                                <Copy size={16} /> Duplicar contrato
                              </button>
                              <div className="action-menu-divider" />
                              <button className="action-menu-item danger" disabled={!!busy} onClick={() => act(l, 'delete')}>
                                <Trash2 size={16} /> Excluir contrato
                              </button>
                            </div>
                          )}
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
            {currentItems.map(l => {
              const sit = situation(l);
              const name = formatName(l.cliente);
              const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
              const corBadge = sit === 'Atrasado' ? 'badge-red' : sit === 'Vence hoje' ? 'badge-gold' : sit === 'Pago' ? 'badge-gray' : 'badge-green';
              const open = cardDetails.has(l.id);
              return (
                <div key={l.id} className="mobile-card">
                  <div className="mobile-card-header">
                    <span className="client-initials">{initials}</span>
                    <div className="mobile-card-client">
                      <div className="mobile-card-client-name">{name}</div>
                      {l.descricao && <div className="mobile-card-client-desc">{l.descricao}</div>}
                    </div>
                    <span className={`badge ${corBadge}`} style={{ flexShrink: 0 }}>{sit}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Principal</span>
                    <span className="mobile-card-value" style={{ color: 'var(--text)' }}>{money(l.valor_emprestado)}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Total</span>
                    <span className="mobile-card-value" style={{ color: 'var(--gold)' }}>{money(total(l))}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Vencimento</span>
                    <span className="mobile-card-value">{localDate(l.data_vencimento)}</span>
                  </div>
                  <div className={`mobile-card-details ${open ? 'open' : ''}`}>
                    <div className="mobile-card-detail-row">
                      <span className="mobile-card-detail-label">Telefone</span>
                      <span className="mobile-card-detail-value">{l.telefone || '—'}</span>
                    </div>
                    <div className="mobile-card-detail-row">
                      <span className="mobile-card-detail-label">Juros</span>
                      <span className="mobile-card-detail-value">{money(interest(l))}</span>
                    </div>
                    <div className="mobile-card-detail-row">
                      <span className="mobile-card-detail-label">Data</span>
                      <span className="mobile-card-detail-value">{localDate(l.data_emprestimo)}</span>
                    </div>
                  </div>
                  <div className="mobile-card-actions">
                    <button className="card-details-toggle" onClick={() => toggleCardDetails(l.id)}>
                      {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {open ? 'Menos detalhes' : 'Ver detalhes'}
                    </button>
                    <div className="action-menu-wrap">
                      <button className="action-menu-btn" onClick={() => toggleMenu(l.id)} disabled={!!busy}>
                        <MoreHorizontal size={16} />
                      </button>
                      {openMenu === l.id && (
                        <div className="action-menu open" ref={menuRef}>
                          <Link href={`/contratos/${l.id}`} className="action-menu-item" onClick={() => setOpenMenu(null)}>
                            <Edit size={16} /> Editar contrato
                          </Link>
                          <button className="action-menu-item" onClick={() => changeDueDate(l)} disabled={!!busy}>
                            <Calendar size={16} /> Alterar vencimento
                          </button>
                          {l.status === 'Pendente' && (
                            <>
                              <button className="action-menu-item" disabled={!!busy} onClick={() => act(l, 'interest')}>
                                <DollarSign size={16} /> Receber juros
                              </button>
                              <button className="action-menu-item" disabled={!!busy} onClick={() => act(l, 'renew')}>
                                <RefreshCw size={16} /> Renovar contrato
                              </button>
                              <button className="action-menu-item" disabled={!!busy} onClick={() => act(l, 'paid')}>
                                <CheckCircle size={16} /> Quitar contrato
                              </button>
                            </>
                          )}
                          <button className="action-menu-item" disabled={!!busy} onClick={() => act(l, 'duplicate')}>
                            <Copy size={16} /> Duplicar contrato
                          </button>
                          <div className="action-menu-divider" />
                          <button className="action-menu-item danger" disabled={!!busy} onClick={() => act(l, 'delete')}>
                            <Trash2 size={16} /> Excluir contrato
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="pagination-controls" style={{ marginTop: 16 }}>
              <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="btn btn-dark btn-sm">
                ← Anterior
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, currentPage - 2);
                const page = start + i;
                if (page > totalPages) return null;
                return (
                  <button key={page} onClick={() => goToPage(page)} className={`btn btn-sm ${page === currentPage ? 'btn-gold' : 'btn-dark'}`}>
                    {page}
                  </button>
                );
              })}
              <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="btn btn-dark btn-sm">
                Próximo →
              </button>
              <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                Página {currentPage} de {totalPages} ({filtered.length} contratos)
              </span>
            </div>
          )}
        </>
      )}
    </>
  );
}
