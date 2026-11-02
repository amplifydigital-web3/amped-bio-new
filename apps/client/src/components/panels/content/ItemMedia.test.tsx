import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { CaptionsSection, ItemPreview } from "./ItemMedia";
import { CONTENT_COPY } from "./copy";

const mocks = vi.hoisted(() => ({
  readUrl: vi.fn(),
  setCaptions: vi.fn(),
  removeCaptions: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@repo/ui", async () => ({
  ...(await import("./testUi").then(m => m.prismUi())),
  MediaPlayer: ({ item }: { item: { title: string } }) => <div>player for {item.title}</div>,
  ChapterList: () => null,
  requirePlayerSource: vi.fn(),
  trpc: {
    content: {
      getReadUrl: {
        queryOptions: (input: { publicId: string }) => ({
          queryKey: ["content.getReadUrl", input],
          queryFn: () => mocks.readUrl(input),
        }),
      },
      get: { queryKey: (input: object) => ["content.get", input] },
    },
  },
  trpcClient: {
    content: {
      setCaptions: { mutate: mocks.setCaptions },
      removeCaptions: { mutate: mocks.removeCaptions },
      getReadUrl: { query: mocks.readUrl },
    },
  },
  queryClient: { invalidateQueries: mocks.invalidate },
}));

const e = CONTENT_COPY.editor;
const ID = "abcdefgh12345678";
const base = {
  publicId: ID,
  title: "Shoreline, 5 a.m.",
  status: "ready",
  moderationState: "clear",
  durationMs: 231_000,
  chapters: null,
  assets: [] as Array<{ role: string; lang: string | null }>,
};

beforeEach(() => {
  Object.values(mocks).forEach(fn => fn.mockReset());
  mocks.invalidate.mockResolvedValue(undefined);
});

describe("ItemPreview", () => {
  it("plays video and audio in the shared player", () => {
    mocks.readUrl.mockResolvedValue({ playback: null });
    renderWithProviders(<ItemPreview item={{ ...base, kind: "audio" }} />);
    expect(screen.getByText(`player for ${base.title}`)).toBeInTheDocument();
    expect(screen.getByText(e.previewHelp)).toBeInTheDocument();
  });

  it("shows an image from its signed renditions", async () => {
    mocks.readUrl.mockResolvedValue({
      playback: { image: { src: "https://m/img/1280.webp", srcSet: "", width: 1280, height: 640 } },
    });
    renderWithProviders(<ItemPreview item={{ ...base, kind: "image" }} />);
    const image = await screen.findByRole("img", { name: base.title });
    expect(image).toHaveAttribute("src", "https://m/img/1280.webp");
  });

  it("shows nothing until the item is ready, and nothing for ZIP files", () => {
    const { container } = renderWithProviders(
      <ItemPreview item={{ ...base, kind: "video", status: "processing" }} />
    );
    expect(container).toBeEmptyDOMElement();
    expect(mocks.readUrl).not.toHaveBeenCalled();
    const zip = renderWithProviders(<ItemPreview item={{ ...base, kind: "file" }} />);
    expect(zip.container).toBeEmptyDOMElement();
  });
});

describe("CaptionsSection", () => {
  it("lists caption languages and removes one", async () => {
    mocks.removeCaptions.mockResolvedValue({ captions: [] });
    renderWithProviders(
      <CaptionsSection
        item={{ ...base, kind: "video", assets: [{ role: "caption", lang: "en" }] }}
      />
    );
    expect(screen.getByRole("listitem")).toHaveTextContent("English");
    expect(screen.getByText(e.captionsCount(1))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: e.removeCaptions("English") }));
    await waitFor(() =>
      expect(mocks.removeCaptions).toHaveBeenCalledWith({ publicId: ID, lang: "en" })
    );
    expect(mocks.invalidate).toHaveBeenCalled();
  });

  it("uploads a .vtt file for the chosen language", async () => {
    mocks.setCaptions.mockResolvedValue({ captions: [{ lang: "es", label: "Spanish" }] });
    renderWithProviders(<CaptionsSection item={{ ...base, kind: "audio" }} />);
    fireEvent.change(screen.getByLabelText(e.captionsLanguage), { target: { value: "es" } });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["WEBVTT\n\n00:00.000 --> 00:01.000\nHola\n"], "es.vtt", {
      type: "text/vtt",
    });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(mocks.setCaptions).toHaveBeenCalledWith({
        publicId: ID,
        lang: "es",
        vtt: "WEBVTT\n\n00:00.000 --> 00:01.000\nHola\n",
      })
    );
  });

  it("refuses a file over 512 KB before sending, and shows server errors", async () => {
    renderWithProviders(<CaptionsSection item={{ ...base, kind: "audio" }} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const big = new File(["x".repeat(512 * 1024 + 1)], "big.vtt");
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText(e.captionsTooLarge)).toBeInTheDocument();
    expect(mocks.setCaptions).not.toHaveBeenCalled();

    mocks.setCaptions.mockRejectedValue(new Error("This is not a WebVTT caption file."));
    fireEvent.change(input, { target: { files: [new File(["nope"], "a.vtt")] } });
    expect(await screen.findByText("This is not a WebVTT caption file.")).toBeInTheDocument();
  });

  it("waits for processing, stops at five languages, and skips other kinds", () => {
    renderWithProviders(
      <CaptionsSection item={{ ...base, kind: "video", status: "processing" }} />
    );
    expect(screen.getByText(e.captionsLater)).toBeInTheDocument();
    expect(screen.queryByText(e.addCaptions)).toBeNull();

    const five = ["en", "es", "fr", "de", "it"].map(lang => ({ role: "caption", lang }));
    renderWithProviders(<CaptionsSection item={{ ...base, kind: "video", assets: five }} />);
    expect(screen.getAllByText(e.captionsCount(5))).toHaveLength(1);
    expect(screen.queryByText(e.addCaptions)).toBeNull();

    const { container } = renderWithProviders(
      <CaptionsSection item={{ ...base, kind: "image" }} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
