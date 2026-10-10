import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AuthContextType } from "@repo/ui";
import { ProtectedRoute } from "./ProtectedRoute";

const keepUnsavedEdits = vi.fn();
const replace = vi.fn();

let auth: Partial<AuthContextType>;

vi.mock("@repo/ui", () => ({
  useAuth: () => auth,
}));

vi.mock("@/contexts/EditorContext", () => ({
  useEditor: () => ({ keepUnsavedEdits: () => keepUnsavedEdits() }),
}));

vi.mock("./shell/ShellGate", () => ({
  ShellPending: ({ onRetry }: { onRetry: () => void }) => (
    <div>
      pending <button onClick={onRetry}>retry</button>
    </div>
  ),
  signInUrl: () => "/login?returnTo=http://localhost/explore",
}));

const originalLocation = window.location;

beforeEach(() => {
  keepUnsavedEdits.mockClear();
  replace.mockClear();
  // jsdom's Location.replace is not configurable, so swap the whole object
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { replace: (url: string) => replace(url) },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

describe("ProtectedRoute", () => {
  it("renders children for a signed-in user", () => {
    auth = { isPending: false, authUser: { id: 1 } as never };
    render(
      <ProtectedRoute>
        <div>private content</div>
      </ProtectedRoute>
    );
    expect(screen.getByText("private content")).toBeInTheDocument();
  });

  it("shows the pending shell while the session is loading", () => {
    auth = { isPending: true, authUser: null };
    render(
      <ProtectedRoute>
        <div>private content</div>
      </ProtectedRoute>
    );
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.queryByText("private content")).not.toBeInTheDocument();
  });

  it("keeps unsaved edits and redirects to sign in when signed out", () => {
    auth = { isPending: false, authUser: null };
    render(
      <ProtectedRoute>
        <div>private content</div>
      </ProtectedRoute>
    );

    expect(keepUnsavedEdits).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/login?returnTo=http://localhost/explore");
  });
});
