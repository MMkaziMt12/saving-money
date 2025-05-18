
"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";
import { Hourglass, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth"; // Updated import
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AwaitingApprovalPage() {
  const { user, profile, signOutUser, isLoadingAuth, isApproved } = useAuth(); // Using new hook
  const router = useRouter();

  useEffect(() => {
    if (!isLoadingAuth) { // Check after auth state is resolved
      if (user && isApproved) {
        router.replace("/"); // Already approved, redirect to dashboard
      } else if (!user) {
        router.replace("/login"); // Not logged in, redirect to login
      }
    }
  }, [isLoadingAuth, user, isApproved, router]);


  const handleLogout = async () => {
    await signOutUser();
    // router.push("/login"); // The onAuthStateChange will redirect via AppLayout
  };

  if (isLoadingAuth || (!user && typeof window !== 'undefined')) {
     return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Hourglass className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading user status...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center shadow-xl">
        <CardHeader>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
            <Hourglass className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl">Account Pending Approval</CardTitle>
          <CardDescription className="text-md">
            Welcome to {APP_NAME}, {profile?.full_name || user?.email || "User"}!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Your account has been created successfully. An administrator needs to approve your membership before you can access the app.
          </p>
          <p className="text-muted-foreground">
            Please check back later or contact an admin if you have questions.
          </p>
          <Button onClick={handleLogout} variant="outline" className="w-full">
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
