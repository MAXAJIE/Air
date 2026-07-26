import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uploadInput = z.object({
  folder: z.string().min(1).max(40).regex(/^[a-z-]+$/),
  fileName: z.string().min(1).max(120),
  contentType: z.string().min(3).max(80),
  dataBase64: z.string().min(10).max(12_000_000),
});

function decode(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Authenticated photo upload (checklist items, amenity counts, payment QR). */
export const uploadPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => uploadInput.parse(input))
  .handler(async ({ data, context }) => {
    const ext = data.fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${data.folder}/${context.userId}/${crypto.randomUUID()}.${ext}`;
    // Uploads run as the signed-in user (storage RLS restricts them to their own
    // folder), so no service-role key is needed for this flow.
    const { error } = await context.supabase.storage
      .from("photos")
      .upload(path, decode(data.dataBase64), { contentType: data.contentType, upsert: false });
    if (error) throw new Error(error.message);
    return { path };
  });

/** Signed read URLs for stored photos. Callers must be signed in. */
export const signPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ paths: z.array(z.string().min(1)).max(60) }).parse(input))
  .handler(async ({ data, context }) => {
    if (data.paths.length === 0) return { urls: {} as Record<string, string> };
    const { data: signed, error } = await context.supabase.storage
      .from("photos")
      .createSignedUrls(data.paths, 60 * 60);
    if (error) throw new Error(error.message);
    const urls: Record<string, string> = {};
    for (const row of signed ?? []) {
      if (row.path && row.signedUrl) urls[row.path] = row.signedUrl;
    }
    return { urls };
  });
