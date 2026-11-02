import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ContentBlockFields, hiddenReason } from "./ContentBlockFields";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@repo/ui", async () => ({
  ...(await import("../../content/testUi").then(m => m.prismUi())),
  trpc: {
    content: {
      list: {
        queryOptions: (input: object) => ({
          queryKey: ["content.list", input],
          queryFn: () => mocks.list(input),
        }),
      },
    },
  },
}));
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }));

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  publicId: id.padEnd(16, "0"),
  title: `Item ${id}`,
  kind: "video",
  status: "ready",
  publishState: "published",
  moderationState: "clear",
  adult: false,
  ...extra,
});

beforeEach(() => {
  mocks.list.mockResolvedValue({
    items: [row("a"), row("b", { publishState: "draft" }), row("c", { status: "failed" })],
  });
});

describe("hiddenReason", () => {
  it("names why an item will not show yet", () => {
    expect(hiddenReason(row("a"))).toBeNull();
    expect(hiddenReason(row("a", { publishState: "draft" }))).toMatch(/Draft/);
    expect(hiddenReason(row("a", { status: "processing" }))).toBe("Processing");
    expect(hiddenReason(row("a", { moderationState: "held" }))).toBe("In review");
    expect(hiddenReason(row("a", { adult: true }))).toMatch(/18\+/);
  });
});

describe("ContentBlockFields", () => {
  it("picks items from the library in order, skipping failed ones", async () => {
    const onValid = vi.fn();
    renderWithProviders(
      <ContentBlockFields
        config={{ label: "Latest", layout: "featured", publicIds: [] }}
        onValid={onValid}
      />
    );
    const first = await screen.findByRole("checkbox", { name: /Item a/ });
    expect(screen.queryByRole("checkbox", { name: /Item c/ })).toBeNull();
    fireEvent.click(first);
    expect(onValid).toHaveBeenLastCalledWith({
      label: "Latest",
      layout: "featured",
      publicIds: ["a000000000000000"],
    });
  });

  it("reorders, removes and changes the layout", async () => {
    const onValid = vi.fn();
    renderWithProviders(
      <ContentBlockFields
        config={{ label: "", layout: "grid", publicIds: ["a000000000000000", "b000000000000000"] }}
        onValid={onValid}
      />
    );
    fireEvent.click(await screen.findByRole("button", { name: "Move Item b up" }));
    expect(onValid).toHaveBeenLastCalledWith(
      expect.objectContaining({ publicIds: ["b000000000000000", "a000000000000000"] })
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Item a from this block" }));
    expect(onValid).toHaveBeenLastCalledWith(
      expect.objectContaining({ publicIds: ["b000000000000000"] })
    );
    expect(screen.getByText("Draft, publish to show")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    expect(onValid).toHaveBeenLastCalledWith(expect.objectContaining({ layout: "list" }));
  });
});
