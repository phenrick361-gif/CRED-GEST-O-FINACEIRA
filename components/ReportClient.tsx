'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { interest, money, situation, total, parseCurrencyBR, parsePercentageBR } from '@/lib/finance';
import type { Loan } from '@/types';
import Papa from 'papaparse';

function parseDate(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T12:00:00Z');
    if (isNaN(d.getTime())) throw new Error('Data invalida: "' + raw + '"');
    return s;
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) throw new Error('Data invalida: "' + raw + '". Use DD/MM/AAAA ou AAAA-MM-DD');
  const day = parseInt(m[1], 10), month = parseInt(m[2], 10), year = parseInt(m[3], 10);
  if (month < 1 || month > 12) throw new Error('Mes invalido na data: "' + raw + '"');
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day)
    throw new Error('Data invalida: "' + raw + '"');
  return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

const statusValidos = new Set(['Pendente', 'Pago', 'Cancelado']);

type PreviewRow = {
  line: number;
  cliente: string;
  originalCliente: string;
  principal: number | null;
  originalPrincipal: string;
  taxa: number | null;
  originalTaxa: string;
  jurosMonetario: number | null;
  originalJuros: string;
  totalCSV: number | null;
  originalTotal: string;
  vencimento: string;
  telefone: string;
  status: string;
  valido: boolean;
  erros: string[];
  avisos: string[];
};

