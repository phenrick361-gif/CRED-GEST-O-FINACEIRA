'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Loan, ContractType } from '@/types';
import { User, DollarSign, Calendar, FileText, Layers } from 'lucide-react';
import { money } from '@/lib/finance';

type Initial = Partial<Loan>;

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addMonths(iso: string, months: number): string {
  if (!iso || isNaN(Date.parse(iso))) { throw new Error('Data inválida'); }
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return formatLocalDate(d);
}

function validatePhone(phone: string): boolean {
  const phoneRegex = /^\(\d{2}\)\s9\d{4}-\d{4}$/;
  return phoneRegex.test(phone) || phone.trim() === '';
}

function stripDangerous(input: string): string {
  return input.replace(/[<>]/g, '');
}

function sanitizeInput(input: string): string {
  return stripDangerous(input).trim();
}

function validateLoanForm(formData: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!formData.cliente || formData.cliente.trim() === '') { errors.push('Nome do cliente é obrigatório'); }
  if (!formData.valor_emprestado || formData.valor_emprestado <= 0) { errors.push('Valor do empréstimo deve ser maior que zero'); }
  if (!formData.porcentagem_juros || formData.porcentagem_juros < 0) { errors.push('Taxa de juros deve ser não negativa'); }
  if (!formData.prazo_meses || formData.prazo_meses < 1) { errors.push('Prazo deve ser de pelo menos 1 mês'); }
  if (!validatePhone(formData.telefone) && formData.telefone.trim() !== '') { errors.push('Formato de telefone inválido. Use: (XX) 9XXXX-XXXX'); }
  if (formData.data_emprestimo && formData.data_vencimento) {
    const startDate = new Date(formData.data_emprestimo);
    const endDate = new Date(formData.data_vencimento);
    if (startDate >= endDate) { errors.push('Data de vencimento deve ser posterior à data do empréstimo'); }
  }
  const valorEmpestado = Number(formData.valor_emprestado);
  if (valorEmpestado > 1000000) { errors.push('Valor máximo do empréstimo é R$ 1.000.000'); }
  if (formData.contract_type === 'installment') {
    if (!formData.numero_parcelas || formData.numero_parcelas < 1) { errors.push('Número de parcelas é obrigatório'); }
    if (!formData.valor_parcela || formData.valor_parcela <= 0) { errors.push('Valor da parcela deve ser maior que zero'); }
    if (!formData.primeiro_vencimento) { errors.push('Primeiro vencimento é obrigatório'); }
  }
  return { valid: errors.length === 0, errors };
}

