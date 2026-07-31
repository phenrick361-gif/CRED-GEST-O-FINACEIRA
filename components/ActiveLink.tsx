'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export default function ActiveLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + '/');

  return (
    <Link href={href} className={isActive ? 'active' : ''} aria-current={isActive ? 'page' : undefined}>
      {children}
    </Link>
  );
}
