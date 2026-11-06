/**
 * Access gating G3 on the public page: a locked link, text or media block,
 * the unlock sheet, unlock in place, and links through /go.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TESTNET_NOTICE, type AccessDecision, type BlockType } from "@repo/constants";

const mocks = vi.hoisted(() => ({ openBlock: vi.fn(), follow: vi.fn() }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/trpc", () => ({
  trpcClient: {
    access: { openBlock: { query: mocks.openBlock } },
    follow: { follow: { mutate: mocks.follow } },
  },
}));
vi.mock("@/components/blocks/MediaBlock", () => ({
  MediaBlock: ({ block }: any) => <div data-testid="media">{block.config.url}</div>,
}));

import { GatedBlock, goHref, stakeNoticeBlockId } from "./GatedBlock";

const theme = {} as any;
const refused = (over: Partial<AccessDecision> = {}): AccessDecision => ({
  allowed: false,
  reason: "not_follower",
  hint: { action: "follow", creatorHandle: "maya" },
  rule: null,
  checkedAt: "2026-11-03T10:00:00.000Z",
  ...over,
});
const allowed: AccessDecision = {
  ...refused(),
  allowed: true,
  reason: "ok",
  hint: { action: "none" },
};

const locked = (type: "link" | "text" | "media", config: Record<string, string>, stake = false) =>
  ({
    id: 31,
    type,
    order: 0,
    config,
    gated: true,
    gate: stake
      ? {
          kind: "pool_member",
          summary: "Pool fans",
          stake: true,
          poolAddress: "0x" + "b".repeat(40),
        }
      : { kind: "follower", summary: "Followers", stake: false },
  }) as unknown as BlockType;

beforeEach(() => {
  mocks.openBlock.mockReset();
  mocks.follow.mockReset();
});

describe("GatedBlock", () => {
  it("shows a locked link with the rule and no destination", () => {
    const { container } = render(
      <GatedBlock
        block={locked("link", { label: "VIP room", platform: "locked" })}
        theme={theme}
        handle="maya"
        decision={null}
        onChanged={vi.fn()}
      />
    );
    expect(screen.getByText("VIP room, Locked, Followers")).toBeInTheDocument();
    expect(container.querySelector("a")).toBeNull();
  });

  it("links through /go once checkPage says the viewer qualifies", () => {
    render(
      <GatedBlock
        block={locked("link", { label: "VIP room", platform: "locked" })}
        theme={theme}
        handle="maya"
        decision={allowed}
        onChanged={vi.fn()}
      />
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", goHref(31));
  });

  it("opens the unlock sheet, follows, and shows the text in place", async () => {
    mocks.openBlock
      .mockResolvedValueOnce({ decision: refused(), block: null })
      .mockResolvedValueOnce({
        decision: allowed,
        block: { kind: "text", content: "The door code is 4417", platform: "text" },
      });
    mocks.follow.mockResolvedValue({ pending: false });
    const onChanged = vi.fn();
    render(
      <GatedBlock
        block={locked("text", { label: "", platform: "text" })}
        theme={theme}
        handle="maya"
        decision={null}
        onChanged={onChanged}
      />
    );
    expect(screen.queryByText(/4417/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Locked post/ }));
    expect(await screen.findByText("Follow to open this")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Follow" }));
    await waitFor(() => expect(screen.getByText("The door code is 4417")).toBeInTheDocument());
    expect(onChanged).toHaveBeenCalled();
  });

  it("opens the sheet from ?unlock with the stake notices on a pool rule", async () => {
    mocks.openBlock.mockResolvedValue({
      decision: refused({ reason: "not_pool_member", hint: { action: "view_pool", poolId: 5 } }),
      block: null,
    });
    render(
      <GatedBlock
        block={locked("media", { label: "Studio session", platform: "youtube" }, true)}
        theme={theme}
        handle="maya"
        decision={null}
        autoOpen
        onChanged={vi.fn()}
      />
    );
    expect(await screen.findByText("You have no stake in this pool")).toBeInTheDocument();
    expect(screen.getByText(TESTNET_NOTICE)).toBeInTheDocument();
  });

  it("plays a media block in place for a viewer who qualifies", async () => {
    mocks.openBlock.mockResolvedValue({
      decision: allowed,
      block: {
        kind: "media",
        url: "https://youtube.com/watch?v=x",
        label: "Studio",
        platform: "youtube",
      },
    });
    render(
      <GatedBlock
        block={locked("media", { label: "Studio", platform: "youtube" })}
        theme={theme}
        handle="maya"
        decision={allowed}
        onChanged={vi.fn()}
      />
    );
    expect(await screen.findByTestId("media")).toHaveTextContent("https://youtube.com/watch?v=x");
  });
});

describe("stake notice on the page (GQ2-2, decision D2)", () => {
  it("sits under the first block behind a stake rule, once per page", () => {
    const follower = { ...locked("link", { label: "VIP" }), id: 1 };
    const stakeA = { ...locked("text", { label: "" }, true), id: 2 };
    const stakeB = { ...locked("media", { label: "Clip" }, true), id: 3 };
    expect(stakeNoticeBlockId([follower, stakeA, stakeB])).toBe(2);
    expect(stakeNoticeBlockId([follower])).toBeNull();
    expect(stakeNoticeBlockId([{ id: 9, gated: false }])).toBeNull();
  });
});
