import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { ADULT_FAN_COPY, ALABAMA_HEALTH_WARNINGS } from "@repo/constants";
import { renderWithProviders } from "@/test/utils";

const mocks = vi.hoisted(() => ({
  user: { id: 20, handle: "fan" } as { id: number; handle: string } | null,
  checks: vi.fn(),
  recheck: vi.fn(),
}));

vi.mock("@repo/ui", async importOriginal => ({
  ...(await importOriginal<typeof import("@repo/ui")>()),
  useAuth: () => ({ authUser: mocks.user, isPending: false }),
  trpc: {
    identity: {
      myChecks: {
        queryOptions: () => ({ queryKey: ["identity.myChecks"], queryFn: () => mocks.checks() }),
      },
      recheck: {
        mutationOptions: (opts: object = {}) => ({
          mutationFn: (input: unknown) => mocks.recheck(input),
          ...opts,
        }),
      },
    },
  },
}));
vi.mock("@/components/panels/wallet/rns/identity/catalog", () => ({
  AUTHBASE_VERIFY_URL: "https://authbase.test/sso/amped?returnTo=%2Fverify",
  AUTHBASE_CONSENT_URL: "https://authbase.test/sso/amped?returnTo=%2Fconsent",
}));

import { AgeCheckPage, safeReturnTo, stateFor } from "./AgeCheck";

const assign = vi.fn();

function renderSheet(returnTo = "https://amped.bio/maya/adult") {
  return renderWithProviders(
    <MemoryRouter initialEntries={[`/age-check?returnTo=${encodeURIComponent(returnTo)}`]}>
      <Routes>
        <Route path="/age-check" element={<AgeCheckPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mocks.user = { id: 20, handle: "fan" };
  mocks.checks.mockReset();
  mocks.recheck.mockReset();
  assign.mockReset();
  sessionStorage.clear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign, href: "http://app.test/age-check" },
  });
});

describe("safeReturnTo", () => {
  it("keeps same host paths and public site URLs, and drops anything else", () => {
    expect(safeReturnTo("/pay/abc", "https://amped.bio")).toBe("/pay/abc");
    expect(safeReturnTo("https://amped.bio/maya/adult", "https://amped.bio")).toBe(
      "https://amped.bio/maya/adult"
    );
    expect(safeReturnTo("//evil.test/x", "https://amped.bio")).toBe("https://amped.bio");
    expect(safeReturnTo("https://evil.test/x", "https://amped.bio")).toBe("https://amped.bio");
    expect(safeReturnTo("javascript:alert(1)", "https://amped.bio")).toBe("https://amped.bio");
    expect(safeReturnTo(null, "https://amped.bio")).toBe("https://amped.bio");
  });
});

describe("stateFor", () => {
  it("maps each reason to one sheet state", () => {
    expect(stateFor("not_linked")).toBe("verify");
    expect(stateFor("not_verified")).toBe("verify");
    expect(stateFor("no_wallet")).toBe("verify");
    expect(stateFor("not_shared")).toBe("share");
    expect(stateFor("under_18")).toBe("under_18");
    expect(stateFor("unavailable")).toBe("unavailable");
  });
});

describe("the Over 18 sheet", () => {
  it("asks a signed out fan to sign in, with the warnings", async () => {
    mocks.user = null;
    renderSheet();
    expect(await screen.findByText(ADULT_FAN_COPY.signedOut)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: ADULT_FAN_COPY.signIn })).toBeInTheDocument();
    for (const line of ALABAMA_HEALTH_WARNINGS) expect(screen.getByText(line)).toBeInTheDocument();
  });

  it("shows Verify, then checks again on Continue and opens on a pass", async () => {
    mocks.checks.mockResolvedValue({ ageOver18: { pass: false, reason: "not_linked" } });
    mocks.recheck.mockResolvedValue({ pass: true, validUntil: "2027-01-01T00:00:00Z" });
    renderSheet();
    expect(await screen.findByText(ADULT_FAN_COPY.verify)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: ADULT_FAN_COPY.continue }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://amped.bio/maya/adult"));
    expect(mocks.recheck.mock.calls[0]![0]).toEqual({ kind: "age_over_18" });
  });

  it("shows Share for a verified fan who has not shared Over 18", async () => {
    mocks.checks.mockResolvedValue({ ageOver18: { pass: false, reason: "not_shared" } });
    renderSheet();
    expect(await screen.findByText(ADULT_FAN_COPY.share)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ADULT_FAN_COPY.shareAction })).toBeInTheDocument();
  });

  it("refuses under 18 with no retry", async () => {
    mocks.checks.mockResolvedValue({ ageOver18: { pass: false, reason: "under_18" } });
    renderSheet();
    expect(await screen.findByText(ADULT_FAN_COPY.under18)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ADULT_FAN_COPY.tryAgain })).toBeNull();
    expect(screen.queryByRole("button", { name: ADULT_FAN_COPY.continue })).toBeNull();
  });

  it("offers Try again when Authbase is down", async () => {
    mocks.checks.mockResolvedValue({ ageOver18: { pass: false, reason: "unavailable" } });
    renderSheet();
    expect(await screen.findByText(ADULT_FAN_COPY.unavailable)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ADULT_FAN_COPY.tryAgain })).toBeInTheDocument();
  });

  it("checks fresh with no tap when the fan comes back from Authbase", async () => {
    sessionStorage.setItem("amped:age-check-pending", "1");
    mocks.checks.mockResolvedValue({ ageOver18: { pass: false, reason: "not_shared" } });
    mocks.recheck.mockResolvedValue({ pass: true, validUntil: "2027-01-01T00:00:00Z" });
    renderSheet("/pay/abc");
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/pay/abc"));
  });

  it("opens at once for a fan who already passed", async () => {
    mocks.checks.mockResolvedValue({ ageOver18: { pass: true, validUntil: "2027-01-01" } });
    renderSheet();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://amped.bio/maya/adult"));
  });
});
