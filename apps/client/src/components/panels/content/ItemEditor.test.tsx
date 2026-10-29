import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ItemEditor } from "./ItemEditor";
import { rowsToChapters } from "./lib/chapters";

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));

vi.mock("@repo/ui", async () => ({
  ...(await import("./testUi").then(m => m.prismUi())),
  trpc: {
    content: {
      get: {
        queryOptions: (input: { publicId: string }) => ({
          queryKey: ["content.get", input],
          queryFn: () => mocks.get(input),
        }),
        queryKey: (input: { publicId: string }) => ["content.get", input],
      },
    },
  },
  trpcClient: { content: { update: { mutate: mocks.update } } },
  queryClient: { setQueryData: vi.fn() },
}));
vi.mock("./lib/uploads", () => ({ refreshContent: vi.fn() }));
// Preview and captions have their own tests (ItemMedia.test.tsx)
vi.mock("./ItemMedia", () => ({ ItemPreview: () => null, CaptionsSection: () => null }));

const ID = "abcdefgh12345678";

function item(over: Record<string, unknown> = {}) {
  return {
    publicId: ID,
    kind: "audio",
    title: "Low Tide EP, stems",
    description: null,
    status: "ready",
    processingStep: "done",
    failureReason: null,
    publishState: "draft",
    moderationState: "clear",
    allowDownload: false,
    adult: false,
    chapters: [{ startMs: 0, title: "Tide pools, first light" }],
    durationMs: 1_458_000,
    pageCount: null,
    totalBytes: 1,
    assets: [],
    ...over,
  };
}

describe("ItemEditor (cs3)", () => {
  beforeEach(() => {
    mocks.get.mockResolvedValue(item());
    mocks.update.mockImplementation(async (input: object) => ({ ...item(), ...input }));
  });

  it("fills the fields and autosaves a title change", async () => {
    renderWithProviders(<ItemEditor publicId={ID} onBack={vi.fn()} />);
    const title = await screen.findByLabelText("Title");
    expect(title).toHaveValue("Low Tide EP, stems");
    expect(screen.getByLabelText("Chapter 1 title")).toHaveValue("Tide pools, first light");

    fireEvent.change(title, { target: { value: "  Low Tide EP, all stems " } });
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({ publicId: ID, title: "Low Tide EP, all stems" })
    );
    expect(await screen.findByText(/Autosaved \d\d:\d\d/)).toBeInTheDocument();
  });

  it("does not save an empty title and says so", async () => {
    renderWithProviders(<ItemEditor publicId={ID} onBack={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText("Title"), { target: { value: "  " } });
    expect(await screen.findByText("Add a title.")).toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 900));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("saves chapters only when every row is complete, sorted by start", async () => {
    renderWithProviders(<ItemEditor publicId={ID} onBack={vi.fn()} />);
    await screen.findByLabelText("Title");
    fireEvent.click(screen.getByRole("button", { name: "Add chapter" }));
    expect(
      await screen.findByText("Each chapter needs a start like 6:12 and a title.")
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Chapter 2 title"), { target: { value: "Breakers" } });
    fireEvent.change(screen.getByLabelText("Chapter 2 start, minutes and seconds"), {
      target: { value: "6:12" },
    });
    await waitFor(() =>
      expect(mocks.update).toHaveBeenLastCalledWith({
        publicId: ID,
        chapters: [
          { startMs: 0, title: "Tide pools, first light" },
          { startMs: 372_000, title: "Breakers" },
        ],
      })
    );
  });

  it("offers Everyone only; the other rules show Later", async () => {
    renderWithProviders(<ItemEditor publicId={ID} onBack={vi.fn()} />);
    await screen.findByLabelText("Title");
    const everyone = screen.getByRole("radio", { name: /Everyone/ });
    expect(everyone).toHaveAttribute("aria-checked", "true");
    const paid = screen.getByRole("radio", { name: /Paid/ });
    expect(paid).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByText("Later")).toHaveLength(6);
  });

  it("explains a failed item and keeps the details", async () => {
    mocks.get.mockResolvedValue(item({ status: "failed", failureReason: "stream:ERR_DURATION" }));
    renderWithProviders(<ItemEditor publicId={ID} onBack={vi.fn()} />);
    expect(await screen.findAllByText("Processing failed")).toHaveLength(2);
    expect(screen.getByText(/This video could not be read/)).toBeInTheDocument();
  });

  it("flushes pending edits before going back", async () => {
    const onBack = vi.fn();
    renderWithProviders(<ItemEditor publicId={ID} onBack={onBack} />);
    fireEvent.change(await screen.findByLabelText("Description"), { target: { value: "Stems" } });
    fireEvent.click(screen.getByRole("button", { name: "All content" }));
    await waitFor(() => expect(onBack).toHaveBeenCalled());
    expect(mocks.update).toHaveBeenCalledWith({ publicId: ID, description: "Stems" });
  });
});

describe("rowsToChapters", () => {
  it("returns null while a row is incomplete", () => {
    expect(rowsToChapters([{ key: 1, start: "", title: "A" }])).toBeNull();
    expect(rowsToChapters([{ key: 1, start: "1:00", title: " " }])).toBeNull();
    expect(rowsToChapters([])).toEqual([]);
  });
});
