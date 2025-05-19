
import type { ReactNode } from 'react';
import { APP_NAME } from '@/lib/constants';
import { Building2 } from 'lucide-react';

// This layout NO LONGER provides AuthProvider.
// It relies on the AuthProvider from the root layout (src/app/layout.tsx).
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    // AuthProvider is now in RootLayout. Components inside will consume that context.
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <Building2 className="h-12 w-12 text-primary" />
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
            {APP_NAME}
          </h1>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-lg sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
