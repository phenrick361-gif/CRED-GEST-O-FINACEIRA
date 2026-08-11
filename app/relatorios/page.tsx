'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LOAN_COLUMNS } from '@/lib/supabase/columns';
import AppShell from '@/components/AppShell';
import ReportClient from '@/components/ReportClient';
import type { Loan } from '@/types';

export default function ReportsPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const load = () => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('emprestimos')
        .select(LOAN_COLUMNS)
        .eq('user_id', user.id)
        .order('data_emprestimo', { ascending: false })
        .then(({ data, error }) => {
          if (error) { setErrorMsg(error.message); return; }
          setErrorMsg('');
          setLoans((data || []) as Loan[]);
        });
    });
  };

  useEffect(() => {
    load();
    const onChanged = () => load();
    window.addEventListener('cred-data-changed', onChanged);
    window.addEventListener('focus', onChanged);
    document.addEventListener('visibilitychange', onChanged);
    return () => {
      window.removeEventListener('cred-data-changed', onChanged);
      window.removeEventListener('focus', onChanged);
      document.removeEventListener('visibilitychange', onChanged);
    };
  }, []);

  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-header-title">Relatórios</h1>
          <p className="page-header-subtitle">Visualize, filtre e exporte informações financeiras.</p>
        </div>
        <div className="page-header-right">
          <span className="badge badge-green">Acesso liberado</span>
        </div>
      </div>
      {errorMsg && (
        <div className="error" style={{ marginBottom: 16 }}>Erro ao carregar dados: {errorMsg}</div>
      )}
      <ReportClient loans={loans} />
    </AppShell>
  );
}
