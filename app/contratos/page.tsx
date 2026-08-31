'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LOAN_COLUMNS } from '@/lib/supabase/columns';
import AppShell from '@/components/AppShell';
import ContractsTable from '@/components/ContractsTable';
import type { Loan } from '@/types';
import Link from 'next/link';
import { PlusCircle } from 'lucide-react';

export default function ContractsPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const loadLoans = useCallback(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('emprestimos')
        .select(LOAN_COLUMNS)
        .eq('user_id', user.id)
        .order('data_vencimento')
        .then(({ data, error }) => {
          if (error) { setErrorMsg(error.message); return; }
          setErrorMsg('');
          setLoans(((data || []) as Loan[]).filter(loan => loan.contract_type !== 'installment'));
        });
    });
  }, []);

  useEffect(() => {
    loadLoans();
    const onChanged = () => loadLoans();
    window.addEventListener('cred-data-changed', onChanged);
    window.addEventListener('focus', onChanged);
    document.addEventListener('visibilitychange', onChanged);
    return () => {
      window.removeEventListener('cred-data-changed', onChanged);
      window.removeEventListener('focus', onChanged);
      document.removeEventListener('visibilitychange', onChanged);
    };
  }, [loadLoans, reloadKey]);

  const changed = useCallback(() => {
    window.dispatchEvent(new Event('cred-data-changed'));
    setReloadKey(k => k + 1);
  }, []);

  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-header-title">Carteira</h1>
          <p className="page-header-subtitle">Gerencie todos os contratos, pagamentos e vencimentos.</p>
        </div>
        <div className="page-header-right">
          <Link href="/novo-emprestimo" className="btn btn-gold">
            <PlusCircle size={18} /> Novo empréstimo
          </Link>
        </div>
      </div>

      {errorMsg && (
        <div className="error" style={{ marginBottom: 16 }}>Erro ao carregar dados: {errorMsg}</div>
      )}

      <ContractsTable loans={loans} onChanged={changed} />
    </AppShell>
  );
}
