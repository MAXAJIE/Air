import { z } from "zod";

/**
 * Shared, environment-neutral pieces of the photo server functions.
 *
 * They live outside `photos.functions.ts` on purpose: the server-function
 * splitter rewrites that module and drops module-scope siblings, so anything a
 * handler needs at runtime must be imported.
 */
export const uploadPhotoInput = z.object({
  folder: z.string().min(1).max(40).regex(/^[a-z-]+$/),
  fileName: z.string().min(1).max(120),
  contentType: z.string().min(3).max(80),
  dataBase64: z.string().min(10).max(12_000_000),
});

export const signPhotosInput = z.object({ paths: z.array(z.string().min(1)).max(60) });

/** base64 → bytes, without Node Buffer (the server runs on a Worker runtime). */
export function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function fileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
}
