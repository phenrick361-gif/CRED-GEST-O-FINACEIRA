'use client';

import type { MonthBucket } from '@/lib/lucro';

const W = 500;
const H = 250;
const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 18;
const PAD_B = 28;

const GOLD = '#D4AF37';
const GREEN = '#22C55E';

function fmtShort(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1000) return (n / 1000).toFixed(1).replace('.', ',') + 'k';
  if (abs >= 10) return String(Math.round(n * 10) / 10).replace('.', ',');
  return String(Math.round(n));
}

export default function LucroLineChart({ series }: { series: MonthBucket[] }) {
  const n = series.length;
  const maxVal = Math.max(1, ...series.flatMap(s => [s.previsto, s.obtido])) * 1.18;

  const x = (i: number) => PAD_L + (i * (W - PAD_L - PAD_R)) / Math.max(n - 1, 1);
  const y = (v: number) => H - PAD_B - (v / maxVal) * (H - PAD_T - PAD_B);

  const previstoPts = series.map((s, i) => `${x(i)},${y(s.previsto)}`).join(' ');
  const obtidoPts = series.map((s, i) => `${x(i)},${y(s.obtido)}`).join(' ');

  const gridY = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {gridY.map(g => {
        const gy = y(maxVal * (1 - g) / 1.18);
        const label = maxVal * (1 - g) / 1.18;
        return (
          <g key={g}>
            <line x1={PAD_L} x2={W - PAD_R} y1={gy} y2={gy} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
            <text x={PAD_L - 6} y={gy + 3} textAnchor="end" fill="#94A3B8" fontSize="9" fontWeight="600">
              {fmtShort(label)}
            </text>
          </g>
        );
      })}

      <defs>
        <linearGradient id="profitGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={GOLD} stopOpacity="0.22" />
          <stop offset="100%" stopColor={GOLD} stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="profitGreen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={GREEN} stopOpacity="0.16" />
          <stop offset="100%" stopColor={GREEN} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {n > 1 && (
        <>
          <polygon fill="url(#profitGold)" points={`${x(0)},${y(0)} ${previstoPts} ${x(n - 1)},${y(0)}`} />
          <polygon fill="url(#profitGreen)" points={`${x(0)},${y(0)} ${obtidoPts} ${x(n - 1)},${y(0)}`} />
        </>
      )}

      {n > 1 && (
        <>
          <polyline fill="none" stroke={GOLD} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={previstoPts} />
          <polyline fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={obtidoPts} />
        </>
      )}

      {series.map((s, i) => (
        <g key={s.month}>
          <circle cx={x(i)} cy={y(s.previsto)} r="3.5" fill={GOLD} stroke="#050505" strokeWidth="1.5" />
          <circle cx={x(i)} cy={y(s.obtido)} r="3.5" fill={GREEN} stroke="#050505" strokeWidth="1.5" />
          <text x={x(i)} y={H - 8} textAnchor="middle" fill="#94A3B8" fontSize="9.5" fontWeight="600">
            {s.rotulo}
          </text>
        </g>
      ))}
    </svg>
  );
}