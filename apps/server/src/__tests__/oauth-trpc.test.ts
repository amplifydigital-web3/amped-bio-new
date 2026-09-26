/**
 * Tests for TRPC OAuth routers — input validation schemas and utility functions.
 * The actual router behavior (list, create, update, etc.) requires a live session
 * and database, which are covered by the E2E tests.
 */
import { describe, it, expect } from "vitest";
import { parseRedirectUris } from "../trpc/admin/oauthApps";

describe("parseRedirectUris", () => {
  it("returns an empty array for null input", () => {
    expect(parseRedirectUris(null)).toEqual([]);
  });

  it("returns an empty array for undefined-like values coerced to null", () => {
    expect(parseRedirectUris(null)).toEqual([]);
  });

  it("parses a valid JSON array of strings", () => {
    const result = parseRedirectUris('["https://app.example.com/callback"]');
    expect(result).toEqual(["https://app.example.com/callback"]);
  });

  it("parses multiple redirect URIs", () => {
    const input = JSON.stringify([
      "https://app.example.com/callback",
      "https://app.example.com/auth",
      "https://staging.example.com/callback",
    ]);
    const result = parseRedirectUris(input);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("https://app.example.com/callback");
  });

  it("filters out non-string values from the array", () => {
    const input = '["https://valid.com/callback", 123, null, false]';
    const result = parseRedirectUris(input);
    expect(result).toEqual(["https://valid.com/callback"]);
  });

  it("returns empty array for invalid JSON", () => {
    const result = parseRedirectUris("not-json-at-all");
    expect(result).toEqual([]);
  });

  it("returns empty array for malformed JSON (object instead of array)", () => {
    const result = parseRedirectUris('{"uri": "https://example.com"}');
    expect(result).toEqual([]);
  });

  it("returns empty array for an empty string", () => {
    const result = parseRedirectUris("");
    expect(result).toEqual([]);
  });
});