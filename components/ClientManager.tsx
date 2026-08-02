'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { addMonth, interest, localDate, money, situation, total, formatName } from '@/lib/finance';
import type { Loan } from '@/types';
import Link from 'next/link';
import { Edit, Calendar, DollarSign, RefreshCw, CheckCircle, Copy, Trash2, MoreHorizontal, ArrowLeft, UserPlus, Search } from 'lucide-react';

type ClientGroup = {
  name: string;
  phone: string;
  items: Loan[];
  totalEmprestado: number;
  totalAReceber: number;
  ativos: number;
  pagos: number;
  atrasados: number;
};

const statusValidos = new Set(['Pendente', 'Pago', 'Cancelado']);

function sanitize(v: string) { return v.replace(/[<>]/g, '').trim(); }

const today = () => new Date().toISOString().slice(0, 10);

export default function ClientManager({ loans, onChanged }: { loans: Loan[]; onChanged?: () => void }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Todos');
  const [sort, setSort] = useState('nome');
  const [selected, setSelected] = useState<string | null>(null);
  const [editContract, setEditContract] = useState<Loan | null>(null);
  const [editClient, setEditClient] = useState<{ name: string; phone: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ type: 'client' | 'contract'; item: any } | null>(null);
  const [busy, setBusy] = useState('');
  const [notif, setNotif] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const reload = () => onChanged?.();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
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

  function notify(msg: string) { setNotif(msg); setTimeout(() => setNotif(''), 3500); }

  const groups = useMemo(() => {
    const map = new Map<string, Loan[]>();
    loans.forEach(l => map.set(l.cliente, [...(map.get(l.cliente) || []), l]));
    return [...map.entries()].map(([name, items]) => ({
      name, phone: items.find(i => i.telefone)?.telefone || '', items,
      totalEmprestado: items.reduce((s, l) => s + Number(l.valor_emprestado), 0),
      totalAReceber: items.filter(i => i.status === 'Pendente').reduce((s, l) => s + total(l), 0),
      ativos: items.filter(i => i.status === 'Pendente').length,
      pagos: items.filter(i => i.status === 'Pago').length,
      atrasados: items.filter(i => i.status === 'Pendente' && i.data_vencimento < today()).length,
    }));
  }, [loans]);

  const filtered = useMemo(() => {
    let r = groups;
    if (search) { const q = search.toLowerCase(); r = r.filter(c => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)); }
    if (filter !== 'Todos') {
      r = r.filter(c => {
        if (filter === 'Em dia') return c.items.some(l => situation(l) === 'Em dia');
        if (filter === 'Vence hoje') return c.items.some(l => situation(l) === 'Vence hoje');
        if (filter === 'Com contratos ativos') return c.ativos > 0;
        if (filter === 'Com contratos atrasados') return c.atrasados > 0;
        if (filter === 'Sem contratos') return c.items.length === 0;
        if (filter === 'Quitados') return c.pagos > 0 && c.ativos === 0;
        return true;
      });
    }
    r = [...r].sort((a, b) => {
      if (sort === 'nome') return a.name.localeCompare(b.name);
      if (sort === 'valor') return b.totalEmprestado - a.totalEmprestado;
      if (sort === 'vencimento') {
        const aD = a.items.reduce((m, l) => l.data_vencimento < m ? l.data_vencimento : m, '9999-99-99');
        const bD = b.items.reduce((m, l) => l.data_vencimento < m ? l.data_vencimento : m, '9999-99-99');
        return aD.localeCompare(bD);
      }
      return 0;
    });
    return r;
  }, [groups, search, filter, sort]);

  const selData = selected ? groups.find(c => c.name === selected) || null : null;

  useEffect(() => {
    if (selected && !groups.some(c => c.name === selected)) setSelected(null);
  }, [selected, groups]);

  async function act(loan: Loan, kind: 'paid' | 'interest' | 'renew' | 'delete' | 'duplicate') {
    if (kind === 'delete') { setConfirmDel({ type: 'contract', item: loan }); return; }
    setBusy(loan.id + kind); setOpenMenu(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    try {
      if (kind === 'paid') {
        await supabase.from('pagamentos').insert({ user_id: user.id, emprestimo_id: loan.id, tipo: 'Total', valor: total(loan) });
        await supabase.from('emprestimos').update({ status: 'Pago' }).eq('id', loan.id).eq('user_id', user.id);
        notify(`Contrato de ${loan.cliente} marcado como pago.`);
      }
      if (kind === 'interest') {
        await supabase.from('pagamentos').insert({ user_id: user.id, emprestimo_id: loan.id, tipo: 'Juros', valor: interest(loan) });
        await supabase.from('emprestimos').update({ status: 'Pendente', data_vencimento: addMonth(loan.data_vencimento) }).eq('id', loan.id).eq('user_id', user.id);
        notify(`Juros de ${loan.cliente} registrados. Vencimento renovado.`);
      }
      if (kind === 'renew') {
        await supabase.from('emprestimos').update({ data_vencimento: addMonth(loan.data_vencimento), status: 'Pendente' }).eq('id', loan.id).eq('user_id', user.id);
        notify(`Contrato de ${loan.cliente} renovado.`);
      }
      if (kind === 'duplicate') {
        const { id, created_at, updated_at, ...rest } = loan;
        await supabase.from('emprestimos').insert({
          ...rest, user_id: user.id, status: 'Pendente',
          data_emprestimo: today(),
          data_vencimento: addMonth(today())
        });
        notify(`Contrato de ${loan.cliente} duplicado.`);
      }
    } catch (err: any) { notify(`Erro: ${err.message}`); }
    finally { setBusy(''); reload(); }
  }

  async function changeDueDate(loan: Loan) {
    setOpenMenu(null);
    const newDate = prompt('Nova data de vencimento (AAAA-MM-DD):', loan.data_vencimento);
    if (!newDate || !newDate.match(/^\d{4}-\d{2}-\d{2}$/)) return;
    setBusy('date_' + loan.id);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    try {
      const { error } = await supabase.from('emprestimos').update({ data_vencimento: newDate }).eq('id', loan.id).eq('user_id', user.id);
      if (error) throw error;
      notify(`Vencimento de ${loan.cliente} alterado para ${newDate}.`);
    } catch (err: any) { notify(`Erro: ${err.message}`); }
    finally { setBusy(''); reload(); }
  }

  async function deleteContract(loan: Loan) {
    setBusy('del_' + loan.id); setOpenMenu(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    try {
      await supabase.from('emprestimos').delete().eq('id', loan.id).eq('user_id', user.id);
      notify(`Contrato de ${loan.cliente} excluído.`); setConfirmDel(null); reload();
    } catch (err: any) { notify(`Erro: ${err.message}`); }
    finally { setBusy(''); }
  }

  async function deleteClient(clientName: string) {
    setBusy('delc_' + clientName);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    try {
      const { error } = await supabase.from('emprestimos').delete().eq('user_id', user.id).eq('cliente', clientName);
      if (error) throw error;
      notify(`Cliente ${clientName} excluído.`); setConfirmDel(null); setSelected(null); reload();
    } catch (err: any) { notify(`Erro: ${err.message}`); }
    finally { setBusy(''); }
  }

  async function saveContract() {
    if (!editContract) return;
    setBusy('save_' + editContract.id);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    try {
      const { error } = await supabase.from('emprestimos').update({
        cliente: sanitize(editContract.cliente), telefone: sanitize(editContract.telefone || '') || null,
        descricao: sanitize(editContract.descricao), valor_emprestado: Number(editContract.valor_emprestado),
        porcentagem_juros: Number(editContract.porcentagem_juros), data_vencimento: editContract.data_vencimento,
        modalidade: editContract.modalidade, periodicidade: editContract.periodicidade,
        status: statusValidos.has(editContract.status as any) ? editContract.status : 'Pendente',
        prazo_meses: Number(editContract.prazo_meses) || 1,
      }).eq('id', editContract.id).eq('user_id', user.id);
      if (error) throw error;
      notify('Contrato atualizado com sucesso.'); setEditContract(null); reload();
    } catch (err: any) { notify(`Erro: ${err.message}`); }
    finally { setBusy(''); }
  }

  async function saveClient() {
    if (!editClient) return;
    setBusy('savec');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    try {
      const { error } = await supabase.from('emprestimos').update({ telefone: sanitize(editClient.phone) || null }).eq('user_id', user.id).eq('cliente', editClient.name);
      if (error) throw error;
      notify('Cliente atualizado com sucesso.'); setEditClient(null); reload();
    } catch (err: any) { notify(`Erro: ${err.message}`); }
    finally { setBusy(''); }
  }

  const clientFilters = ['Todos', 'Com contratos ativos', 'Com contratos atrasados', 'Quitados', 'Em dia', 'Vence hoje'];

  return (
    <>
      {notif && <div className="notification">✅ {notif}</div>}

      {!selected ? (
        <>
          <div className="filter-row">
            <input className="input" placeholder="Buscar por nome ou telefone..." value={search} onChange={e => setSearch(e.target.value)} />
            <div className="chip-group">
              {clientFilters.map(f => (
                <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="panel" style={{ textAlign: 'center', padding: 48 }}>
              <div className="empty-state">
                <span className="empty-state-icon" style={{ fontSize: 48 }}>👥</span>
                <span className="empty-state-text">Nenhum cliente encontrado</span>
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
                      <th style={{ textAlign: 'center' }}>Contratos</th>
                      <th className="text-right">Total emprestado</th>
                      <th className="text-right">Total a receber</th>
                      <th style={{ textAlign: 'center' }}>Situação</th>
                      <th style={{ textAlign: 'center' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(c => {
                      const name = formatName(c.name);
                      const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
                      const temAtrasado = c.atrasados > 0;
                      const temAtivo = c.ativos > 0;
                      const tudoPago = c.pagos > 0 && c.ativos === 0;
                      const sitBadge = temAtrasado ? 'badge-red' : temAtivo ? 'badge-green' : tudoPago ? 'badge-gray' : 'badge-gray';
                      const sitText = temAtrasado ? 'Com atraso' : temAtivo ? 'Ativo' : tudoPago ? 'Quitado' : 'Sem contratos';
                      return (
                        <tr key={c.name} style={{ cursor: 'pointer' }} onClick={() => setSelected(c.name)}>
                          <td>
                            <div className="client-name-cell">
                              <span className="client-initials">{initials}</span>
                              <span className="client-name-text">{name}</span>
                            </div>
                          </td>
                          <td className="muted">{c.phone || '—'}</td>
                          <td style={{ textAlign: 'center' }}>{c.items.length}</td>
                          <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(c.totalEmprestado)}</td>
                          <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--gold)' }}>{money(c.totalAReceber)}</td>
                          <td style={{ textAlign: 'center' }}><span className={`badge ${sitBadge}`}>{sitText}</span></td>
                          <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            <div className="action-menu-wrap">
                              <button className="action-menu-btn" onClick={() => setOpenMenu(openMenu === c.name ? null : c.name)}>
                                <MoreHorizontal size={18} />
                              </button>
                              {openMenu === c.name && (
                                <div className="action-menu open" ref={menuRef}>
                                  <button className="action-menu-item" onClick={() => { setOpenMenu(null); setSelected(c.name); }}>
                                    <Search size={16} /> Ver detalhes
                                  </button>
                                  <button className="action-menu-item" onClick={() => { setOpenMenu(null); setEditClient({ name: c.name, phone: c.phone }); }}>
                                    <Edit size={16} /> Editar cliente
                                  </button>
                                  <div className="action-menu-divider" />
                                  <button className="action-menu-item danger" onClick={() => { setOpenMenu(null); setConfirmDel({ type: 'client', item: c.name }); }}>
                                    <Trash2 size={16} /> Excluir cliente
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
              {/* Mobile cards for clients */}
              <div className="mobile-only">
                {filtered.map(c => {
                  const name = formatName(c.name);
                  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
                  const temAtrasado = c.atrasados > 0;
                  const temAtivo = c.ativos > 0;
                  const tudoPago = c.pagos > 0 && c.ativos === 0;
                  const sitBadge = temAtrasado ? 'badge-red' : temAtivo ? 'badge-green' : tudoPago ? 'badge-gray' : 'badge-gray';
                  const sitText = temAtrasado ? 'Com atraso' : temAtivo ? 'Ativo' : tudoPago ? 'Quitado' : 'Sem contratos';
                  return (
                    <div key={c.name} className="mobile-card" onClick={() => setSelected(c.name)} style={{ cursor: 'pointer' }}>
                      <div className="mobile-card-header">
                        <span className="client-initials">{initials}</span>
                        <div className="mobile-card-client">
                          <div className="mobile-card-client-name">{name}</div>
                          <div className="mobile-card-client-desc">{c.phone || 'Telefone não informado'}</div>
                        </div>
                        <span className={`badge ${sitBadge}`} style={{ flexShrink: 0 }}>{sitText}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Contratos</span>
                        <span className="mobile-card-value">{c.items.length}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Total emprestado</span>
                        <span className="mobile-card-value">{money(c.totalEmprestado)}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Total a receber</span>
                        <span className="mobile-card-value" style={{ color: 'var(--gold)' }}>{money(c.totalAReceber)}</span>
                      </div>
                      <div className="mobile-card-actions" onClick={e => e.stopPropagation()}>
                        <div className="action-menu-wrap">
                          <button className="action-menu-btn" onClick={() => setOpenMenu(openMenu === c.name ? null : c.name)}>
                            <MoreHorizontal size={16} />
                          </button>
                          {openMenu === c.name && (
                            <div className="action-menu open" ref={menuRef}>
                              <button className="action-menu-item" onClick={() => { setOpenMenu(null); setSelected(c.name); }}>
                                <Search size={16} /> Ver detalhes
                              </button>
                              <button className="action-menu-item" onClick={() => { setOpenMenu(null); setEditClient({ name: c.name, phone: c.phone }); }}>
                                <Edit size={16} /> Editar cliente
                              </button>
                              <div className="action-menu-divider" />
                              <button className="action-menu-item danger" onClick={() => { setOpenMenu(null); setConfirmDel({ type: 'client', item: c.name }); }}>
                                <Trash2 size={16} /> Excluir cliente
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : selData && (
        <div>
          <button className="btn btn-dark" onClick={() => setSelected(null)} style={{ marginBottom: 16 }}>
            <ArrowLeft size={16} /> Voltar para clientes
          </button>

          <div className="client-detail-header">
            <div className="client-detail-avatar">{formatName(selData.name).split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</div>
            <div className="client-detail-info">
              <h2>{formatName(selData.name)}</h2>
              <div className="muted">{selData.phone || 'Telefone não informado'}</div>
            </div>
          </div>

          <div className="client-stats">
            <div className="client-stat">
              <div className="client-stat-label">Total emprestado</div>
              <div className="client-stat-value">{money(selData.totalEmprestado)}</div>
              <div className="muted">Valor dos principals</div>
            </div>
            <div className="client-stat">
              <div className="client-stat-label">Total a receber</div>
              <div className="client-stat-value" style={{ color: 'var(--gold)' }}>{money(selData.totalAReceber)}</div>
              <div className="muted">Principal + juros</div>
            </div>
            <div className="client-stat">
              <div className="client-stat-label">Contratos ativos</div>
              <div className="client-stat-value" style={{ color: 'var(--green)' }}>{selData.ativos}</div>
              <div className="muted">Em aberto</div>
            </div>
            <div className="client-stat">
              <div className="client-stat-label">Total contratos</div>
              <div className="client-stat-value">{selData.items.length}</div>
              <div className="muted">Quantidade total</div>
            </div>
          </div>

          <div className="client-detail-actions">
            <Link href="/novo-emprestimo" className="btn btn-gold">
              <UserPlus size={16} /> Novo contrato para este cliente
            </Link>
            <button className="btn btn-dark" onClick={() => setEditClient({ name: selData.name, phone: selData.phone })}>
              <Edit size={16} /> Editar cliente
            </button>
            <button className="btn btn-danger" onClick={() => setConfirmDel({ type: 'client', item: selData.name })}>
              <Trash2 size={16} /> Excluir cliente
            </button>
          </div>

          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="panel-title" style={{ padding: '16px 20px', margin: 0 }}>
              <span className="panel-title-left">Contratos deste cliente</span>
            </div>
            <div className="table-wrap desktop-table" style={{ border: 'none', borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Principal</th>
                    <th>Juros</th>
                    <th className="text-right">Total</th>
                    <th style={{ textAlign: 'center' }}>Data</th>
                    <th style={{ textAlign: 'center' }}>Vencimento</th>
                    <th style={{ textAlign: 'center' }}>Situação</th>
                    <th style={{ textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {selData.items.map(l => {
                    const sit = situation(l);
                    const corBadge = sit === 'Atrasado' ? 'badge-red' : sit === 'Vence hoje' ? 'badge-gold' : sit === 'Pago' ? 'badge-gray' : 'badge-green';
                    return (
                      <tr key={l.id}>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(l.valor_emprestado)}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(interest(l))}</td>
                        <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: 'var(--gold)' }}>{money(total(l))}</td>
                        <td style={{ textAlign: 'center' }}>{localDate(l.data_emprestimo)}</td>
                        <td style={{ textAlign: 'center' }}>{localDate(l.data_vencimento)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`badge ${corBadge}`}>{sit}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="action-menu-wrap">
                            <button className="action-menu-btn" onClick={() => setOpenMenu(openMenu === l.id ? null : l.id)}>
                              <MoreHorizontal size={18} />
                            </button>
                            {openMenu === l.id && (
                              <div className="action-menu open" ref={menuRef}>
                                <button className="action-menu-item" onClick={() => { setOpenMenu(null); setEditContract({ ...l }); }}>
                                  <Edit size={16} /> Editar contrato
                                </button>
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
                                    <button className="action-menu-item" disabled={!!busy} onClick={() => act(l, 'duplicate')}>
                                      <Copy size={16} /> Duplicar contrato
                                    </button>
                                  </>
                                )}
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
            {/* Mobile cards for client detail contracts */}
            <div className="mobile-only" style={{ padding: '8px 16px 16px' }}>
              {selData.items.map(l => {
                const sit = situation(l);
                const corBadge = sit === 'Atrasado' ? 'badge-red' : sit === 'Vence hoje' ? 'badge-gold' : sit === 'Pago' ? 'badge-gray' : 'badge-green';
                return (
                  <div key={l.id} className="mobile-card" style={{ marginBottom: 8 }}>
                    <div className="mobile-card-header">
                      <span className={`badge ${corBadge}`}>{sit}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Principal</span>
                      <span className="mobile-card-value">{money(l.valor_emprestado)}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Juros</span>
                      <span className="mobile-card-value">{money(interest(l))}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Total</span>
                      <span className="mobile-card-value" style={{ color: 'var(--gold)' }}>{money(total(l))}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Data</span>
                      <span className="mobile-card-value">{localDate(l.data_emprestimo)}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Vencimento</span>
                      <span className="mobile-card-value">{localDate(l.data_vencimento)}</span>
                    </div>
                    <div className="mobile-card-actions">
                      <div className="action-menu-wrap">
                        <button className="action-menu-btn" onClick={() => setOpenMenu(openMenu === l.id ? null : l.id)}>
                          <MoreHorizontal size={16} />
                        </button>
                        {openMenu === l.id && (
                          <div className="action-menu open" ref={menuRef}>
                            <button className="action-menu-item" onClick={() => { setOpenMenu(null); setEditContract({ ...l }); }}>
                              <Edit size={16} /> Editar contrato
                            </button>
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
                                <button className="action-menu-item" disabled={!!busy} onClick={() => act(l, 'duplicate')}>
                                  <Copy size={16} /> Duplicar contrato
                                </button>
                              </>
                            )}
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
          </div>
        </div>
      )}

      {editContract && (
        <div className="modal-overlay" onClick={() => setEditContract(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              <span>✏️ Editar contrato</span>
              <button className="modal-close" onClick={() => setEditContract(null)}>✕</button>
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr', gap: 12 }}>
              <div className="field"><label>Cliente</label><input className="input" value={editContract.cliente} onChange={e => setEditContract({ ...editContract, cliente: e.target.value })} /></div>
              <div className="field"><label>Telefone</label><input className="input" value={editContract.telefone || ''} onChange={e => setEditContract({ ...editContract, telefone: e.target.value })} /></div>
              <div className="field"><label>Descrição</label><input className="input" value={editContract.descricao} onChange={e => setEditContract({ ...editContract, descricao: e.target.value })} /></div>
              <div className="field"><label>Valor emprestado</label><input className="input" type="number" min="0" step="0.01" value={editContract.valor_emprestado} onChange={e => setEditContract({ ...editContract, valor_emprestado: Number(e.target.value) })} /></div>
              <div className="field"><label>Porcentagem de juros (%)</label><input className="input" type="number" min="0" step="0.01" value={editContract.porcentagem_juros} onChange={e => setEditContract({ ...editContract, porcentagem_juros: Number(e.target.value) })} /></div>
              <div className="field"><label>Data de vencimento</label><input className="input" type="date" value={editContract.data_vencimento} onChange={e => setEditContract({ ...editContract, data_vencimento: e.target.value })} /></div>
              <div className="field"><label>Modalidade</label><select className="select" value={editContract.modalidade} onChange={e => setEditContract({ ...editContract, modalidade: e.target.value })}><option>Pag. Único</option><option>Parcelado</option></select></div>
              <div className="field"><label>Periodicidade</label><select className="select" value={editContract.periodicidade} onChange={e => setEditContract({ ...editContract, periodicidade: e.target.value })}><option>Mensal</option><option>Semanal</option><option>Quinzenal</option></select></div>
              <div className="field"><label>Status</label><select className="select" value={editContract.status} onChange={e => setEditContract({ ...editContract, status: e.target.value as any })}><option>Pendente</option><option>Pago</option><option>Cancelado</option></select></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gold w-full" disabled={!!busy} onClick={saveContract}>{busy.includes('save') ? 'Salvando...' : 'Salvar alterações'}</button>
              <button className="btn btn-dark" onClick={() => setEditContract(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {editClient && (
        <div className="modal-overlay" onClick={() => setEditClient(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              <span>✏️ Editar cliente</span>
              <button className="modal-close" onClick={() => setEditClient(null)}>✕</button>
            </div>
            <div className="field"><label>Nome</label><input className="input" value={editClient.name} disabled /></div>
            <div className="field"><label>Telefone</label><input className="input" value={editClient.phone} onChange={e => setEditClient({ ...editClient, phone: e.target.value })} placeholder="(83) 99999-9999" /></div>
            <div className="modal-footer">
              <button className="btn btn-gold w-full" disabled={!!busy} onClick={saveClient}>{busy === 'savec' ? 'Salvando...' : 'Salvar alterações'}</button>
              <button className="btn btn-dark" onClick={() => setEditClient(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(440px,100%)' }}>
            <div className="modal-title" style={{ color: 'var(--red)' }}>
              <span>⚠️ Confirmar exclusão</span>
              <button className="modal-close" onClick={() => setConfirmDel(null)}>✕</button>
            </div>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: '12px 0 20px' }}>
              {confirmDel.type === 'client'
                ? `Tem certeza que deseja excluir o cliente "${confirmDel.item}" e todos os seus contratos? Esta ação não poderá ser desfeita.`
                : `Tem certeza que deseja excluir o contrato de "${confirmDel.item.cliente}"? Esta ação não poderá ser desfeita.`}
            </p>
            <div className="modal-footer">
              <button className="btn btn-danger w-full" disabled={!!busy} onClick={() => {
                if (confirmDel.type === 'client') deleteClient(confirmDel.item);
                if (confirmDel.type === 'contract') deleteContract(confirmDel.item);
              }}>{busy ? 'Excluindo...' : 'Sim, excluir'}</button>
              <button className="btn btn-dark" onClick={() => setConfirmDel(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
