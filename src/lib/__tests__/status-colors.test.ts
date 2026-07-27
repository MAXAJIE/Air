import { describe, it, expect } from "vitest";
import {
  statusChipClass,
  jobStatusChipClass,
  statusDotClass,
  isHexColor,
} from "@/lib/status-colors";

describe("statusChipClass", () => {
  it("returns a string containing status-chip", () => {
    const cls = statusChipClass("blue");
    expect(cls).toContain("status-chip");
  });

  it("returns specific class for blue status", () => {
    const cls = statusChipClass("blue");
    expect(cls).toContain("status-chip-blue");
  });

  it("handles a hex color string", () => {
    const cls = statusChipClass("#ef4444");
    expect(typeof cls).toBe("string");
    expect(cls.length).toBeGreaterThan(0);
  });

  it("handles undefined gracefully", () => {
    const cls = statusChipClass(undefined);
    expect(typeof cls).toBe("string");
  });
});

describe("jobStatusChipClass", () => {
  it("returns a string for each status", () => {
    const statuses = ["pending", "in_progress", "submitted", "done", "reviewed"];
    for (const s of statuses) {
      const cls = jobStatusChipClass(s as any);
      expect(typeof cls).toBe("string");
      expect(cls.length).toBeGreaterThan(0);
    }
  });

  it("returns different strings for different statuses", () => {
    const pending = jobStatusChipClass("pending");
    const done = jobStatusChipClass("done");
    expect(pending).not.toBe(done);
  });
});

describe("statusDotClass", () => {
  it("returns a non-empty string", () => {
    const cls = statusDotClass("blue");
    expect(cls.length).toBeGreaterThan(0);
  });
});

describe("isHexColor", () => {
  it("returns true for valid hex colors", () => {
    expect(isHexColor("#ff0000")).toBe(true);
    expect(isHexColor("#00ff00")).toBe(true);
    expect(isHexColor("#0000ff")).toBe(true);
  });

  it("returns false for non-hex values", () => {
    expect(isHexColor("blue")).toBe(false);
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor("")).toBe(false);
    expect(isHexColor(null)).toBe(false);
    expect(isHexColor(undefined)).toBe(false);
  });

  it("returns false for invalid hex", () => {
    expect(isHexColor("#gggggg")).toBe(false);
    expect(isHexColor("#12345")).toBe(false);
  });
});
