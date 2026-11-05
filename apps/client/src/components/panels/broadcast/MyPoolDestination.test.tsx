import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { renderWithProviders } from "@/test/utils";

const state = vi.hoisted(() => ({
  overview: null as null | Record<string, unknown>,
  navigate: vi.fn(),
}));

vi.mock("@repo/ui", async importOriginal => {
  const actual = await importOriginal<typeof import("@repo/ui")>();
  return {
    ...actual,
    trpc: {
      broadcast: {
        creator: {
          overview: {
            queryOptions: () => ({
              queryKey: ["overview"],
              queryFn: async () => state.overview,
            }),
          },
        },
      },
    },
  };
});
vi.mock("wagmi", () => ({ useChainId: () => 1 }));
vi.mock("react-router", async importOriginal => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => state.navigate,
}));
vi.mock("./utils", async importOriginal => ({
  ...(await importOriginal<typeof import("./utils")>()),
  BROADCAST_ON: true,
}));
vi.mock("../createrewardpool/CreatorPoolPanel", () => ({
  CreatorPoolPanel: () => <div>Pool panel</div>,
}));

import { MyPoolDestination } from "./MyPoolDestination";

const render = () =>
  renderWithProviders(
    <MemoryRouter>
      <MyPoolDestination />
    </MemoryRouter>
  );

describe("My Pool Broadcast card (M9, spec 8.6 item 4)", () => {
  it("shows the last broadcast and opens New broadcast with Pool stakers picked", async () => {
    state.overview = {
      pool: { id: 9, name: "Tide" },
      last: { id: 4, title: "Studio week", createdAt: new Date().toISOString() },
    };
    render();
    expect(await screen.findByText("Studio week")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Broadcasts" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Broadcast" }));
    expect(state.navigate).toHaveBeenCalledWith("/inbox/broadcast/new?audience=pool");
    expect(screen.getByText("Pool panel")).toBeInTheDocument();
  });

  it("shows no card without a pool", async () => {
    state.overview = { pool: null, last: null };
    render();
    expect(await screen.findByText("Pool panel")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Broadcast" })).not.toBeInTheDocument();
  });
});
