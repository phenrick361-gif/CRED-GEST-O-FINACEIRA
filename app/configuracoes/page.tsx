'use client';

import AppShell from '@/components/AppShell';
import SettingsPanel from '@/components/SettingsPanel';
import { Settings } from 'lucide-react';

export default function ConfiguracoesPage() {
  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-header-title">Configurações</h1>
          <p className="page-header-subtitle">Gerencie sua conta, preferências e dados do sistema.</p>
        </div>
        <div className="page-header-right">
          <span className="badge badge-green">Acesso liberado</span>
        </div>
      </div>
      <SettingsPanel />
    </AppShell>
  );
}
