import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  Minus,
  Plus,
  ShoppingCart,
  Sparkle,
  Star,
  MessageSquare,
  ArrowLeft,
  HelpCircle,
  ImagePlus,
  X,
  CalendarClock,
  History,
  LogOut,
  Phone,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { fileToBase64 } from "@/lib/files";
import {
  checkoutGuestSession,
  createShoppingOrder,
  createSpecialRequest,
  getGuestActivity,
  getGuestContext,
  rateCleaner,
  saveGuestCheckIn,
  startGuestSession,
  submitRoomCondition,
} from "@/lib/guest.functions";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format-price";

/**
 * The welcome checklist is a per-session, per-device thing: the guest may skip
 * it, and skipping must survive a refresh without another round-trip.
 */
function checkInKey(sessionId: string) {
  return `guest-checkin:${sessionId}`;
}

function hasCheckedIn(sessionId: string) {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(checkInKey(sessionId)) === "1";
}

/**
 * Checking out closes the stay but must not erase what the guest did: the
 * device remembers its past session ids so history survives a checkout.
 */
function sessionsKey(propertyId: string) {
  return `guest-sessions:${propertyId}`;
}

function readSessions(propertyId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(sessionsKey(propertyId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function rememberSession(propertyId: string, sessionId: string) {
  if (typeof window === "undefined") return;
  const next = [sessionId, ...readSessions(propertyId).filter((id) => id !== sessionId)].slice(0, 30);
  window.localStorage.setItem(sessionsKey(propertyId), JSON.stringify(next));
}

export const Route = createFileRoute("/g/$code")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { session?: string } => ({
    session: typeof search.session === "string" ? search.session : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Welcome — Keyward" },
      { name: "description", content: "Guest access page." },
      { property: "og:title", content: "Welcome — Keyward" },
      { property: "og:description", content: "Guest access page." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GuestByCodePage,
});

type GuestProperty = {
  id: string;
  name: string;
  address: string | null;
  place_name: string | null;
  photo_path: string | null;
};

type ViewState = "loading" | "welcome" | "history" | "menu" | "condition" | "request" | "shop" | "rate" | "thanksCondition" | "thanksRequest" | "thanksShop" | "thanksRate" | "expired" | "error";

type SessionState = {
  sessionId: string;
  propertyName: string;
};

type AmenityItem = { id: string; name: string; expected_qty: number };
type CatalogItem = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  photoUrl: string | null;
};
type GuestContext = {
  propertyName: string;
  amenities: AmenityItem[];
  catalog: CatalogItem[];
  qrUrl: string | null;
  qrLabel: string | null;
  cleaner: { jobId: string; userId: string; name: string } | null;
};

type PhotoDraft = {
  fileName: string;
  contentType: string;
  dataBase64: string;
};

/* ------------------------------------------------------------------ */
/*  Star rating picker                                                 */
/* ------------------------------------------------------------------ */
function StarRating({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (v: number) => void;
  label?: string;
}) {
  return (
    <div className="space-y-1">
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className={cn(
              "rounded-md p-0.5 transition-colors hover:scale-110",
              star <= (value ?? 0) ? "text-amber-400" : "text-muted-foreground/30",
            )}
          >
            <Star className="h-6 w-6 fill-current" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Simple photo upload (reads file → base64, no storage upload)      */
/* ------------------------------------------------------------------ */
function PhotoUpload({
  value,
  onChange,
  label,
}: {
  value: PhotoDraft | null;
  onChange: (p: PhotoDraft | null) => void;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative">
          <img
            src={`data:${value.contentType};base64,${value.dataBase64}`}
            alt={label}
            className="h-40 w-full rounded-md object-cover"
          />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute right-2 top-2 h-7 w-7"
            onClick={() => onChange(null)}
            aria-label="Remove"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/40 text-sm text-muted-foreground transition-colors hover:bg-muted"
        >
          {loading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          ) : (
            <ImagePlus className="h-5 w-5" aria-hidden="true" />
          )}
          {label}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > 8 * 1024 * 1024) {
            toast.error("Image must be under 8 MB");
            return;
          }
          setLoading(true);
          try {
            const dataBase64 = await fileToBase64(file);
            onChange({ fileName: file.name, contentType: file.type || "image/jpeg", dataBase64 });
          } catch {
            toast.error("Failed to read file");
          } finally {
            setLoading(false);
          }
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main guest page                                                    */
/* ------------------------------------------------------------------ */
function GuestByCodePage() {
  const { code } = Route.useParams();
  const { session: sessionFromUrl } = Route.useSearch();
  const navigate = useNavigate();
  const t = useT();

  const [view, setView] = useState<ViewState>("loading");
  const [session, setSession] = useState<SessionState | null>(null);
  const [context, setContext] = useState<GuestContext | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  // ---- Step 1: Look up property from the code in the URL ----
  const propertyQ = useQuery({
    queryKey: ["guest-property", code],
    queryFn: async (): Promise<GuestProperty | null> => {
      const { data, error } = await supabase.rpc("guest_property_by_code", { _code: code });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as GuestProperty | null;
    },
    retry: false,
  });

  // ---- Step 2: Auto-start session when property is found (skip if we have one from URL) ----
  const sessionQ = useQuery({
    queryKey: ["guest-session", code, propertyQ.data?.id],
    enabled: !!propertyQ.data?.id && !sessionFromUrl,
    queryFn: async (): Promise<SessionState> => {
      const result = await startGuestSession({ data: { propertyId: propertyQ.data!.id, code } });
      return { sessionId: result.sessionId, propertyName: result.propertyName };
    },
    retry: false,
  });

  // ---- Effective session ID (from URL on refresh, or from startGuestSession) ----
  const effectiveSessionId = sessionFromUrl || sessionQ.data?.sessionId || null;

  // Store sessionId in URL so refresh doesn't restart
  useEffect(() => {
    if (sessionQ.data?.sessionId) {
      navigate({ to: "/g/$code", params: { code }, search: { session: sessionQ.data.sessionId }, replace: true });
    }
  }, [sessionQ.data?.sessionId]);

  // ---- Step 3: Fetch context (amenities, catalog, QR, cleaner) ----
  const contextQ = useQuery({
    queryKey: ["guest-context", effectiveSessionId, propertyQ.data?.id],
    enabled: !!effectiveSessionId && !!propertyQ.data,
    queryFn: async (): Promise<GuestContext> => {
      const result = await getGuestContext({ data: { propertyId: propertyQ.data!.id, sessionId: effectiveSessionId! } });
      return result as GuestContext;
    },
    retry: false,
  });

  // ---- Drive the state machine in useEffect (not in render!) ----
  useEffect(() => {
    if (view !== "loading") return;

    if (propertyQ.isError || (propertyQ.data === null && !propertyQ.isLoading)) {
      setView("error");
      setErrorMessage(t("guest.badCode"));
      return;
    }

    if (sessionQ.isError && !sessionFromUrl) {
      const msg = sessionQ.error instanceof Error ? sessionQ.error.message : "";
      if (msg === "bad_code") {
        setView("error");
        setErrorMessage(t("guest.badCode"));
      } else if (msg === "expired") {
        setView("expired");
      } else {
        setView("error");
        // Show what actually failed instead of a dead end the guest cannot act on.
        setErrorMessage(msg || t("common.error"));
      }
      return;
    }

    if (contextQ.isError) {
      const msg = contextQ.error instanceof Error ? contextQ.error.message : "";
      // requireSession() throws either "expired" (session past TTL) or
      // "Invalid stay session" (session id from URL doesn't match). Both mean
      // the guest needs to enter a fresh stay code — route them to the
      // expired view so the restart CTA is offered.
      if (msg === "expired" || msg === "Invalid stay session") {
        setView("expired");
      } else {
        setView("error");
        setErrorMessage(msg || t("common.error"));
      }
      return;
    }

    if (effectiveSessionId && contextQ.data) {
      if (propertyQ.data) rememberSession(propertyQ.data.id, effectiveSessionId);
      setSession({ sessionId: effectiveSessionId, propertyName: contextQ.data.propertyName });
      setContext(contextQ.data);
      setView(hasCheckedIn(effectiveSessionId) ? "menu" : "welcome");
    }
  }, [
    view,
    sessionFromUrl,
    effectiveSessionId,
    propertyQ.data,
    propertyQ.isLoading,
    propertyQ.isError,
    sessionQ.isError,
    sessionQ.error,
    contextQ.data,
    contextQ.isError,
    contextQ.error,
    t,
  ]);

  const property = propertyQ.data;

  // A checkout closes the stay for the owner and hands this device a fresh
  // session. Past sessions stay in the device's history list.
  const checkout = useMutation({
    mutationFn: async () => {
      if (!session || !property) throw new Error("No active stay");
      return checkoutGuestSession({
        data: { propertyId: property.id, sessionId: session.sessionId },
      });
    },
    onSuccess: (result) => {
      if (typeof window !== "undefined" && property) {
        window.localStorage.removeItem(checkInKey(session!.sessionId));
        rememberSession(property.id, result.sessionId);
      }
      toast.success(t("guest.checkoutDone"));
      navigate({
        to: "/g/$code",
        params: { code },
        search: { session: result.sessionId },
        replace: true,
      });
      if (typeof window !== "undefined") window.location.reload();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });


  // ---- The page is loading ----
  if (view === "loading") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
        <header className="text-center">
          <h1 className="font-display text-3xl font-semibold">{t("guest.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("guest.codePrompt")}</p>
        </header>
        <div className="h-40 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  // ---- Error: bad code ----
  if (view === "error") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
        <header className="text-center">
          <h1 className="font-display text-3xl font-semibold">{t("guest.title")}</h1>
        </header>
        <div className="surface flex flex-col items-center gap-4 p-6 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
          <p className="font-medium">{errorMessage}</p>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{code}</span>
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              // A failed extra (QR, cleaner lookup) is usually transient, so
              // offer a plain retry before sending the guest to reception.
              setErrorMessage("");
              setView("loading");
              void propertyQ.refetch();
              void sessionQ.refetch();
              void contextQ.refetch();
            }}
          >
            {t("guest.retry")}
          </Button>
        </div>
      </div>
    );
  }

  // ---- Expired ----
  if (view === "expired") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
        <header className="text-center">
          <h1 className="font-display text-3xl font-semibold">{t("guest.title")}</h1>
        </header>
        <div className="surface flex flex-col items-center gap-4 p-6 text-center">
          <HelpCircle className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">{t("guest.expired")}</p>
          <Button
            type="button"
            onClick={() => {
              // Drop the stale session id from the URL and re-run the flow
              // from step 1 so a fresh session is created.
              navigate({
                to: "/g/$code",
                params: { code },
                search: {},
                replace: true,
              });
              if (typeof window !== "undefined") window.location.reload();
            }}
          >
            {t("guest.enter")}
          </Button>
        </div>
      </div>
    );
  }

  // ---- Thanks (different messages per action) ----
  if (view === "thanksCondition") {
    return (
      <ThanksView
        propertyName={property?.name ?? ""}
        message={t("guest.conditionThanks")}
        onBack={() => setView("menu")}
      />
    );
  }
  if (view === "thanksRequest") {
    return (
      <ThanksView
        propertyName={property?.name ?? ""}
        message={t("guest.requestThanks")}
        onBack={() => setView("menu")}
      />
    );
  }
  if (view === "thanksShop") {
    return (
      <ThanksView
        propertyName={property?.name ?? ""}
        message={t("guest.orderThanks")}
        onBack={() => setView("menu")}
      />
    );
  }
  if (view === "thanksRate") {
    return (
      <ThanksView
        propertyName={property?.name ?? ""}
        message={t("guest.rateThanks")}
        onBack={() => setView("menu")}
      />
    );
  }

  // ---- Main flow: menu or sub-views ----
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-10">
      {view !== "menu" && view !== "welcome" && (
        <button
          type="button"
          onClick={() => setView("menu")}
          className="mb-4 inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("common.back")}
        </button>
      )}

      {view === "welcome" && session && property && (
        <WelcomeChecklist
          propertyId={property.id}
          sessionId={session.sessionId}
          propertyName={property.name}
          onDone={() => {
            if (typeof window !== "undefined") {
              window.localStorage.setItem(checkInKey(session.sessionId), "1");
            }
            setView("menu");
          }}
        />
      )}

      {view === "history" && session && property && (
        <HistoryView propertyId={property.id} sessionId={session.sessionId} />
      )}

      {view === "menu" && (
        <MenuView
          propertyName={property?.name ?? ""}
          propertyAddress={property?.address ?? property?.place_name ?? null}
          cleaner={context?.cleaner ?? null}
          onCondition={() => setView("condition")}
          onRequest={() => setView("request")}
          onShop={() => setView("shop")}
          onHistory={() => setView("history")}
          onCheckout={() => checkout.mutate()}
          checkingOut={checkout.isPending}
        />
      )}

      {view === "condition" && session && property && (
        <ConditionView
          propertyId={property.id}
          sessionId={session.sessionId}
          amenities={context?.amenities ?? []}
          cleaner={context?.cleaner ?? null}
          onSubmitted={(ratedCleaner) => {
            if (ratedCleaner) {
              setView("rate");
            } else {
              setView("thanksCondition");
            }
          }}
        />
      )}

      {view === "request" && session && property && (
        <RequestView
          propertyId={property.id}
          sessionId={session.sessionId}
          onSubmitted={() => setView("thanksRequest")}
        />
      )}

      {view === "shop" && session && property && (
        <ShopView
          propertyId={property.id}
          sessionId={session.sessionId}
          catalog={context?.catalog ?? []}
          qrUrl={context?.qrUrl ?? null}
          qrLabel={context?.qrLabel ?? null}
          onSubmitted={() => setView("thanksShop")}
        />
      )}

      {view === "rate" && session && property && context?.cleaner && (
        <RateCleanerView
          propertyId={property.id}
          sessionId={session.sessionId}
          cleaner={context.cleaner}
          onSubmitted={() => setView("thanksRate")}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Menu view — 3 choice cards + optional cleaner rate                 */
/* ------------------------------------------------------------------ */
/*  Welcome checklist — one question at a time before the main menu     */
/* ------------------------------------------------------------------ */
type CheckInDraft = {
  guestName: string;
  partySize: string;
  checkInAt: string;
  contactNumber: string;
};

/** `datetime-local` wants local `YYYY-MM-DDTHH:mm`, not a UTC ISO string. */
function localNow() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function WelcomeChecklist({
  propertyId,
  sessionId,
  propertyName,
  onDone,
}: {
  propertyId: string;
  sessionId: string;
  propertyName: string;
  onDone: () => void;
}) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [confirmClose, setConfirmClose] = useState(false);
  const [draft, setDraft] = useState<CheckInDraft>({
    guestName: "",
    partySize: "1",
    checkInAt: "",
    contactNumber: "",
  });

  const steps = [
    {
      key: "guestName" as const,
      icon: Star,
      title: t("guest.checkin.nameTitle"),
      hint: t("guest.checkin.nameHint"),
      valid: draft.guestName.trim().length > 0,
    },
    {
      key: "partySize" as const,
      icon: Users,
      title: t("guest.checkin.partyTitle"),
      hint: t("guest.checkin.partyHint"),
      valid: Number(draft.partySize) >= 1,
    },
    {
      key: "checkInAt" as const,
      icon: CalendarClock,
      title: t("guest.checkin.whenTitle"),
      hint: t("guest.checkin.whenHint"),
      valid: draft.checkInAt.trim().length > 0,
    },
    {
      key: "contactNumber" as const,
      icon: Phone,
      title: t("guest.checkin.phoneTitle"),
      hint: t("guest.checkin.phoneHint"),
      valid: draft.contactNumber.trim().length >= 3,
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  const save = useMutation({
    mutationFn: async () =>
      saveGuestCheckIn({
        data: {
          propertyId,
          sessionId,
          guestName: draft.guestName.trim(),
          partySize: Number(draft.partySize),
          checkInAt: draft.checkInAt,
          contactNumber: draft.contactNumber.trim(),
        },
      }),
    onSuccess: () => {
      toast.success(t("guest.checkin.saved"));
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const advance = () => (isLast ? save.mutate() : setStep((value) => value + 1));

  return (
    <div className="relative flex min-h-[70vh] flex-col justify-center">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={t("common.close")}
        className="absolute right-0 top-0 h-8 w-8"
        onClick={() => setConfirmClose(true)}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>

      <header className="mb-8 text-center">
        <h1 className="text-2xl font-semibold">{propertyName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("guest.checkin.intro")}</p>
      </header>

      <div className="mb-6 flex justify-center gap-2" aria-hidden="true">
        {steps.map((entry, index) => (
          <span
            key={entry.key}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              index === step ? "w-8 bg-primary" : index < step ? "w-6 bg-primary" : "w-6 bg-muted",
            )}
          />
        ))}
      </div>

      {/* Remounting on the step key replays the entrance animation per question. */}
      <div
        key={current.key}
        className="animate-fade-in space-y-4 rounded-xl border border-border bg-card p-5"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <current.icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-medium">{current.title}</p>
            <p className="text-sm text-muted-foreground">{current.hint}</p>
          </div>
        </div>

        {current.key === "checkInAt" ? (
          <div className="flex gap-2">
            <Input
              type="datetime-local"
              value={draft.checkInAt}
              onChange={(e) => setDraft((d) => ({ ...d, checkInAt: e.target.value }))}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setDraft((d) => ({ ...d, checkInAt: localNow() }))}
            >
              {t("guest.checkin.now")}
            </Button>
          </div>
        ) : (
          <Input
            autoFocus
            type={current.key === "partySize" ? "number" : current.key === "contactNumber" ? "tel" : "text"}
            min={current.key === "partySize" ? 1 : undefined}
            value={draft[current.key]}
            onChange={(e) => setDraft((d) => ({ ...d, [current.key]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !current.valid) return;
              e.preventDefault();
              advance();
            }}
          />
        )}

        <div className="flex gap-2">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setStep((value) => value - 1)}
            >
              {t("common.back")}
            </Button>
          )}
          <Button
            type="button"
            className="flex-1"
            disabled={!current.valid || save.isPending}
            onClick={advance}
          >
            {isLast ? (save.isPending ? t("common.loading") : t("common.submit")) : t("guest.checkin.next")}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("guest.checkin.closeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("guest.checkin.closeBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onDone}>{t("guest.checkin.closeConfirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  History — everything this stay has submitted                        */
/* ------------------------------------------------------------------ */
function HistoryView({ propertyId, sessionId }: { propertyId: string; sessionId: string }) {
  const t = useT();
  const historyQ = useQuery({
    queryKey: ["guest-history", propertyId, sessionId],
    queryFn: async () =>
      getGuestActivity({ data: { propertyId, sessionId, sessionIds: readSessions(propertyId) } }),
  });

  const label: Record<string, string> = {
    review: t("guest.condition"),
    request: t("guest.request"),
    order: t("guest.buy"),
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{t("guest.history")}</h2>

      {historyQ.isLoading ? (
        <div className="h-24 animate-pulse rounded-md bg-muted" />
      ) : (historyQ.data?.entries.length ?? 0) === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("guest.historyEmpty")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {historyQ.data!.entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 p-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  {label[entry.kind]} · {entry.title}
                </span>
                {entry.detail && (
                  <span className="block truncate text-sm text-muted-foreground">{entry.detail}</span>
                )}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(entry.at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function MenuView({
  propertyName,
  propertyAddress,
  cleaner,
  onCondition,
  onRequest,
  onShop,
  onHistory,
  onCheckout,
  checkingOut,
}: {
  propertyName: string;
  propertyAddress: string | null;
  cleaner: { jobId: string; userId: string; name: string } | null;
  onCondition: () => void;
  onRequest: () => void;
  onShop: () => void;
  onHistory: () => void;
  onCheckout: () => void;
  checkingOut: boolean;
}) {
  const t = useT();
  const [confirmCheckout, setConfirmCheckout] = useState(false);

  const cards = [
    {
      icon: Star,
      title: t("guest.condition"),
      desc: t("guest.conditionDesc"),
      action: onCondition,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      icon: MessageSquare,
      title: t("guest.request"),
      desc: t("guest.requestDesc"),
      action: onRequest,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      icon: ShoppingCart,
      title: t("guest.buy"),
      desc: t("guest.buyDesc"),
      action: onShop,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="font-display text-2xl font-semibold">{propertyName}</h1>
        {propertyAddress && (
          <p className="mt-1 text-sm text-muted-foreground">{propertyAddress}</p>
        )}
        <p className="mt-4 text-base text-muted-foreground">{t("guest.pick")}</p>
      </header>

      <div className="space-y-3">
        {cards.map((card) => (
          <button
            key={card.title}
            type="button"
            onClick={card.action}
            className="surface flex w-full items-start gap-4 rounded-xl border border-border p-4 text-left transition-all hover:border-primary/50 hover:shadow-sm"
          >
            <span
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                card.bg,
              )}
            >
              <card.icon className={cn("h-6 w-6", card.color)} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{card.title}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{card.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Thanks / success view                                              */
/* ------------------------------------------------------------------ */
function ThanksView({
  propertyName,
  message,
  onBack,
}: {
  propertyName: string;
  message: string;
  onBack: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-10 text-center">
      <CheckCircle2 className="h-12 w-12 text-emerald-500" aria-hidden="true" />
      <div>
        <h2 className="text-xl font-semibold">{propertyName}</h2>
        <p className="mt-2 text-muted-foreground">{message}</p>
      </div>
      <Button onClick={onBack} variant="outline">
        {t("common.back")}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Condition sub-view — rating + amenity counts + photos             */
/* ------------------------------------------------------------------ */
function ConditionView({
  propertyId,
  sessionId,
  amenities,
  cleaner,
  onSubmitted,
}: {
  propertyId: string;
  sessionId: string;
  amenities: AmenityItem[];
  cleaner: { jobId: string; userId: string; name: string } | null;
  onSubmitted: (ratedCleaner: boolean) => void;
}) {
  const t = useT();
  const [rating, setRating] = useState<number | null>(null);
  // Notes and complaints go to different columns: only the complaint box (and
  // a rating under the property's star threshold) reaches the complaints board.
  const [mode, setMode] = useState<"notes" | "complaint">("notes");
  const [notes, setNotes] = useState("");
  const [complaint, setComplaint] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);

  const submit = useMutation({
    mutationFn: async () => {
      await submitRoomCondition({
        data: {
          propertyId,
          sessionId,
          rating,
          notes: notes.trim() || undefined,
          complaint: complaint.trim() || undefined,
          counts: Object.entries(counts)
            .filter(([, qty]) => qty > 0)
            .map(([amenityId, actualQty]) => ({ amenityId, actualQty })),
          photos: photos.length > 0 ? photos : undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("guest.conditionThanks"));
      onSubmitted(!!cleaner);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">{t("guest.condition")}</h2>
      </header>

      <StarRating value={rating} onChange={setRating} label={t("guest.rating")} />

      {amenities.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("guest.actualQty")}</p>
          {amenities.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5"
            >
              <span className="text-sm font-medium">{item.name}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                  onClick={() =>
                    setCounts((prev) => ({
                      ...prev,
                      [item.id]: Math.max(0, (prev[item.id] ?? 0) - 1),
                    }))
                  }
                >
                  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <span className="w-8 text-center text-sm font-medium tabular-nums">
                  {counts[item.id] ?? 0}
                </span>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                  onClick={() =>
                    setCounts((prev) => ({
                      ...prev,
                      [item.id]: Math.min(9999, (prev[item.id] ?? 0) + 1),
                    }))
                  }
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1">
          {(["notes", "complaint"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => setMode(option)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                mode === option
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {option === "notes" ? t("common.notes") : t("guest.complaint")}
            </button>
          ))}
        </div>
        <Textarea
          rows={3}
          placeholder={mode === "notes" ? t("guest.notesPlaceholder") : t("guest.complaintPlaceholder")}
          value={mode === "notes" ? notes : complaint}
          onChange={(e) => (mode === "notes" ? setNotes(e.target.value) : setComplaint(e.target.value))}
        />
      </div>

      <PhotoUpload
        value={photos[0] ?? null}
        onChange={(p) => setPhotos(p ? [p] : [])}
        label={t("guest.hygienePhoto")}
      />

      <Button
        className="w-full"
        disabled={submit.isPending}
        onClick={() => submit.mutate()}
      >
        {submit.isPending ? t("common.loading") : t("common.submit")}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Special request sub-view                                           */
/* ------------------------------------------------------------------ */
function RequestView({
  propertyId,
  sessionId,
  onSubmitted,
}: {
  propertyId: string;
  sessionId: string;
  onSubmitted: () => void;
}) {
  const t = useT();
  const [description, setDescription] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      if (description.trim().length < 3) throw new Error("Description too short");
      await createSpecialRequest({ data: { propertyId, sessionId, description: description.trim() } });
    },
    onSuccess: () => {
      toast.success(t("guest.requestThanks"));
      onSubmitted();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">{t("guest.request")}</h2>
      </header>

      <Textarea
        rows={4}
        placeholder={t("guest.requestPlaceholder")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <Button
        className="w-full"
        disabled={description.trim().length < 3 || submit.isPending}
        onClick={() => submit.mutate()}
      >
        {submit.isPending ? t("common.loading") : t("common.submit")}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shop sub-view — catalog + QR + payment proof                       */
/* ------------------------------------------------------------------ */
function ShopView({
  propertyId,
  sessionId,
  catalog,
  qrUrl,
  qrLabel,
  onSubmitted,
}: {
  propertyId: string;
  sessionId: string;
  catalog: CatalogItem[];
  qrUrl: string | null;
  qrLabel: string | null;
  onSubmitted: () => void;
}) {
  const t = useT();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [amountPaid, setAmountPaid] = useState("");
  const [proof, setProof] = useState<PhotoDraft | null>(null);

  const lines = Object.entries(quantities)
    .filter(([, qty]) => qty > 0)
    .map(([itemId, qty]) => ({ itemId, quantity: qty }));

  const total = lines.reduce((sum, line) => {
    const item = catalog.find((c) => c.id === line.itemId);
    return sum + (item?.price ?? 0) * line.quantity;
  }, 0);

  const submit = useMutation({
    mutationFn: async () => {
      if (lines.length === 0) throw new Error("Order is empty");
      if (!proof) throw new Error("Payment proof photo is required");
      await createShoppingOrder({
        data: {
          propertyId,
          sessionId,
          lines,
          amountEntered: Number(amountPaid) || 0,
          proof,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("guest.orderThanks"));
      onSubmitted();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">{t("guest.buy")}</h2>
      </header>

      {/* Catalog */}
      <div className="space-y-3">
        {catalog.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5"
          >
            {item.photoUrl && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <img
                src={item.photoUrl}
                alt={item.name}
                className="mr-3 h-14 w-14 shrink-0 rounded-md object-cover"
                loading="lazy"
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{item.name}</span>
              {item.description && (
                <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
              )}
              <span className="block text-xs font-medium text-emerald-600 dark:text-emerald-400">{formatPrice(item.price)}</span>
            </span>
            <div className="flex shrink-0 items-center gap-2 pl-3">
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                onClick={() =>
                  setQuantities((prev) => ({
                    ...prev,
                    [item.id]: Math.max(0, (prev[item.id] ?? 0) - 1),
                  }))
                }
              >
                <Minus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <span className="w-8 text-center text-sm font-medium tabular-nums">
                {quantities[item.id] ?? 0}
              </span>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                onClick={() =>
                  setQuantities((prev) => ({
                    ...prev,
                    [item.id]: Math.min(99, (prev[item.id] ?? 0) + 1),
                  }))
                }
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
        {catalog.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("common.none")}</p>
        )}
      </div>

      {/* Total */}
      {lines.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
          <span className="text-sm font-medium">{t("guest.cart")}</span>
          <span className="font-display text-lg font-semibold">{formatPrice(total)}</span>
        </div>
      )}

      {/* QR code */}
      {qrUrl ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("guest.payTitle")}</p>
          {qrLabel && <p className="text-xs text-muted-foreground">{qrLabel}</p>}
          <img
            src={qrUrl}
            alt={qrLabel ?? "QR"}
            className="mx-auto h-48 w-48 rounded-lg border border-border object-contain"
          />
          <p className="text-xs text-muted-foreground">{t("guest.payHelp")}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          {t("guest.noQr")}
        </div>
      )}

      {/* Amount paid */}
      <div className="space-y-2">
        <Label htmlFor="amount">{t("guest.amountPaid")}</Label>
        <Input
          id="amount"
          type="number"
          min={0}
          step="0.01"
          value={amountPaid}
          onChange={(e) => setAmountPaid(e.target.value)}
        />
      </div>

      {/* Payment proof photo */}
      <PhotoUpload
        value={proof}
        onChange={setProof}
        label={t("guest.uploadProof")}
      />

      <Button
        className="w-full"
        disabled={lines.length === 0 || !proof || submit.isPending}
        onClick={() => submit.mutate()}
      >
        {submit.isPending ? t("common.loading") : t("common.submit")}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Rate cleaner sub-view                                              */
/* ------------------------------------------------------------------ */
function RateCleanerView({
  propertyId,
  sessionId,
  cleaner,
  onSubmitted,
}: {
  propertyId: string;
  sessionId: string;
  cleaner: { jobId: string; userId: string; name: string };
  onSubmitted: () => void;
}) {
  const t = useT();
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      if (!rating) throw new Error("Please select a rating");
      await rateCleaner({
        data: {
          propertyId,
          sessionId,
          cleanerUserId: cleaner.userId,
          jobId: cleaner.jobId,
          rating,
          comment: comment.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("guest.rateThanks"));
      onSubmitted();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Sparkle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <div>
          <h2 className="text-xl font-semibold">{t("guest.rateCleaner")}</h2>
          <p className="text-sm text-muted-foreground">{cleaner.name}</p>
        </div>
      </header>

      <StarRating value={rating} onChange={setRating} />

      <Textarea
        rows={3}
        placeholder={t("common.notes")}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />

      <Button
        className="w-full"
        disabled={!rating || submit.isPending}
        onClick={() => submit.mutate()}
      >
        {submit.isPending ? t("common.loading") : t("common.submit")}
      </Button>
    </div>
  );
}
