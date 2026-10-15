import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

/** Child that throws during render when told to. */
function Bomb({ explode, label }: { explode: boolean; label: string }) {
  if (explode) throw new Error(`Boom ${label}`);
  return <div>{label}</div>;
}

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div>all good</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("renders the fallback when a child throws", () => {
    const onError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={error => <div>caught: {error?.message}</div>}>
        <Bomb explode label="first" />
      </ErrorBoundary>
    );
    expect(screen.getByText("caught: Boom first")).toBeInTheDocument();
    onError.mockRestore();
  });

  it("resets and re-renders children when the child tree changes", () => {
    const onError = vi.spyOn(console, "error").mockImplementation(() => {});
    function Parent() {
      const [explode, setExplode] = useState(true);
      return (
        <>
          <ErrorBoundary fallback={<div aria-label="fallback" />}>
            {explode ? <Bomb explode label="again" /> : <div>fixed now</div>}
          </ErrorBoundary>
          <button onClick={() => setExplode(false)}>fix</button>
        </>
      );
    }
    render(<Parent />);
    expect(screen.getByLabelText("fallback")).toBeInTheDocument();

    fireEvent.click(screen.getByText("fix"));
    expect(screen.getByText("fixed now")).toBeInTheDocument();
    onError.mockRestore();
  });
});