export default function ReportClient({ loans }: { loans: Loan[] }) {
  const router = useRouter();
  const [importResult, setImportResult] = useState<{ imported: number; ignored: number; erros?: string[]; avisos?: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [detectedHeaders, setDetectedHeaders] = useState<string[] | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [previewSummary, setPreviewSummary] = useState<{ validos: number; erros: number; totalPrincipal: number; totalJuros: number; totalGeral: number } | null>(null);

  const open = loans.filter(l => l.status === 'Pendente');
  const rows = [
    ['Capital investido', open.reduce((s, l) => s + Number(l.valor_emprestado), 0)],
    ['Lucro esperado', open.reduce((s, l) => s + interest(l), 0)],
    ['Total da carteira', open.reduce((s, l) => s + total(l), 0)],
  ] as const;

  function exportCsv() {
    const headers = ['Cliente', 'Telefone', 'Valor Emprestado', 'Juros (%)', 'Lucro', 'Total', 'Vencimento', 'Status', 'Situação'];
    const lines = loans.map(l => [
      l.cliente, l.telefone || '', l.valor_emprestado, l.porcentagem_juros,
      interest(l), total(l), l.data_vencimento, l.status, situation(l),
    ]);
    const csv = '\uFEFF' + [headers, ...lines]
      .map(row => row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';'))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'relatorio_cred.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    setImportResult(null);
    setPreviewRows(null);
    setPreviewSummary(null);
    setDetectedHeaders(null);
    try {
      const text = await file.text();

      const parsed = Papa.parse(text, { header: false, skipEmptyLines: true });
      if (parsed.errors.length > 0) throw new Error('Erro ao ler CSV: ' + parsed.errors[0].message);

      const rows = parsed.data as string[][];
      if (rows.length < 2) throw new Error('CSV precisa ter cabecalho + pelo menos 1 linha de dados');

      const rawHeaders = rows[0].map(h => (h || '').trim().replace(/^\uFEFF/, ''));
      setDetectedHeaders(rawHeaders);

      const headerLower = new Map<string, number>();
      rawHeaders.forEach((h, i) => { if (h) headerLower.set(h.toLowerCase(), i); });

      const fieldMap: Record<string, { aliases: string[]; label: string }> = {
        cliente: { aliases: ['cliente', 'nome', 'contratante', 'tomador', 'devedor'], label: 'Cliente' },
        valor_emprestado: { aliases: ['valor', 'valor emprestado', 'valor do emprestimo', 'principal', 'capital'], label: 'Valor' },
        telefone: { aliases: ['telefone', 'celular', 'contato', 'whatsapp', 'fone', 'phone', 'tel', 'whats'], label: 'Telefone' },
        porcentagem_juros: { aliases: ['porcentagem juros (%)', 'porcentagem juros', 'juros (%)', 'juros %', 'taxa', 'taxa (%)', 'taxa de juros', 'percentual', 'porcentagem', '%', 'taxa %'], label: 'Juros %' },
        juros_monetario: { aliases: ['juros', 'lucro', 'valor juros', 'rendimento', 'juros r$', 'juros em reais'], label: 'Juros R$' },
        data_vencimento: { aliases: ['data vencimento', 'vencimento', 'venc', 'data de vencimento', 'data fim', 'data final', 'due date'], label: 'Vencimento' },
        status: { aliases: ['status', 'situacao', 'estado', 'situa'], label: 'Status' },
        total_csv: { aliases: ['valor total', 'total', 'montante', 'total a receber', 'total do contrato', 'total geral'], label: 'Total (conferencia)' },
      };

      const idx: Record<string, number> = {};
      for (const [f, cfg] of Object.entries(fieldMap)) {
        for (const a of cfg.aliases) {
          const n = a.toLowerCase();
          if (headerLower.has(n)) { idx[f] = headerLower.get(n)!; break; }
        }
      }

      if (idx.cliente === undefined) throw new Error('Coluna de cliente nao encontrada. Cabecalhos detectados: ' + rawHeaders.join(', '));
      if (idx.valor_emprestado === undefined) throw new Error('Coluna de valor nao encontrada. Cabecalhos detectados: ' + rawHeaders.join(', '));

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Faca login novamente');

      const allPreviewRows: PreviewRow[] = [];
      const parseErros: string[] = [];

      for (let r = 1; r < rows.length; r++) {
        try {
          const row = rows[r];
          const originalCliente = (row[idx.cliente] || '').trim();
          const cliente = originalCliente;
          if (!cliente) { parseErros.push('Linha ' + (r + 1) + ': cliente vazio'); continue; }

          const originalPrincipal = row[idx.valor_emprestado] || '';
          const principal = parseCurrencyBR(originalPrincipal);
          if (principal === null || principal <= 0) {
            parseErros.push('Linha ' + (r + 1) + ' (' + cliente + '): valor invalido "' + originalPrincipal + '"');
            continue;
          }

          const vencRaw = idx.data_vencimento !== undefined ? (row[idx.data_vencimento] || '') : '';
          let venc = '';
          try { venc = parseDate(vencRaw); } catch { venc = ''; }

          const fone = idx.telefone !== undefined ? (row[idx.telefone] || '').trim() : '';
          const st = idx.status !== undefined ? (row[idx.status] || '').trim() : 'Pendente';
          const finalStatus = statusValidos.has(st) ? st : 'Pendente';

          let taxa: number | null = null;
          let jurosMonetario: number | null = null;
          let totalCSV: number | null = null;

          const originalTaxa = idx.porcentagem_juros !== undefined ? (row[idx.porcentagem_juros] || '') : '';
          const originalJuros = idx.juros_monetario !== undefined ? (row[idx.juros_monetario] || '') : '';
          const originalTotal = idx.total_csv !== undefined ? (row[idx.total_csv] || '') : '';

          if (originalTaxa) {
            taxa = parsePercentageBR(originalTaxa);
          }

          if (originalJuros) {
            jurosMonetario = parseCurrencyBR(originalJuros);
          }

          if (originalTotal) {
            totalCSV = parseCurrencyBR(originalTotal);
          }

          const erros: string[] = [];
          const avisos: string[] = [];
          let principalFinal = principal;
          let taxaFinal: number;

          if (taxa !== null && taxa > 0 && jurosMonetario !== null && jurosMonetario > 0) {
            const jurosCalculado = principal * taxa / 100;
            const diffJuros = Math.abs(jurosCalculado - jurosMonetario);
            if (diffJuros > 0.02) {
              avisos.push('Juros monetario (' + money(jurosMonetario) + ') difere do calculado pela taxa (' + money(jurosCalculado) + ' com ' + taxa + '%). Usando taxa.');
            }
            taxaFinal = taxa;
          } else if (jurosMonetario !== null && jurosMonetario > 0 && (taxa === null || taxa === 0)) {
            taxaFinal = (jurosMonetario / principal) * 100;
            const arredondado = Math.round(taxaFinal * 100) / 100;
            if (Math.abs(arredondado - taxaFinal) > 0.001) {
              taxaFinal = arredondado;
            }
          } else if (taxa !== null && taxa >= 0) {
            taxaFinal = taxa;
          } else {
            taxaFinal = 0;
          }

          const jurosCalculadoFinal = principalFinal * taxaFinal / 100;
          const totalCalculadoFinal = principalFinal + jurosCalculadoFinal;

          if (totalCSV !== null && totalCSV > 0) {
            const diffTotal = Math.abs(totalCSV - totalCalculadoFinal);
            if (diffTotal > 0.02) {
              if (taxa === null && jurosMonetario === null) {
                taxaFinal = ((totalCSV - principal) / principal) * 100;
                if (!Number.isFinite(taxaFinal) || taxaFinal < 0) {
                  erros.push('Total informado (R$ ' + totalCSV.toFixed(2) + ') e inconsistente com o principal (R$ ' + principal.toFixed(2) + ').');
                  taxaFinal = 0;
                }
              } else {
                erros.push('Total informado (' + money(totalCSV) + ') difere de principal + juros (' + money(totalCalculadoFinal) + '). Diferença: R$ ' + diffTotal.toFixed(2));
              }
            }
          }

          if (principalFinal <= 0) erros.push('Principal deve ser positivo');
          if (taxaFinal < 0) erros.push('Taxa nao pode ser negativa');
          if (taxaFinal > 100) erros.push('Taxa de juros muito alta (' + taxaFinal.toFixed(2) + '%). Verifique se inseriu a taxa (ex: 40) em vez do valor dos juros (ex: 4000,00).');
          if (jurosMonetario !== null && jurosMonetario < 0) erros.push('Juros nao pode ser negativo');

          const valido = erros.length === 0;

          allPreviewRows.push({
            line: r + 1,
            cliente,
            originalCliente,
            principal: principalFinal,
            originalPrincipal,
            taxa: taxaFinal,
            originalTaxa,
            jurosMonetario: jurosCalculadoFinal,
            originalJuros,
            totalCSV: totalCalculadoFinal,
            originalTotal,
            vencimento: venc,
            telefone: fone,
            status: finalStatus,
            valido,
            erros,
            avisos,
          });
        } catch (err: any) {
          parseErros.push('Linha ' + (r + 1) + ': ' + err.message);
        }
      }

      const validos = allPreviewRows.filter(r => r.valido);
      const totalPrincipal = validos.reduce((s, r) => s + (r.principal || 0), 0);
      const totalJuros = validos.reduce((s, r) => s + (r.jurosMonetario || 0), 0);
      const totalGeral = validos.reduce((s, r) => s + (r.totalCSV || 0), 0);

      setPreviewRows(allPreviewRows);
      setPreviewSummary({
        validos: validos.length,
        erros: allPreviewRows.length - validos.length + parseErros.length,
        totalPrincipal,
        totalJuros,
        totalGeral,
      });

      if (parseErros.length > 0) {
        setImportResult({ imported: 0, ignored: 0, erros: parseErros });
      }

    } catch (err: any) {
      setImportResult({ imported: 0, ignored: 0, erros: [err.message] });
    } finally {
      setImporting(false);
    }
  }

  async function confirmImport() {
    if (!previewRows || importing) return;
    setImporting(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Faca login novamente');

      const existingSet = new Set(loans.map(l => l.cliente.toLowerCase().trim() + '|' + Number(l.valor_emprestado) + '|' + l.data_vencimento));

      const validos = previewRows.filter(r => r.valido);
      const dbErros: string[] = [];
      const avisos: string[] = [];
      let imported = 0;

      for (const item of validos) {
        const key = item.cliente.toLowerCase() + '|' + item.principal + '|' + item.vencimento;
        if (existingSet.has(key)) { avisos.push('Linha ' + item.line + ' (' + item.cliente + '): duplicado ignorado'); continue; }

        const payload = {
          user_id: user.id,
          cliente: item.cliente,
          telefone: item.telefone || null,
          valor_emprestado: item.principal,
          porcentagem_juros: item.taxa,
          data_vencimento: item.vencimento || new Date().toISOString().slice(0, 10),
          data_emprestimo: new Date().toISOString().slice(0, 10),
          status: item.status,
          descricao: 'Emprestimo',
          prazo_meses: 1,
          modalidade: 'Pag. Unico',
          periodicidade: 'Mensal',
          juros_aplicado: 'Sobre Total',
        };

        const { error } = await supabase.from('emprestimos').insert(payload);
        if (error) {
          dbErros.push('Linha ' + item.line + ' (' + item.cliente + '): ' + error.message);
        } else {
          imported++;
          existingSet.add(key);
        }
      }

      for (const item of validos) {
        if (item.avisos.length > 0) {
          avisos.push(...item.avisos.map(a => 'Linha ' + item.line + ' (' + item.cliente + '): ' + a));
        }
      }

      const todosErros = validos
        .filter(r => !r.valido)
        .flatMap(r => r.erros.map(e => 'Linha ' + r.line + ' (' + r.cliente + '): ' + e));

      setImportResult({
        imported,
        ignored: (previewRows.length - validos.length),
        erros: [...todosErros, ...dbErros].length > 0 ? [...todosErros, ...dbErros] : undefined,
        avisos: avisos.length > 0 ? avisos : undefined,
      });
      setPreviewRows(null);
      setPreviewSummary(null);
      router.refresh();
      setTimeout(() => setImportResult(null), 15000);
    } catch (err: any) {
      setImportResult({ imported: 0, ignored: 0, erros: [err.message] });
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <section className="grid three-col">
        {rows.map(([label, value]) => (
          <div className="kpi" key={label}>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">{money(value)}</div>
          </div>
        ))}
      </section>
      <div style={{ height: 18 }} />
      <section className="panel">
        <div className="panel-title">Resumo por situacao</div>
        <div className="grid three-col">
          {['Em dia', 'Vence hoje', 'Atrasado', 'Pago'].map(s => (
            <div className="kpi" key={s}>
              <div className="kpi-label">{s}</div>
              <div className="kpi-value">{loans.filter(l => situation(l) === s).length}</div>
            </div>
          ))}
        </div>
        <div style={{ height: 18 }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-gold" onClick={exportCsv}>Exportar CSV</button>
          <button className="btn btn-dark" disabled={importing} onClick={() => document.getElementById('csvInput')?.click()}>
            {importing ? 'Importando...' : 'Importar CSV'}
          </button>
          <input id="csvInput" type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
        </div>

        {detectedHeaders && (
          <div className="panel" style={{ marginTop: 16, border: '1px solid rgba(212,175,55,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 14, color: '#d4af37' }}>
              Cabecalhos detectados no CSV:
            </div>
            <div style={{ fontSize: 13, color: '#ccc', paddingLeft: 28, marginTop: 4 }}>
              {detectedHeaders.join(' | ')}
            </div>
          </div>
        )}

        {importResult && !previewRows && (
          <div
            className="panel"
            style={{
              marginTop: 16,
              border: (importResult.erros?.length ?? 0) > 0 || (importResult.avisos?.length ?? 0) > 0
                ? '1px solid rgba(255,216,77,0.3)'
                : '1px solid rgba(24,224,97,0.3)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontWeight: 800,
                fontSize: 15,
                color: '#fff',
                marginBottom: (importResult.erros?.length ?? 0) > 0 || (importResult.avisos?.length ?? 0) > 0 ? 12 : 0,
              }}
            >
              <span
                style={{
                  color: (importResult.erros?.length ?? 0) > 0 ? '#ff4d4d' : (importResult.avisos?.length ?? 0) > 0 ? '#ffd84d' : '#18e061',
                  fontSize: 18,
                }}
              >
                {(importResult.erros?.length ?? 0) > 0 ? 'Erro' : (importResult.avisos?.length ?? 0) > 0 ? 'Aviso' : 'OK'}
              </span>
              {importResult.imported > 0
                ? importResult.imported + ' contratos importados'
                : 'Nenhum contrato importado'}
              {importResult.ignored > 0 ? (
                <span style={{ color: '#999', fontWeight: 600 }}> ({importResult.ignored} ignorados)</span>
              ) : ''}
            </div>
            {importResult.avisos && importResult.avisos.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#ffd84d', marginBottom: 6 }}>Avisos:</div>
                {importResult.avisos.map((a, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#eebb55', lineHeight: 1.5, marginBottom: 4, paddingLeft: 16 }}>
                    {a}
                  </div>
                ))}
              </div>
            )}
            {importResult.erros && importResult.erros.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#ff6b6b', marginBottom: 6 }}>Erros:</div>
                {importResult.erros.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#ff9999', lineHeight: 1.5, marginBottom: 4, paddingLeft: 16 }}>
                    {e}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {previewRows && previewSummary && (
          <div className="panel" style={{ marginTop: 16, border: '1px solid rgba(212,175,55,0.35)' }}>
            <div className="panel-title" style={{ fontSize: 15 }}>
              Previa da Importacao
            </div>

            <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '12px 16px', flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Validos</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{previewSummary.validos}</div>
              </div>
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 16px', flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Com erro</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--red)' }}>{previewSummary.erros}</div>
              </div>
              <div style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 10, padding: '12px 16px', flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Principal</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money(previewSummary.totalPrincipal)}</div>
              </div>
              <div style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 10, padding: '12px 16px', flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Juros</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>{money(previewSummary.totalJuros)}</div>
              </div>
              <div style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 10, padding: '12px 16px', flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Geral</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>{money(previewSummary.totalGeral)}</div>
              </div>
            </div>

            <div className="table-wrap desktop-table" style={{ maxHeight: 360, overflowY: 'auto' }}>
              <table style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Cliente</th>
                    <th className="text-right">Principal</th>
                    <th className="text-right">Taxa</th>
                    <th className="text-right">Juros</th>
                    <th className="text-right">Total</th>
                    <th>Vencimento</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map(item => (
                    <tr key={item.line} style={{ opacity: item.valido ? 1 : 0.5 }}>
                      <td>{item.line}</td>
                      <td>
                        <div className="client-name-cell">
                          <span className="client-initials" style={{ width: 26, height: 26, fontSize: 10 }}>
                            {item.cliente.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                          </span>
                          <div>
                            <div className="client-name-text" style={{ fontSize: 13 }}>{item.cliente}</div>
                            {!item.valido && item.erros.map((e, i) => (
                              <div key={i} style={{ fontSize: 10, color: 'var(--red)', marginTop: 1 }}>{e}</div>
                            ))}
                            {item.avisos.map((a, i) => (
                              <div key={i} style={{ fontSize: 10, color: '#eebb55', marginTop: 1 }}>{a}</div>
                            ))}
                          </div>
                        </div>
                      </td>
                      <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{item.principal !== null ? money(item.principal) : '-'}</td>
                      <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 11 }}>{item.taxa !== null ? item.taxa.toFixed(1) + '%' : '-'}</td>
                      <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{item.jurosMonetario !== null ? money(item.jurosMonetario) : '-'}</td>
                      <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--gold)' }}>{item.totalCSV !== null ? money(item.totalCSV) : '-'}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.vencimento || '-'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${item.valido ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>
                          {item.valido ? 'OK' : 'Erro'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards for preview */}
            <div className="mobile-only">
              {previewRows.slice(0, 5).map(item => (
                <div key={item.line} className="mobile-card" style={{ opacity: item.valido ? 1 : 0.5 }}>
                  <div className="mobile-card-header">
                    <span className="client-initials" style={{ width: 26, height: 26, fontSize: 10 }}>
                      {item.cliente.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                    </span>
                    <div className="mobile-card-client">
                      <div className="mobile-card-client-name" style={{ fontSize: 13 }}>{item.cliente}</div>
                    </div>
                    <span className={`badge ${item.valido ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10, flexShrink: 0 }}>
                      {item.valido ? 'OK' : 'Erro'}
                    </span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Linha</span>
                    <span className="mobile-card-value">{item.line}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Principal</span>
                    <span className="mobile-card-value">{item.principal !== null ? money(item.principal) : '-'}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Juros</span>
                    <span className="mobile-card-value">{item.jurosMonetario !== null ? money(item.jurosMonetario) : '-'}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Total</span>
                    <span className="mobile-card-value" style={{ color: 'var(--gold)' }}>{item.totalCSV !== null ? money(item.totalCSV) : '-'}</span>
                  </div>
                  <div className="mobile-card-details" style={{ display: 'block' }}>
                    <div className="mobile-card-detail-row">
                      <span className="mobile-card-detail-label">Taxa</span>
                      <span className="mobile-card-detail-value">{item.taxa !== null ? item.taxa.toFixed(1) + '%' : '-'}</span>
                    </div>
                    <div className="mobile-card-detail-row">
                      <span className="mobile-card-detail-label">Vencimento</span>
                      <span className="mobile-card-detail-value">{item.vencimento || '-'}</span>
                    </div>
                    {!item.valido && item.erros.map((e, i) => (
                      <div key={i} style={{ fontSize: 10, color: 'var(--red)', marginTop: 4 }}>{e}</div>
                    ))}
                    {item.avisos.map((a, i) => (
                      <div key={i} style={{ fontSize: 10, color: '#eebb55', marginTop: 2 }}>{a}</div>
                    ))}
                  </div>
                </div>
              ))}
              {previewRows.length > 5 && (
                <div className="muted" style={{ textAlign: 'center', fontSize: 12, marginTop: 4 }}>
                  + {previewRows.length - 5} linhas
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-dark"
                onClick={() => { setPreviewRows(null); setPreviewSummary(null); }}
                disabled={importing}
              >
                Cancelar
              </button>
              <button
                className="btn btn-gold"
                onClick={confirmImport}
                disabled={importing || previewSummary.validos === 0}
              >
                {importing ? 'Importando...' : 'Importar ' + previewSummary.validos + ' contratos'}
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
