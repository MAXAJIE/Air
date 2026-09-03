import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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

const OUTPUT_W = 1280; // exported width in px

type Loaded = { src: string; image: HTMLImageElement };

/**
 * Rectangular crop dialog used by every non-avatar image field.
 *
 * The frame is fluid (it keeps `aspect` through CSS `aspect-ratio`) and the
 * picture is positioned in percentages of the frame, so what the user sees
 * here is exactly what gets exported — the old fixed 320px frame drifted from
 * the real frame width and the saved crop no longer fitted the display area.
 */
export function ImageCropDialog({
  file,
  aspect,
  onCancel,
  onCropped,
  busy,
}: {
  file: File | null;
  /** width / height of the display area this image fills. */
  aspect: number;
  onCancel: () => void;
  onCropped: (file: File) => void;
  busy?: boolean;
}) {
  const t = useT();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [frameW, setFrameW] = useState(320);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const frameH = frameW / aspect;

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Track the real on-screen frame width so the maths always matches the pixels.
  useEffect(() => {
    const node = frameRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (width > 0) setFrameW(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loaded]);

  useEffect(() => {
    if (!file) {
      setLoaded(null);
      return;
    }
    const src = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      reset();
      setLoaded({ src, image });
    };
    image.onerror = () => {
      toast.error(t("common.error"));
      onCancel();
    };
    image.src = src;
    return () => URL.revokeObjectURL(src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  /** Scale that makes the image cover the whole frame at zoom 1. */
  const baseScale = loaded
    ? Math.max(frameW / loaded.image.naturalWidth, frameH / loaded.image.naturalHeight)
    : 1;
  const drawW = loaded ? loaded.image.naturalWidth * baseScale * zoom : 0;
  const drawH = loaded ? loaded.image.naturalHeight * baseScale * zoom : 0;

  const clamp = (o: { x: number; y: number }) => {
    const maxX = Math.max(0, (drawW - frameW) / 2);
    const maxY = Math.max(0, (drawH - frameH) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, o.x)),
      y: Math.min(maxY, Math.max(-maxY, o.y)),
    };
  };
  const safeOffset = clamp(offset);

  // Top-left of the picture, expressed inside the frame.
  const left = (frameW - drawW) / 2 + safeOffset.x;
  const top = (frameH - drawH) / 2 + safeOffset.y;

  async function confirm() {
    if (!loaded) return;
    const outW = OUTPUT_W;
    const outH = Math.round(OUTPUT_W / aspect);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // One single scale factor keeps the export identical to the preview.
    const k = outW / frameW;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(loaded.image, left * k, top * k, drawW * k, drawH * k);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9),
    );
    if (!blob) {
      toast.error(t("common.error"));
      return;
    }
    onCropped(new File([blob], "image.jpg", { type: "image/jpeg" }));
  }

  return (
    <Dialog open={!!file} onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("crop.title")}</DialogTitle>
          <DialogDescription>{t("crop.help")}</DialogDescription>
        </DialogHeader>

        <div
          ref={frameRef}
          className="relative mx-auto w-full max-w-[320px] touch-none select-none overflow-hidden rounded-lg bg-muted"
          style={{ aspectRatio: String(aspect) }}
          onPointerDown={(e) => {
            dragRef.current = { x: e.clientX - safeOffset.x, y: e.clientY - safeOffset.y };
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!dragRef.current) return;
            setOffset(clamp({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y }));
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
              className="pointer-events-none absolute max-w-none"
              style={{
                width: `${(drawW / frameW) * 100}%`,
                height: `${(drawH / frameH) * 100}%`,
                left: `${(left / frameW) * 100}%`,
                top: `${(top / frameH) * 100}%`,
              }}
            />
          )}
          <div className="pointer-events-none absolute inset-0 rounded-lg border-2 border-primary/70" />
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("avatar.zoom")}</p>
          <Slider
            value={[zoom]}
            min={1}
            max={3}
            step={0.01}
            onValueChange={([v]) => setZoom(v)}
            aria-label={t("avatar.zoom")}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button type="button" disabled={busy || !loaded} onClick={() => confirm()}>
            {t("crop.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
