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

const FRAME_W = 320; // on-screen editor width in px
const OUTPUT_W = 1280; // exported width in px

type Loaded = { src: string; image: HTMLImageElement };

/**
 * Rectangular crop dialog used by every non-avatar image field. The frame has
 * the same aspect ratio as the place the image will be displayed, so what the
 * user positions here is exactly what the app will show.
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
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const frameW = FRAME_W;
  const frameH = Math.round(FRAME_W / aspect);

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

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

  async function confirm() {
    if (!loaded) return;
    const outW = OUTPUT_W;
    const outH = Math.round(OUTPUT_W / aspect);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = outW / frameW;
    ctx.drawImage(
      loaded.image,
      (frameW / 2 - drawW / 2 + safeOffset.x) * ratio,
      (frameH / 2 - drawH / 2 + safeOffset.y) * ratio,
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
          className="relative mx-auto touch-none select-none overflow-hidden rounded-lg bg-muted"
          style={{ width: frameW, height: frameH }}
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
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: drawW,
                height: drawH,
                transform: `translate(calc(-50% + ${safeOffset.x}px), calc(-50% + ${safeOffset.y}px))`,
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
