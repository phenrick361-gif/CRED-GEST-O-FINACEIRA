'use client';

import { FormEvent, useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Loan, ContractType, Installment } from '@/types';
import { User, DollarSign, Calendar, FileText, Layers, Edit3 } from 'lucide-react';
import { money, localDate } from '@/lib/finance';
import { isValid, format } from 'date-fns';

export type LoanFormInitial = Partial<Loan> & { numero_parcelas?: string; valor_parcela?: string; primeiro_vencimento?: string };
type Initial = LoanFormInitial;

function formatDateForInput(value?: string | Date | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return isValid(date) ? format(date, 'yyyy-MM-dd') : '';
}

function formatLocalDate(d: Date): string {
  if (!isValid(d)) return '';
  return format(d, 'yyyy-MM-dd');
}

function addMonths(iso: string, months: number): string {
  const date = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (!isValid(date)) return '';
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, last));
  return formatLocalDate(date);
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

function parseMoney(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(',', '.')) || 0;
}

function formatMoneyBR(val: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function validateLoanForm(formData: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!formData.cliente || formData.cliente.trim() === '') { errors.push('Nome do cliente é obrigatório'); }
  if (!formData.valor_emprestado || formData.valor_emprestado <= 0) { errors.push('Valor do empréstimo deve ser maior que zero'); }
  if (formData.porcentagem_juros === undefined || formData.porcentagem_juros === null || formData.porcentagem_juros < 0) { errors.push('Taxa de juros deve ser não negativa'); }
  if (!formData.prazo_meses || formData.prazo_meses < 1) { errors.push('Prazo deve ser de pelo menos 1 mês'); }
  if (!validatePhone(formData.telefone) && formData.telefone.trim() !== '') { errors.push('Formato de telefone inválido. Use: (XX) 9XXXX-XXXX'); }
  if (formData.data_emprestimo && formData.data_vencimento) {
    const startDate = new Date(formData.data_emprestimo);
    const endDate = new Date(formData.data_vencimento);
    if (isValid(startDate) && isValid(endDate) && startDate >= endDate) { errors.push('Data de vencimento deve ser posterior à data do empréstimo'); }
  }
  const valorEmpestado = Number(formData.valor_emprestado);
  if (valorEmpestado > 1000000) { errors.push('Valor máximo do empréstimo é R$ 1.000.000'); }
  if (formData.contract_type === 'installment') {
    if (!formData.numero_parcelas || formData.numero_parcelas < 1) { errors.push('Número de parcelas é obrigatório'); }
    const installmentAmounts = formData.installmentAmounts || {};
    const keys = Object.keys(installmentAmounts);
    if (keys.length === 0) { errors.push('Defina o valor de cada parcela'); }
    for (const k of keys) {
      if (!installmentAmounts[k] || parseMoney(installmentAmounts[k]) <= 0) { errors.push('Todos os valores de parcela devem ser maiores que zero'); break; }
    }
    const totalInstallment = keys.reduce((s: number, k: string) => s + parseMoney(installmentAmounts[k]), 0);
    const totalLoan = Number(formData.valor_emprestado) + Number(formData.valor_emprestado) * (Number(formData.porcentagem_juros) / 100);
    if (Math.abs(totalInstallment - totalLoan) > 0.05) { errors.push(`Soma das parcelas difere do total do contrato`); }
  }
  return { valid: errors.length === 0, errors };
}

