import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";
import { formatPrice, formatPriceNullable } from "@/lib/format-price";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("handles undefined values", () => {
    expect(cn("a", undefined, "b")).toBe("a b");
  });

  it("resolves tailwind conflicts", () => {
    expect(cn("px-4", "px-2")).toBe("px-2");
  });

  it("handles empty input", () => {
    expect(cn()).toBe("");
  });
});

describe("formatPrice", () => {
  it("formats price with default currency", () => {
    expect(formatPrice(12.5)).toBe("RM 12.50");
  });

  it("formats zero", () => {
    expect(formatPrice(0)).toBe("RM 0.00");
  });

  it("formats whole numbers correctly", () => {
    expect(formatPrice(100)).toBe("RM 100.00");
  });

  it("handles large numbers", () => {
    expect(formatPrice(1234567.89)).toBe("RM 1,234,567.89");
  });
});

describe("formatPriceNullable", () => {
  it("formats a number", () => {
    expect(formatPriceNullable(25)).toBe("RM 25.00");
  });

  it("returns — for null", () => {
    expect(formatPriceNullable(null)).toBe("—");
  });

  it("returns — for undefined", () => {
    expect(formatPriceNullable(undefined)).toBe("—");
  });

  it("formats zero", () => {
    expect(formatPriceNullable(0)).toBe("RM 0.00");
  });
});
