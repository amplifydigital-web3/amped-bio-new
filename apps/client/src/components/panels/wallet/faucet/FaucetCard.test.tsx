import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { TESTNET_NOTICE } from "@repo/constants";
import { renderWithProviders } from "@/test/utils";

// BRIEF rule 2 and QA CK-Q60: wherever tREVO shows, the testnet line is TESTNET_NOTICE verbatim.

// Each test may override the faucet state (#225: a claim queued for the daily batch)
const faucetOverrides: Record<string, unknown> = {};
vi.mock("./useFaucet", () => ({
  useFaucet: () => ({
    state: "ready",
    amount: 100,
    currency: "tREVO",
    requirements: { photo: true, background: true, bio: true, minLinks: true },
    doneCount: 4,
    nextAvailable: null,
    arrivesBy: null,
    requestError: null,
    request: vi.fn(),
    retry: vi.fn(),
    ...faucetOverrides,
  }),
}));
vi.mock("@/contexts/EditorContext", () => ({ useEditor: () => ({ blocks: [] }) }));
vi.mock("../../home/VideoPlayerDialog", () => ({ VideoPlayerDialog: () => null }));

import FaucetCard from "./FaucetCard";

describe("FaucetCard testnet line", () => {
  it("shows TESTNET_NOTICE and no card specific testnet line", () => {
    renderWithProviders(
      <MemoryRouter>
        <FaucetCard />
      </MemoryRouter>
    );
    expect(screen.getByText(TESTNET_NOTICE)).toBeInTheDocument();
    expect(screen.queryByText(/no cash value/)).toBeNull();
  });

  it("tells a fan with a queued claim that tREVO comes with the next daily batch", () => {
    Object.assign(faucetOverrides, {
      state: "sent",
      arrivesBy: new Date("2026-11-07T14:00:00Z"),
    });
    renderWithProviders(
      <MemoryRouter>
        <FaucetCard />
      </MemoryRouter>
    );
    expect(screen.getByText(/arrives with the next daily batch, by/)).toBeInTheDocument();
    expect(screen.getByText(TESTNET_NOTICE)).toBeInTheDocument();
    for (const key of Object.keys(faucetOverrides)) delete faucetOverrides[key];
  });
});
