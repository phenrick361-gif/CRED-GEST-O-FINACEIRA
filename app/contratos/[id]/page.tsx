'use client';

import { useEffect, useState } from 'react';
import { useParams, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LOAN_COLUMNS } from '@/lib/supabase/columns';
import AppShell from '@/components/AppShell';
import LoanForm, { type LoanFormInitial } from '@/components/LoanForm';

export default function EditLoanPage() {
  const { id } = useParams<{ id: string }>();
  const [loan, setLoan] = useState<LoanFormInitial | null | 'loading'>('loading');

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoan(null); return; }
      Promise.all([
        supabase
          .from('emprestimos')
          .select(LOAN_COLUMNS)
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('installments')
          .select('installment_number,amount,due_date')
          .eq('contract_id', id)
          .eq('user_id', user.id)
          .order('installment_number'),
      ]).then(([loanResult, installmentResult]) => {
        if (loanResult.error || !loanResult.data) {
          setLoan(null);
          return;
        }

        const plan = installmentResult.data || [];
        setLoan({
          ...loanResult.data,
          numero_parcelas: plan.length || undefined,
          valor_parcela: plan[0]?.amount ?? undefined,
          primeiro_vencimento: plan[0]?.due_date ?? undefined,
          total_parcelas: plan.reduce((sum, installment) => sum + Number(installment.amount || 0), 0),
        } as LoanFormInitial);
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