export default function LoanForm({ initial, id }: { initial?: Partial<Loan> & { numero_parcelas?: string; valor_parcela?: string; primeiro_vencimento?: string }; id?: string }) {
  const router = useRouter();
  const today = formatLocalDate(new Date());
  const [form, setForm] = useState<{
    cliente: string; telefone: string; observacao: string; descricao: string;
    valor_emprestado: string; porcentagem_juros: string; juros_aplicado: string;
    modalidade: string; periodicidade: string; prazo_meses: string;
    data_emprestimo: string; data_vencimento: string; status: string;
    contract_type: ContractType; numero_parcelas: string; valor_parcela: string; primeiro_vencimento: string;
  }>({
    cliente: initial?.cliente ? sanitizeInput(initial.cliente) : '',
    telefone: initial?.telefone ? sanitizeInput(initial.telefone) : '',
    observacao: initial?.observacao ? sanitizeInput(initial.observacao) : '',
    descricao: initial?.descricao ? sanitizeInput(initial.descricao) : 'Empréstimo',
    valor_emprestado: String(initial?.valor_emprestado ?? ''),
    porcentagem_juros: String(initial?.porcentagem_juros ?? 40),
    juros_aplicado: initial?.juros_aplicado || 'Sobre Total',
    modalidade: initial?.modalidade || 'Pag. Único',
    periodicidade: initial?.periodicidade || 'Mensal',
    prazo_meses: String(initial?.prazo_meses ?? 1),
    data_emprestimo: initial?.data_emprestimo || today,
    data_vencimento: initial?.data_vencimento || addMonths(today, 1),
    status: initial?.status || 'Pendente',
    contract_type: (initial?.contract_type as ContractType) || 'normal',
    numero_parcelas: String(initial?.numero_parcelas ?? ''),
    valor_parcela: String(initial?.valor_parcela ?? ''),
    primeiro_vencimento: initial?.primeiro_vencimento || '',
  });
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const autoVencimento = useRef(true);

  const recalcVencimento = (nextForm: typeof form) => {
    try {
      return addMonths(nextForm.data_emprestimo || today, Number(nextForm.prazo_meses) || 1);
    } catch {
      return nextForm.data_vencimento;
    }
  };

  const change = (key: string, value: string) => {
    const sanitizedValue = stripDangerous(value);
    setForm(prev => {
      let next = { ...prev, [key]: sanitizedValue };
      if (key === 'data_emprestimo' || key === 'prazo_meses') {
        autoVencimento.current = true;
        next = { ...next, data_vencimento: recalcVencimento(next) };
      } else if (key === 'data_vencimento') {
        autoVencimento.current = false;
      }
      return next;
    });
    if (validationErrors.length > 0) {
      const newForm = { ...form, [key]: sanitizedValue };
      const validation = validateLoanForm(newForm);
      if (validation.valid) { setValidationErrors([]); }
    }
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setValidationErrors([]);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }

    try {
      const isInstallment = form.contract_type === 'installment';
      const valorEmprestado = Number(form.valor_emprestado);
      const numeroParcelas = isInstallment ? parseInt(form.numero_parcelas || '0', 10) : 0;
      const valorParcela = isInstallment ? Number(form.valor_parcela) : 0;
      const totalReceber = isInstallment ? valorParcela * numeroParcelas : 0;

      const payload: any = {
        ...form,
        user_id: user.id,
        cliente: form.cliente.trim(),
        telefone: form.telefone.trim(),
        descricao: form.descricao.trim(),
        observacao: (form.observacao || '').trim(),
        valor_emprestado: valorEmprestado,
        porcentagem_juros: Number(form.porcentagem_juros),
        prazo_meses: Number(form.prazo_meses),
        contract_type: form.contract_type,
        numero_parcelas: isInstallment ? numeroParcelas : null,
        valor_parcela: isInstallment ? valorParcela : null,
        primeiro_vencimento: isInstallment ? form.primeiro_vencimento : null,
        status: isInstallment ? 'Pendente' : form.status,
      };

      if (!isInstallment) {
        delete payload.numero_parcelas;
        delete payload.valor_parcela;
        delete payload.primeiro_vencimento;
      }

      const validation = validateLoanForm(payload);
      if (!validation.valid) {
        setValidationErrors(validation.errors);
        setLoading(false);
        return;
      }

      let result: any;
      if (id) {
        result = await supabase.from('emprestimos').update(payload).eq('id', id).eq('user_id', user.id);
      } else {
        result = await supabase.from('emprestimos').insert(payload);
      }

      if (result.error) { throw new Error(result.error.message); }

      if (!id && isInstallment && result.data && result.data[0]) {
        const contractId = result.data[0].id;
        const installmentDates: string[] = [];
        const baseDate = new Date(`${form.primeiro_vencimento}T12:00:00`);
        for (let i = 0; i < numeroParcelas; i++) {
          const d = new Date(baseDate);
          d.setMonth(d.getMonth() + i);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          installmentDates.push(`${y}-${m}-${day}`);
        }

        const installmentRows = installmentDates.map((dueDate, idx) => ({
          contract_id: contractId,
          user_id: user.id,
          installment_number: idx + 1,
          amount: valorParcela,
          due_date: dueDate,
          paid_at: null,
          status: 'A vencer' as const,
        }));

        const { error: instError } = await supabase.from('installments').insert(installmentRows);
        if (instError) throw new Error(instError.message);
      }

      if (typeof window !== 'undefined') window.dispatchEvent(new Event('cred-data-changed'));
      router.push('/contratos');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro ao salvar');
    } finally {
      setLoading(false);
    }
  }

  const valor = Number(form.valor_emprestado) || 0;
  const taxa = Number(form.porcentagem_juros) || 0;
  const jurosCalculado = valor * (taxa / 100);
  const totalCalculado = valor + jurosCalculado;
  const isInstallment = form.contract_type === 'installment';
  const numParcelas = parseInt(form.numero_parcelas || '0', 10);
  const valParcela = Number(form.valor_parcela || '0');
  const totalReceber = isInstallment ? valParcela * numParcelas : 0;

  return (
    <div className="loan-form-layout">
      <form className="panel" onSubmit={submit}>
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 16 }}>
            <User size={18} /> Cliente
          </h4>
          <div className="form-grid">
            <div className="field">
              <label>Selecionar cliente *</label>
              <input
                className={`input ${validationErrors.some(e => e.includes('cliente')) ? 'error' : ''}`}
                value={form.cliente}
                onChange={e => change('cliente', e.target.value)}
                placeholder="Nome do cliente"
                required
              />
              {validationErrors.some(e => e.includes('cliente')) && (
                <div className="error-text">{validationErrors.find(e => e.includes('cliente'))}</div>
              )}
            </div>
            <div className="field">
              <label>Telefone</label>
              <input
                className={`input ${validationErrors.some(e => e.includes('telefone')) ? 'error' : ''}`}
                value={form.telefone}
                onChange={e => change('telefone', e.target.value)}
                placeholder="(83) 99999-9999"
              />
              {validationErrors.some(e => e.includes('telefone')) && (
                <div className="error-text">{validationErrors.find(e => e.includes('telefone'))}</div>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 16 }}>
            <DollarSign size={18} /> Valores
          </h4>
          <div className="form-grid">
            <div className="field">
              <label>Valor principal *</label>
              <input
                className={`input ${validationErrors.some(e => e.includes('valor')) ? 'error' : ''}`}
                type="number" min="0" step="0.01"
                value={form.valor_emprestado}
                onChange={e => change('valor_emprestado', e.target.value)}
                placeholder="10000"
                required
              />
            </div>
            <div className="field">
              <label>Taxa de juros (%) *</label>
              <input
                className={`input ${validationErrors.some(e => e.includes('juros')) ? 'error' : ''}`}
                type="number" min="0" step="0.01"
                value={form.porcentagem_juros}
                onChange={e => change('porcentagem_juros', e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Valor dos juros</label>
              <input className="input" type="text" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(jurosCalculado)} readOnly disabled style={{ opacity: 0.7 }} />
            </div>
            <div className="field">
              <label>Valor total</label>
              <input className="input" type="text" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCalculado)} readOnly disabled style={{ opacity: 0.7 }} />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 16 }}>
            <Layers size={18} /> Tipo de Contrato
          </h4>
          <div className="form-grid">
            <div className="field">
              <label>Tipo de Contrato *</label>
              <select className="select" value={form.contract_type} onChange={e => change('contract_type', e.target.value)}>
                <option value="normal">Normal</option>
                <option value="installment">Parcelado</option>
              </select>
            </div>
            <div className="field">
              <label>Modalidade</label>
              <select className="select" value={form.modalidade} onChange={e => change('modalidade', e.target.value)}>
                <option>Pag. Único</option>
                <option>Parcelado</option>
              </select>
            </div>
          </div>
        </div>

        {isInstallment && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 16 }}>
              <Layers size={18} /> Parcelamento
            </h4>
            <div className="form-grid">
              <div className="field">
                <label>Número de parcelas *</label>
                <input
                  className={`input ${validationErrors.some(e => e.includes('parcelas')) ? 'error' : ''}`}
                  type="number" min="1"
                  value={form.numero_parcelas}
                  onChange={e => change('numero_parcelas', e.target.value)}
                  placeholder="10"
                  required
                />
              </div>
              <div className="field">
                <label>Valor da parcela *</label>
                <input
                  className={`input ${validationErrors.some(e => e.includes('parcela')) ? 'error' : ''}`}
                  type="number" min="0" step="0.01"
                  value={form.valor_parcela}
                  onChange={e => change('valor_parcela', e.target.value)}
                  placeholder="600"
                  required
                />
              </div>
              <div className="field">
                <label>Primeiro vencimento *</label>
                <input
                  className={`input ${validationErrors.some(e => e.includes('vencimento')) ? 'error' : ''}`}
                  type="date"
                  value={form.primeiro_vencimento}
                  onChange={e => change('primeiro_vencimento', e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>Periodicidade</label>
                <select className="select" value={form.periodicidade} onChange={e => change('periodicidade', e.target.value)}>
                  <option>Mensal</option>
                  <option>Quinzenal</option>
                  <option>Semanal</option>
                </select>
              </div>
            </div>
            {totalReceber > 0 && (
              <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(212,175,55,0.06)', borderRadius: 10, border: '1px solid rgba(212,175,55,0.15)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Total a receber: </span>
                <span style={{ color: 'var(--gold)', fontWeight: 800, fontSize: 16 }}>{money(totalReceber)}</span>
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 16 }}>
            <Calendar size={18} /> Datas
          </h4>
          <div className="form-grid">
            <div className="field">
              <label>Data do empréstimo *</label>
              <input className="input" type="date" value={form.data_emprestimo} onChange={e => change('data_emprestimo', e.target.value)} required />
            </div>
            <div className="field">
              <label>Data de vencimento *</label>
              <input
                className={`input ${validationErrors.some(e => e.includes('vencimento')) ? 'error' : ''}`}
                type="date" value={form.data_vencimento}
                onChange={e => change('data_vencimento', e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Prazo (meses) *</label>
              <input
                className={`input ${validationErrors.some(e => e.includes('Prazo')) ? 'error' : ''}`}
                type="number" min="1" value={form.prazo_meses}
                onChange={e => change('prazo_meses', e.target.value)}
                required
              />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 16 }}>
            <FileText size={18} /> Observações
          </h4>
          <div className="field">
            <textarea
              className="textarea"
              value={form.observacao}
              onChange={e => change('observacao', e.target.value)}
              placeholder="Observações adicionais sobre o contrato..."
            />
          </div>
        </div>

        {id && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 16 }}>
              Status
            </h4>
            <div className="field" style={{ maxWidth: 300 }}>
              <select className="select" value={form.status} onChange={e => change('status', e.target.value)}>
                <option>Pendente</option>
                <option>Pago</option>
                <option>Cancelado</option>
              </select>
            </div>
          </div>
        )}

        {validationErrors.length > 0 && (
          <div className="validation-errors">
            {validationErrors.map((err, i) => (<div key={i} className="error">{err}</div>))}
          </div>
        )}
        {error && <div className="error">{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button type="submit" className="btn btn-gold" style={{ flex: 1 }} disabled={loading}>
            {loading ? 'Salvando...' : id ? 'Salvar alterações' : 'Salvar empréstimo'}
          </button>
          <button type="button" className="btn btn-dark" onClick={() => router.back()}>Cancelar</button>
        </div>
      </form>

      <div className="loan-summary-card">
        <div className="loan-summary-title">📋 Resumo</div>
        <div className="loan-summary-row">
          <span className="loan-summary-label">Cliente</span>
          <span className="loan-summary-value">{form.cliente || '—'}</span>
        </div>
        <div className="loan-summary-row">
          <span className="loan-summary-label">Principal</span>
          <span className="loan-summary-value">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}</span>
        </div>
        <div className="loan-summary-row">
          <span className="loan-summary-label">Tipo</span>
          <span className="loan-summary-value">{isInstallment ? 'Parcelado' : 'Normal'}</span>
        </div>
        {isInstallment && (
          <>
            <div className="loan-summary-row">
              <span className="loan-summary-label">Parcelas</span>
              <span className="loan-summary-value">{numParcelas}</span>
            </div>
            <div className="loan-summary-row">
              <span className="loan-summary-label">Valor/parcela</span>
              <span className="loan-summary-value">{money(valParcela)}</span>
            </div>
            <div className="loan-summary-row">
              <span className="loan-summary-label">Total a receber</span>
              <span className="loan-summary-value" style={{ color: 'var(--gold)' }}>{money(totalReceber)}</span>
            </div>
          </>
        )}
        <div className="loan-summary-row">
          <span className="loan-summary-label">Juros</span>
          <span className="loan-summary-value">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(jurosCalculado)}</span>
        </div>
        <div className="loan-summary-row">
          <span className="loan-summary-label">Total</span>
          <span className="loan-summary-value" style={{ color: 'var(--gold)' }}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCalculado)}</span>
        </div>
        <div className="loan-summary-row">
          <span className="loan-summary-label">Vencimento</span>
          <span className="loan-summary-value">{form.data_vencimento ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${form.data_vencimento}T00:00:00Z`)) : '—'}</span>
        </div>
      </div>
    </div>
  );
}