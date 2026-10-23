import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { PublishCard, publicItemUrl, type PublishItem } from "./PublishCard";
import { CONTENT_COPY } from "./copy";

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  unpublish: vi.fn(),
  remove: vi.fn(),
  abort: vi.fn(),
  setQueryData: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@repo/ui", async () => ({
  ...(await import("./testUi").then(m => m.prismUi())),
  useAuth: () => ({ authUser: { handle: "maya" } }),
  trpc: { content: { get: { queryKey: (input: object) => ["content.get", input] } } },
  trpcClient: {
    content: {
      publish: { mutate: mocks.publish },
      unpublish: { mutate: mocks.unpublish },
      delete: { mutate: mocks.remove },
      abortUpload: { mutate: mocks.abort },
    },
  },
  queryClient: { setQueryData: mocks.setQueryData },
}));
vi.mock("./lib/uploads", () => ({ refreshContent: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: { add: mocks.toast } }));

const e = CONTENT_COPY.editor;
const base: PublishItem = {
  publicId: "abcdefgh12345678",
  title: "Low Tide EP",
  status: "ready",
  publishState: "draft",
  moderationState: "clear",
  adult: false,
};

beforeEach(() => Object.values(mocks).forEach(fn => fn.mockReset()));

describe("PublishCard", () => {
  it("publishes a ready draft and updates the cached item", async () => {
    mocks.publish.mockResolvedValue({ ...base, publishState: "published" });
    renderWithProviders(<PublishCard item={base} onDeleted={vi.fn()} />);
    expect(screen.getByText(e.publishTitleDraft)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: e.publish }));
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith({ publicId: base.publicId }));
    expect(mocks.setQueryData).toHaveBeenCalled();
  });

  it("explains why it can not publish yet", () => {
    renderWithProviders(
      <PublishCard item={{ ...base, status: "processing" }} onDeleted={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: e.publish })).toBeDisabled();
    expect(screen.getByText(e.publishProcessing)).toBeInTheDocument();
    renderWithProviders(
      <PublishCard item={{ ...base, moderationState: "held" }} onDeleted={vi.fn()} />
    );
    expect(screen.getByText(e.publishReview)).toBeInTheDocument();
  });

  it("shows the public link and Unpublish once published, and the 18+ note", async () => {
    mocks.unpublish.mockResolvedValue({ ...base });
    renderWithProviders(
      <PublishCard item={{ ...base, publishState: "published" }} onDeleted={vi.fn()} />
    );
    expect(screen.getByRole("link", { name: e.viewPublicLabel })).toHaveAttribute(
      "href",
      publicItemUrl("maya", base.publicId)
    );
    fireEvent.click(screen.getByRole("button", { name: e.unpublish }));
    await waitFor(() => expect(mocks.unpublish).toHaveBeenCalled());

    renderWithProviders(
      <PublishCard item={{ ...base, publishState: "published", adult: true }} onDeleted={vi.fn()} />
    );
    expect(screen.getByText(e.publishAdult)).toBeInTheDocument();
  });

  it("deletes a ready item for 30 days, and removes a failed upload at once", async () => {
    mocks.remove.mockResolvedValue({ restorableUntil: new Date() });
    const onDeleted = vi.fn();
    renderWithProviders(<PublishCard item={base} onDeleted={onDeleted} />);
    expect(screen.getByText(e.deleteHelp)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: e.deleteItem }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(mocks.remove).toHaveBeenCalledWith({ publicId: base.publicId });
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: e.deleted(base.title) })
    );

    mocks.abort.mockResolvedValue({});
    renderWithProviders(<PublishCard item={{ ...base, status: "failed" }} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: e.deleteItem }).at(-1)!);
    await waitFor(() => expect(mocks.abort).toHaveBeenCalled());
  });

  it("shows the server's reason when publishing fails", async () => {
    const { TRPCClientError } = await import("@trpc/client");
    mocks.publish.mockRejectedValue(
      Object.assign(new TRPCClientError("This item is in review."), {
        data: { code: "BAD_REQUEST" },
      })
    );
    renderWithProviders(<PublishCard item={base} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: e.publish }));
    expect(await screen.findByText("This item is in review.")).toBeInTheDocument();
  });
});
