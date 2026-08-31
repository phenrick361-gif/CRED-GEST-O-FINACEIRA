'use client';

import type { ReactNode } from 'react';
import { useCallback, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LayoutDashboard, Users, Briefcase, PlusCircle, BarChart3, FileText, Calculator, Settings, LogOut, Menu, X, ShieldCheck } from 'lucide-react';
import type { Profile } from '@/types';
import { isoToday } from '@/lib/finance';

export default function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userName, setUserName] = useState('Usuário');
  const [allowed, setAllowed] = useState(true);
  const [overdueCount, setOverdueCount] = useState(0);
  const pathname = usePathname();
  const supabase = createClient();

  const refreshOverdueCount = useCallback(async () => {
    const client = createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;
    const { count, error } = await client
      .from('installments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('paid_at', null)
      .lt('due_date', isoToday());
    if (!error) setOverdueCount(count || 0);
  }, []);

  useEffect(() => {
    const s = createClient();
    s.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      s.from('profiles').select('*').eq('id', user.id).maybeSingle().then(({ data }) => {
        if (data) {
          setProfile(data as Profile);
          setUserName(data.nome || user.email || 'Usuário');
          const status = String(data.status_assinatura || 'teste').toLowerCase();
          setAllowed(['ativo', 'active', 'teste', 'trial', 'gratuito'].includes(status));
        }
      });
    });
    refreshOverdueCount();
    window.addEventListener('cred-data-changed', refreshOverdueCount);
    window.addEventListener('focus', refreshOverdueCount);
    document.addEventListener('visibilitychange', refreshOverdueCount);
    return () => {
      window.removeEventListener('cred-data-changed', refreshOverdueCount);
      window.removeEventListener('focus', refreshOverdueCount);
      document.removeEventListener('visibilitychange', refreshOverdueCount);
    };
  }, [refreshOverdueCount]);

  const links = [
    { icon: LayoutDashboard, label: 'Painel', href: '/dashboard' },
    { icon: LayoutDashboard, label: 'Parcelados', href: '/parcelados' },
    { icon: Users, label: 'Clientes', href: '/clientes' },
    { icon: Briefcase, label: 'Carteira', href: '/contratos' },
    { icon: PlusCircle, label: 'Novo empréstimo', href: '/novo-emprestimo' },
    { icon: BarChart3, label: 'Balanço Geral', href: '/balanco-geral' },
    { icon: FileText, label: 'Relatórios', href: '/relatorios' },
    { icon: Calculator, label: 'Calculadora', href: '/calculadora' },
  ];

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    links.push({ icon: Settings, label: 'Configurações', href: '/configuracoes' });
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  function getInitials(name: string): string {
    return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="app-shell">
      <button className="mobile-menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Menu">
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={closeSidebar} />

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: 'var(--gold)' }}>
              <path d="M12 2C12 2 9 6 7 8C5 10 2 12 2 12C2 12 5 14 7 16C9 18 12 22 12 22C12 22 15 18 17 16C19 14 22 12 22 12C22 12 19 10 17 8C15 6 12 2 12 2Z" fill="currentColor" opacity="0.85"/>
              <path d="M12 4C12 4 10 7 9 9C8 11 12 13 12 13C12 13 16 11 15 9C14 7 12 4 12 4Z" fill="currentColor" opacity="0.4"/>
            </svg>
          </div>
          <h2>CRED</h2>
          <div className="brand-sub">Gestão Financeira</div>
        </div>

        <div className="user-card">
          <div className="user-avatar">{getInitials(userName)}</div>
          <div className="user-name">{userName}</div>
          <div className="user-label">USUÁRIO</div>
          <div className="online-status">
            <span className="online-dot" />
            <span>Sistema online</span>
          </div>
        </div>

        <nav className="nav">
          {links.map(l => {
            const active = isActive(l.href);
            const Icon = l.icon;
            const showBadge = l.label === 'Parcelados' && overdueCount > 0;
            return (
              <Link key={l.href} href={l.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={closeSidebar}>
                <Icon className="nav-icon" size={18} />
                {l.label}
                {showBadge && <span style={{ background: 'var(--red)', color: '#fff', fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '1px 7px', minWidth: 20, textAlign: 'center', marginLeft: 4 }}>{overdueCount}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-divider" />
          <button
            className="sidebar-signout"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.replace('/login');
            }}
          >
            <LogOut size={16} /> Sair
          </button>
          {profile && (
            <div className="sidebar-plan">
              <div className="sidebar-plan-label"><ShieldCheck size={12} style={{ marginRight: 2 }} /> PLANO {profile.plano?.toUpperCase() || 'PROFISSIONAL'}</div>
              <div className="sidebar-plan-status">{profile.status_assinatura || 'teste'}</div>
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        {!allowed ? (
          <div className="error" style={{ textAlign: 'center', padding: 24, fontSize: 15 }}>
            Sua assinatura está bloqueada. Entre em contato com o administrador.
          </div>
        ) : <div className="page-container">{children}</div>}
      </main>
    </div>
  );
}
