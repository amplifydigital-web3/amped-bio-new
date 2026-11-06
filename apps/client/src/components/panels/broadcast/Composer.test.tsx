import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { BROADCAST_LIMITS, TESTNET_NOTICE } from "@repo/constants";
import { renderWithProviders } from "@/test/utils";

const send = vi.hoisted(() => vi.fn(async () => ({ id: 9, status: "QUEUED" })));
vi.mock("@repo/ui", async importOriginal => {
  const actual = await importOriginal<typeof import("@repo/ui")>();
  return {
    ...actual,
    trpcClient: { broadcast: { creator: { send: { mutate: send } } } },
  };
});
vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }));

import { Composer } from "./Composer";
import { quotaLine } from "./CreatorBroadcasts";

const counts = { pool: 3, followers: 10, total: 11 };

function setup(props: Partial<Parameters<typeof Composer>[0]> = {}) {
  return renderWithProviders(
    <Composer
      chainId="1"
      poolName="Tide Circle"
      counts={counts}
      creatorName="Maya Lin"
      leftToday={3}
      nextSendReviewed={false}
      onCancel={vi.fn()}
      onSent={vi.fn()}
      {...props}
    />
  );
}

function write(title = "New release", body = "It is out now.") {
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: title } });
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: body } });
}

beforeEach(() => send.mockClear());

describe("broadcast composer audience picker (M9, spec 8.6 item 3)", () => {
  it("shows each count and the deduplicated total for Both", () => {
    setup();
    expect(screen.getByRole("radio", { name: "Pool stakers" })).toBeChecked();
    expect(screen.getByText("3 people")).toBeInTheDocument();
    expect(screen.getByText("10 people")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Both" }));
    expect(screen.getByText(/11 people get it in their Amped.Bio inbox/)).toBeInTheDocument();
    write();
    expect(screen.getByRole("button", { name: "Send to 11 people" })).toBeEnabled();
  });

  it("sends the picked audience", async () => {
    setup({ initialAudience: "FOLLOWERS" });
    write();
    fireEvent.click(screen.getByRole("button", { name: "Send to 10 people" }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ audience: "FOLLOWERS" }))
    );
  });

  it("without a pool only Followers can be picked", () => {
    setup({ poolName: null, initialAudience: "POOL_MEMBERS" });
    expect(screen.getByRole("radio", { name: "Followers" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Pool stakers" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Both" })).toBeDisabled();
  });

  it("an empty audience cannot send and says why", () => {
    setup({ counts: { pool: 0, followers: 0, total: 0 }, initialAudience: "FOLLOWERS" });
    write();
    expect(screen.getByText(/Nobody follows you yet\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send to 0 people" })).toBeDisabled();
  });

  it("the preview carries the Testnet notice for pool stakers or pool language", () => {
    setup({ initialAudience: "FOLLOWERS" });
    write("Studio news", "New songs this week.");
    expect(screen.queryByText(TESTNET_NOTICE)).not.toBeInTheDocument();
    write("Studio news", "Thanks for staking with me.");
    expect(screen.getByText(TESTNET_NOTICE)).toBeInTheDocument();
    write("Studio news", "New songs this week.");
    fireEvent.click(screen.getByRole("radio", { name: "Pool stakers" }));
    expect(screen.getByText(TESTNET_NOTICE)).toBeInTheDocument();
  });
});

describe("quota line (spec 8.6 item 2)", () => {
  it("names the daily and the weekly cap", () => {
    expect(quotaLine({ leftToday: 2, usedThisWeek: 1 })).toBe("2 of 3 left today");
    expect(quotaLine({ leftToday: 0, usedThisWeek: 3 })).toMatch(/^3 of 3 sent today/);
    expect(quotaLine({ leftToday: 0, usedThisWeek: BROADCAST_LIMITS.perWeek })).toMatch(
      /^10 of 10 this week/
    );
  });
});
