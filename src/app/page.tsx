
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMockAuth } from '@/hooks/use-mock-auth';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const { user, isLoading, isApproved } = useMockAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/login');
      } else if (!isApproved) {
        router.replace('/awaiting-approval');
      } else {
        // User is logged in and approved, stay or redirect to dashboard
        // (assuming current page is the target dashboard if it's '/')
        // If '/(app)/page.tsx' is the actual dashboard, this page could redirect there.
        // For this setup, (app)/page.tsx IS the dashboard.
        // So if this component is hit, it should redirect into the (app) group.
        // Next.js should handle this by rendering (app)/page.tsx if authenticated and approved.
        // This root page acts as a guard.
        // If the current path is already inside (app) due to layout guards, this logic might be redundant.
        // Let's assume this page is hit first if not deep-linked.
        if(router.pathname === '/') { // Or a more specific check if needed
             router.replace('/'); // This will effectively render the (app)/page.tsx due to layout logic
        }
      }
    }
  }, [user, isLoading, isApproved, router]);

  if (isLoading || (!user && typeof window !== 'undefined') || (user && !isApproved && typeof window !== 'undefined')) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  // Fallback, should be handled by redirection
  return null;
}
