// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { attachSource } from "../src/player/attach";

// Fan Library FL-5: an offline copy plays as a plain MP4, with no HLS library

describe("attachSource with an MP4", () => {
  it("sets the file as the src and swaps to a fresh one in place", async () => {
    const media = document.createElement("video");
    const onFatal = vi.fn();
    const attachment = await attachSource(
      media,
      { kind: "video", hls: "", mp4: "/downloads/abcd1234efgh5678", expiresAt: Date.now() + 1000 },
      onFatal
    );
    expect(media.getAttribute("src")).toBe("/downloads/abcd1234efgh5678");
    await attachment.swap({
      kind: "video",
      hls: "https://example.com/manifest.m3u8",
      expiresAt: Date.now() + 1000,
    });
    expect(media.getAttribute("src")).toBe("https://example.com/manifest.m3u8");
    attachment.detach();
    expect(media.getAttribute("src")).toBeNull();
    expect(onFatal).not.toHaveBeenCalled();
  });
});
