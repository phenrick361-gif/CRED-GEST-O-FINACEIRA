'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import AppShell from '@/components/AppShell';
import ContractsTable from '@/components/ContractsTable';
import type { Loan } from '@/types';
import Link from 'next/link';
import { PlusCircle } from 'lucide-react';

export default function ContractsPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  const loadLoans = useCallback(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('emprestimos').select('*').eq('user_id', user.id).order('data_vencimento').then(({ data }) => {
        setLoans((data || []) as Loan[]);
      });
    });
  }, []);

  useEffect(() => {
    loadLoans();
  }, [loadLoans, reloadKey]);

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

      <ContractsTable loans={loans} onChanged={() => setReloadKey(k => k + 1)} />
    </AppShell>
  );
}
