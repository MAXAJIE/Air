/**
 * Geocoding internals, kept out of `geo.functions.ts` so the server-function
 * splitter cannot strip helpers the handlers call at runtime.
 */
import type { GeoResult } from "@/lib/geo.types";

export const GATEWAY = "https://connector-gateway.lovable.dev/mapbox";

export async function mapboxSearch(query: string, near?: { lat: number; lng: number }): Promise<GeoResult[] | null> {
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
export async function osmSearch(query: string): Promise<GeoResult[]> {
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
