
"use client";

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  // useState ensures QueryClient is only created once per component lifecycle
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Global default query options
        staleTime: 1000 * 60 * 5, // 5 minutes
        refetchOnWindowFocus: false, // Optional: disable refetch on window focus
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
