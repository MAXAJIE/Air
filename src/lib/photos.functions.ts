import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  decodeBase64,
  fileExtension,
  signPhotosInput,
  uploadPhotoInput,
} from "@/lib/photos-shared";

/** Authenticated photo upload (checklist items, amenity counts, payment QR). */
export const uploadPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => uploadPhotoInput.parse(input))
  .handler(async ({ data, context }) => {
    const path = `${data.folder}/${context.userId}/${crypto.randomUUID()}.${fileExtension(data.fileName)}`;
    // Uploads run as the signed-in user (storage RLS restricts them to their own
    // folder), so no service-role key is needed for this flow.
    const { error } = await context.supabase.storage
      .from("photos")
      .upload(path, decodeBase64(data.dataBase64), {
        contentType: data.contentType,
        upsert: false,
      });
    if (error) throw new Error(error.message);
    return { path };
  });

/** Signed read URLs for stored photos. Callers must be signed in. */
export const signPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => signPhotosInput.parse(input))
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
