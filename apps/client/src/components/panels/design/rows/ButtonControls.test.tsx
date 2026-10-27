import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ButtonControls } from "./ButtonControls";
import { buttonRowValue, currentButtonShape } from "../kit/surfaceLook";

// Theme Engine v2 phase 2, Buttons row (board 07, Screen Review row 145).

function setup(props: Partial<Parameters<typeof ButtonControls>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <ButtonControls
      shape="rounded"
      border="none"
      layout="label"
      disabled={false}
      onChange={onChange}
      {...props}
    />
  );
  return onChange;
}

describe("ButtonControls", () => {
  it("shows five shapes, six borders and three layouts with the current ones checked", () => {
    setup({ shape: "ticket", border: "hairline", layout: "icon" });
    expect(screen.getAllByRole("radio")).toHaveLength(14);
    expect(screen.getByRole("radio", { name: "Ticket" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Hairline" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Icon slot" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("writes the shape, the border and the layout", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("radio", { name: "Squircle" }));
    expect(onChange).toHaveBeenLastCalledWith({ buttonShape: "squircle" });
    fireEvent.click(screen.getByRole("radio", { name: "Glow" }));
    expect(onChange).toHaveBeenLastCalledWith({ buttonBorder: "glow" });
    fireEvent.click(screen.getByRole("radio", { name: "Split" }));
    expect(onChange).toHaveBeenLastCalledWith({ buttonLayout: "split" });
  });

  it("explains Split", () => {
    setup({ layout: "split" });
    expect(screen.getByText("Split adds a chevron at the right.")).toBeInTheDocument();
  });

  it("writes nothing on a locked theme", () => {
    const onChange = setup({ disabled: true });
    fireEvent.click(screen.getByRole("radio", { name: "Pill" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("buttons row helpers", () => {
  it("reads the stored shape, or the style's own", () => {
    expect(currentButtonShape(0)).toBe("rounded");
    expect(currentButtonShape(1)).toBe("pill");
    expect(currentButtonShape(0, "cut")).toBe("cut");
  });

  it("names the style, then the shape and border when set (board 07)", () => {
    expect(buttonRowValue("Soft", "rounded", "none")).toBe("Soft");
    expect(buttonRowValue("Soft", "pill", "hairline")).toBe("Soft, Pill, Hairline");
  });
});
