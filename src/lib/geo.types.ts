/** Shared shape for address lookups (safe to import from client code). */
export type GeoResult = {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
};
