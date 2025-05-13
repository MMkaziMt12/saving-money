
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMockAuth } from "@/hooks/use-mock-auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const { login, cycleUserType } = useMockAuth(); // Using cycleUserType for demo
  const router = useRouter();
  const [email, setEmail] = useState("user@example.com");
  const [password, setPassword] = useState("password");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // In a real app, you'd call Supabase auth here
    // For this mock, let's assume login based on email or simply cycle
    if (email === "admin@example.com") {
      login("admin");
    } else if (email === "pending@example.com") {
      login("user", false);
    }
     else {
      login("user", true);
    }
    router.push("/");
  };

  const handleCycleUser = () => {
    cycleUserType();
    router.push("/");
  }

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
          />
        </div>
        <Button type="submit" className="w-full">
          Login
        </Button>
      </form>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">
            Or
          </span>
        </div>
      </div>
      <Button variant="outline" onClick={handleCycleUser} className="w-full">
        Cycle User Type (Dev)
      </Button>
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
