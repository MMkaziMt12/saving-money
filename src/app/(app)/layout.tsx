
import type { ReactNode } from "react";
import { Header } from "@/components/layout/Header";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarInset,
} from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { APP_NAME } from "@/lib/constants";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { AuthProvider } from "@/contexts/AuthContext"; // Import new AuthProvider
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchUserProfileFromServer } from "@/lib/api/profile";
import type { AuthenticatedUser as AppUser, Profile } from "@/types";
import { cn } from "@/lib/utils";

// This component will now handle client-side auth guarding using the new AuthContext
import { ClientAuthGuardWrapper } from "./ClientAuthGuardWrapper";


export default async function AppLayout({ children }: { children: ReactNode }) {
  // This part runs on the server to fetch initial auth state
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: serverAuthUser },
  } = await supabase.auth.getUser();

  let serverProfile: Profile | null = null;
  if (serverAuthUser) {
    try {
      console.log("AppLayout (Server): Fetching initial profile for user:", serverAuthUser.id);
      serverProfile = await fetchUserProfileFromServer(serverAuthUser.id, supabase);
      console.log("AppLayout (Server): Initial profile fetched:", serverProfile ? serverProfile.id : null, "Approved:", serverProfile?.is_approved);
    } catch (error) {
      console.error("AppLayout (Server): Error fetching initial profile:", error);
      // serverProfile remains null
    }
  }
  
  const initialUserWithProfile = serverAuthUser
    ? ({ ...serverAuthUser, profile: serverProfile } as AppUser)
    : null;

  console.log("AppLayout (Server): Passing to AuthProvider:", { initialUserId: initialUserWithProfile?.id, initialProfileId: serverProfile?.id });

  return (
    <AuthProvider initialUser={initialUserWithProfile} initialProfile={serverProfile}>
      <ClientAuthGuardWrapper> {/* This new component will handle client-side redirects */}
        <SidebarProvider defaultOpen={true}>
          <Sidebar>
            <SidebarHeader>
              <Link
                href="/"
                className="flex items-center gap-2 font-bold text-lg text-[hsl(var(--sidebar-active-background))] group-data-[state=expanded]/sidebar:ml-2 group-data-[state=collapsed]/sidebar:justify-center"
              >
                <Building2 className="h-6 w-6 shrink-0" />
                <span className="group-data-[state=expanded]/sidebar:inline group-data-[state=collapsed]/sidebar:hidden">
                  {APP_NAME}
                </span>
              </Link>
            </SidebarHeader>
            <SidebarContent>
              <SidebarNav />
            </SidebarContent>
          </Sidebar>
          <SidebarInset>
            <div className={cn("flex flex-col flex-1 transition-all duration-300 ease-in-out print:p-0")}>
              <Header />
              <main className="flex-1 p-4 sm:px-6 sm:py-6 md:gap-8 overflow-auto print:overflow-visible">
                {children}
              </main>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </ClientAuthGuardWrapper>
    </AuthProvider>
  );
}
