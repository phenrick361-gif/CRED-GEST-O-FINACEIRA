'use client';

import { getInstallmentStatus } from '@/lib/finance';
import type { Installment } from '@/types/installment';
import { asAmount } from '@/lib/installments';

function fmt(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

interface InstallmentPieChartProps {
  installments: Installment[];
}

export function InstallmentPieChart({ installments }: InstallmentPieChartProps) {
  const paga = installments.filter(i => getInstallmentStatus(i.due_date, i.paid_at) === 'Paga');
  const avencer = installments.filter(i => getInstallmentStatus(i.due_date, i.paid_at) === 'A vencer');
  const venceHoje = installments.filter(i => getInstallmentStatus(i.due_date, i.paid_at) === 'Vence hoje');
  const atrasada = installments.filter(i => getInstallmentStatus(i.due_date, i.paid_at) === 'Atrasada');

  const total = installments.length;
  const hasData = total > 0;
  const r = 76;
  const circ = 2 * Math.PI * r;

  const segments = [
    { label: 'PAGAS', value: paga.length, amount: paga.reduce((sum, installment) => sum + asAmount(installment.amount), 0), color: '#22C55E' },
    { label: 'A VENCER', value: avencer.length, amount: avencer.reduce((sum, installment) => sum + asAmount(installment.amount), 0), color: '#3B82F6' },
    { label: 'VENCEM HOJE', value: venceHoje.length, amount: venceHoje.reduce((sum, installment) => sum + asAmount(installment.amount), 0), color: '#EAB308' },
    { label: 'ATRASADAS', value: atrasada.length, amount: atrasada.reduce((sum, installment) => sum + asAmount(installment.amount), 0), color: '#EF4444' },
  ].filter(s => s.value > 0);

  if (!hasData) {
    return (
      <div className="chart-card">
        <div className="chart-title">🍀 Status das parcelas</div>
        <div className="chart-empty">
          <span className="chart-empty-icon">🍀</span>
          <span className="chart-empty-text">Nenhuma parcela cadastrada</span>
          <span className="chart-empty-sub">As parcelas aparecerão quando criar contratos parcelados</span>
        </div>
      </div>
    );
  }

  let offset = 0;
  const arcs = segments.map(seg => {
    const len = seg.value > 0 ? (seg.value / total) * circ : 0;
    const arc = { ...seg, len, offset };
    offset += len;
    return arc;
  });

  const totalAmount = installments.reduce((sum, installment) => sum + asAmount(installment.amount), 0);

  return (
    <div className="chart-card">
      <div className="chart-title">🍀 Status das parcelas</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'center' }}>
        <svg viewBox="0 0 200 190" style={{ width: '100%', maxWidth: 200, height: 'auto' }}>
          {arcs.filter(a => a.value > 0).map(a => (
            <circle key={a.label} cx="100" cy="95" r={r} fill="none" stroke={a.color}
              strokeWidth="28" strokeDasharray={`${a.len} ${circ - a.len}`}
              strokeDashoffset={-a.offset} transform="rotate(-90 100 95)"
              strokeLinecap="butt" opacity="0.9"
            />
          ))}
          <text x="100" y="88" textAnchor="middle" fill="#fff" fontSize="28" fontWeight="900">{total}</text>
          <text x="100" y="108" textAnchor="middle" fill="#999" fontSize="11" fontWeight="600">parcelas</text>
        </svg>
        <div style={{ display: 'grid', gap: 10 }}>
          {segments.map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{s.label}</div>
                <div style={{ fontSize: 11, color: '#999' }}>{s.value} parcela{s.value !== 1 ? 's' : ''} — {fmt(s.amount)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="chart-legend" style={{ marginTop: 14 }}>
        <span className="chart-legend-item">
          <span className="chart-dot" style={{ background: '#D4AF37' }} />
          Total: {fmt(totalAmount)}
        </span>
      </div>
    </div>
  );
}
