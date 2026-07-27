import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isVerified,
  touchActivity,
  readLastActivity,
  clearActivity,
  isIdleExpired,
  holdIdleLogout,
  releaseIdleLogout,
  isIdleLogoutHeld,
  clearIdleLogoutHolds,
  markPendingVerification,
  readPendingVerification,
  clearPendingVerification,
  isUnverified,
  INACTIVITY_TTL_MS,
  LAST_ACTIVE_KEY,
  TASK_HOLD_KEY,
  PENDING_VERIFY_KEY,
} from "@/lib/session-hygiene";

// Mock localStorage
const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
};
Object.defineProperty(global, "window", {
  value: { localStorage: localStorageMock },
  writable: true,
});

beforeEach(() => {
  store.clear();
  vi.useRealTimers();
});

describe("isVerified", () => {
  it("returns false for null/undefined user", () => {
    expect(isVerified(null)).toBe(false);
    expect(isVerified(undefined)).toBe(false);
  });

  it("returns true when email_confirmed_at is set", () => {
    const user = { email_confirmed_at: "2026-01-01" } as any;
    expect(isVerified(user)).toBe(true);
  });

  it("returns true when confirmed_at is set", () => {
    const user = { confirmed_at: "2026-01-01" } as any;
    expect(isVerified(user)).toBe(true);
  });

  it("returns false when neither confirmation date is set", () => {
    const user = { email_confirmed_at: null, confirmed_at: null } as any;
    expect(isVerified(user)).toBe(false);
  });
});

describe("touchActivity / readLastActivity / clearActivity", () => {
  it("stores and reads activity timestamp", () => {
    touchActivity(1000);
    expect(readLastActivity()).toBe(1000);
  });

  it("returns null when no activity stored", () => {
    expect(readLastActivity()).toBe(null);
  });

  it("clears stored activity", () => {
    touchActivity(1000);
    clearActivity();
    expect(readLastActivity()).toBe(null);
  });
});

describe("isIdleExpired", () => {
  it("returns false when there's a task hold", () => {
    store.set(TASK_HOLD_KEY, "1");
    store.set(LAST_ACTIVE_KEY, String(Date.now() - INACTIVITY_TTL_MS - 1000));
    expect(isIdleExpired()).toBe(false);
  });

  it("returns false when no activity stored", () => {
    expect(isIdleExpired()).toBe(false);
  });

  it("returns true when activity is older than TTL", () => {
    const past = Date.now() - INACTIVITY_TTL_MS - 1000;
    store.set(LAST_ACTIVE_KEY, String(past));
    expect(isIdleExpired(Date.now())).toBe(true);
  });

  it("returns false when activity is within TTL", () => {
    const recent = Date.now() - 60_000; // 1 minute ago
    store.set(LAST_ACTIVE_KEY, String(recent));
    expect(isIdleExpired(Date.now())).toBe(false);
  });
});

describe("holdIdleLogout / releaseIdleLogout / isIdleLogoutHeld", () => {
  it("starts with no hold", () => {
    expect(isIdleLogoutHeld()).toBe(false);
  });

  it("holdIdleLogout sets the hold", () => {
    holdIdleLogout();
    expect(isIdleLogoutHeld()).toBe(true);
  });

  it("releaseIdleLogout clears the hold", () => {
    holdIdleLogout();
    releaseIdleLogout();
    expect(isIdleLogoutHeld()).toBe(false);
  });

  it("supports multiple concurrent holds", () => {
    holdIdleLogout();
    holdIdleLogout();
    releaseIdleLogout();
    expect(isIdleLogoutHeld()).toBe(true);
    releaseIdleLogout();
    expect(isIdleLogoutHeld()).toBe(false);
  });

  it("releaseIdleLogout is safe to call without a hold", () => {
    expect(() => releaseIdleLogout()).not.toThrow();
    expect(isIdleLogoutHeld()).toBe(false);
  });
});

describe("clearIdleLogoutHolds", () => {
  it("removes all holds", () => {
    holdIdleLogout();
    holdIdleLogout();
    clearIdleLogoutHolds();
    expect(isIdleLogoutHeld()).toBe(false);
  });
});

describe("markPendingVerification / readPendingVerification / clearPendingVerification", () => {
  it("stores and reads pending verification", () => {
    markPendingVerification("test@example.com");
    const result = readPendingVerification();
    expect(result?.email).toBe("test@example.com");
    expect(typeof result?.at).toBe("number");
  });

  it("returns null when no verification stored", () => {
    expect(readPendingVerification()).toBe(null);
  });

  it("clears pending verification", () => {
    markPendingVerification("test@example.com");
    clearPendingVerification();
    expect(readPendingVerification()).toBe(null);
  });

  it("returns null for invalid stored data", () => {
    store.set(PENDING_VERIFY_KEY, "not-json");
    expect(readPendingVerification()).toBe(null);
  });
});

describe("isUnverified", () => {
  it("returns false for null/undefined user", () => {
    expect(isUnverified(null)).toBe(false);
    expect(isUnverified(undefined)).toBe(false);
  });

  it("returns true when user has no confirmation", () => {
    const user = { email_confirmed_at: null, confirmed_at: null } as any;
    expect(isUnverified(user)).toBe(true);
  });

  it("returns false when user is confirmed", () => {
    const user = { email_confirmed_at: "2026-01-01", confirmed_at: null } as any;
    expect(isUnverified(user)).toBe(false);
  });
});
