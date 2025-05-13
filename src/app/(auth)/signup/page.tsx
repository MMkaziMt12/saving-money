"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const supabase = createClient();
    
    // The `handle_new_user` trigger in Supabase will use `raw_user_meta_data`.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone: phone, 
          // email will be available from auth.users.email
          // is_approved and role will default in the profiles table
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
      // User is created, session might or might not be active depending on email confirmation settings.
      // The trigger `handle_new_user` should have created a profile.
      toast({
        title: "Account Created!",
        description: "Please check your email for verification if required. Your account is pending admin approval.",
      });
      // AuthProvider will pick up the new user state.
      // Redirect to awaiting approval page.
      router.push("/awaiting-approval");
    } else {
       toast({
        title: "Signup Incomplete",
        description: "Something went wrong during signup. Please try again.",
        variant: "destructive",
      });
    }
    setIsLoading(false);
  };

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
          <Input id="fullName" placeholder="John Doe" value={fullName} onChange={e => setFullName(e.target.value)} required disabled={isLoading} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="m@example.com" value={email} onChange={e => setEmail(e.target.value)} required disabled={isLoading} />
        </div>
         <div className="grid gap-2">
          <Label htmlFor="phone">Phone Number</Label>
          <Input id="phone" type="tel" placeholder="123-456-7890" value={phone} onChange={e => setPhone(e.target.value)} required disabled={isLoading} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required disabled={isLoading} />
        </div>
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Sign Up
        </Button>
      </form>
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
