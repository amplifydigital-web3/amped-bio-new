import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { TESTNET_NOTICE } from "@repo/constants";
import { renderWithProviders } from "@/test/utils";

// BRIEF rule 2 and QA CK-Q60: wherever tREVO shows, the testnet line is TESTNET_NOTICE verbatim.

vi.mock("./useFaucet", () => ({
  useFaucet: () => ({
    state: "ready",
    amount: 100,
    currency: "tREVO",
    requirements: { photo: true, background: true, bio: true, minLinks: true },
    doneCount: 4,
    nextAvailable: null,
    requestError: null,
    request: vi.fn(),
    retry: vi.fn(),
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
});
