// "use client";

// import { useEffect } from 'react';
// import { useRouter } from 'next/navigation';
// import { useAuth } from '@/contexts/AuthContext';
// import { Loader2 } from 'lucide-react';

// export default function HomePage() {
//   const { user, profile, isLoading, isApproved } = useAuth();
//   const router = useRouter();

//   useEffect(() => {
//     if (!isLoading) {
//       if (!user) {
//         router.replace('/login');
//       } else if (!profile || !isApproved) { // User exists but profile not loaded or not approved
//         router.replace('/awaiting-approval');
//       } else {
//         // User is authenticated, profile loaded, and approved.
//         // The (app)/layout.tsx will render the dashboard for the '/' path.
//         // No explicit redirection needed here if already on '/',
//         // as the (app) group handles the '/' route.
//         // If this page is ever reached directly when user is approved,
//         // it means (app) layout should take over.
//         // router.replace('/'); // This might cause a loop if not careful.
//         // Let the (app) group routing handle it.
//       }
//     }
//   }, [user, profile, isLoading, isApproved, router]);

//   if (isLoading || (!user && typeof window !== 'undefined') || (user && (!profile || !isApproved) && typeof window !== 'undefined')) {
//     return (
//       <div className="flex h-screen w-screen items-center justify-center bg-background">
//         <Loader2 className="h-12 w-12 animate-spin text-primary" />
//       </div>
//     );
//   }
  
//   // If user is authenticated and approved, (app)/layout.tsx and (app)/page.tsx
//   // should be rendering. This component acts as a guard and interstitial loader.
//   // Returning null assumes the layout handles the actual content for '/' path.
//   if (user && profile && isApproved) {
//      return null; 
//   }

//   // Fallback, though covered by useEffect redirects.
//   return (
//       <div className="flex h-screen w-screen items-center justify-center bg-background">
//         <Loader2 className="h-12 w-12 animate-spin text-primary" />
//       </div>
//   );
// }
