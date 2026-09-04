import { useMutation } from "@tanstack/react-query";
import { Crosshair, Loader2, MapPin, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  approximateLocation,
  reverseGeocode,
  searchAddress,
  type GeoResult,
} from "@/lib/geo.functions";

export type PlaceValue = {
  address: string;
  placeName: string | null;
  lat: number | null;
  lng: number | null;
};

/** Reads GPS without ever throwing — returns null whenever the browser blocks it. */

type Coords = { lat: number; lng: number };

/** A failed attempt keeps its error code so the message can be specific. */
type Attempt = { coords: Coords | null; code: number | null };

function requestPosition(options: PositionOptions): Promise<Attempt> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: Attempt) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    // Some embedded frames never call either callback, so cap the wait ourselves.
    const timer = setTimeout(() => done({ coords: null, code: null }), (options.timeout ?? 10000) + 2000);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        done({ coords: { lat: position.coords.latitude, lng: position.coords.longitude }, code: null });
      },
      (error) => {
        clearTimeout(timer);
        done({ coords: null, code: error.code });
      },
      options,
    );
  });
}

/**
 * A cross-origin iframe (the editor preview, an embedded dashboard) only gets
 * GPS when the parent frame grants it. Granting the browser permission does
 * nothing there, which is exactly the "I allowed it and it still fails" case.
 */
function isEmbedded() {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Ask the browser for a fix, then ask again without high accuracy.
 *
 * The permission prompt is often answered *after* the first call already
 * failed, and the cached error made every later click look like it aborted
 * instantly. The retry uses `maximumAge: 0` so a freshly granted permission is
 * actually used instead of the stale denial.
 */
async function getBrowserPosition(): Promise<Attempt> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { coords: null, code: null };
  }
  // A "denied" permission state is final: calling getCurrentPosition then only
  // burns a timeout, so go straight to the coarse fallback.
  if (await permissionDenied()) return { coords: null, code: 1 };

  const first = await requestPosition({
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 60000,
  });
  if (first.coords) return first;
  return requestPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 0 });
}

async function permissionDenied(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    return status?.state === "denied";
  } catch {
    return false;
  }
}

/** Why GPS failed, phrased as something the user can actually act on. */
function blockedMessage(code: number | null): string {
  if (isEmbedded()) {
    return "This page is embedded, so the browser will not share GPS here. Open it in its own tab, or type the address instead.";
  }
  if (code === 1) {
    return "Location permission is blocked for this site. Allow it in the address-bar site settings, then try again.";
  }
  if (code === 2) {
    return "Your device could not get a fix. Turn on device location services, or type the address instead.";
  }
  if (code === 3) {
    return "Getting a location took too long. Try again outdoors, or type the address instead.";
  }
  return "Location is unavailable on this device. Type the address instead.";
}

/** Address entry that always resolves to real coordinates — typo-proof by design. */
export function AddressPicker({
  value,
  onChange,
  label,
}: {
  value: PlaceValue;
  onChange: (value: PlaceValue) => void;
  label: string;
}) {
  const [query, setQuery] = useState(value.address ?? "");
  const [results, setResults] = useState<GeoResult[]>([]);

  const search = useMutation({
    mutationFn: async () => {
      const response = await searchAddress({ data: { query: query.trim() } });
      return response.results;
    },
    onSuccess: (rows) => {
      setResults(rows);
      if (rows.length === 0) toast.info("No matching address found");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Address lookup failed"),
  });

  const locate = useMutation({
    mutationFn: async (): Promise<{ result: GeoResult; approximate: boolean; reason?: string }> => {
      const attempt = await getBrowserPosition();
      const position = attempt.coords;

      // GPS blocked (denied, embedded frame, no hardware): fall back to a coarse IP fix.
      if (!position) {
        const fallback = await approximateLocation().catch(() => ({ result: null }));
        if (!fallback.result) throw new Error(blockedMessage(attempt.code));
        return { result: fallback.result, approximate: true, reason: blockedMessage(attempt.code) };
      }

      // Coordinates are already good enough to save; a failing reverse lookup
      // must never throw away a successful GPS read.
      const coordsOnly: GeoResult = {
        id: "pin",
        label: "Pinned location",
        address: `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`,
        lat: position.lat,
        lng: position.lng,
      };
      const response = await reverseGeocode({
        data: { lat: position.lat, lng: position.lng },
      }).catch(() => ({ result: null }));
      return { result: response.result ?? coordsOnly, approximate: false };
    },
    onSuccess: ({ result, approximate, reason }) => {
      pick(result);
      if (approximate) {
        toast.info(
          `Approximate location used — check the address before saving.${reason ? ` (${reason})` : ""}`,
        );
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not read your location"),
  });

  const pick = (result: GeoResult) => {
    setQuery(result.address);
    setResults([]);
    onChange({ address: result.address, placeName: result.label, lat: result.lat, lng: result.lng });
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="address-search">{label}</Label>
      <div className="flex gap-2">
        <Input
          id="address-search"
          value={query}
          placeholder="Search a street, building or landmark"
          onChange={(e) => {
            setQuery(e.target.value);
            onChange({ ...value, address: e.target.value });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (query.trim().length >= 3) search.mutate();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Search address"
          disabled={query.trim().length < 3 || search.isPending}
          onClick={() => search.mutate()}
        >
          {search.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Use my current location"
          disabled={locate.isPending}
          onClick={() => locate.mutate()}
        >
          {locate.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Crosshair className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>

      {results.length > 0 && (
        <ul className="max-h-52 overflow-auto rounded-md border border-border bg-popover text-sm shadow-[var(--shadow-lift)]">
          {results.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                onClick={() => pick(result)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{result.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{result.address}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {value.lat !== null && value.lng !== null && (
        <p className="text-xs text-muted-foreground">
          GPS locked: {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </p>
      )}
    </div>
  );
}
