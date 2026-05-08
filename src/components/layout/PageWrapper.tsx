'use client';

import { ReactNode } from 'react';

export default function PageWrapper({ children }: { children: ReactNode }) {
  return (
    <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 pt-3 px-3 sm:px-4 space-y-3">
      {children}
    </main>
  );
}
