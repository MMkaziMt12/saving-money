
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
import { cn } from "@/lib/utils";
import { ClientAuthGuardWrapper } from "./ClientAuthGuardWrapper"; // Client-side guard

// This layout NO LONGER fetches initial auth data or provides AuthProvider.
// It relies on the AuthProvider from the root layout (src/app/layout.tsx).
export default function AppLayout({ children }: { children: ReactNode }) {
  console.log("AppLayout (app group) rendering.");

  return (
    // AuthProvider is now in RootLayout. ClientAuthGuardWrapper consumes the context.
    <ClientAuthGuardWrapper>
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
  );
}
