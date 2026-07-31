'use client';

function fmt(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function fmtShort(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(Math.round(n));
}

export function BarChartCard({
  capital, jurosPrevistos, jurosRecebidos
}: {
  capital: number; jurosPrevistos: number; jurosRecebidos: number;
}) {
  const items = [
    { label: 'Capital investido', value: capital, color: '#d4af37', icon: '💰' },
    { label: 'Juros previstos', value: jurosPrevistos, color: '#36bffa', icon: '📈' },
    { label: 'Juros recebidos', value: jurosRecebidos, color: '#18e061', icon: '💵' },
  ];
  const max = Math.max(...items.map(i => i.value), 1);
  const hasData = items.some(i => i.value > 0);

  return (
    <div className="chart-card">
      <div className="chart-title">📊 Visão financeira</div>
      {!hasData ? (
        <div className="chart-empty">
          <span className="chart-empty-icon">📊</span>
          <span className="chart-empty-text">Nenhum dado financeiro</span>
          <span className="chart-empty-sub">Os valores aparecerão quando houver contratos</span>
        </div>
      ) : (
        <>
          <svg viewBox="0 0 500 220" style={{ width: '100%', height: 'auto', display: 'block' }}>
            {items.map((item, i) => {
              const barH = (item.value / max) * 150;
              const x = 40 + i * 155;
              const y = 195 - barH;
              return (
                <g key={item.label}>
                  <rect x={x} y={y} width={90} height={barH} rx={6} fill={item.color} opacity={0.85}>
                    <animate attributeName="height" from="0" to={barH} dur="0.5s" fill="freeze" />
                    <animate attributeName="y" from={195} to={y} dur="0.5s" fill="freeze" />
                  </rect>
                  <text x={x + 45} y={y - 8} textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800">
                    {fmtShort(item.value)}
                  </text>
                </g>
              );
            })}
            {['Capital', 'Juros prev.', 'Juros rec.'].map((label, i) => (
              <text key={label} x={85 + i * 155} y={212} textAnchor="middle" fill="#999" fontSize="11" fontWeight="600">
                {label}
              </text>
            ))}
          </svg>
          <div className="chart-legend">
            {items.map(item => (
              <span key={item.label} className="chart-legend-item">
                <span className="chart-dot" style={{ background: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function DonutChartCard({
  emDia, atrasados, pagos, semJuros
}: {
  emDia: number; atrasados: number; pagos: number; semJuros: number;
}) {
  const segments = [
    { label: 'Em dia', value: emDia, color: '#18e061' },
    { label: 'Atrasados', value: atrasados, color: '#ff4d4d' },
    { label: 'Pagos', value: pagos, color: '#36bffa' },
    { label: 'Sem juros', value: semJuros, color: '#d4af37' },
  ];
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const hasData = total > 0;
  const r = 76;
  const circ = 2 * Math.PI * r;

  let offset = 0;
  const arcs = segments.map(seg => {
    const len = seg.value > 0 ? (seg.value / total) * circ : 0;
    const arc = { ...seg, len, offset };
    offset += len;
    return arc;
  });

  return (
    <div className="chart-card">
      <div className="chart-title">🍀 Distribuição da carteira</div>
      {!hasData ? (
        <div className="chart-empty">
          <span className="chart-empty-icon">🍀</span>
          <span className="chart-empty-text">Nenhum contrato cadastrado</span>
          <span className="chart-empty-sub">A distribuição aparecerá quando houver contratos</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'center' }}>
          <svg viewBox="0 0 200 190" style={{ width: '100%', maxWidth: 200, height: 'auto' }}>
            {arcs.filter(a => a.value > 0).map(a => (
              <circle key={a.label} cx="100" cy="95" r={r} fill="none" stroke={a.color}
                strokeWidth="28" strokeDasharray={`${a.len} ${circ - a.len}`}
                strokeDashoffset={-a.offset} transform="rotate(-90 100 95)"
                strokeLinecap="butt" opacity="0.9"
              />
            ))}
            <text x="100" y="88" textAnchor="middle" fill="#fff" fontSize="28" fontWeight="900">{total}</text>
            <text x="100" y="108" textAnchor="middle" fill="#999" fontSize="11" fontWeight="600">total</text>
          </svg>
          <div style={{ display: 'grid', gap: 10 }}>
            {segments.filter(s => s.value > 0).map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{s.value} contrato{s.value !== 1 ? 's' : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function MonthlyChartCard({ data }: {
  data: { month: string; principal: number; total: number; newTotal: number }[];
}) {
  const hasData = data.length > 0;
  const maxVal = Math.max(...data.map(d => d.total), 1);

  const pt = (d: { total: number }, i: number) => {
    const x = 50 + i * ((500 - 80) / Math.max(data.length - 1, 1));
    const y = 190 - (d.total / maxVal) * 150;
    return `${x},${y}`;
  };

  const points = data.map((d, i) => pt(d, i)).join(' ');

  const barW = Math.min(40, (500 - 80) / data.length * 0.5);

  return (
    <div className="chart-card">
      <div className="chart-title">📈 Evolução mensal da carteira</div>
      {!hasData ? (
        <div className="chart-empty">
          <span className="chart-empty-icon">📈</span>
          <span className="chart-empty-text">Nenhum dado mensal</span>
          <span className="chart-empty-sub">A evolução aparecerá conforme novos contratos forem criados</span>
        </div>
      ) : (
        <>
          <svg viewBox="0 0 500 220" style={{ width: '100%', height: 'auto', display: 'block' }}>
            {data.length > 1 && (
              <>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d4af37" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#d4af37" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <polygon fill="url(#areaGrad)"
                  points={`50,190 ${points} ${50 + (data.length - 1) * ((500 - 80) / Math.max(data.length - 1, 1))},190`}
                />
              </>
            )}
            {data.length > 1 && (
              <polyline fill="none" stroke="#d4af37" strokeWidth="2.5" strokeLinejoin="round"
                points={points}
              />
            )}
            {data.map((d, i) => {
              const x = 50 + i * ((500 - 80) / Math.max(data.length - 1, 1));
              const y = 190 - (d.total / maxVal) * 150;
              return (
                <g key={d.month}>
                  <rect x={x - barW / 2} y={y} width={barW} height={190 - y - 20} rx={3}
                    fill="#d4af37" opacity="0.12"
                  />
                  <circle cx={x} cy={y} r="4" fill="#d4af37" stroke="#050505" strokeWidth="2" />
                  <text x={x} y={190} textAnchor="middle" fill="#999" fontSize="9" fontWeight="600">
                    {d.month.slice(2)}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="chart-legend">
            <span className="chart-legend-item">
              <span className="chart-dot" style={{ background: '#d4af37' }} />
              Valor acumulado da carteira
            </span>
          </div>
        </>
      )}
    </div>
  );
}
