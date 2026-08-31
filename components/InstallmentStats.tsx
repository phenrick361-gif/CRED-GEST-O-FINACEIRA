'use client';

import { getInstallmentStatus } from '@/lib/finance';
import type { Installment, Loan } from '@/types';
import { money } from '@/lib/finance';
import { asAmount } from '@/lib/installments';
import { DollarSign, Clock, CheckCircle, AlertTriangle, Calendar, XCircle } from 'lucide-react';

interface InstallmentStatsProps {
  installments: Installment[];
  loans: Loan[];
}

export function InstallmentStats({ installments, loans }: InstallmentStatsProps) {
  const paga = installments.filter(i => getInstallmentStatus(i.due_date, i.paid_at) === 'Paga');
  const abertas = installments.filter(i => getInstallmentStatus(i.due_date, i.paid_at) !== 'Paga');
  const vencemHoje = installments.filter(i => getInstallmentStatus(i.due_date, i.paid_at) === 'Vence hoje');
  const atrasadas = installments.filter(i => getInstallmentStatus(i.due_date, i.paid_at) === 'Atrasada');
  const totalPago = paga.reduce((sum, installment) => sum + asAmount(installment.amount), 0);
  const totalAberto = abertas.reduce((sum, installment) => sum + asAmount(installment.amount), 0);
  const capitalParcelado = loans.reduce((sum, loan) => sum + asAmount(loan.valor_emprestado), 0);

  const stats = [
    { icon: DollarSign, label: 'Capital em Parcelados', value: money(capitalParcelado), aux: 'Principal separado do Painel', color: 'var(--gold)' },
    { icon: Clock, label: 'Total a Receber', value: money(totalAberto), aux: 'Parcelas ainda pendentes', color: 'var(--blue)' },
    { icon: CheckCircle, label: 'Total Recebido', value: money(totalPago), aux: 'Parcelas já pagas', color: 'var(--green)' },
    { icon: AlertTriangle, label: 'Parcelas em Aberto', value: abertas.length, aux: 'Pendentes de pagamento', color: 'var(--yellow)' },
    { icon: Calendar, label: 'Vencem Hoje', value: vencemHoje.length, aux: 'Cobrar hoje', color: 'var(--yellow)' },
    { icon: XCircle, label: 'Atrasadas', value: atrasadas.length, aux: 'Vencidas e não pagas', color: 'var(--red)' },
  ];

  return (
    <section className="grid kpi-grid-6" style={{ marginBottom: 20 }}>
      {stats.map(c => (
        <div key={c.label} className="kpi">
          <div className="kpi-icon-wrap">
            <c.icon size={18} />
          </div>
          <div className="kpi-label">{c.label}</div>
          <div className="kpi-value">{c.value}</div>
          <div className="muted">{c.aux}</div>
        </div>
      ))}
    </section>
  );
}
