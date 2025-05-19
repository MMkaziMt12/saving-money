
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, useEffect } from "react";
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth"; // Using new hook

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.53-4.19 7.22-10.01 7.22-17.65z"></path>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
    <path fill="none" d="M0 0h48v48H0z"></path>
  </svg>
);

export default function SignupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const { isAuthenticated, isLoadingAuth } = useAuth(); // Using new hook

  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated) {
      router.replace("/"); // If already authenticated and auth check done, redirect
    }
  }, [isAuthenticated, isLoadingAuth, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const supabase = createClient();
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName, // This will be in new.raw_user_meta_data for the trigger
          phone: phone, 
          // email: email, // No need to pass email here, it's already part of auth.users
        },
      },
    });

    if (error) {
      toast({
        title: "Signup Failed",
        description: error.message || "Could not create your account.",
        variant: "destructive",
      });
    } else if (data.user) {
      toast({
        title: "Account Created!",
        description: "Please check your email for verification if required. Your account is pending admin approval.",
      });
      // AuthProvider's onAuthStateChange will handle post-signup flow (profile creation via trigger, then state update)
      // and (app)/layout.tsx guard will redirect to /awaiting-approval or / as appropriate.
    } else {
       toast({
        title: "Signup Incomplete",
        description: "Something went wrong during signup. Please try again.",
        variant: "destructive",
      });
    }
    setIsLoading(false);
  };

  const handleGoogleSignUp = async () => {
    setIsGoogleLoading(true);
    const supabase = createClient();
    // For Google sign-up, metadata (like full_name) is typically handled by Supabase populating raw_user_meta_data
    // which our handle_new_user trigger will use.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback` 
      }
    });
    if (error) {
      toast({
        title: "Google Sign-Up Failed",
        description: error.message || "Could not sign up with Google.",
        variant: "destructive",
      });
      setIsGoogleLoading(false);
    }
    // On success, Supabase redirects to Google, then back to your app.
    // The AuthProvider's onAuthStateChange will handle the session and profile creation.
  };

  if (isLoadingAuth || (!isLoadingAuth && isAuthenticated)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-center">Create an Account</h2>
        <p className="text-sm text-muted-foreground text-center mt-1">
          Join your family&apos;s savings group.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="fullName">Full Name</Label>
          <Input id="fullName" placeholder="John Doe" value={fullName} onChange={e => setFullName(e.target.value)} required disabled={isLoading || isGoogleLoading} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="m@example.com" value={email} onChange={e => setEmail(e.target.value)} required disabled={isLoading || isGoogleLoading} />
        </div>
         <div className="grid gap-2">
          <Label htmlFor="phone">Phone Number</Label>
          <Input id="phone" type="tel" placeholder="123-456-7890" value={phone} onChange={e => setPhone(e.target.value)} required disabled={isLoading || isGoogleLoading} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required disabled={isLoading || isGoogleLoading} />
        </div>
        <Button type="submit" className="w-full" disabled={isLoading || isGoogleLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Sign Up
        </Button>
      </form>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">
            Or continue with
          </span>
        </div>
      </div>

      <Button variant="outline" className="w-full" onClick={handleGoogleSignUp} disabled={isLoading || isGoogleLoading}>
        {isGoogleLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <GoogleIcon />
        )}
        Sign up with Google
      </Button>

       <p className="px-8 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="underline underline-offset-4 hover:text-primary"
        >
          Login
        </Link>
      </p>
    </div>
  );
}
