'use client';

import type { Installment } from '@/types/installment';
import { money } from '@/lib/finance';
import { DollarSign, Clock, CheckCircle, AlertTriangle, Calendar, XCircle } from 'lucide-react';

interface InstallmentStatsProps {
  installments: Installment[];
}

export function InstallmentStats({ installments }: InstallmentStatsProps) {
  const ativas = installments.filter(i => i.status !== 'Paga');
  const pagas = installments.filter(i => i.status === 'Paga');
  const abertas = installments.filter(i => i.status !== 'Paga');
  const vencemHoje = installments.filter(i => i.status === 'Vence hoje');
  const atrasadas = installments.filter(i => i.status === 'Atrasada');
  const totalPago = pagas.reduce((s, i) => s + i.amount, 0);
  const totalAberto = ativas.reduce((s, i) => s + i.amount, 0);
  const capitalParcelado = installments.reduce((s, i) => s + i.amount, 0);

  const stats = [
    { icon: DollarSign, label: 'Capital em Parcelados', value: money(capitalParcelado), aux: 'Valor dos contratos parcelados', color: 'var(--gold)' },
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