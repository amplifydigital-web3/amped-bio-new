import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/ui", () => ({ trpcClient: {} }));
vi.mock("@/contexts/EditorContext", () => ({ useEditor: vi.fn() }));

import { ownLookId } from "./useThemeActions";

// TE-4a: an editor apply names the look it writes to.
describe("ownLookId", () => {
  it("is the creator's own look id", () => {
    expect(ownLookId({ id: 42, user_id: 7 })).toBe(42);
  });

  it("is undefined for a marketplace theme or a page with no look yet", () => {
    expect(ownLookId({ id: 3, user_id: null })).toBeUndefined();
    expect(ownLookId({ id: 0, user_id: 7 })).toBeUndefined();
  });
});
