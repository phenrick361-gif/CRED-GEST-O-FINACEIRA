'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Loan } from '@/types';
import { User, DollarSign, Calendar, FileText } from 'lucide-react';

type Initial = Partial<Loan>;

function addMonths(iso: string, months: number): string {
  if (!iso || isNaN(Date.parse(iso))) { throw new Error('Data inválida'); }
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

function validatePhone(phone: string): boolean {
  const phoneRegex = /^\(\d{2}\)\s9\d{4}-\d{4}$/;
  return phoneRegex.test(phone) || phone.trim() === '';
}

function sanitizeInput(input: string): string {
  return input.replace(/[<>]/g, '').trim();
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
  return { valid: errors.length === 0, errors };
}

export default function LoanForm({ initial, id }: { initial?: Initial; id?: string }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
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
    status: initial?.status || 'Pendente'
  });
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const change = (key: string, value: string) => {
    const sanitizedValue = sanitizeInput(value);
    setForm(prev => ({ ...prev, [key]: sanitizedValue }));
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

    const validation = validateLoanForm(form);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }

    try {
      const payload = {
        ...form,
        user_id: user.id,
        valor_emprestado: Number(form.valor_emprestado),
        porcentagem_juros: Number(form.porcentagem_juros),
        prazo_meses: Number(form.prazo_meses)
      };

      let result;
      if (id) {
        result = await supabase.from('emprestimos').update(payload).eq('id', id).eq('user_id', user.id);
      } else {
        result = await supabase.from('emprestimos').insert(payload);
      }

      if (result.error) { throw new Error(result.error.message); }
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
            <div className="field">
              <label>Modalidade</label>
              <select className="select" value={form.modalidade} onChange={e => change('modalidade', e.target.value)}>
                <option>Pag. Único</option>
                <option>Parcelado</option>
              </select>
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
