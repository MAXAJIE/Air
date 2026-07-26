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
async function getBrowserPosition(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: { lat: number; lng: number } | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    // Some embedded frames never call either callback, so cap the wait ourselves.
    const timer = setTimeout(() => done(null), 12000);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        done({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        done(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
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
    mutationFn: async (): Promise<{ result: GeoResult; approximate: boolean }> => {
      const position = await getBrowserPosition();

      // GPS blocked (denied, embedded frame, no hardware): fall back to a coarse IP fix.
      if (!position) {
        const fallback = await approximateLocation();
        if (!fallback.result) {
          throw new Error(
            "Location is turned off for this site. Allow location access in your browser, or type the address instead.",
          );
        }
        return { result: fallback.result, approximate: true };
      }

      const response = await reverseGeocode({
        data: { lat: position.lat, lng: position.lng },
      });
      return {
        result:
          response.result ?? {
            id: "pin",
            label: "Pinned location",
            address: `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`,
            lat: position.lat,
            lng: position.lng,
          },
        approximate: false,
      };
    },
    onSuccess: ({ result, approximate }) => {
      pick(result);
      if (approximate) toast.info("Approximate location used — check the address before saving.");
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
