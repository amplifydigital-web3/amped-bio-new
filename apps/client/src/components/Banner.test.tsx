import { describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Banner } from "./Banner";

const go = vi.fn();

vi.mock("./shell/ShellNavigation", () => ({
  useShellNavigation: () => ({ go }),
}));

// Keep decoupled from the whole @repo/ui surface: only the button and the
// class merge helper are used here. The real Button needs the full ui index,
// which pulls in better-auth and other browser-only modules.
vi.mock("@repo/ui", () => ({
  Button: ({ children, onClick, ...props }: PropsWithChildren<{ onClick?: () => void }>) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" "),
}));

describe("Banner", () => {
  it("renders an info notice with status role", () => {
    render(<Banner message="Welcome back" />);
    expect(screen.getByRole("status")).toHaveTextContent("Welcome back");
  });

  it("renders an error notice with alert role and action needed prefix", () => {
    render(<Banner message="Save failed" type="error" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Action needed Save failed");
  });

  it("does not render when the message was dismissed before", () => {
    const key = "amped:dismissed-announcement";
    // Same hash Banner computes for type info + message
    let hash = 0;
    const input = `info:already dismissed`;
    for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) | 0;
    localStorage.setItem(key, String(hash));

    render(<Banner message="already dismissed" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("dismisses and persists the choice in localStorage", () => {
    render(<Banner message="Dismiss me" />);
    fireEvent.click(screen.getByLabelText("Dismiss announcement"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(localStorage.getItem("amped:dismissed-announcement")).not.toBeNull();
  });

  it("renders an Open button only when a destination panel is set and navigates on click", () => {
    render(<Banner message="New theme" panel="gallery" />);
    fireEvent.click(screen.getByRole("button", { name: /Open Design/i }));
    expect(go).toHaveBeenCalledWith("design", { tab: "themes" });
  });

  it("renders no Open button when no panel is set", () => {
    render(<Banner message="Just a notice" />);
    expect(screen.queryByRole("button", { name: /Open/i })).not.toBeInTheDocument();
  });
});
