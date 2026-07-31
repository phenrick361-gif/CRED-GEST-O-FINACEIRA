'use client';
import { useState } from 'react';

export default function Calculator() {
  const [expr, setExpr] = useState('');
  const [display, setDisplay] = useState('0');

  function press(v: string) {
    if (v === 'C') { setExpr(''); setDisplay('0'); return; }
    if (v === '⌫') {
      const next = expr.slice(0, -1);
      setExpr(next);
      setDisplay(next || '0');
      return;
    }
    if (v === '=') {
      try {
        let safe = expr.replaceAll('×', '*').replaceAll('÷', '/');
        safe = safe.replace(/(\d+(?:\.\d+)?)([+\-])(\d+(?:\.\d+)?)%/g, (_, a, o, b) => `${a}${o}(${a}*${b}/100)`);
        safe = safe.replace(/(\d+(?:\.\d+)?)([*\/])(\d+(?:\.\d+)?)%/g, (_, a, o, b) => `${a}${o}(${b}/100)`);
        safe = safe.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
        if (!/^[0-9+\-*/().\s]+$/.test(safe)) throw new Error();
        const result = Function(`"use strict";return (${safe})`)();
        if (!Number.isFinite(result)) throw new Error();
        const formatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 10 }).format(Math.round(result * 1e10) / 1e10);
        setDisplay(formatted);
        setExpr(String(result));
      } catch {
        setDisplay('Erro');
      }
      return;
    }
    const next = expr + v;
    setExpr(next);
    setDisplay(next);
  }

  const keys = [
    { label: 'C', cls: 'clear' }, { label: '⌫', cls: '' }, { label: '%', cls: '' }, { label: '÷', cls: 'op' },
    { label: '7', cls: '' }, { label: '8', cls: '' }, { label: '9', cls: '' }, { label: '×', cls: 'op' },
    { label: '4', cls: '' }, { label: '5', cls: '' }, { label: '6', cls: '' }, { label: '-', cls: 'op' },
    { label: '1', cls: '' }, { label: '2', cls: '' }, { label: '3', cls: '' }, { label: '+', cls: 'op' },
    { label: '0', cls: '' }, { label: '.', cls: '' }, { label: '(', cls: 'paren' }, { label: ')', cls: 'paren' },
    { label: '=', cls: 'eq' },
  ];

  return (
    <div className="panel calc">
      <div className="calc-display">{display}</div>
      <div className="calc-grid">
        {keys.map(k => (
          <button
            key={k.label}
            className={k.cls}
            onClick={() => press(k.label)}
            style={k.label === '=' ? { gridColumn: 'span 4' } : undefined}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}
