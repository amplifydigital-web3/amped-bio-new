import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { BlockAccessFields } from "./BlockAccessFields";

// Access gating G3: Who can open this on a link, media or text block row.

const mocks = vi.hoisted(() => ({ getAccess: vi.fn(), setAccessRule: vi.fn() }));

vi.mock("@repo/ui", async () => ({
  ...(await import("../../content/testUi").then(m => m.prismUi())),
  trpc: {
    blocks: {
      getAccess: {
        queryOptions: (input: { id: number }) => ({
          queryKey: ["blocks.getAccess", input],
          queryFn: () => mocks.getAccess(input),
        }),
        queryKey: (input: { id: number }) => ["blocks.getAccess", input],
      },
    },
  },
  trpcClient: { blocks: { setAccessRule: { mutate: mocks.setAccessRule } } },
  queryClient: { invalidateQueries: vi.fn(async () => {}) },
}));

describe("BlockAccessFields", () => {
  beforeEach(() => {
    mocks.getAccess.mockResolvedValue({
      access: null,
      gating: { stakeKindsAllowed: false, poolId: null },
    });
    mocks.setAccessRule.mockResolvedValue({ gated: true });
  });

  it("opens the picker and locks the block to followers", async () => {
    const onGated = vi.fn();
    renderWithProviders(<BlockAccessFields blockId={12} gated={false} onGatedChange={onGated} />);
    fireEvent.click(screen.getByRole("button", { name: /Who can open this/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /Followers/ }));
    await waitFor(() =>
      expect(mocks.setAccessRule).toHaveBeenCalledWith({
        blockId: 12,
        access: { kind: "follower", params: {} },
      })
    );
    expect(onGated).toHaveBeenCalledWith(true);
    expect(screen.getAllByText("Not available for your page yet.")).toHaveLength(2);
  });
});
