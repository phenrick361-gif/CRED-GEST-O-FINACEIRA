'use client';

import { useEffect, useState } from 'react';
import { useParams, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import AppShell from '@/components/AppShell';
import LoanForm from '@/components/LoanForm';
import type { Loan } from '@/types';

export default function EditLoanPage() {
  const { id } = useParams<{ id: string }>();
  const [loan, setLoan] = useState<Loan | null | 'loading'>('loading');

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoan(null); return; }
      supabase.from('emprestimos').select('*').eq('id', id).eq('user_id', user.id).maybeSingle().then(({ data }) => {
        setLoan(data as Loan || null);
      });
    });
  }, [id]);

  if (loan === 'loading') return <AppShell><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando...</div></AppShell>;
  if (!loan) notFound();

  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-header-title">Editar contrato</h1>
          <p className="page-header-subtitle">Altere as informações do contrato de {loan.cliente}.</p>
        </div>
      </div>
      <LoanForm id={id} initial={loan} />
    </AppShell>
  );
}
