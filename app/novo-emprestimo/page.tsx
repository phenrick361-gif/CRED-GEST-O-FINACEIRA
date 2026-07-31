'use client';

import AppShell from '@/components/AppShell';
import LoanForm from '@/components/LoanForm';

export default function NewLoanPage() {
  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-header-title">Novo empréstimo</h1>
          <p className="page-header-subtitle">Cadastre um novo contrato para um cliente.</p>
        </div>
      </div>
      <LoanForm />
    </AppShell>
  );
}
