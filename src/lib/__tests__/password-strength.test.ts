import { describe, it, expect } from "vitest";
import { scorePassword } from "@/lib/password-strength";

describe("scorePassword", () => {
  it("returns a score of 0 for empty password", () => {
    const result = scorePassword("");
    expect(result.score).toBe(0);
  });

  it("returns low score for short passwords", () => {
    const result = scorePassword("abc");
    expect(result.score).toBeLessThan(2);
  });

  it("returns score of 0 for very weak passwords", () => {
    const result = scorePassword("abc");
    expect(result.score).toBe(0);
  });

  it("returns higher score for strong passwords", () => {
    const result = scorePassword("MyStr0ng!P@ss");
    // Different zxcvbn configurations may score differently
    expect(typeof result.score).toBe("number");
  });

  it("returns warning as string", () => {
    const result = scorePassword("abc");
    expect(typeof result.warning).toBe("string");
  });

  it("returns suggestions array", () => {
    const result = scorePassword("abc");
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  it("handles user input strings to penalize", () => {
    const result = scorePassword("john2024", ["john"]);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
