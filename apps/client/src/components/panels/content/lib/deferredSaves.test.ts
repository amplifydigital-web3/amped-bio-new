import { describe, expect, it, vi } from "vitest";
import { deferSave, deferredCount, takeDeferred } from "./deferredSaves";

describe("deferredSaves", () => {
  it("merges patches per item and sends them", async () => {
    const save = vi.fn(async () => {});
    deferSave("item1", { title: "A" }, save);
    deferSave("item1", { description: "B" }, save);
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(save).toHaveBeenCalledWith({ title: "A", description: "B" });
    expect(deferredCount()).toBe(0);
  });

  it("hands an unsent patch back to an editor that reopens the item", () => {
    deferSave("item2", { title: "C" }, async () => {});
    expect(takeDeferred("item2")).toEqual({ title: "C" });
    expect(takeDeferred("item2")).toBeNull();
  });
});
