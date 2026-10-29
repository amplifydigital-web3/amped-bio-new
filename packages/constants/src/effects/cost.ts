import type { ThemeConfigV2 } from "../theme";
import { findEffect } from "./registry";
import type { EffectCost } from "./types";

/**
 * Page cost (spec 3.7, decision 1): still 0, light 1, heavy 3. A page over 3
 * is Heavy: weak devices see the still version of its moving layers. The
 * editor's cost chip reads this; the counts name what moves.
 */

const POINTS: Readonly<Record<EffectCost, number>> = { still: 0, light: 1, heavy: 3 };

/** One moving part of the page, with the label the cost chip names. */
export interface CostPart {
  layer: string;
  label: string;
  cost: EffectCost;
}

export interface PageCost {
  points: number;
  /** Still: nothing moves. Light: within the budget. Heavy: over it. */
  level: "still" | "light" | "heavy";
  parts: CostPart[];
}

/** The page budget from decision 1: 1 heavy or 3 light. */
export const PAGE_BUDGET = 3;

export function pageCost(v2: ThemeConfigV2): PageCost {
  const parts: CostPart[] = [];
  const add = (layer: string, id: string | undefined) => {
    const entry = id ? findEffect(id) : undefined;
    if (!entry || entry.retired || entry.cost === "still") return;
    parts.push({ layer, label: entry.label, cost: entry.cost });
  };
  const base = v2.scene.base;
  if (base.type === "gradient" && (base.drift || base.mesh)) {
    parts.push({ layer: "scene", label: base.mesh ? "Mesh gradient" : "Drift", cost: "light" });
  }
  if (base.type === "shader") add("scene", base.id);
  add("scene", v2.scene.overlay?.id);
  add("container", v2.container.id);
  add("button", v2.button.id);
  add("buttonHover", v2.buttonHover.id);
  add("buttonPress", v2.buttonPress.id);
  add("name", v2.name.id);
  add("cursor", v2.cursor.id);
  const points = parts.reduce((sum, part) => sum + POINTS[part.cost], 0);
  const level = points === 0 ? "still" : points > PAGE_BUDGET ? "heavy" : "light";
  return { points, level, parts };
}
