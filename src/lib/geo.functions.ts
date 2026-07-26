import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GeoResult = {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
};

const GATEWAY = "https://connector-gateway.lovable.dev/mapbox";

async function mapboxSearch(query: string, near?: { lat: number; lng: number }): Promise<GeoResult[] | null> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const mapboxKey = process.env.MAPBOX_API_KEY;
  if (!lovableKey || !mapboxKey) return null;

  const proximity = near ? `&proximity=${near.lng},${near.lat}` : "";
  const url = `${GATEWAY}/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=6&types=address,poi,place${proximity}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": mapboxKey },
  });
  if (!response.ok) {
    const body = await response.text();
    console.error(`Mapbox geocoding failed [${response.status}]: ${body}`);
    return null;
  }
  const json = (await response.json()) as {
    features?: Array<{ id: string; text?: string; place_name?: string; center?: [number, number] }>;
  };
  return (json.features ?? [])
    .filter((f) => Array.isArray(f.center))
    .map((f) => ({
      id: f.id,
      label: f.text ?? f.place_name ?? query,
      address: f.place_name ?? f.text ?? query,
      lng: f.center![0],
      lat: f.center![1],
    }));
}

/** Free fallback so address search always works, even without a Mapbox connection. */
async function osmSearch(query: string): Promise<GeoResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { "User-Agent": "keyward-app/1.0 (address autocomplete)" } });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Address lookup failed [${response.status}]: ${body}`);
  }
  const json = (await response.json()) as Array<{
    place_id: number;
    name?: string;
    display_name: string;
    lat: string;
    lon: string;
  }>;
  return json.map((row) => ({
    id: String(row.place_id),
    label: row.name || row.display_name.split(",")[0],
    address: row.display_name,
    lat: Number(row.lat),
    lng: Number(row.lon),
  }));
}

export const searchAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        query: z.string().trim().min(3).max(160),
        near: z.object({ lat: z.number(), lng: z.number() }).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ results: GeoResult[] }> => {
    const viaMapbox = await mapboxSearch(data.query, data.near ?? undefined);
    if (viaMapbox && viaMapbox.length > 0) return { results: viaMapbox };
    return { results: await osmSearch(data.query) };
  });

export const reverseGeocode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ result: GeoResult | null }> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const mapboxKey = process.env.MAPBOX_API_KEY;
    if (lovableKey && mapboxKey) {
      const url = `${GATEWAY}/geocoding/v5/mapbox.places/${data.lng},${data.lat}.json?limit=1`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": mapboxKey },
      });
      if (response.ok) {
        const json = (await response.json()) as {
          features?: Array<{ id: string; text?: string; place_name?: string }>;
        };
        const first = json.features?.[0];
        if (first) {
          return {
            result: {
              id: first.id,
              label: first.text ?? "Pinned location",
              address: first.place_name ?? "",
              lat: data.lat,
              lng: data.lng,
            },
          };
        }
      } else {
        console.error(`Mapbox reverse geocoding failed [${response.status}]: ${await response.text()}`);
      }
    }

    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${data.lat}&lon=${data.lng}`;
    const response = await fetch(url, { headers: { "User-Agent": "keyward-app/1.0 (reverse geocode)" } });
    if (!response.ok) return { result: null };
    const json = (await response.json()) as { place_id?: number; name?: string; display_name?: string };
    if (!json.display_name) return { result: null };
    return {
      result: {
        id: String(json.place_id ?? "pin"),
        label: json.name || json.display_name.split(",")[0],
        address: json.display_name,
        lat: data.lat,
        lng: data.lng,
      },
    };
  });

/**
 * Coarse, IP-based location used when the browser refuses GPS (denied permission,
 * blocked in an embedded frame, or no GPS hardware). Keeps "use my location" usable.
 */
export const approximateLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
  async (): Promise<{ result: GeoResult | null }> => {
    const request = getRequest();
    const clientIp =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;

    const url = clientIp ? `https://ipapi.co/${clientIp}/json/` : "https://ipapi.co/json/";
    try {
      const response = await fetch(url, { headers: { "User-Agent": "keyward-app/1.0 (ip locate)" } });
      if (!response.ok) return { result: null };
      const json = (await response.json()) as {
        latitude?: number;
        longitude?: number;
        city?: string;
        region?: string;
        country_name?: string;
        error?: boolean;
      };
      if (json.error || typeof json.latitude !== "number" || typeof json.longitude !== "number") {
        return { result: null };
      }
      const parts = [json.city, json.region, json.country_name].filter(Boolean) as string[];
      return {
        result: {
          id: "ip",
          label: json.city || "Approximate location",
          address: parts.join(", "),
          lat: json.latitude,
          lng: json.longitude,
        },
      };
    } catch (error) {
      console.error("IP location lookup failed", error);
      return { result: null };
    }
  });
