import { useMutation } from "@tanstack/react-query";
import { Camera, Loader2, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { SignedPhoto } from "@/components/signed-photo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { useT } from "@/i18n";
import { fileToBase64 } from "@/lib/files";
import { uploadPhoto } from "@/lib/photos.functions";
import { cn } from "@/lib/utils";

const FRAME = 288; // on-screen editor size in px
const OUTPUT = 512; // exported avatar size in px

type Loaded = { src: string; image: HTMLImageElement };

/**
 * Round profile picture field. Picking a file opens a cropper that shows exactly
 * what is kept inside the circle, so the face can be placed before uploading.
 */
export function AvatarCropPicker({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (path: string | null) => void;
  className?: string;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(
    () => () => {
      if (loaded) URL.revokeObjectURL(loaded.src);
    },
    [loaded],
  );

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const dataBase64 = await fileToBase64(file);
      const result = await uploadPhoto({
        data: { folder: "avatar", fileName: file.name, contentType: file.type, dataBase64 },
      });
      return result.path;
    },
    onSuccess: (path) => {
      onChange(path);
      close();
      toast.success(t("common.saved"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const close = useCallback(() => {
    setLoaded(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  function pick(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      toast.error(t("avatar.tooLarge"));
      return;
    }
    const src = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setLoaded({ src, image });
    };
    image.onerror = () => toast.error(t("common.error"));
    image.src = src;
  }

  /** Scale that makes the shorter side exactly fill the circle. */
  const baseScale = loaded
    ? FRAME / Math.min(loaded.image.naturalWidth, loaded.image.naturalHeight)
    : 1;
  const drawW = loaded ? loaded.image.naturalWidth * baseScale * zoom : 0;
  const drawH = loaded ? loaded.image.naturalHeight * baseScale * zoom : 0;

  const clamp = (o: { x: number; y: number }) => {
    const maxX = Math.max(0, (drawW - FRAME) / 2);
    const maxY = Math.max(0, (drawH - FRAME) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, o.x)),
      y: Math.min(maxY, Math.max(-maxY, o.y)),
    };
  };

  async function confirm() {
    if (!loaded) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = OUTPUT / FRAME;
    const safe = clamp(offset);
    ctx.drawImage(
      loaded.image,
      (FRAME / 2 - drawW / 2 + safe.x) * ratio,
      (FRAME / 2 - drawH / 2 + safe.y) * ratio,
      drawW * ratio,
      drawH * ratio,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9),
    );
    if (!blob) {
      toast.error(t("common.error"));
      return;
    }
    upload.mutate(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
  }

  const safeOffset = clamp(offset);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-4">
        <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-secondary-foreground">
          {value ? (
            <SignedPhoto
              path={value}
              alt={t("avatar.label")}
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <UserRound className="h-8 w-8" aria-hidden="true" />
          )}
        </span>
        <div className="space-y-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            {value ? t("avatar.replace") : t("avatar.add")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("avatar.help")}</p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) pick(file);
        }}
      />

      <Dialog open={!!loaded} onOpenChange={(open) => (!open ? close() : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("avatar.cropTitle")}</DialogTitle>
            <DialogDescription>{t("avatar.cropHelp")}</DialogDescription>
          </DialogHeader>

          <div
            className="relative mx-auto touch-none select-none overflow-hidden rounded-lg bg-muted"
            style={{ width: FRAME, height: FRAME }}
            onPointerDown={(e) => {
              dragRef.current = { x: e.clientX - safeOffset.x, y: e.clientY - safeOffset.y };
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!dragRef.current) return;
              setOffset(
                clamp({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y }),
              );
            }}
            onPointerUp={() => {
              dragRef.current = null;
            }}
          >
            {loaded && (
              <img
                src={loaded.src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                style={{
                  width: drawW,
                  height: drawH,
                  transform: `translate(calc(-50% + ${safeOffset.x}px), calc(-50% + ${safeOffset.y}px))`,
                }}
              />
            )}
            {/* Everything outside the circle is what gets cropped away. */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: "color-mix(in oklab, var(--background) 72%, transparent)",
                WebkitMaskImage: "radial-gradient(circle at center, transparent 0 49.5%, #000 50%)",
                maskImage: "radial-gradient(circle at center, transparent 0 49.5%, #000 50%)",
              }}
            />
            <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-primary/70" />
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("avatar.zoom")}</p>
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.01}
              onValueChange={([v]) => {
                setZoom(v);
                setOffset((o) => o);
              }}
              aria-label={t("avatar.zoom")}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              {t("common.cancel")}
            </Button>
            <Button type="button" disabled={upload.isPending} onClick={() => confirm()}>
              {upload.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {t("avatar.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
