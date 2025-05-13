
"use client";

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useMockAuth } from '@/hooks/use-mock-auth';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const { user, isLoading, isApproved } = useMockAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/login');
      } else if (!isApproved) {
        router.replace('/awaiting-approval');
      } else {
        // User is authenticated and approved.
        // If we are on the root path ('/'), and the (app) layout hasn't taken over,
        // explicitly navigate to a path that will be handled by the (app) layout.
        // However, Next.js routing with App Router and layouts should handle this:
        // If a user is authenticated and approved, the (app)/layout.tsx will render,
        // and within that, (app)/page.tsx (the dashboard) will be rendered.
        // This root page.tsx should ideally not need to redirect to '/' again if already on '/'.
        // The (app)/layout.tsx is responsible for showing the dashboard content for the '/' path.
      }
    }
  }, [user, isLoading, isApproved, router, pathname]);

  // Show a loader while auth state is being determined and redirection is in progress.
  // This prevents a flash of unstyled content or incorrect page.
  if (isLoading || (!user && typeof window !== 'undefined' && pathname === '/') || (user && !isApproved && typeof window !== 'undefined' && pathname === '/')) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  // If authenticated and approved, and on the root path, the (app)/layout.tsx and (app)/page.tsx
  // should be rendering. Returning null here assumes the layout handles the actual content.
  // This component primarily acts as a guard for the root path.
  if (user && isApproved && pathname === '/') {
    // This state implies the (app)/* route structure should be active.
    // The (app)/layout.tsx should render its children, which includes (app)/page.tsx.
    // No explicit router.replace('/') is needed here as it could cause a loop.
    // The layout itself handles rendering the correct dashboard page.
    return null; 
  }

  // Fallback for any other state, though covered by useEffect redirects.
  return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
  );
}
