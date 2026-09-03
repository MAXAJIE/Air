import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/i18n";
import { STATUS_COLORS, isHexColor, statusDotClass, statusDotStyle } from "@/lib/status-colors";

const WHEEL =
  "conic-gradient(#ef4444,#f59e0b,#eab308,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#ec4899,#ef4444)";

function Dot({ color, className = "" }: { color: string | null; className?: string }) {
  const hex = isHexColor(color);
  return (
    <span
      aria-hidden="true"
      className={`h-4 w-4 rounded-full border border-border ${hex ? "" : statusDotClass(color)} ${className}`}
      style={hex ? statusDotStyle(color) : undefined}
    />
  );
}

/**
 * Colour chooser in a small popover: presets, a colour wheel and explicit
 * Cancel / Apply buttons — nothing is saved until Apply is pressed.
 */
export function ColorPickerPopover({
  value,
  onApply,
  label,
}: {
  value: string | null;
  onApply: (color: string) => void;
  label: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string>(value ?? "slate");

  useEffect(() => {
    if (open) setDraft(value ?? "slate");
  }, [open, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2" aria-label={label}>
          <Dot color={value} />
          <span className="text-xs">{t("color.title")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-3" align="start">
        <div className="flex flex-wrap gap-2">
          {STATUS_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => setDraft(c)}
              className={`h-6 w-6 rounded-full ${statusDotClass(c)} ${
                draft === c ? "ring-2 ring-ring" : ""
              }`}
            />
          ))}
          <label
            className={`relative inline-flex h-6 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border ${
              isHexColor(draft) ? "ring-2 ring-ring" : ""
            }`}
            title={t("color.custom")}
            style={isHexColor(draft) ? statusDotStyle(draft) : undefined}
          >
            {!isHexColor(draft) ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{ background: WHEEL }}
              />
            ) : null}
            <input
              type="color"
              aria-label={t("color.custom")}
              className="h-8 w-8 cursor-pointer opacity-0"
              value={isHexColor(draft) ? draft : "#3b82f6"}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Dot color={draft} />
          {t("color.preview")}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            {t("color.apply")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
