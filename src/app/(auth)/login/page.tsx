"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from '@/lib/supabase/client';
import { useAuth } from "@/contexts/AuthContext"; // Import useAuth
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { fetchProfile } = useAuth(); // Get fetchProfile to update context
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast({
        title: "Login Failed",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } else if (data.user) {
      // AuthProvider's onAuthStateChange will handle setting user and fetching profile.
      // We can optionally pre-fetch profile here if needed for immediate use,
      // but AuthProvider should take care of it.
      // await fetchProfile(data.user.id); // AuthProvider already does this
      toast({
        title: "Login Successful",
        description: "Welcome back!",
      });
      router.push("/"); // Redirect to dashboard or home
    }
    setIsLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-center">Welcome Back!</h2>
        <p className="text-sm text-muted-foreground text-center mt-1">
          Enter your credentials to access your account.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="m@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input 
            id="password" 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required 
            disabled={isLoading}
          />
        </div>
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Login
        </Button>
      </form>
      <p className="px-8 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="underline underline-offset-4 hover:text-primary"
        >
          Sign Up
        </Link>
      </p>
    </div>
  );
}
