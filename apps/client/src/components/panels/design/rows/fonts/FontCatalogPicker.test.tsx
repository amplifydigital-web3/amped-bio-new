import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ThemeConfig } from "@repo/constants";
import {
  FontCatalogPicker,
  currentBodyFont,
  currentNameFont,
  fontPatch,
  fontsValue,
} from "./FontCatalogPicker";

// Theme Engine v2 phase 2b, fonts PR 1 (board 02, Screen Review row 140).

const state = vi.hoisted(() => ({
  config: {} as ThemeConfig,
  locked: false,
  update: vi.fn(),
  preview: vi.fn(),
  endPreview: vi.fn(),
}));

vi.mock("../../kit/useDesign", () => ({
  useDesign: () => ({
    config: state.config,
    values: {
      fontFamily: state.config.fontFamily ?? "Inter",
      fontSize: state.config.fontSize ?? "16px",
      fontColor: "#16152b",
      containerColor: "#ffffff",
      transparency: 100,
    },
    profile: { name: "Maya Rivera" },
    locked: state.locked,
    update: state.update,
    preview: state.preview,
    endPreview: state.endPreview,
  }),
  cardFill: () => ({}),
}));

vi.mock("../../kit/CreatorArt", () => ({
  CreatorBackdrop: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  state.config = { fontFamily: "Figtree" };
  state.locked = false;
  state.update.mockReset();
  state.preview.mockReset();
});

describe("font fields", () => {
  it("reads the v1 look when the theme has no name face", () => {
    expect(currentNameFont({}, "Lora")).toEqual({ family: "Lora", weight: 700 });
    expect(currentBodyFont({}, "Lora")).toEqual({ family: "Lora", weight: 400 });
    expect(fontsValue({}, "Lora")).toBe("Lora");
    expect(fontsValue({ nameFont: { family: "Syne" } }, "Lora")).toBe("Syne and Lora");
  });

  it("writes the body family to fontFamily and keeps a plain body style off the theme", () => {
    expect(fontPatch("body", { family: "Lora", weight: 400 })).toEqual({
      fontFamily: "Lora",
      bodyFontStyle: undefined,
    });
    expect(fontPatch("body", { family: "Lora", weight: 600, italic: true })).toEqual({
      fontFamily: "Lora",
      bodyFontStyle: { weight: 600, italic: true },
    });
    expect(fontPatch("name", { family: "Syne", weight: 800 })).toEqual({
      nameFont: { family: "Syne", weight: 800 },
    });
  });
});

describe("FontCatalogPicker", () => {
  it("loads the catalog and shows the Popular shelf as tiles in the creator's name", async () => {
    render(<FontCatalogPicker />);
    const grid = await screen.findByRole("radiogroup", { name: "Name font" });
    expect(within(grid).getAllByRole("radio")).toHaveLength(8);
    expect(screen.getByRole("searchbox", { name: "Search fonts" })).toHaveAttribute(
      "placeholder",
      expect.stringMatching(/^Search 1,9\d\d families$/)
    );
    expect(within(grid).getAllByText("Maya Rivera").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^See all 1,9\d\d families$/ })).toBeInTheDocument();
  });

  it("writes the picked name face at the current weight", async () => {
    render(<FontCatalogPicker />);
    fireEvent.change(await screen.findByRole("searchbox", { name: "Search fonts" }), {
      target: { value: "Fraunces" },
    });
    fireEvent.click(await screen.findByRole("radio", { name: "Fraunces, variable" }));
    expect(state.update).toHaveBeenLastCalledWith({
      nameFont: { family: "Fraunces", weight: 700 },
    });
  });

  it("writes the body face to fontFamily from the Body font tab", async () => {
    render(<FontCatalogPicker />);
    await screen.findByRole("radiogroup", { name: "Name font" });
    const tab = screen.getByRole("tab", { name: "Body font" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    fireEvent.keyDown(tab, { key: "Enter" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search fonts" }), {
      target: { value: "Lora" },
    });
    await waitFor(() => screen.getByRole("radiogroup", { name: "Body font" }));
    fireEvent.click(screen.getByRole("radio", { name: "Lora, variable" }));
    expect(state.update).toHaveBeenLastCalledWith({ fontFamily: "Lora", bodyFontStyle: undefined });
  });

  it("sets both faces from a pairing", async () => {
    render(<FontCatalogPicker />);
    await screen.findByRole("radiogroup", { name: "Name font" });
    fireEvent.click(screen.getByRole("radio", { name: "Pairings" }));
    fireEvent.click(screen.getByRole("radio", { name: "Fraunces and Figtree" }));
    expect(state.update).toHaveBeenLastCalledWith({
      nameFont: { family: "Fraunces", weight: 700 },
      fontFamily: "Figtree",
      bodyFontStyle: undefined,
    });
  });

  it("offers italics, optical size and a weight slider only where the face has them", async () => {
    state.config = { fontFamily: "Figtree", nameFont: { family: "Fraunces", weight: 700 } };
    const { unmount } = render(<FontCatalogPicker />);
    expect(await screen.findByRole("slider", { name: "Weight" })).toHaveAttribute(
      "aria-valuetext",
      "700 Bold"
    );
    expect(screen.getByRole("slider", { name: "Optical size" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Italic" }));
    expect(state.update).toHaveBeenLastCalledWith({
      nameFont: { family: "Fraunces", weight: 700, italic: true },
    });
    unmount();

    state.config = { fontFamily: "Figtree", nameFont: { family: "Bebas Neue", weight: 400 } };
    render(<FontCatalogPicker />);
    expect(
      await screen.findByText("Bebas Neue comes in one weight, 400 Regular.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("says so when no family matches the search", async () => {
    render(<FontCatalogPicker />);
    fireEvent.change(await screen.findByRole("searchbox", { name: "Search fonts" }), {
      target: { value: "zzzz" },
    });
    expect(screen.getByRole("status")).toHaveTextContent('No family matches "zzzz"');
  });

  it("does not write on a locked theme", async () => {
    state.locked = true;
    render(<FontCatalogPicker />);
    const grid = await screen.findByRole("radiogroup", { name: "Name font" });
    fireEvent.click(within(grid).getAllByRole("radio")[1]);
    expect(state.update).not.toHaveBeenCalled();
  });
});
