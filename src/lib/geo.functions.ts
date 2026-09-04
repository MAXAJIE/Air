import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GATEWAY, mapboxSearch, osmSearch } from "@/lib/geo-internal";
import type { GeoResult } from "@/lib/geo.types";

export type { GeoResult };


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
  .handler(async (): Promise<{ result: GeoResult | null }> => {
    const request = getRequest();
    const clientIp =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;

    // Cloudflare already geolocates the request, so use that before any
    // third-party lookup — it never rate-limits and never blocks us.
    const fromEdge = edgeLocation(request.headers);
    if (fromEdge) return { result: fromEdge };

    // Free IP providers rate-limit and go down; try them in turn.
    const endpoints = clientIp
      ? [`https://ipapi.co/${clientIp}/json/`, `https://ipwho.is/${clientIp}`, `https://get.geojs.io/v1/ip/geo/${clientIp}.json`]
      : ["https://ipapi.co/json/", "https://ipwho.is/", "https://get.geojs.io/v1/ip/geo.json"];

    for (const url of endpoints) {
      const result = await lookupIp(url);
      if (result) return { result };
    }
    return { result: null };
  });

/** Cloudflare puts an approximate fix on every request it forwards. */
function edgeLocation(headers: Headers): GeoResult | null {
  const lat = Number(headers.get("cf-iplatitude"));
  const lng = Number(headers.get("cf-iplongitude"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  const parts = [headers.get("cf-ipcity"), headers.get("cf-region"), headers.get("cf-ipcountry")].filter(
    Boolean,
  ) as string[];
  return {
    id: "edge",
    label: headers.get("cf-ipcity") || "Approximate location",
    address: parts.join(", "),
    lat,
    lng,
  };
}

/** Normalises the three provider shapes into one GeoResult. */
async function lookupIp(url: string): Promise<GeoResult | null> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": "keyward-app/1.0 (ip locate)" } });
    if (!response.ok) return null;
    const json = (await response.json()) as Record<string, unknown>;
    if (json.error || json.success === false) return null;
    const lat = Number(json.latitude ?? json.lat);
    const lng = Number(json.longitude ?? json.lon ?? json.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const city = (json.city as string) || "";
    const region = (json.region as string) || "";
    const country = (json.country_name as string) || (json.country as string) || "";
    const parts = [city, region, country].filter(Boolean);
    return {
      id: "ip",
      label: city || "Approximate location",
      address: parts.join(", "),
      lat,
      lng,
    };
  } catch (error) {
    console.error(`IP location lookup failed for ${url}`, error);
    return null;
  }
}
