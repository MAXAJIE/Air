import { useMutation } from "@tanstack/react-query";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

import { SignedPhoto } from "@/components/signed-photo";
import { Button } from "@/components/ui/button";
import { fileToBase64 } from "@/lib/files";
import { uploadPhoto } from "@/lib/photos.functions";
import { cn } from "@/lib/utils";

/** Drop-in image field: uploads to private storage and hands back the object path. */
export function PhotoPicker({
  value,
  onChange,
  folder,
  label,
  className,
}: {
  value: string | null;
  onChange: (path: string | null) => void;
  folder: string;
  label: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 8 * 1024 * 1024) throw new Error("Image must be under 8 MB");
      const dataBase64 = await fileToBase64(file);
      const result = await uploadPhoto({
        data: { folder, fileName: file.name, contentType: file.type || "image/jpeg", dataBase64 },
      });
      return result.path;
    },
    onSuccess: (path) => onChange(path),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        {value ? (
          <SignedPhoto path={value} alt={label} className="h-40 w-full object-cover" />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/40 text-sm text-muted-foreground transition-colors hover:bg-muted"
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
          if (file) upload.mutate(file);
        }}
      />
    </div>
  );
}
