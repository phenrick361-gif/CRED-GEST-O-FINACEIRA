'use client';

import AppShell from '@/components/AppShell';
import Calculator from '@/components/Calculator';

export default function CalculatorPage() {
  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-header-title">Calculadora</h1>
          <p className="page-header-subtitle">Calcule valores, juros e percentuais rapidamente.</p>
        </div>
        <div className="page-header-right">
          <span className="badge badge-green">Acesso liberado</span>
        </div>
      </div>
      <Calculator />
    </AppShell>
  );
}
