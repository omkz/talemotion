"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Film, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, register } from "@/lib/api/auth";
import { useAuth } from "./auth-provider";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      const user =
        mode === "register"
          ? await register({
              name: String(data.get("name") ?? ""),
              email: String(data.get("email") ?? ""),
              password: String(data.get("password") ?? ""),
            })
          : await login({
              email: String(data.get("email") ?? ""),
              password: String(data.get("password") ?? ""),
            });
      setUser(user);
      toast.success(mode === "register" ? "Account created" : "Welcome back");
      const next = searchParams.get("next");
      router.replace(next?.startsWith("/") ? next : "/projects");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Authentication could not be completed."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const isRegister = mode === "register";
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_42%)]" />
      <div className="relative w-full max-w-md">
        <Link
          href="/"
          className="mb-6 flex items-center justify-center gap-2 text-sm font-semibold"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Film className="size-4.5" />
          </span>
          TaleMotion
        </Link>
        <Card className="border-border/80 bg-card/95">
          <CardHeader>
            <CardTitle className="text-xl">
              {isRegister ? "Create your workspace" : "Sign in to TaleMotion"}
            </CardTitle>
            <CardDescription>
              {isRegister
                ? "Start producing cinematic historical videos."
                : "Continue your video production workspace."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              {isRegister && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" autoComplete="name" required />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  minLength={isRegister ? 12 : 1}
                  required
                />
                {isRegister && (
                  <p className="text-xs text-muted-foreground">
                    Use at least 12 characters.
                  </p>
                )}
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button className="w-full" type="submit" disabled={submitting}>
                {submitting && <LoaderCircle className="size-4 animate-spin" />}
                {isRegister ? "Create account" : "Sign in"}
              </Button>
            </form>
            <p className="mt-5 text-center text-sm text-muted-foreground">
              {isRegister ? "Already have an account?" : "New to TaleMotion?"}{" "}
              <Link
                className="font-medium text-foreground hover:underline"
                href={isRegister ? "/login" : "/register"}
              >
                {isRegister ? "Sign in" : "Create an account"}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
