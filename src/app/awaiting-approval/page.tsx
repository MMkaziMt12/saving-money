
"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth"; // Using the new hook
import { APP_NAME } from "@/lib/constants";
import { Hourglass, LogOut, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AwaitingApprovalPage() {
  const { user, profile, signOutUser, isLoadingAuth, isApproved, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoadingAuth) { 
      if (isAuthenticated) { // isAuthenticated implies user, profile, and approved are all true
        console.log("AwaitingApprovalPage: User is authenticated and approved, redirecting to /");
        router.replace("/"); 
      } else if (!user) { // No user session at all
        console.log("AwaitingApprovalPage: No user session, redirecting to /login");
        router.replace("/login"); 
      }
      // If user exists, but not approved, they should stay on this page.
    }
  }, [isLoadingAuth, user, isAuthenticated, router]);


  const handleLogout = async () => {
    await signOutUser();
    // The onAuthStateChange listener (managed by AuthProvider/authStore) should trigger a redirect to /login
  };

  // Show loader while auth state is being determined,
  // or if user is somehow on this page but should be redirected away quickly.
  if (isLoadingAuth || (!isLoadingAuth && isAuthenticated) || (!isLoadingAuth && !user)) {
     return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading user status...</p>
      </div>
    );
  }

  // At this point, isLoadingAuth is false, user exists, but isApproved is false.
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
            Your account has been created successfully. An administrator needs to approved your membership before you can access the app.
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
