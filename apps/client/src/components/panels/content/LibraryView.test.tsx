import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders } from "@/test/utils";
import { LibraryView } from "./LibraryView";

const MB = 1024 * 1024;
const GB = 1024 * MB;

const mocks = vi.hoisted(() => ({
  getStorage: vi.fn(),
  list: vi.fn(),
  abortUpload: vi.fn(),
  toast: vi.fn(),
}));

// Real Prism parts from their own modules: the ui index pulls in better-auth
vi.mock("@repo/ui", async () => ({
  ...(await import("./testUi").then(m => m.prismUi())),
  trpc: {
    content: {
      getStorage: {
        queryOptions: () => ({ queryKey: ["content.getStorage"], queryFn: mocks.getStorage }),
      },
      list: {
        infiniteQueryOptions: (input: object, opts: object) => ({
          queryKey: ["content.list", input],
          queryFn: ({ pageParam }: { pageParam?: string }) =>
            mocks.list({ ...input, cursor: pageParam }),
          initialPageParam: undefined,
          ...opts,
        }),
      },
    },
  },
  trpcClient: { content: { abortUpload: { mutate: mocks.abortUpload } } },
}));

vi.mock("@/components/ui/toast", () => ({ toast: { add: mocks.toast } }));
vi.mock("./lib/uploads", () => ({
  useUploads: () => ({ queue: { add: vi.fn(), clearSettled: vi.fn() }, entries: [] }),
  refreshContent: vi.fn(),
}));

const storage = {
  uploadsOpen: true,
  bytesLimit: 5 * GB,
  bytesUsed: 2 * GB,
  bytesReserved: 0,
  pageFilesBytes: 12 * MB,
  byKind: { video: 1.4 * GB, audio: 450 * MB },
  videoMinutesLimit: 300,
  videoMinutesUsed: 84,
  limits: { video: 2 * GB, audio: 500 * MB, image: 25 * MB, document: 100 * MB, file: 500 * MB },
};

function item(over: Record<string, unknown>) {
  return {
    publicId: "abcdefgh12345678",
    kind: "audio",
    title: "Low Tide EP, stems",
    description: null,
    status: "ready",
    processingStep: "done",
    failureReason: null,
    publishState: "draft",
    moderationState: "clear",
    durationMs: 1_458_000,
    pageCount: null,
    totalBytes: 212 * MB,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

describe("LibraryView (cs1, cs8)", () => {
  beforeEach(() => {
    mocks.getStorage.mockResolvedValue(storage);
    mocks.list.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("shows the empty state with the limits and one Upload action", async () => {
    renderWithProviders(<LibraryView onOpenItem={vi.fn()} />);
    expect(await screen.findByText("Upload your first video, track or file")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Video 2 GB, audio and ZIP 500 MB, documents 100 MB, images 25 MB. 5 GB and 300 video minutes on your plan."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
    expect(screen.getByText("84 of 300 minutes")).toBeInTheDocument();
  });

  it("disables Upload and says why while uploads are closed", async () => {
    mocks.getStorage.mockResolvedValue({ ...storage, uploadsOpen: false });
    renderWithProviders(<LibraryView onOpenItem={vi.fn()} />);
    expect(await screen.findByText("Uploads are not open yet")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled());
  });

  it("lists items with one status each and opens the editor", async () => {
    const onOpenItem = vi.fn();
    mocks.list.mockResolvedValue({
      items: [
        item({}),
        item({
          publicId: "bbbbbbbbbbbbbbbb",
          kind: "video",
          title: "Harbor at 5 a.m.",
          status: "processing",
          processingStep: "encoding",
          durationMs: null,
        }),
        item({
          publicId: "cccccccccccccccc",
          kind: "file",
          title: "Field kit presets",
          moderationState: "held",
        }),
        item({
          publicId: "dddddddddddddddd",
          kind: "document",
          title: "Liner notes",
          status: "failed",
          failureReason: "pdf_encrypted",
        }),
      ],
      nextCursor: null,
    });
    renderWithProviders(<LibraryView onOpenItem={onOpenItem} />);
    expect(await screen.findByText("Low Tide EP, stems")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Encoding on Stream")).toBeInTheDocument();
    expect(screen.getByText("In review")).toBeInTheDocument();
    expect(screen.getByText(/This PDF has a password/)).toBeInTheDocument();
    expect(screen.getByText("24:18")).toBeInTheDocument();
    expect(screen.getByText("4 items")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Low Tide EP, stems" }));
    expect(onOpenItem).toHaveBeenCalledWith("abcdefgh12345678");
  });

  it("filters by kind on the server and by title in the browser", async () => {
    mocks.list.mockResolvedValue({ items: [item({})], nextCursor: null });
    renderWithProviders(<LibraryView onOpenItem={vi.fn()} />);
    await screen.findByText("Low Tide EP, stems");

    fireEvent.click(screen.getByRole("radio", { name: "Video" }));
    await waitFor(() =>
      expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "video" }))
    );

    fireEvent.change(screen.getByPlaceholderText("Search by title"), {
      target: { value: "nothing like it" },
    });
    expect(await screen.findByText("Nothing matches")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show everything" }));
    expect(await screen.findByText("Low Tide EP, stems")).toBeInTheDocument();
  });

  it("names what failed and offers Try again", async () => {
    mocks.list.mockRejectedValue(new Error("down"));
    renderWithProviders(<LibraryView onOpenItem={vi.fn()} />, {
      queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    });
    expect(await screen.findByText("Your library did not load")).toBeInTheDocument();
    mocks.list.mockResolvedValue({ items: [], nextCursor: null });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Upload your first video, track or file")).toBeInTheDocument();
  });
});