export default function LoanForm({
  initial,
  id,
  initialInstallments
}: {
  initial?: Initial;
  id?: string;
  initialInstallments?: Installment[];
}) {
  const router = useRouter();
  const today = formatLocalDate(new Date());
  const [form, setForm] = useState<{
    cliente: string; telefone: string; observacao: string; descricao: string;
    valor_emprestado: string; porcentagem_juros: string; juros_aplicado: string;
    modalidade: string; periodicidade: string; prazo_meses: string;
    data_emprestimo: string; data_vencimento: string; status: string;
    contract_type: ContractType; numero_parcelas: string; primeiro_vencimento: string;
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
    primeiro_vencimento: initial?.primeiro_vencimento || '',
  });
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [installmentAmounts, setInstallmentAmounts] = useState<Record<number, string>>({});
  const [installmentModified, setInstallmentModified] = useState<Set<number>>(new Set());
  const [installmentDueDates, setInstallmentDueDates] = useState<Record<number, string>>({});
  const [installmentDueDateModified, setInstallmentDueDateModified] = useState<Set<number>>(new Set());
  const [showAllInstallments, setShowAllInstallments] = useState(false);
  const [showConfirmApplyAll, setShowConfirmApplyAll] = useState(false);
  const [installmentsLoaded, setInstallmentsLoaded] = useState(false);
  const autoFillTriggered = useRef(false);

  const valor = Number(form.valor_emprestado) || 0;
  const taxa = Number(form.porcentagem_juros) || 0;
  const jurosCalculado = valor * (taxa / 100);
  const totalCalculado = valor + jurosCalculado;
  const isInstallment = form.contract_type === 'installment';
  const numParcelas = parseInt(form.numero_parcelas || '0', 10);

  const totalParcelas = useMemo(() => {
    return Object.keys(installmentAmounts).reduce((s, k) => s + parseMoney(installmentAmounts[Number(k)]), 0);
  }, [installmentAmounts]);

  const diffParcelas = totalParcelas - totalCalculado;
  const valoresConferem = isInstallment && numParcelas > 0 && Object.keys(installmentAmounts).length > 0 && Math.abs(diffParcelas) <= 0.05;
  const podeSalvar = !isInstallment || (isInstallment && valoresConferem && !loading && !saving);

  const installmentList = initialInstallments || [];

  useEffect(() => {
    if (!initial) return;
    setForm(prev => ({
      ...prev,
      cliente: initial?.cliente ? sanitizeInput(initial.cliente) : prev.cliente,
      telefone: initial?.telefone ? sanitizeInput(initial.telefone) : prev.telefone,
      observacao: initial?.observacao ? sanitizeInput(initial.observacao) : prev.observacao,
      descricao: initial?.descricao ? sanitizeInput(initial.descricao) : prev.descricao,
      valor_emprestado: String(initial?.valor_emprestado ?? prev.valor_emprestado),
      porcentagem_juros: String(initial?.porcentagem_juros ?? prev.porcentagem_juros),
      juros_aplicado: initial?.juros_aplicado ?? prev.juros_aplicado,
      modalidade: initial?.modalidade ?? prev.modalidade,
      periodicidade: initial?.periodicidade ?? prev.periodicidade,
      prazo_meses: String(initial?.prazo_meses ?? prev.prazo_meses),
      data_emprestimo: initial?.data_emprestimo ?? prev.data_emprestimo,
      data_vencimento: initial?.data_vencimento ?? prev.data_vencimento,
      status: initial?.status ?? prev.status,
      contract_type: (initial?.contract_type as ContractType) ?? prev.contract_type,
      numero_parcelas: String(initial?.numero_parcelas ?? prev.numero_parcelas),
      primeiro_vencimento: initial?.primeiro_vencimento ?? prev.primeiro_vencimento,
    }));
  }, [initial]);

  useEffect(() => {
    if (id && initialInstallments && initialInstallments.length > 0) {
      const amounts: Record<number, string> = {};
      const dueDates: Record<number, string> = {};
      for (const inst of initialInstallments) {
        amounts[inst.installment_number] = String(inst.amount ?? 0);
        dueDates[inst.installment_number] = inst.due_date || '';
      }
      setInstallmentAmounts(amounts);
      setInstallmentDueDates(dueDates);
      setInstallmentsLoaded(true);
    }
  }, [id, initialInstallments]);

  useEffect(() => {
    if (id && initialInstallments && initialInstallments.length === 0) {
      setInstallmentAmounts({});
      setInstallmentDueDates({});
      setInstallmentsLoaded(true);
    }
  }, [id, initialInstallments]);

  const generateDueDates = useCallback((primeiroVencimento: string, count: number, periodicidade: string) => {
    const dates: Record<number, string> = {};
    if (!primeiroVencimento || count < 1) return dates;
    const firstDate = new Date(`${primeiroVencimento}T12:00:00`);
    if (!isValid(firstDate)) return dates;
    for (let i = 0; i < count; i++) {
      const d = new Date(firstDate);
      if (periodicidade === 'Mensal') { d.setMonth(d.getMonth() + i); }
      else if (periodicidade === 'Quinzenal') { d.setDate(d.getDate() + i * 14); }
      else if (periodicidade === 'Semanal') { d.setDate(d.getDate() + i * 7); }
      dates[i + 1] = formatLocalDate(d);
    }
    return dates;
  }, []);

  const applyFirstToAll = useCallback((amount: string) => {
    if (!numParcelas || numParcelas < 1) return;
    const newAmounts: Record<number, string> = {};
    const newModified = new Set<number>();
    for (let i = 1; i <= numParcelas; i++) { newAmounts[i] = amount; newModified.add(i); }
    setInstallmentAmounts(newAmounts);
    setInstallmentModified(newModified);
    autoFillTriggered.current = true;
  }, [numParcelas]);

  const handleFirstAmountChange = useCallback((amount: string) => {
    if (!numParcelas || numParcelas < 1) return;
    if (autoFillTriggered.current) return;
    const unmodifiedKeys = Object.keys(installmentAmounts).filter(k => !installmentModified.has(Number(k)));
    const newAmounts = { ...installmentAmounts };
    for (const k of unmodifiedKeys) { newAmounts[Number(k)] = amount; }
    setInstallmentAmounts(newAmounts);
  }, [numParcelas, installmentAmounts, installmentModified]);

  const fillSuggestedValues = useCallback(() => {
    if (!numParcelas || numParcelas < 1 || !valor) return;
    const suggested = Math.round((totalCalculado / numParcelas) * 100) / 100;
    const lastSuggested = Math.round((totalCalculado - suggested * (numParcelas - 1)) * 100) / 100;
    const newAmounts: Record<number, string> = {};
    const newModified = new Set<number>();
    for (let i = 1; i <= numParcelas; i++) {
      const val = i === numParcelas ? lastSuggested : suggested;
      newAmounts[i] = val.toFixed(2).replace('.', ',');
      newModified.add(i);
    }
    setInstallmentAmounts(newAmounts);
    setInstallmentModified(newModified);
    autoFillTriggered.current = true;
  }, [numParcelas, valor, totalCalculado]);

  const handleAmountChange = useCallback((num: number, value: string) => {
    const sanitized = stripDangerous(value).replace(/[^0-9.,]/g, '');
    setInstallmentAmounts(prev => ({ ...prev, [num]: sanitized }));
    setInstallmentModified(prev => new Set(prev).add(num));
  }, []);

  const handleDueDateChange = useCallback((num: number, value: string) => {
    setInstallmentDueDates(prev => ({ ...prev, [num]: value }));
    setInstallmentDueDateModified(prev => new Set(prev).add(num));
  }, []);

  useEffect(() => {
    if (!isInstallment || !form.primeiro_vencimento || !numParcelas || numParcelas < 1) return;
    const newDates = generateDueDates(form.primeiro_vencimento, numParcelas, form.periodicidade);
    setInstallmentDueDates(prev => {
      const merged = { ...prev };
      let changed = false;
      for (const k of Object.keys(newDates)) {
        const num = Number(k);
        if (!installmentDueDateModified.has(num) && merged[num] !== newDates[num]) { merged[num] = newDates[num]; changed = true; }
      }
      return changed ? merged : prev;
    });
  }, [form.primeiro_vencimento, numParcelas, form.periodicidade, generateDueDates, installmentDueDateModified]);

  useEffect(() => {
    if (!isInstallment || !form.primeiro_vencimento || !numParcelas || numParcelas < 1 || !form.valor_emprestado || !form.porcentagem_juros) return;
    if (autoFillTriggered.current) return;
    const suggested = Math.round((totalCalculado / numParcelas) * 100) / 100;
    const lastSuggested = Math.round((totalCalculado - suggested * (numParcelas - 1)) * 100) / 100;
    const newAmounts: Record<number, string> = {};
    let changed = false;
    for (let i = 1; i <= numParcelas; i++) {
      const val = i === numParcelas ? lastSuggested : suggested;
      const formatted = val.toFixed(2).replace('.', ',');
      if (!installmentModified.has(i)) {
        if (newAmounts[i] !== formatted) { newAmounts[i] = formatted; changed = true; }
      } else if (!installmentAmounts[i]) { newAmounts[i] = formatted; changed = true; }
    }
    if (changed) setInstallmentAmounts(prev => ({ ...prev, ...newAmounts }));
  }, [form.primeiro_vencimento, numParcelas, form.porcentagem_juros, form.valor_emprestado]);

  const change = (key: string, value: string) => {
    const sanitizedValue = stripDangerous(value);
    setForm(prev => {
      let next = { ...prev, [key]: sanitizedValue };
      if (key === 'data_emprestimo' || key === 'prazo_meses') {
        const base = formatDateForInput(next.data_emprestimo);
        if (base) { const v = addMonths(base, Number(next.prazo_meses) || 1); if (v) next.data_vencimento = v; }
      }
      return next;
    });
    if (validationErrors.length > 0) {
      const newForm = { ...form, [key]: sanitizedValue };
      const validation = validateLoanForm(newForm);
      if (validation.valid) { setValidationErrors([]); }
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setValidationErrors([]);
    setSaving(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }

    try {
      const isInstallmentType = form.contract_type === 'installment';
      const valorEmprestado = Number(form.valor_emprestado);
      const numeroParcelas = isInstallmentType ? parseInt(form.numero_parcelas || '0', 10) : 0;

      let payload: any = {
        user_id: user.id,
        cliente: form.cliente.trim(),
        telefone: form.telefone.trim(),
        descricao: form.descricao.trim(),
        observacao: (form.observacao || '').trim(),
        valor_emprestado: valorEmprestado,
        porcentagem_juros: Number(form.porcentagem_juros),
        juros_aplicado: form.juros_aplicado,
        modalidade: form.modalidade,
        periodicidade: form.periodicidade,
        prazo_meses: Number(form.prazo_meses),
        data_emprestimo: form.data_emprestimo,
        data_vencimento: form.data_vencimento,
        status: isInstallmentType ? 'Pendente' : form.status,
        contract_type: form.contract_type,
      };

      if (!id) { payload.created_at = new Date().toISOString(); }

      if (isInstallmentType) {
        const getInstallmentAmount = (num: number): number => {
          const val = installmentAmounts[num];
          return parseMoney(val) || 0;
        };

        if (id) {
          const allInstallmentRows = installmentList.map((inst) => ({
            id: inst.id,
            contract_id: inst.contract_id,
            user_id: user.id,
            installment_number: inst.installment_number,
            amount: getInstallmentAmount(inst.installment_number) ?? inst.amount,
            due_date: installmentDueDates[inst.installment_number] || inst.due_date,
            paid_at: inst.paid_at,
            status: inst.status,
            updated_at: new Date().toISOString(),
          }));

          for (const row of allInstallmentRows) {
            const { error: instErr } = await supabase.from('installments').update({ amount: row.amount, due_date: row.due_date, updated_at: row.updated_at }).eq('id', row.id).eq('user_id', user.id);
            if (instErr) throw new Error(`Erro ao atualizar parcela ${row.installment_number}: ${instErr.message}`);
          }
        } else {
          const installmentRows = Object.keys(installmentDueDates).map((key) => ({
            contract_id: '',
            user_id: user.id,
            installment_number: Number(key),
            amount: getInstallmentAmount(Number(key)) ?? 0,
            due_date: installmentDueDates[Number(key)],
            paid_at: null,
            status: 'A vencer' as const,
          }));

          const { data: newContract } = await supabase.from('emprestimos').insert(payload).select().single();
          if (!newContract || newContract.error) { throw new Error(newContract?.error?.message || 'Erro ao criar contrato'); }

          for (const row of installmentRows) { row.contract_id = newContract.id; }
          const { error: instError } = await supabase.from('installments').insert(installmentRows);
          if (instError) throw new Error(instError.message);
        }
      } else {
        if (id) {
          const { error: updateErr } = await supabase.from('emprestimos').update(payload).eq('id', id).eq('user_id', user.id);
          if (updateErr) throw new Error(updateErr.message);
        } else {
          const { data: newContract, error: insertErr } = await supabase.from('emprestimos').insert(payload).select().single();
          if (insertErr) throw new Error(insertErr.message);
        }
      }

      if (typeof window !== 'undefined') window.dispatchEvent(new Event('cred-data-changed'));
      setSaving(false);
      router.push('/contratos');
      router.refresh();
    } catch (err: any) {
      setSaving(false);
      setError(err.message || 'Ocorreu um erro ao salvar');
    } finally {
      setLoading(false);
      setSaving(false);
    }
  };

  const displayAmounts = useMemo(() => {
    const result: Record<number, string> = {};
    for (let i = 1; i <= numParcelas; i++) { result[i] = installmentAmounts[i] || ''; }
    return result;
  }, [numParcelas, installmentAmounts]);

  const displayDueDates = useMemo(() => {
    const result: Record<number, string> = {};
    for (let i = 1; i <= numParcelas; i++) { result[i] = installmentDueDates[i] || ''; }
    return result;
  }, [numParcelas, installmentDueDates]);

  const visibleCount = showAllInstallments ? numParcelas : Math.min(5, numParcelas);
  const hasMoreInstallments = numParcelas > 5;

  return (
    <div className="loan-form-layout">
      <form className="panel" onSubmit={submit}>
        <div style={{ marginBottom: 14 }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 12 }}>
            <User size={16} /> Cliente
          </h4>
          <input
            className={`input ${validationErrors.some(e => e.includes('cliente')) ? 'error' : ''}`}
            value={form.cliente}
            onChange={e => change('cliente', e.target.value)}
            placeholder="Nome do cliente"
            required
          />
          {validationErrors.some(e => e.includes('cliente')) && <div className="error-text">{validationErrors.find(e => e.includes('cliente'))}</div>}
          <div className="field" style={{ marginTop: 10 }}>
            <label style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)' }}>Telefone</label>
            <input
              className={`input ${validationErrors.some(e => e.includes('telefone')) ? 'error' : ''}`}
              value={form.telefone}
              onChange={e => change('telefone', e.target.value)}
              placeholder="(83) 99999-9999"
            />
            {validationErrors.some(e => e.includes('telefone')) && <div className="error-text">{validationErrors.find(e => e.includes('telefone'))}</div>}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 12 }}>
            <DollarSign size={16} /> Valores
          </h4>
          <div className="field">
            <label style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)' }}>Valor principal *</label>
            <input
              className={`input ${validationErrors.some(e => e.includes('valor')) ? 'error' : ''}`}
              type="number" min="0" step="0.01"
              value={form.valor_emprestado}
              onChange={e => change('valor_emprestado', e.target.value)}
              placeholder="10000"
              required
            />
            {validationErrors.some(e => e.includes('valor')) && <div className="error-text">{validationErrors.find(e => e.includes('valor'))}</div>}
          </div>
          <div className="field">
            <label style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)' }}>Taxa de juros (%) *</label>
            <input
              className={`input ${validationErrors.some(e => e.includes('juros')) ? 'error' : ''}`}
              type="number" min="0" step="0.01"
              value={form.porcentagem_juros}
              onChange={e => change('porcentagem_juros', e.target.value)}
              required
            />
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Juros: {formatMoneyBR(jurosCalculado)}</span>
            <span style={{ color: 'var(--gold)', fontWeight: 800, fontSize: 15 }}>Total: {formatMoneyBR(totalCalculado)}</span>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 12 }}>
            <Layers size={16} /> Tipo de Contrato
          </h4>
          <div className="field">
            <select className="select" value={form.contract_type} onChange={e => change('contract_type', e.target.value)}>
              <option value="normal">Normal</option>
              <option value="installment">Parcelado</option>
            </select>
          </div>
          {isInstallment && (
            <div className="field">
              <select className="select" value={form.periodicidade} onChange={e => change('periodicidade', e.target.value)}>
                <option>Mensal</option>
                <option>Quinzenal</option>
                <option>Semanal</option>
              </select>
            </div>
          )}
        </div>

        {isInstallment && (
          <div style={{ marginBottom: 14 }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 12 }}>
              <Layers size={16} /> Parcelamento
            </h4>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}>
                <label style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)' }}>Nº de parcelas *</label>
                <input
                  className={`input ${validationErrors.some(e => e.includes('parcelas')) ? 'error' : ''}`}
                  type="number" min="1"
                  value={form.numero_parcelas}
                  onChange={e => change('numero_parcelas', e.target.value)}
                  placeholder="10"
                  required
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)' }}>1º vencimento *</label>
                <input
                  className={`input ${validationErrors.some(e => e.includes('vencimento')) ? 'error' : ''}`}
                  type="date"
                  value={form.primeiro_vencimento}
                  onChange={e => change('primeiro_vencimento', e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-gold btn-sm"
                style={{ fontSize: 12, padding: '6px 12px' }}
                onClick={fillSuggestedValues}
              >
                💡 Sugerir valor
              </button>
              <button
                type="button"
                className="btn btn-dark btn-sm"
                style={{ fontSize: 12, padding: '6px 12px' }}
                onClick={() => {
                  const firstVal = displayAmounts[1] || '';
                  if (installmentModified.size > 0) {
                    setShowConfirmApplyAll(true);
                  } else if (firstVal) {
                    applyFirstToAll(firstVal);
                  }
                }}
              >
                Aplicar 1ª a todas
              </button>
            </div>

            {numParcelas > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ color: 'var(--gold-light)', fontWeight: 700, fontSize: 13 }}>Parcelas ({numParcelas})</span>
                  {hasMoreInstallments && (
                    <button
                      type="button"
                      className="btn btn-dark btn-sm"
                      style={{ fontSize: 11, padding: '4px 8px' }}
                      onClick={() => setShowAllInstallments(!showAllInstallments)}
                    >
                      {showAllInstallments ? 'Ver menos' : `Ver todas (${numParcelas})`}
                    </button>
                  )}
                </div>
                <div className="table-wrap" style={{ marginBottom: 12 }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'center', fontSize: 12, padding: '4px 8px' }}>#</th>
                        <th style={{ textAlign: 'center', fontSize: 12, padding: '4px 8px' }}>Vencimento</th>
                        <th style={{ textAlign: 'right', fontSize: 12, padding: '4px 8px' }}>Valor</th>
                        <th style={{ textAlign: 'center', fontSize: 12, padding: '4px 8px' }}>Mod.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: numParcelas }, (_, idx) => {
                        const num = idx + 1;
                        const isModified = installmentModified.has(num);
                        const isDueDateModified = installmentDueDateModified.has(num);
                        if (num > visibleCount && !showAllInstallments) return null;
                        return (
                          <tr key={num} style={{ opacity: isModified ? 1 : undefined }}>
                            <td style={{ textAlign: 'center', fontSize: 13, padding: '4px 8px' }}>{num}/{numParcelas}</td>
                            <td style={{ textAlign: 'center', padding: '4px 8px' }}>
                              <input
                                type="date"
                                value={displayDueDates[num] || ''}
                                onChange={e => handleDueDateChange(num, e.target.value)}
                                style={{ width: '120px', padding: '3px 6px', fontSize: 12 }}
                              />
                              {isDueDateModified && <span style={{ color: 'var(--gold)', fontSize: 10, marginLeft: 4 }}>✎</span>}
                            </td>
                            <td style={{ textAlign: 'right', padding: '4px 8px' }}>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={displayAmounts[num] || ''}
                                onChange={e => handleAmountChange(num, e.target.value)}
                                placeholder="0,00"
                                style={{ width: '100px', padding: '3px 6px', fontSize: 12, textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ textAlign: 'center', fontSize: 12, padding: '4px 8px' }}>
                              {isModified ? <span style={{ color: 'var(--gold)' }}>★</span> : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {!isInstallment && (
          <div style={{ marginBottom: 14 }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 12 }}>
              <Calendar size={16} /> Datas
            </h4>
            <div className="field">
              <label style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)' }}>Data do empréstimo *</label>
              <input className="input" type="date" value={form.data_emprestimo} onChange={e => change('data_emprestimo', e.target.value)} required />
            </div>
            <div className="field">
              <label style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)' }}>Data de vencimento *</label>
              <input
                className={`input ${validationErrors.some(e => e.includes('vencimento')) ? 'error' : ''}`}
                type="date" value={form.data_vencimento}
                onChange={e => change('data_vencimento', e.target.value)}
                required
              />
            </div>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 12 }}>
            <FileText size={16} /> Observações
          </h4>
          <textarea
            className="textarea"
            value={form.observacao}
            onChange={e => change('observacao', e.target.value)}
            placeholder="Observações adicionais sobre o contrato..."
            style={{ minHeight: 70 }}
          />
        </div>

        {id && (
          <div style={{ marginBottom: 14 }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 12 }}>
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

        {isInstallment && (
          <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(212,175,55,0.06)', borderRadius: 10, border: '1px solid rgba(212,175,55,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Total do contrato:</span>
              <span style={{ color: 'var(--gold)', fontWeight: 800, fontSize: 14 }}>{formatMoneyBR(totalCalculado)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Soma das parcelas:</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{formatMoneyBR(totalParcelas)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Diferença:</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: Math.abs(diffParcelas) > 0.05 ? 'var(--gold)' : 'var(--text-secondary)' }}>
                {Math.abs(diffParcelas) > 0.05 ? (diffParcelas > 0 ? `+${formatMoneyBR(diffParcelas)}` : `-${formatMoneyBR(Math.abs(diffParcelas))}`) : 'R$ 0,00'}
              </span>
            </div>
            {Math.abs(diffParcelas) > 0.05 && (
              <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(212,175,55,0.1)', borderRadius: 6, fontSize: 13, color: 'var(--gold)' }}>
                ⚠ {diffParcelas > 0 ? `Faltam R$ ${diffParcelas.toFixed(2)}` : `Excesso de R$ ${Math.abs(diffParcelas).toFixed(2)}`} — ajuste para liberar o salvamento
              </div>
            )}
            {valoresConferem && (
              <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(34,197,94,0.1)', borderRadius: 6, fontSize: 13, color: '#22c55e' }}>
                ✅ Valores conferidos
              </div>
            )}
          </div>
        )}

        {validationErrors.length > 0 && (
          <div className="validation-errors">
            {validationErrors.map((err, i) => (<div key={i} className="error">{err}</div>))}
          </div>
        )}
        {error && <div className="error">{error}</div>}
        {saving && <div className="error" style={{ color: 'var(--yellow)' }}>Salvando no Supabase...</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button type="submit" className="btn btn-gold" style={{ flex: 1 }} disabled={!podeSalvar || loading}>
            {loading || saving ? 'Salvando...' : id ? 'Salvar alterações' : 'Salvar empréstimo'}
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
          <span className="loan-summary-value">{formatMoneyBR(valor)}</span>
        </div>
        <div className="loan-summary-row">
          <span className="loan-summary-label">Tipo</span>
          <span className="loan-summary-value">{isInstallment ? 'Parcelado' : 'Normal'}</span>
        </div>
        {isInstallment && numParcelas > 0 && (
          <>
            <div className="loan-summary-row">
              <span className="loan-summary-label">Parcelas</span>
              <span className="loan-summary-value">{numParcelas}</span>
            </div>
            <div className="loan-summary-row">
              <span className="loan-summary-label">Soma das parcelas</span>
              <span className="loan-summary-value" style={{ color: 'var(--gold)' }}>{formatMoneyBR(totalParcelas)}</span>
            </div>
          </>
        )}
        <div className="loan-summary-row">
          <span className="loan-summary-label">Juros</span>
          <span className="loan-summary-value">{formatMoneyBR(jurosCalculado)}</span>
        </div>
        <div className="loan-summary-row">
          <span className="loan-summary-label">Total do contrato</span>
          <span className="loan-summary-value" style={{ color: 'var(--gold)' }}>{formatMoneyBR(totalCalculado)}</span>
        </div>
        <div className="loan-summary-row">
          <span className="loan-summary-label">Vencimento</span>
          <span className="loan-summary-value">
            {isInstallment && form.primeiro_vencimento ? formatDateForInput(form.primeiro_vencimento) ? localDate(formatDateForInput(form.primeiro_vencimento)) : '—' : form.data_vencimento ? localDate(form.data_vencimento) : '—'}
          </span>
        </div>
      </div>

      {showConfirmApplyAll && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="panel" style={{ maxWidth: 400, width: '90%' }}>
            <h3 style={{ color: 'var(--gold-light)', marginBottom: 12 }}>⚠ Confirmar</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
              {installmentModified.size} parcela(s) foi(m) personalizada(s). Isso vai sobrescrever todos os valores. Tem certeza?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-gold" style={{ flex: 1 }} onClick={() => { applyFirstToAll(displayAmounts[1] || ''); setShowConfirmApplyAll(false); }}>
                Sim, aplicar a todas
              </button>
              <button className="btn btn-dark" onClick={() => setShowConfirmApplyAll(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
