import { z } from "zod";

/**
 * Guest-flow internals. They live outside `guest.functions.ts` because the
 * server-function splitter removes module-scope siblings from that file, which
 * would leave the handlers referencing missing helpers at runtime.
 */
export const uuid = z.string().uuid();

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function requireSession(sessionId: string, propertyId: string) {
  const db = await admin();
  const { data, error } = await db
    .from("customer_sessions")
    .select("id, property_id, expires_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.property_id !== propertyId) throw new Error("Invalid stay session");
  if (new Date(data.expires_at).getTime() < Date.now()) throw new Error("expired");
  return data;
}

export function decode(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function uploadGuestPhoto(propertyId: string, fileName: string, contentType: string, dataBase64: string) {
  const db = await admin();
  const ext = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `guest/${propertyId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage
    .from("photos")
    .upload(path, decode(dataBase64), { contentType, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
