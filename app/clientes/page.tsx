'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LOAN_COLUMNS } from '@/lib/supabase/columns';
import AppShell from '@/components/AppShell';
import ClientManager from '@/components/ClientManager';
import type { Loan } from '@/types';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';

export default function ClientsPage() {
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
        .order('cliente')
        .then(({ data, error }) => {
          if (error) { setErrorMsg(error.message); return; }
          setErrorMsg('');
          setLoans((data || []) as Loan[]);
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
          <h1 className="page-header-title">Clientes</h1>
          <p className="page-header-subtitle">Gerencie clientes e acompanhe todos os contratos vinculados.</p>
        </div>
        <div className="page-header-right">
          <Link href="/novo-emprestimo" className="btn btn-gold">
            <UserPlus size={18} /> Novo cliente
          </Link>
        </div>
      </div>

      {errorMsg && (
        <div className="error" style={{ marginBottom: 16 }}>Erro ao carregar dados: {errorMsg}</div>
      )}

      <ClientManager loans={loans} onChanged={changed} />
    </AppShell>
  );
}
