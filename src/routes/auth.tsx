import { useQueryClient } from "@tanstack/react-query";
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
import {
  UNVERIFIED_TTL_MS,
  markPendingVerification,
  purgeUnverifiedSession,
  readPendingVerification,
} from "@/lib/session-hygiene";


export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "signup" ? ("signup" as const) : ("signin" as const),
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

function strengthOf(password: string) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

function AuthPage() {
  const t = useT();
  const navigate = useNavigate();
  const { mode } = Route.useSearch();

  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [usernameFree, setUsernameFree] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const queryClient = useQueryClient();

  // Unverified signups get 5 minutes; after that the local session and caches are wiped.
  useEffect(() => {
    const pending = readPendingVerification();
    if (!pending) return;
    const remaining = pending.at + UNVERIFIED_TTL_MS - Date.now();
    const expire = async () => {
      await purgeUnverifiedSession(queryClient);
      toast.error(t("auth.verifyExpired"));
    };
    if (remaining <= 0) {
      void expire();
      return;
    }
    const timer = window.setTimeout(() => void expire(), remaining);
    return () => window.clearTimeout(timer);
  }, [queryClient, t]);



  const strengthLabels = [
    t("auth.strength.weak"),
    t("auth.strength.weak"),
    t("auth.strength.fair"),
    t("auth.strength.good"),
    t("auth.strength.strong"),
  ];

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
        const { data } = await supabase.from("profiles").select("email").eq("username", loginEmail).maybeSingle();
        if (!data?.email) throw new Error(t("common.error"));
        loginEmail = data.email;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) throw error;
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

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
                  {password.length > 0 && (
                    <p className="text-xs text-muted-foreground">{strengthLabels[strengthOf(password)]}</p>
                  )}
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
