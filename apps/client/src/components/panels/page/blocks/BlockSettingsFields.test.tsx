import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { BlockType } from "@repo/constants";
import { renderWithProviders } from "@/test/utils";
import { BlockSettingsFields, keepSettings } from "./BlockSettingsFields";
import { utcToZonedWall } from "./scheduleTime";

// Block Review v2 (#54): the Block settings row on a saved block.

vi.mock("@repo/ui", async () => ({
  ...(await import("../../content/testUi").then(m => m.prismUi())),
  trpc: { blocks: { getAccess: { queryOptions: () => ({ queryKey: ["x"], queryFn: vi.fn() }) } } },
  trpcClient: {},
  queryClient: { invalidateQueries: vi.fn(async () => {}) },
}));

const link = (config: Record<string, unknown> = {}): BlockType =>
  ({
    id: 7,
    type: "link",
    order: 0,
    config: { platform: "custom", url: "https://maravale.shop", label: "Kiln sale", ...config },
  }) as BlockType;

function setup(block: BlockType, extra: Partial<Parameters<typeof BlockSettingsFields>[0]> = {}) {
  const onChange = vi.fn();
  const onClearAttention = vi.fn();
  renderWithProviders(
    <BlockSettingsFields
      block={block}
      title="Kiln sale"
      onChange={onChange}
      attentionHolder={null}
      onClearAttention={onClearAttention}
      lockable={false}
      gated={false}
      onGatedChange={vi.fn()}
      {...extra}
    />
  );
  return { onChange, onClearAttention };
}

describe("BlockSettingsFields", () => {
  it("shows four rows with their values in the button names", () => {
    setup(link());
    expect(screen.getByRole("button", { name: /Schedule.*Always on/ })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.getByRole("button", { name: /Attention.*Off/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Motion.*Entrance on/ })).toBeInTheDocument();
    // Read only: not a button, and it says why
    expect(screen.queryByRole("button", { name: /Who can open this/ })).toBeNull();
    expect(screen.getByText("Everyone")).toBeInTheDocument();
  });

  it("says a block that cannot be locked is not available", () => {
    setup({ id: 4, type: "follow", order: 0, config: { label: "Follow" } } as BlockType);
    expect(screen.getByText("Not available on this block")).toBeInTheDocument();
  });

  it("sends messaging blocks to Inbox settings", () => {
    setup({ id: 3, type: "message", order: 0, config: { label: "Message me" } } as BlockType);
    expect(screen.getByText("Set in Inbox settings")).toBeInTheDocument();
  });

  it("keeps one row open at a time", () => {
    setup(link());
    const schedule = screen.getByRole("button", { name: /Schedule/ });
    const motion = screen.getByRole("button", { name: /Motion/ });
    fireEvent.click(schedule);
    expect(schedule).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(schedule.getAttribute("aria-controls")!)).not.toBeNull();
    fireEvent.click(motion);
    expect(schedule).toHaveAttribute("aria-expanded", "false");
    expect(motion).toHaveAttribute("aria-expanded", "true");
  });

  it("shows schedule errors under the field and never saves them", () => {
    const { onChange } = setup(link());
    fireEvent.click(screen.getByRole("button", { name: /Schedule/ }));
    const goLive = screen.getByLabelText("Go live");
    const expire = screen.getByLabelText("Expire");

    fireEvent.change(goLive, { target: { value: "2099-11-10T20:00" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const saved = onChange.mock.calls[0][0];
    expect(saved).toMatchObject({ url: "https://maravale.shop", label: "Kiln sale" });
    // Stored in UTC, read back as the same wall time in the stored zone
    expect(utcToZonedWall(saved.schedule.start, saved.schedule.zone)).toBe("2099-11-10T20:00");

    fireEvent.change(expire, { target: { value: "2099-11-09T20:00" } });
    expect(screen.getByText("Expire must be after Go live")).toBeInTheDocument();
    expect(expire).toHaveAttribute("aria-invalid", "true");
    expect(expire.getAttribute("aria-describedby")).toContain(
      screen.getByText("Expire must be after Go live").closest("p")!.id
    );
    expect(onChange).toHaveBeenCalledTimes(1);

    fireEvent.change(goLive, { target: { value: "" } });
    fireEvent.change(expire, { target: { value: "2020-01-01T10:00" } });
    expect(screen.getByText("Pick a time in the future")).toBeInTheDocument();
    // Clearing Go live saved an Expire only schedule; the past Expire did not save
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][0].schedule.start).toBeUndefined();
    expect(onChange.mock.calls[1][0].schedule.end).toBeDefined();
  });

  it("clears the schedule", () => {
    const { onChange } = setup(
      link({
        schedule: { start: "2099-11-06T20:00:00.000Z", zone: "Europe/Lisbon", showCountdown: true },
      })
    );
    fireEvent.click(screen.getByRole("button", { name: /Schedule/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clear schedule" }));
    const saved = onChange.mock.calls[0][0];
    expect("schedule" in saved).toBe(false);
    expect(saved.label).toBe("Kiln sale");
  });

  it("moves attention here from the block that has it", () => {
    const { onChange, onClearAttention } = setup(link(), {
      attentionHolder: { id: 2, title: "Shop the kiln sale", preset: "shimmer" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Attention/ }));
    expect(
      screen.getByText(
        "Only one block can ask for attention. Shop the kiln sale has it now. Move it here?"
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move here" }));
    expect(onClearAttention).toHaveBeenCalledWith(2);
    expect(onChange.mock.calls[0][0]).toMatchObject({
      label: "Kiln sale",
      attention: { preset: "shimmer" },
    });
  });

  it("picking a preset while another block has one moves it", () => {
    const { onChange, onClearAttention } = setup(link(), {
      attentionHolder: { id: 2, title: "Shop the kiln sale", preset: "shimmer" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Attention/ }));
    const group = screen.getByRole("group", { name: "Attention" });
    expect(within(group).getAllByRole("radio")).toHaveLength(6);
    fireEvent.click(within(group).getByRole("radio", { name: /Glow/ }));
    expect(onClearAttention).toHaveBeenCalledWith(2);
    expect(onChange.mock.calls[0][0].attention).toEqual({ preset: "glow" });
  });

  it("saves motion choices", () => {
    const { onChange } = setup(link());
    fireEvent.click(screen.getByRole("button", { name: /Motion/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Rise" }));
    expect(onChange.mock.calls[0][0].motion).toEqual({ entrance: true, style: "rise" });
  });
});

describe("keepSettings", () => {
  it("keeps saved settings when a block's own fields send a config", () => {
    const current = link({ attention: { preset: "pop" } }).config;
    const next = { platform: "custom", url: "https://x.com", label: "New" } as BlockType["config"];
    expect(keepSettings(current, next)).toEqual({ ...next, attention: { preset: "pop" } });
  });
});
