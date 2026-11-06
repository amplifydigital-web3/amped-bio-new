import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import type { BlockType } from "@repo/constants";
import { renderWithProviders } from "@/test/utils";
import { setFeatureFlagOverridesForTests } from "@/config/featureFlags";
import { AddBlockDialog } from "./AddBlockDialog";

// Block Review v2 (#54): the Add block catalog behind blocksV2.

const mocks = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock("@repo/ui", async () => await import("../../content/testUi").then(m => m.prismUi()));
vi.mock("@/utils/ga", () => ({ trackGAEvent: mocks.track }));

const follow = { id: 9, type: "follow", order: 0, config: {} } as unknown as BlockType;

function setup(blocks: BlockType[] = []) {
  const onPick = vi.fn();
  const onOpenExisting = vi.fn();
  renderWithProviders(
    <AddBlockDialog
      open
      onOpenChange={vi.fn()}
      blocks={blocks}
      onAddLink={vi.fn(async () => {})}
      onPick={onPick}
      onOpenExisting={onOpenExisting}
    />
  );
  return { onPick, onOpenExisting };
}

afterEach(() => {
  setFeatureFlagOverridesForTests({});
  mocks.track.mockReset();
});

describe("AddBlockDialog with blocksV2 off", () => {
  it("renders today's sections and no catalog", () => {
    setFeatureFlagOverridesForTests({ blocksV2: false });
    setup();
    expect(screen.getByRole("group", { name: "Media" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Utility" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Search blocks")).toBeNull();
    expect(screen.queryByText("Coming soon")).toBeNull();
  });
});

describe("AddBlockDialog catalog", () => {
  it("lists families, picks an available tile and opens a singleton on the page", () => {
    setFeatureFlagOverridesForTests({ blocksV2: true, fanGraph: true });
    const { onPick, onOpenExisting } = setup([follow]);
    expect(screen.getByRole("button", { name: /Add link/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "All" })).toBeChecked();
    expect(screen.getByRole("heading", { name: /Links and structure/ })).toBeInTheDocument();
    expect(mocks.track).toHaveBeenCalledWith("add_block_opened", "add_block", "");

    fireEvent.click(screen.getByRole("button", { name: /^Text/ }));
    expect(onPick).toHaveBeenCalledWith({ type: "text" });

    const followTile = screen.getByRole("button", { name: /Follow button.*On your page/ });
    fireEvent.click(followTile);
    expect(onOpenExisting).toHaveBeenCalledWith(9);
    expect(screen.getByRole("button", { name: /Followers.*One per page/ })).toBeInTheDocument();
  });

  it("filters by family", () => {
    setFeatureFlagOverridesForTests({ blocksV2: true });
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "Commerce" }));
    expect(screen.getByRole("heading", { name: /Commerce/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Media/ })).toBeNull();
  });

  it("searches live and keeps Coming soon tiles focusable but not pickable", () => {
    setFeatureFlagOverridesForTests({ blocksV2: true });
    const { onPick } = setup();
    fireEvent.change(screen.getByLabelText("Search blocks"), { target: { value: "calendly" } });
    expect(screen.getByRole("heading", { name: "2 blocks match calendly" })).toBeInTheDocument();
    const booking = screen.getByRole("button", { name: /Booking.*Coming soon/ });
    expect(booking).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(booking);
    expect(onPick).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith("add_block_soon_tapped", "add_block", "booking");

    fireEvent.change(screen.getByLabelText("Search blocks"), { target: { value: "youtube" } });
    fireEvent.click(screen.getByRole("button", { name: /^YouTube/ }));
    expect(onPick).toHaveBeenCalledWith({ type: "media", platform: "youtube" });
    expect(mocks.track).toHaveBeenCalledWith("add_block_picked", "add_block", "media,search");
  });

  it("says when nothing matches and offers Suggest a block", () => {
    setFeatureFlagOverridesForTests({ blocksV2: true });
    setup();
    fireEvent.change(screen.getByLabelText("Search blocks"), {
      target: { value: "pinterest board" },
    });
    expect(
      screen.getByText("No blocks match pinterest board. Paste the link above to add it as a link.")
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Suggest a block/ }).length).toBeGreaterThan(0);
    // The count only, never the query text
    expect(mocks.track).toHaveBeenCalledWith("add_block_search_empty", "add_block", "0");
  });
});
