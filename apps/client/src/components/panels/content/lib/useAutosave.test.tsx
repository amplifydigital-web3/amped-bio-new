import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosave } from "./useAutosave";

type Patch = { title?: string; description?: string | null; adult?: boolean };

describe("useAutosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("merges edits into one save 800 ms after the last change", async () => {
    const save = vi.fn<(patch: Patch) => Promise<void>>(async () => {});
    const { result } = renderHook(() => useAutosave<Patch>(save, { isOnline: () => true }));
    act(() => result.current.change({ title: "Low" }));
    await act(() => vi.advanceTimersByTimeAsync(500));
    act(() => result.current.change({ title: "Low Tide", adult: false }));
    await act(() => vi.advanceTimersByTimeAsync(799));
    expect(save).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: "Low Tide", adult: false });
    expect(result.current.status.state).toBe("saved");
  });

  it("keeps a failed patch and sends it with the next edit on Retry", async () => {
    const save = vi.fn<(patch: Patch) => Promise<void>>(async () => {});
    save.mockRejectedValueOnce(new Error("500"));
    const { result } = renderHook(() => useAutosave<Patch>(save, { isOnline: () => true }));
    act(() => result.current.change({ title: "A" }));
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(result.current.status.state).toBe("error");
    act(() => result.current.change({ description: "B" }));
    await act(() => result.current.flush());
    expect(save).toHaveBeenLastCalledWith({ title: "A", description: "B" });
    expect(result.current.status.state).toBe("saved");
  });

  it("waits while offline", async () => {
    let online = false;
    const save = vi.fn<(patch: Patch) => Promise<void>>(async () => {});
    const { result } = renderHook(() => useAutosave<Patch>(save, { isOnline: () => online }));
    act(() => result.current.change({ title: "A" }));
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(save).not.toHaveBeenCalled();
    expect(result.current.status.state).toBe("offline");
    online = true;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(save).toHaveBeenCalledWith({ title: "A" });
  });

  it("keeps an offline edit after the editor closes and sends it on reconnect", async () => {
    let online = false;
    const save = vi.fn<(patch: Patch) => Promise<void>>(async () => {});
    const { result, unmount } = renderHook(() =>
      useAutosave<Patch>(save, { isOnline: () => online, deferKey: "item9" })
    );
    act(() => result.current.change({ title: "Offline edit" }));
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(save).not.toHaveBeenCalled();
    unmount();
    online = true;
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(save).toHaveBeenCalledWith({ title: "Offline edit" });
  });

  it("flushes pending edits when the editor closes", async () => {
    const save = vi.fn<(patch: Patch) => Promise<void>>(async () => {});
    const { result, unmount } = renderHook(() =>
      useAutosave<Patch>(save, { isOnline: () => true })
    );
    act(() => result.current.change({ title: "A" }));
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(save).toHaveBeenCalledWith({ title: "A" });
  });
});
