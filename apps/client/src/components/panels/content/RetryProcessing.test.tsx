import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { RetryProcessing } from "./RetryProcessing";
import { CONTENT_COPY } from "./copy";

const mocks = vi.hoisted(() => ({ retry: vi.fn(), refresh: vi.fn(), tasks: [] as any[] }));

vi.mock("@repo/ui", async () => ({
  ...(await import("./testUi").then(m => m.prismUi())),
  trpcClient: { content: { retryProcessing: { mutate: mocks.retry } } },
}));
vi.mock("./lib/uploads", () => ({ refreshContent: mocks.refresh }));
vi.mock("./lib/browserDeps", () => ({
  browserUploadDeps: { api: {} },
  contentUploadApi: {},
  normalizeApiError: (error: unknown) => error,
}));
vi.mock("./lib/uploadTask", async importOriginal => {
  const real = await importOriginal<typeof import("./lib/uploadTask")>();
  // A stand in task: runs createUpload through the deps it was given, then processes
  class UploadTask {
    snapshot = { phase: "waiting", loaded: 0, total: 1, publicId: null, error: null };
    constructor(
      readonly init: { file: File; kind: string; mimeType: string },
      readonly deps: { api: { createUpload: (input: object) => Promise<unknown> } },
      readonly onChange: () => void
    ) {
      mocks.tasks.push(this);
    }
    async run() {
      await this.deps.api.createUpload({
        kind: this.init.kind,
        fileName: this.init.file.name,
        mimeType: this.init.mimeType,
        size: this.init.file.size,
      });
      this.snapshot = { ...this.snapshot, phase: "processing", loaded: 1 };
      this.onChange();
    }
    pause() {}
  }
  return { ...real, UploadTask };
});

const e = CONTENT_COPY.editor;
const ID = "abcdefgh12345678";

beforeEach(() => {
  mocks.retry.mockReset();
  mocks.refresh.mockReset();
  mocks.tasks.length = 0;
});

describe("RetryProcessing", () => {
  it("runs processing again when the source is kept", async () => {
    mocks.retry.mockResolvedValue({ status: "processing", publicId: ID });
    const onChange = vi.fn();
    renderWithProviders(<RetryProcessing publicId={ID} kind="video" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: e.retry }));
    expect(await screen.findByText(e.retryStarted)).toBeInTheDocument();
    expect(mocks.retry).toHaveBeenCalledWith({ publicId: ID });
    expect(onChange).toHaveBeenCalled();
  });

  it("asks for the file and uploads it into the same item", async () => {
    mocks.retry
      .mockResolvedValueOnce({ status: "needs_file", publicId: ID })
      .mockResolvedValueOnce({
        status: "uploading",
        publicId: ID,
        target: { type: "put", url: "https://r2/put", headers: {} },
      });
    renderWithProviders(<RetryProcessing publicId={ID} kind="audio" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: e.retry }));
    expect(await screen.findByText(e.retryNeedsFile)).toBeInTheDocument();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "stems.mp3", { type: "audio/mpeg" })] },
    });
    expect(await screen.findByText(e.retryStarted)).toBeInTheDocument();
    expect(mocks.retry).toHaveBeenLastCalledWith({
      publicId: ID,
      file: { fileName: "stems.mp3", mimeType: "audio/mpeg", size: 1, durationSec: undefined },
    });
  });

  it("refuses a file of another kind before sending", async () => {
    mocks.retry.mockResolvedValueOnce({ status: "needs_file", publicId: ID });
    renderWithProviders(<RetryProcessing publicId={ID} kind="audio" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: e.retry }));
    await screen.findByText(e.retryNeedsFile);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "clip.pdf")] } });
    expect(await screen.findByText(e.retryWrongKind("Audio"))).toBeInTheDocument();
    expect(mocks.tasks).toHaveLength(0);
  });

  it("shows the hourly limit from the server", async () => {
    const { ContentApiError } = await import("./lib/uploadTask");
    mocks.retry.mockRejectedValue(
      new ContentApiError("TOO_MANY_REQUESTS", "You can retry processing once an hour.")
    );
    renderWithProviders(<RetryProcessing publicId={ID} kind="video" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: e.retry }));
    expect(await screen.findByText("You can retry processing once an hour.")).toBeInTheDocument();
  });
});
