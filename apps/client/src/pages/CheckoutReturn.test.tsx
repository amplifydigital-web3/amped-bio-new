import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { CheckoutReturnPage } from "./CheckoutReturn";

const ID = "ab".repeat(16);

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/r/:intentId" element={<CheckoutReturnPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("CheckoutReturnPage (mobile checkout 9)", () => {
  it("says the USDC is on its way and names nothing about the purchase", () => {
    const { container } = renderAt(`/r/${ID}`);
    expect(
      screen.getByText("Your USDC is on its way. Go back to Amped.Bio to finish.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Amped.Bio" }).getAttribute("href")).toBe(
      `/pay/${ID}`
    );
    expect(container.textContent).not.toMatch(/\$|@/);
  });

  it("an unknown id links home", () => {
    renderAt("/r/nope");
    expect(screen.getByRole("link", { name: "Open Amped.Bio" }).getAttribute("href")).toBe("/");
  });
});
