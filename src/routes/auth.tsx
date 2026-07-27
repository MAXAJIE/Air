import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { PasswordMeter } from "@/components/password-meter";
import {
  markPendingVerification,
  touchActivity,
} from "@/lib/session-hygiene";


export const Route = createFileRoute("/auth")({
  // `mode` stays optional so plain `<Link to="/auth">` / redirects stay type-safe.
  validateSearch: (search: Record<string, unknown>): { mode?: "signin" | "signup"; next?: string; code?: string } => ({
    mode: search.mode === "signup" ? "signup" : "signin",
    next: typeof search.next === "string" ? search.next : undefined,
    code: typeof search.code === "string" ? search.code : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Keyward" },
      { name: "description", content: "Sign in or create your Keyward account to manage your listings." },
      { property: "og:title", content: "Sign in — Keyward" },
      { property: "og:description", content: "Access your Keyward property operations workspace." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const t = useT();
  const navigate = useNavigate();
  const { mode, next, code } = Route.useSearch();

  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [usernameFree, setUsernameFree] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);




  async function checkUsername(value: string) {
    setUsername(value);
    if (value.trim().length < 3) {
      setUsernameFree(null);
      return;
    }
    const { data } = await supabase.rpc("username_available", { p_username: value });
    setUsernameFree(Boolean(data));
  }

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      let loginEmail = identifier.trim();
      if (!loginEmail.includes("@")) {
        // profiles is not readable by anon; use a SECURITY DEFINER RPC that
        // returns ONLY the email for the given username.
        const { data: resolved, error: rpcError } = await supabase.rpc("email_for_username", {
          p_username: loginEmail,
        });
        if (rpcError) throw rpcError;
        if (!resolved) throw new Error(t("common.error"));
        loginEmail = String(resolved);
      }
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) throw error;
      touchActivity();
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  // If an invite code is in the URL, stash it in sessionStorage so it
  // survives email verification and role selection.
  useEffect(() => {
    if (code && next === "redeem") {
      sessionStorage.setItem("pending_invite_code", code);
    }
  }, [code, next]);

  async function handleSignUp(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      toast.error(t("auth.passwordMismatch"));
      return;
    }
    if (usernameFree === false) {
      toast.error(t("auth.usernameTaken"));
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: { username: username.trim() },
        },
      });
      if (error) throw error;
      markPendingVerification(email.trim());
      toast.success(t("auth.checkEmail"));

    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(identifier.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success(t("auth.linkSent"));
      setForgot(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Link to="/" className="font-display text-lg font-semibold">
          {t("app.name")}
        </Link>
        <LanguageSwitcher />
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-6 pb-16">
        {forgot ? (
          <form onSubmit={handleForgot} className="surface space-y-4 p-6">
            <h1 className="text-2xl">{t("auth.forgotTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("auth.forgotBody")}</p>
            <div className="space-y-2">
              <Label htmlFor="forgot-email">{t("auth.email")}</Label>
              <Input
                id="forgot-email"
                type="email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {t("auth.sendLink")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setForgot(false)}>
                {t("common.back")}
              </Button>
            </div>
          </form>
        ) : (
          <Tabs defaultValue={mode === "signup" ? "signup" : "signin"}>
            <TabsList className="w-full">
              <TabsTrigger value="signin" className="flex-1">
                {t("auth.signIn")}
              </TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">
                {t("auth.signUp")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="surface mt-4 space-y-4 p-6">
                <div className="space-y-2">
                  <Label htmlFor="identifier">{t("auth.emailOrUsername")}</Label>
                  <Input
                    id="identifier"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      aria-label={show ? t("auth.hide") : t("auth.show")}
                      className="absolute inset-y-0 right-3 flex items-center text-muted-foreground"
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {t("auth.signIn")}
                </Button>
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline"
                  onClick={() => setForgot(true)}
                >
                  {t("auth.forgot")}
                </button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              {next === "redeem" && (
                <div className="surface mt-4 mb-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
                  {t("auth.inviteHint")}
                </div>
              )}
              <form onSubmit={handleSignUp} className="surface mt-4 space-y-4 p-6">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">{t("auth.username")}</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => void checkUsername(e.target.value)}
                    required
                    minLength={3}
                  />
                  {usernameFree !== null && (
                    <p className={usernameFree ? "text-xs text-success" : "text-xs text-destructive"}>
                      {usernameFree ? t("auth.usernameFree") : t("auth.usernameTaken")}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">{t("auth.password")}</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      aria-label={show ? t("auth.hide") : t("auth.show")}
                      className="absolute inset-y-0 right-3 flex items-center text-muted-foreground"
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <PasswordMeter password={password} userInputs={[email, username]} />

                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
                  <Input
                    id="confirm"
                    type={show ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {t("auth.signUp")}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
