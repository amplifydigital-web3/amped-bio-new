import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ACCESS_STAKE_DISCLOSURE, TESTNET_NOTICE } from "@repo/constants";
import { renderWithProviders } from "@/test/utils";
import { AccessPicker } from "./AccessPicker";

// Content gating 4.1 (C8): the item editor's "Who can open this".

const mocks = vi.hoisted(() => ({ update: vi.fn(), preview: vi.fn(), ruleUpdate: vi.fn() }));

vi.mock("@repo/ui", async () => ({
  ...(await import("./testUi").then(m => m.prismUi())),
  trpc: {
    blocks: { getAccess: { queryKey: () => ["blocks.getAccess"] } },
    content: {
      get: { queryKey: (input: object) => ["content.get", input] },
      getPreview: {
        queryOptions: (input: { publicId: string }) => ({
          queryKey: ["content.getPreview", input],
          queryFn: () => mocks.preview(input),
        }),
      },
    },
  },
  trpcClient: {
    content: { update: { mutate: mocks.update } },
    access: { rules: { update: { mutate: mocks.ruleUpdate } } },
  },
  queryClient: { invalidateQueries: vi.fn(async () => {}) },
}));

const ID = "abcdefgh12345678";
const allowed = { stakeKindsAllowed: true, poolId: 5 };

describe("AccessPicker", () => {
  beforeEach(() => {
    mocks.update.mockReset().mockResolvedValue({});
    mocks.preview.mockResolvedValue({ blur: null });
    mocks.ruleUpdate.mockReset().mockResolvedValue({ ok: true });
  });

  it("uses the rule summaries and shows Members and Paid as Later", () => {
    renderWithProviders(<AccessPicker publicId={ID} access={null} gating={allowed} />);
    for (const label of [
      "Everyone",
      "Followers",
      "Pool fans",
      "Fans with a minimum stake",
      "Any of these",
    ]) {
      expect(screen.getByRole("radio", { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.queryByText(/Pool members/)).toBeNull();
    expect(screen.getByRole("radio", { name: /Members/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Paid/ })).toBeDisabled();
    expect(screen.getAllByText("Later")).toHaveLength(2);
  });

  it("saves Followers with the Fan Graph helper", async () => {
    renderWithProviders(<AccessPicker publicId={ID} access={null} gating={allowed} />);
    expect(screen.getByText("Anyone who follows you on Amped. Free for fans.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Followers/ }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        publicId: ID,
        access: { kind: "follower", params: {} },
      })
    );
  });

  it("asks for whole tREVO and shows the testnet notice and the disclosure", async () => {
    renderWithProviders(<AccessPicker publicId={ID} access={null} gating={allowed} />);
    fireEvent.click(screen.getByRole("radio", { name: /Fans with a minimum stake/ }));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getByText(TESTNET_NOTICE)).toBeInTheDocument();
    expect(screen.getByText(ACCESS_STAKE_DISCLOSURE)).toBeInTheDocument();
    expect(
      screen.getByText("Whole tREVO. Fans see the amount only when they open the item.")
    ).toBeInTheDocument();
    const input = screen.getByLabelText("Minimum stake");
    fireEvent.change(input, { target: { value: "250" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        publicId: ID,
        access: { kind: "stake_min", params: { poolId: 5, minTrevo: "250" } },
      })
    );
  });

  it("disables stake rules outside the allowlist", () => {
    renderWithProviders(
      <AccessPicker publicId={ID} access={null} gating={{ stakeKindsAllowed: false, poolId: 5 }} />
    );
    expect(screen.getByRole("radio", { name: /Pool fans/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Fans with a minimum stake/ })).toBeDisabled();
    expect(screen.getAllByText("Not available for your page yet.")).toHaveLength(2);
  });

  it("saves Any of these once two rules are picked", async () => {
    renderWithProviders(<AccessPicker publicId={ID} access={null} gating={allowed} />);
    fireEvent.click(screen.getByRole("radio", { name: /Any of these/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Followers/ }));
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Pool fans/ }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        publicId: ID,
        access: {
          kind: "any",
          leaves: [
            { kind: "follower", params: {} },
            { kind: "pool_member", params: { poolId: 5 } },
          ],
        },
      })
    );
    expect(screen.getByText(TESTNET_NOTICE)).toBeInTheDocument();
  });

  it("starts from the item's rule and goes back to Everyone", async () => {
    renderWithProviders(
      <AccessPicker
        publicId={ID}
        access={{
          ruleId: "a".repeat(32),
          valid: true,
          kind: "stake_min",
          params: { poolId: 5, minWei: "100000000000000000000" },
        }}
        gating={allowed}
      />
    );
    expect(screen.getByRole("radio", { name: /Fans with a minimum stake/ })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByLabelText("Minimum stake")).toHaveValue("100");
    fireEvent.click(screen.getByRole("radio", { name: /Everyone/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ publicId: ID, access: null }));
  });

  describe("early access date (G6, delta 4)", () => {
    const RULE = "ab".repeat(16);
    const inline = { ruleId: RULE, valid: true, kind: "follower", name: null, params: {} };

    it("sets Open to everyone on for the item's own rule, as local midnight", async () => {
      renderWithProviders(<AccessPicker publicId={ID} access={inline} gating={allowed} />);
      const input = screen.getByLabelText("Open to everyone on");
      fireEvent.change(input, { target: { value: "2026-12-01" } });
      await waitFor(() =>
        expect(mocks.ruleUpdate).toHaveBeenCalledWith({
          id: RULE,
          opensToAllAt: new Date("2026-12-01T00:00:00").toISOString(),
        })
      );
      expect(await screen.findByText("Date saved.")).toBeInTheDocument();
    });

    it("removes the date", async () => {
      renderWithProviders(
        <AccessPicker
          publicId={ID}
          access={{ ...inline, opensToAllAt: new Date("2026-12-01T00:00:00").toISOString() }}
          gating={allowed}
        />
      );
      expect(screen.getByLabelText("Open to everyone on")).toHaveValue("2026-12-01");
      fireEvent.click(screen.getByRole("button", { name: "Remove date" }));
      await waitFor(() =>
        expect(mocks.ruleUpdate).toHaveBeenCalledWith({ id: RULE, opensToAllAt: null })
      );
    });

    it("is not shown for Everyone or for a saved rule used elsewhere", () => {
      const { unmount } = renderWithProviders(
        <AccessPicker publicId={ID} access={null} gating={allowed} />
      );
      expect(screen.queryByLabelText("Open to everyone on")).toBeNull();
      unmount();
      renderWithProviders(
        <AccessPicker publicId={ID} access={{ ...inline, name: "VIP" }} gating={allowed} />
      );
      expect(screen.queryByLabelText("Open to everyone on")).toBeNull();
    });
  });
});
