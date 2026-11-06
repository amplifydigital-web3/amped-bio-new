import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  looks: {
    limit: 10,
    count: 2,
    appliedId: 1,
    looks: [
      {
        id: 1,
        name: "Summer",
        config: {},
        updated_at: new Date().toISOString(),
        versions: 3,
        share_slug: null,
      },
      {
        id: 2,
        name: "Night",
        config: {},
        updated_at: new Date().toISOString(),
        versions: 1,
        share_slug: "abcdefgh",
      },
    ],
  },
  theme: { id: 1, user_id: 7, name: "Summer", config: { particlesEffect: 3 } },
}));

vi.mock("@repo/ui", async original => {
  const actual = (await original()) as Record<string, unknown>;
  const query = (key: string, data: () => unknown) => ({
    queryOptions: () => ({ queryKey: [key], queryFn: async () => data() }),
    queryKey: () => [key],
  });
  return {
    ...actual,
    trpc: {
      theme: {
        looks: query("looks", () => mocks.looks),
        history: query("history", () => ({ versions: [] })),
        themeOfTheWeek: query("week", () => null),
      },
    },
    trpcClient: { theme: {}, user: { edit: { mutate: vi.fn() } } },
  };
});
vi.mock("@/contexts/EditorContext", () => ({
  useEditor: () => ({
    theme: mocks.theme,
    profile: { handle: "alice", name: "Alice", bio: "", photoUrl: "" },
    setPreviewOverride: vi.fn(),
    setUser: vi.fn(),
    flushSave: vi.fn(async () => true),
  }),
}));
vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }));
vi.mock("../share/ShareLookDialog", () => ({ ShareLookDialog: () => null }));

import { CurrentLookCard, MyLooksShelf } from "./LooksSections";
import { LIMIT_REASON } from "./looksLook";

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  mocks.looks.count = 2;
});

describe("Themes tab looks sections (TE-4c)", () => {
  it("My looks shows the count, the tiles and which look is applied", async () => {
    wrap(<MyLooksShelf onImport={() => undefined} mobile={false} />);
    await waitFor(() => expect(screen.getByText("2 of 10")).toBeTruthy());
    expect(
      screen.getByRole("button", { name: "Summer, applied" }).getAttribute("aria-pressed")
    ).toBe("true");
    expect(screen.getByRole("button", { name: "Night" })).toBeTruthy();
    expect(screen.getByText("Shared")).toBeTruthy();
    expect(screen.getByText("Import file")).toBeTruthy();
  });

  it("the current look card names the look, its layers and cost, and offers sharing", async () => {
    wrap(<CurrentLookCard onJump={() => undefined} />);
    expect(screen.getByText("Current look")).toBeTruthy();
    expect(screen.getByText("Snow")).toBeTruthy();
    expect(screen.getByText("Light, 1 effect.")).toBeTruthy();
    expect(screen.getByText("Copy share link")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save as new look" }).hasAttribute("disabled")).toBe(
      false
    );
  });

  it("at 10 of 10, Save as new look is disabled with the reason", async () => {
    mocks.looks.count = 10;
    wrap(<CurrentLookCard onJump={() => undefined} />);
    await waitFor(() => expect(screen.getByText(LIMIT_REASON)).toBeTruthy());
    expect(screen.getByRole("button", { name: "Save as new look" }).hasAttribute("disabled")).toBe(
      true
    );
  });
});
