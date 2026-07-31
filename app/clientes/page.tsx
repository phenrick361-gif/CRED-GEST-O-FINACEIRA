'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import AppShell from '@/components/AppShell';
import ClientManager from '@/components/ClientManager';
import type { Loan } from '@/types';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';

export default function ClientsPage() {
  const [loans, setLoans] = useState<Loan[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('emprestimos').select('*').eq('user_id', user.id).order('cliente').then(({ data }) => {
        setLoans((data || []) as Loan[]);
      });
    });
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

      <ClientManager loans={loans} />
    </AppShell>
  );
}
