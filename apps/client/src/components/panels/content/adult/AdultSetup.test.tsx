import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { ADULT_SETUP_COPY } from "@repo/constants";
import { renderWithProviders } from "@/test/utils";

const setup = vi.hoisted(() => ({
  value: {
    enabled: false,
    disabledByAmped: false,
    disabledReason: null,
    over18: { pass: true },
    seller: { pass: false, reason: "no_name" },
    policy: { accepted: null, current: "1.1", ok: false },
    custodian: { named: false },
  } as any,
}));

vi.mock("@repo/ui", async importOriginal => {
  const actual = await importOriginal<typeof import("@repo/ui")>();
  const q = (key: string, value: () => unknown) => ({
    queryOptions: () => ({ queryKey: [key], queryFn: value }),
    queryKey: () => [key],
  });
  const m = () => ({
    mutationOptions: (o: object = {}) => ({ mutationFn: vi.fn(async () => ({})), ...o }),
  });
  return {
    ...actual,
    trpc: {
      adult: {
        getSetup: q("adult.getSetup", () => setup.value),
        acceptPolicy: m(),
        setCustodian: m(),
        enable: m(),
        disable: m(),
        people: { list: q("adult.people", () => []), invite: m(), countersign: m() },
      },
    },
  };
});

import { AdultSetup } from "./AdultSetup";

describe("Adult content setup (5.1)", () => {
  it("lists the five rows in order and keeps Turn on 18+ off until every step passes", async () => {
    renderWithProviders(<AdultSetup />);
    expect(await screen.findByText(ADULT_SETUP_COPY.over18)).toBeInTheDocument();
    expect(screen.getByText(ADULT_SETUP_COPY.policy("1.1"))).toBeInTheDocument();
    expect(screen.getByText(ADULT_SETUP_COPY.custodian)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ADULT_SETUP_COPY.turnOn })).toBeDisabled();
  });
});
