import { fireEvent, render, screen } from "@testing-library/react";
import { SurfaceControls } from "./SurfaceControls";
import { containerRowValue, currentShape } from "../kit/surfaceLook";

// Theme Engine v2 phase 2, Container row (board 03, Screen Review row 141).

function setup(props: Partial<Parameters<typeof SurfaceControls>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <SurfaceControls
      shape="rounded"
      border="none"
      disabled={false}
      noSurface={false}
      onChange={onChange}
      {...props}
    />
  );
  return onChange;
}

describe("SurfaceControls", () => {
  it("shows six shapes and six borders with the current ones checked", () => {
    setup({ shape: "squircle", border: "glow" });
    expect(screen.getByRole("radiogroup", { name: "Container shape" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Squircle" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Glow" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByRole("radio")).toHaveLength(12);
  });

  it("writes the shape and the border", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("radio", { name: "Cut corners" }));
    expect(onChange).toHaveBeenLastCalledWith({ containerShape: "cut" });
    fireEvent.click(screen.getByRole("radio", { name: "Dashed" }));
    expect(onChange).toHaveBeenLastCalledWith({ containerBorder: "dashed" });
  });

  it("rests with a reason when no surface is picked", () => {
    const onChange = setup({ noSurface: true });
    expect(screen.getByRole("radio", { name: "Pill" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Pill" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Pick a surface to change its shape and border.")).toBeInTheDocument();
  });
});

describe("container row helpers", () => {
  it("reads the stored shape, or the surface's own", () => {
    expect(currentShape(1)).toBe("rounded");
    expect(currentShape(8)).toBe("arch");
    expect(currentShape(1, "blob")).toBe("blob");
  });

  it("names the surface, then the shape and border when set", () => {
    expect(containerRowValue("Frosted glass", "rounded", "none", true)).toBe("Frosted glass");
    expect(containerRowValue("Frosted glass", "squircle", "glow", true)).toBe(
      "Frosted glass, Squircle, Glow"
    );
    expect(containerRowValue("None", "pill", "glow", false)).toBe("None");
  });
});
