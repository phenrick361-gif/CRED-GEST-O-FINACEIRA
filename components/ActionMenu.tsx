'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';

type ActionMenuItem = {
  label?: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
};

const GAP = 4;
const MARGIN = 8;
const MENU_Z_INDEX = 2147483000;

function useFloatingMenu() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const position = useCallback(() => {
    const btn = btnRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return;
    const r = btn.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    if (!r.width && !r.height) return;

    let left = Math.min(r.right - m.width, window.innerWidth - m.width - MARGIN);
    left = Math.max(MARGIN, left);

    const spaceBelow = window.innerHeight - MARGIN - r.bottom - GAP;
    const spaceAbove = r.top - MARGIN - GAP;
    let top = spaceBelow >= m.height || spaceBelow >= spaceAbove
      ? r.bottom + GAP
      : r.top - m.height - GAP;
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - m.height - MARGIN));

    setPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    position();
    const id = requestAnimationFrame(() => requestAnimationFrame(position));
    return () => cancelAnimationFrame(id);
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    return () => {
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
    };
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, setOpen, btnRef, menuRef, pos };
}

export default function ActionMenu({ items, iconSize = 18 }: { items: ActionMenuItem[]; iconSize?: number }) {
  const { open, setOpen, btnRef, menuRef, pos } = useFloatingMenu();

  return (
    <div className="action-menu-wrap">
      <button
        className="action-menu-btn"
        ref={btnRef}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
      >
        <MoreHorizontal size={iconSize} />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="action-menu open portal-menu"
          style={{
            top: pos.top,
            left: pos.left,
            right: 'auto',
            bottom: 'auto',
            position: 'fixed',
            zIndex: MENU_Z_INDEX,
            transform: 'none',
          }}
        >
          {items.map((item, i) => {
            if (item.divider) return <div key={i} className="action-menu-divider" />;
            const cls = `action-menu-item${item.danger ? ' danger' : ''}`;
            if (item.href) {
              return (
                <Link key={i} href={item.href} role="menuitem" className={cls} onClick={() => setOpen(false)}>
                  {item.icon}
                  {item.label}
                </Link>
              );
            }
            return (
              <button
                key={i}
                role="menuitem"
                className={cls}
                disabled={item.disabled}
                onClick={() => { setOpen(false); item.onClick?.(); }}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
