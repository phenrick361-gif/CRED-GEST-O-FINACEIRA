'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LOAN_COLUMNS } from '@/lib/supabase/columns';
import { interest, money, total as calcTotal } from '@/lib/finance';
import type { Loan } from '@/types';
import { User, Shield, Palette, Database, Trash2, AlertTriangle, Wrench, Key, Bell } from 'lucide-react';

export default function SettingsPanel() {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [repairOpen, setRepairOpen] = useState(false);
  const [contracts, setContracts] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(false);
  const [fixes, setFixes] = useState<Record<string, number>>({});

  if (process.env.NODE_ENV !== 'development') {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: 40 }}>
        <p style={{ color: 'var(--text-secondary)' }}>Configurações disponíveis apenas em ambiente de desenvolvimento.</p>
      </div>
    );
  }

  async function handleDelete() {
    if (confirmText !== 'APAGAR TUDO') return;
    setDeleting(true); setError(null); setMessage(null);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('Usuário não autenticado.');
      const { error: payErr } = await supabase.from('pagamentos').delete().eq('user_id', user.id);
      if (payErr) throw new Error(`Erro ao apagar pagamentos: ${payErr.message}`);
      const { error: loanErr } = await supabase.from('emprestimos').delete().eq('user_id', user.id);
      if (loanErr) throw new Error(`Erro ao apagar contratos: ${loanErr.message}`);
      setMessage('Todos os contratos desta conta foram apagados.');
      setOpen(false); setConfirmText(''); router.refresh();
    } catch (err: any) { setError(err.message); }
    finally { setDeleting(false); }
  }

  function closeModal() { if (deleting) return; setOpen(false); setConfirmText(''); setError(null); }

  async function loadContracts() {
    setLoading(true); setError(null); setMessage(null); setFixes({});
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('Usuário não autenticado.');
      const { data, error: dbError } = await supabase.from('emprestimos').select(LOAN_COLUMNS).eq('user_id', user.id).order('cliente');
      if (dbError) throw new Error(`Erro ao carregar contratos: ${dbError.message}`);
      setContracts((data || []) as Loan[]); setRepairOpen(true);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function fixContract(loanId: string | number) {
    const newPrincipal = fixes[String(loanId)];
    if (!newPrincipal || newPrincipal <= 0) return;
    setError(null); setMessage(null);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('Usuário não autenticado.');
      const { error: updateErr } = await supabase.from('emprestimos').update({ valor_emprestado: newPrincipal }).eq('id', loanId).eq('user_id', user.id);
      if (updateErr) throw new Error(`Erro ao corrigir contrato: ${updateErr.message}`);
      setContracts(prev => prev.filter(c => c.id !== loanId));
      setFixes(prev => { const next = { ...prev }; delete next[loanId]; return next; });
      setMessage('Contrato corrigido com sucesso.'); router.refresh();
    } catch (err: any) { setError(err.message); }
  }

  async function fixAll() {
    setLoading(true); setError(null); setMessage(null);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('Usuário não autenticado.');
      let fixed = 0;
      for (const loan of contracts) {
        const newPrincipal = fixes[String(loan.id)];
        if (!newPrincipal || newPrincipal <= 0) continue;
        const { error: updateErr } = await supabase.from('emprestimos').update({ valor_emprestado: newPrincipal }).eq('id', loan.id).eq('user_id', user.id);
        if (updateErr) throw new Error(`Erro ao corrigir ${loan.cliente}: ${updateErr.message}`);
        fixed++;
      }
      if (fixed > 0) { setMessage(`${fixed} contrato(s) corrigido(s).`); loadContracts(); }
      else { setMessage('Nenhum contrato precisou de correção.'); }
      router.refresh();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      {/* Perfil */}
      <div className="settings-section">
        <div className="settings-section-title"><User size={16} style={{ display: 'inline', marginRight: 6 }} /> Perfil</div>
        <div className="settings-section-desc">Informações da sua conta e dados pessoais.</div>
        <div className="field">
          <label>Nome de usuário</label>
          <input className="input" placeholder="Seu nome" disabled />
        </div>
        <div className="field">
          <label>E-mail</label>
          <input className="input" type="email" placeholder="seu@email.com" disabled />
        </div>
      </div>

      {/* Segurança */}
      <div className="settings-section">
        <div className="settings-section-title"><Shield size={16} style={{ display: 'inline', marginRight: 6 }} /> Segurança</div>
        <div className="settings-section-desc">Gerencie sua senha e opções de segurança.</div>
        <button className="btn btn-dark" disabled>Alterar senha</button>
      </div>

      {/* Dados do sistema */}
      <div className="settings-section">
        <div className="settings-section-title"><Database size={16} style={{ display: 'inline', marginRight: 6 }} /> Dados do sistema</div>
        <div className="settings-section-desc">Ferramentas para gerenciar e reparar dados.</div>
        <button className="btn btn-gold" onClick={loadContracts} disabled={loading} style={{ marginBottom: 12 }}>
          {loading ? '⏳ Verificando...' : '🔍 Verificar valores dos contratos'}
        </button>
      </div>

      {/* Reparar contratos modal */}
      {repairOpen && contracts.length > 0 && (
        <div className="modal-overlay" onClick={() => { setRepairOpen(false); setContracts([]); setFixes({}); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(800px,100%)' }}>
            <div className="modal-title">
              <span>🔧 Revisão de contratos</span>
              <button className="modal-close" onClick={() => { setRepairOpen(false); setContracts([]); setFixes({}); }}>✕</button>
            </div>
            <div style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
              Abaixo estão os contratos com valores calculados a partir do <strong>principal</strong> armazenado.
              Se algum contrato foi importado incorretamente, digite o principal correto e clique em &ldquo;Corrigir&rdquo;.
            </div>
            <div className="table-wrap" style={{ maxHeight: '50vh', overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Principal</th>
                    <th>Juros %</th>
                    <th>Total calculado</th>
                    <th>Corrigir principal</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map(loan => {
                    const expectedTotal = calcTotal(loan);
                    return (
                      <tr key={loan.id}>
                        <td><strong>{loan.cliente}</strong></td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{money(Number(loan.valor_emprestado))}</td>
                        <td>{loan.porcentagem_juros}%</td>
                        <td style={{ fontWeight: 700, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>{money(expectedTotal)}</td>
                        <td>
                          <input className="input" type="number" min="0" step="0.01"
                            placeholder="Novo valor"
                            value={fixes[String(loan.id)] ?? ''}
                            onChange={e => setFixes(prev => ({ ...prev, [String(loan.id)]: Number(e.target.value) }))}
                            style={{ minHeight: 36, fontSize: 13, width: 140 }}
                          />
                        </td>
                        <td>
                          <button className="btn btn-gold btn-sm"
                            disabled={!fixes[String(loan.id)] || fixes[String(loan.id)] <= 0 || loading}
                            onClick={() => fixContract(loan.id)}
                          >Corrigir</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gold" onClick={fixAll} disabled={Object.keys(fixes).length === 0 || loading}>
                {loading ? 'Corrigindo...' : `Corrigir ${Object.keys(fixes).length} contrato(s)`}
              </button>
              <button className="btn btn-dark" onClick={() => { setRepairOpen(false); setContracts([]); setFixes({}); }}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {repairOpen && contracts.length === 0 && !loading && (
        <div className="panel" style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ color: 'var(--green)', fontWeight: 700 }}>✅ Nenhum contrato encontrado para revisão.</p>
        </div>
      )}

      {/* Zona de perigo */}
      <div className="settings-section danger-zone">
        <div className="settings-section-title"><AlertTriangle size={16} style={{ display: 'inline', marginRight: 6 }} /> Zona de perigo</div>
        <div className="settings-section-desc">Ações irreversíveis. Cuidado ao utilizar estas opções.</div>
        <button className="btn btn-danger w-full" style={{ justifyContent: 'center', padding: '14px 18px', fontSize: 15 }} onClick={() => setOpen(true)}>
          <Trash2 size={18} /> Apagar todos os contratos desta conta
        </button>
      </div>

      {open && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(480px,100%)' }}>
            <div className="modal-title" style={{ color: 'var(--red)' }}>
              <span>⚠️ Confirmar exclusão total</span>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <p style={{ color: '#FCA5A5', fontWeight: 700, fontSize: 14, lineHeight: 1.5, margin: 0 }}>
                Esta ação apagará permanentemente todos os contratos e pagamentos da sua conta. Não poderá ser desfeita.
              </p>
            </div>
            <div className="field">
              <label style={{ color: 'var(--red)' }}>Digite <strong>APAGAR TUDO</strong> para confirmar:</label>
              <input className="input" type="text" placeholder="APAGAR TUDO" value={confirmText} onChange={e => setConfirmText(e.target.value)} disabled={deleting} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-danger w-full" style={{ justifyContent: 'center', padding: '12px 16px', fontSize: 14 }}
                disabled={confirmText !== 'APAGAR TUDO' || deleting} onClick={handleDelete}>
                {deleting ? 'Apagando...' : 'Confirmar exclusão'}
              </button>
              <button className="btn btn-dark" style={{ justifyContent: 'center', padding: '12px 16px', fontSize: 14 }} onClick={closeModal} disabled={deleting}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
