'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import AppShell from '@/components/AppShell';
import ReportClient from '@/components/ReportClient';
import type { Loan } from '@/types';

export default function ReportsPage() {
  const [loans, setLoans] = useState<Loan[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('emprestimos').select('*').eq('user_id', user.id).then(({ data }) => {
        setLoans((data || []) as Loan[]);
      });
    });
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
      <ReportClient loans={loans} />
    </AppShell>
  );
}
