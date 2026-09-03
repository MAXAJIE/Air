import { useMutation } from "@tanstack/react-query";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ImageCropDialog } from "@/components/image-crop-dialog";
import { SignedPhoto } from "@/components/signed-photo";
import { Button } from "@/components/ui/button";
import { fileToBase64 } from "@/lib/files";
import { uploadPhoto } from "@/lib/photos.functions";
import { cn } from "@/lib/utils";

/**
 * Drop-in image field: opens a square/rectangular cropper matching the display
 * area, then uploads to private storage and hands back the object path.
 */
export function PhotoPicker({
  value,
  onChange,
  folder,
  label,
  className,
  /** width / height of the area this image is displayed in. */
  aspect = 3 / 2,
}: {
  value: string | null;
  onChange: (path: string | null) => void;
  folder: string;
  label: string;
  className?: string;
  aspect?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 8 * 1024 * 1024) throw new Error("Image must be under 8 MB");
      const dataBase64 = await fileToBase64(file);
      const result = await uploadPhoto({
        data: { folder, fileName: file.name, contentType: file.type || "image/jpeg", dataBase64 },
      });
      return result.path;
    },
    onSuccess: (path) => {
      setPending(null);
      onChange(path);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  return (
    <div className={cn("space-y-2", className)}>
      {/* The preview box uses the same ratio as the cropper, so the saved crop
          is displayed exactly as it was positioned. */}
      <div className="relative w-full" style={{ aspectRatio: String(aspect) }}>
        {value ? (
          <SignedPhoto path={value} alt={label} className="h-full w-full object-cover" />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/40 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            {upload.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
            )}
            {label}
          </button>
        )}
        {value && (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute right-2 top-2 h-7 w-7"
            onClick={() => onChange(null)}
            aria-label="Remove image"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>
      {value && (
        <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Replace image
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > 8 * 1024 * 1024) {
            toast.error("Image must be under 8 MB");
            return;
          }
          setPending(file);
        }}
      />

      {/* Position the picture inside the frame it will be shown in. */}
      <ImageCropDialog
        file={pending}
        aspect={aspect}
        busy={upload.isPending}
        onCancel={() => setPending(null)}
        onCropped={(cropped) => upload.mutate(cropped)}
      />
    </div>
  );
}
