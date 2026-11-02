import { useSyncExternalStore } from "react";
import { AlertTriangle, Pause, Play } from "lucide-react";
import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  contrastRatio,
  lookCost,
  lookFor,
  parseHex,
  playingOverlay,
  cn,
  type Rgb,
} from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { useBackgroundColors } from "@/components/panels/design/kit/useDesign";
import { usePreviewTheme } from "./previewHooks";

// Theme Engine v2 editor chrome (spec 3.7, 3.10; boards 01 and 08). Above the
// preview: the page cost chip, or the scene guard when the name or bio is hard
// to read over a moving scene. Below the size tabs: Device budget and Pause
// motion, for the preview only, remembered for this browser session.

export type PreviewDevice = "strong" | "typical" | "weak";

const DEVICE_KEY = "amped:preview-device";
const PAUSED_KEY = "amped:preview-paused";
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice still holds until the page reloads
  }
  memory.set(key, value);
  listeners.forEach(listener => listener());
}

const memory = new Map<string, string>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function useStored(key: string, fallback: string): string {
  return useSyncExternalStore(
    subscribe,
    () => memory.get(key) ?? read(key) ?? fallback,
    () => fallback
  );
}

/** Device budget and Pause motion for the editor preview. */
export function usePreviewMotion(): { device: PreviewDevice; paused: boolean } {
  const device = useStored(DEVICE_KEY, "typical");
  const paused = useStored(PAUSED_KEY, "0") === "1";
  return {
    device: device === "strong" || device === "weak" ? device : "typical",
    paused,
  };
}

const DEVICE_LABELS: Record<PreviewDevice, string> = {
  strong: "Strong",
  typical: "Typical",
  weak: "Weak",
};

export function PreviewMotionControls() {
  const { device, paused } = usePreviewMotion();
  return (
    <div className="flex items-center gap-2">
      <Tabs value={device} onValueChange={value => write(DEVICE_KEY, value)} className="flex-1">
        <TabsList aria-label="Device budget" className="w-full">
          {(Object.keys(DEVICE_LABELS) as PreviewDevice[]).map(value => (
            <TabsTrigger key={value} value={value} className="flex-1">
              {DEVICE_LABELS[value]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Button
        variant="secondary"
        aria-pressed={paused}
        onClick={() => write(PAUSED_KEY, paused ? "0" : "1")}
      >
        {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
        {paused ? "Play motion" : "Pause motion"}
      </Button>
    </div>
  );
}

const plural = (n: number) => `${n} ${n === 1 ? "effect" : "effects"}`;

/** The cost chip line (spec 3.7): Light or Heavy with the count. */
export function costLine(level: "still" | "light" | "heavy", count: number): string {
  if (level === "still") return "Still. Nothing on your page moves.";
  if (level === "light") return `Light, ${plural(count)}.`;
  return `Heavy, ${plural(count)}. Weak phones see the still version. Everything else stays.`;
}

function worstRatio(text: Rgb, backgrounds: Rgb[]): number {
  return Math.min(...backgrounds.map(bg => contrastRatio(text, bg)));
}

export interface SceneGuard {
  part: "name" | "bio";
  ratio: number;
  needs: number;
  over: string;
}

/**
 * The scene guard (board 08, decision 11): with no surface behind the text,
 * measure the text color against the colors of the scene (gradient stops, the
 * photo's mean color). Name needs 3:1, the bio 4.5:1. Returns the first part
 * that fails, or null.
 */
export function sceneGuard(input: {
  surface: boolean;
  moving: boolean;
  fontColor: string | undefined;
  backgrounds: Rgb[] | null;
  over: string;
}): SceneGuard | null {
  if (input.surface || !input.moving || !input.backgrounds?.length) return null;
  const text = parseHex(input.fontColor ?? "");
  if (!text) return null;
  const ratio = worstRatio(text, input.backgrounds);
  if (ratio < 3) return { part: "name", ratio, needs: 3, over: input.over };
  if (ratio < 4.5) return { part: "bio", ratio, needs: 4.5, over: input.over };
  return null;
}

function formatRatio(ratio: number) {
  return `${(Math.floor(ratio * 10) / 10).toFixed(1)}:1`;
}

export function PreviewCostLine() {
  const { theme, updateThemeConfig } = useEditor();
  const previewTheme = usePreviewTheme();
  const config = previewTheme.config;
  const look = lookFor(config);
  const cost = lookCost(look);
  const backgrounds = useBackgroundColors(config.background);
  const background = config.background;
  const overlay = playingOverlay(look);
  const base = look.v2.scene.base;
  const moving =
    overlay !== null ||
    background?.type === "image" ||
    background?.type === "video" ||
    (base.type === "gradient" && (base.drift || base.mesh));
  const guard = sceneGuard({
    surface: look.container.id !== "container.none",
    moving,
    fontColor: config.fontColor,
    backgrounds,
    over: overlay?.label ?? "your background",
  });
  const locked = theme.user_id === null;

  if (guard) {
    const who = guard.part === "name" ? "Name" : "Your bio";
    return (
      <div
        role="status"
        className="flex items-start gap-2 rounded-prism-13 bg-[#fff4e0] px-3 py-2 text-prism-meta text-[#5c3b00]"
      >
        <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="flex-1">
          {who} over {guard.over} measures {formatRatio(guard.ratio)}. It needs {guard.needs}:1 to
          read on every frame.
        </p>
        <Button
          variant="secondary"
          size="sm"
          disabled={locked}
          onClick={() => updateThemeConfig({ containerStyle: 1 })}
        >
          Add a surface
        </Button>
      </div>
    );
  }

  const count = cost.parts.length;
  return (
    <p role="status" className="flex items-center gap-2 px-1 text-prism-meta text-prism-ink-2">
      <span
        aria-hidden
        className={cn(
          "inline-block h-2 w-2 shrink-0 rounded-full",
          cost.level === "heavy"
            ? "bg-[#7a4f00]"
            : cost.level === "light"
              ? "bg-[#17693f]"
              : "bg-prism-line"
        )}
      />
      {costLine(cost.level, count)}
    </p>
  );
}
