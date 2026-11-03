import { renderToStaticMarkup } from "react-dom/server";
import type { EffectEntry } from "@repo/constants";
import {
  FULLSCREEN_VERTEX,
  createProgram,
  dprCapFor,
  hexToVec3,
  startShader,
} from "../src/motion/webgl";
import { ShaderLayer, shaderSpeed } from "../src/creator/shader-layer";

// Theme Engine v2 phase 3a (TE-3a): the shared WebGL engine pulled out of the
// landing hero, and the scene layer that paints a poster before it.

type Loose = Record<string, any>;

/** A WebGL context that records what the engine asks of it. */
function fakeGl(options: { compiles?: boolean; links?: boolean } = {}) {
  const calls: { name: string; args: unknown[] }[] = [];
  const record =
    (name: string, value: unknown = undefined) =>
    (...args: unknown[]) => {
      calls.push({ name, args });
      return value;
    };
  const lost = { count: 0 };
  const gl: Loose = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    TRIANGLES: 8,
    createShader: record("createShader", {}),
    shaderSource: record("shaderSource"),
    compileShader: record("compileShader"),
    getShaderParameter: () => options.compiles ?? true,
    deleteShader: record("deleteShader"),
    createProgram: record("createProgram", {}),
    attachShader: record("attachShader"),
    linkProgram: record("linkProgram"),
    getProgramParameter: () => options.links ?? true,
    useProgram: record("useProgram"),
    createBuffer: record("createBuffer", {}),
    bindBuffer: record("bindBuffer"),
    bufferData: record("bufferData"),
    getAttribLocation: () => 0,
    enableVertexAttribArray: record("enableVertexAttribArray"),
    vertexAttribPointer: record("vertexAttribPointer"),
    getUniformLocation: (_p: unknown, name: string) => ({ name }),
    uniform1f: record("uniform1f"),
    uniform2f: record("uniform2f"),
    uniform3f: record("uniform3f"),
    uniform4f: record("uniform4f"),
    viewport: record("viewport"),
    drawArrays: record("drawArrays"),
    getExtension: () => ({ loseContext: () => lost.count++ }),
  };
  return { gl, calls, lost };
}

let frames: ((now: number) => void)[] = [];

function setupWindow() {
  frames = [];
  const listeners: Record<string, (() => void)[]> = {};
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: true }),
    devicePixelRatio: 3,
    addEventListener: (type: string, fn: () => void) => (listeners[type] ??= []).push(fn),
    removeEventListener: () => {},
  });
  vi.stubGlobal("document", {
    hidden: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal("requestAnimationFrame", (fn: (now: number) => void) => {
    frames.push(fn);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("performance", { now: () => 0 });
}

/** Runs queued frames, each 16 ms apart unless a step is given. */
function run(count: number, step = 16, from = 16) {
  let now = from;
  for (let i = 0; i < count; i++) {
    const next = frames.shift();
    if (!next) return now;
    next(now);
    now += step;
  }
  return now;
}

function canvasWith(gl: Loose | null) {
  return { getContext: () => gl, width: 0, height: 0 } as unknown as HTMLCanvasElement;
}

const host = {
  getBoundingClientRect: () => ({ width: 400, height: 300, left: 0, top: 0 }),
} as unknown as HTMLElement;

afterEach(() => vi.unstubAllGlobals());

describe("startShader", () => {
  beforeEach(setupWindow);

  it("returns null without WebGL, or when the shader does not compile or link", () => {
    const onSlow = vi.fn();
    expect(startShader({ canvas: canvasWith(null), host, fragment: "x", onSlow })).toBeNull();
    const bad = fakeGl({ compiles: false });
    expect(startShader({ canvas: canvasWith(bad.gl), host, fragment: "x", onSlow })).toBeNull();
    const unlinked = fakeGl({ links: false });
    expect(createProgram(unlinked.gl as WebGLRenderingContext, "x")).toBeNull();
  });

  it("draws the full screen triangle with time, size, pointer and the caller's uniforms", () => {
    const { gl, calls } = fakeGl();
    const canvas = canvasWith(gl);
    const onFirstFrame = vi.fn();
    const handle = startShader({
      canvas,
      host,
      fragment: "void main(){}",
      uniforms: { uIntensity: 0.5, uColorA: [1, 0, 0] },
      dprCap: 2,
      onSlow: vi.fn(),
      onFirstFrame,
    });
    expect(handle).not.toBeNull();
    expect(calls.find(c => c.name === "shaderSource")?.args[1]).toBe(FULLSCREEN_VERTEX);
    // The pixel ratio is capped: 400 x 300 at 2
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
    expect(calls).toContainEqual({ name: "uniform1f", args: [{ name: "uIntensity" }, 0.5] });
    expect(calls).toContainEqual({ name: "uniform3f", args: [{ name: "uColorA" }, 1, 0, 0] });
    expect(calls).toContainEqual({ name: "uniform2f", args: [{ name: "uRes" }, 400, 300] });
    run(3);
    expect(calls.filter(c => c.name === "drawArrays")).toHaveLength(3);
    expect(onFirstFrame).toHaveBeenCalledTimes(1);
    handle!.update({ uIntensity: 0.9 });
    expect(calls).toContainEqual({ name: "uniform1f", args: [{ name: "uIntensity" }, 0.9] });
  });

  it("speed 0 draws one frame and holds it", () => {
    const { gl, calls } = fakeGl();
    startShader({ canvas: canvasWith(gl), host, fragment: "x", speed: 0, onSlow: vi.fn() });
    run(5);
    expect(calls.filter(c => c.name === "drawArrays")).toHaveLength(1);
    expect(frames).toHaveLength(0);
  });

  it("stops, frees the context and calls onSlow when the median frame is over 28 ms", () => {
    const { gl, lost } = fakeGl();
    const onSlow = vi.fn();
    startShader({ canvas: canvasWith(gl), host, fragment: "x", onSlow });
    run(60, 40);
    expect(onSlow).toHaveBeenCalledTimes(1);
    expect(lost.count).toBe(1);
    expect(frames).toHaveLength(0);
  });

  it("keeps running on a fast device and stop frees the context once", () => {
    const { gl, lost } = fakeGl();
    const onSlow = vi.fn();
    const handle = startShader({ canvas: canvasWith(gl), host, fragment: "x", onSlow });
    run(60, 16);
    expect(onSlow).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    handle!.stop();
    handle!.stop();
    expect(lost.count).toBe(1);
  });
});

describe("engine helpers", () => {
  it("reads theme hex colors as vec3 and caps the pixel ratio per device", () => {
    expect(hexToVec3("#ff8000")).toEqual([1, 128 / 255, 0]);
    expect(hexToVec3("nope")).toEqual([0, 0, 0]);
    expect(dprCapFor("strong")).toBe(2);
    expect(dprCapFor("typical")).toBe(1.5);
    expect(dprCapFor(undefined)).toBe(1.5);
    expect(dprCapFor("weak")).toBe(1);
  });

  it("maps Speed 0 to 100 onto the time multiplier", () => {
    expect(shaderSpeed({})).toBe(1);
    expect(shaderSpeed({ speed: 50 })).toBe(1);
    expect(shaderSpeed({ speed: 100 })).toBe(2);
    expect(shaderSpeed({ speed: 0 })).toBe(0);
  });
});

const COLORS = { button: "#5650a2", buttonText: "#ffffff", container: "#ffffff", text: "#16152b" };

const SCENE: EffectEntry = {
  id: "scene.test-glow",
  layer: "scene",
  label: "Test glow",
  description: "A test scene",
  tier: "showcase",
  engine: "webgl",
  cost: "heavy",
  source: "amped",
  colorMode: "theme",
  params: {
    speed: { kind: "range", min: 0, max: 100, step: 1, default: 50, label: "Speed" },
  },
  loop: true,
  render: {
    kind: "webgl",
    shader: "void main(){}",
    uniforms: (_p, c) => ({ uColor: hexToVec3(c.button) }),
    poster: c => `radial-gradient(circle at 50% 40%, ${c.button}, ${c.text})`,
  },
  preview: { sample: "scene", video: true },
  addedIn: 2,
};

describe("ShaderLayer", () => {
  it("paints the poster first, in the creator's colors, with the canvas hidden", () => {
    const html = renderToStaticMarkup(<ShaderLayer entry={SCENE} colors={COLORS} showcase />);
    expect(html).toContain('data-effect="scene.test-glow"');
    expect(html).toContain('data-state="poster"');
    expect(html).toContain("radial-gradient(circle at 50% 40%, #5650a2, #16152b)");
    expect(html).toContain("opacity:0");
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders nothing for an entry that is not a WebGL scene", () => {
    const particles = { ...SCENE, engine: "particles", render: { kind: "none" } } as EffectEntry;
    expect(renderToStaticMarkup(<ShaderLayer entry={particles} colors={COLORS} showcase />)).toBe(
      ""
    );
    expect(renderToStaticMarkup(<ShaderLayer entry={null} colors={COLORS} />)).toBe("");
    expect(
      renderToStaticMarkup(<ShaderLayer entry={{ ...SCENE, retired: true }} colors={COLORS} />)
    ).toBe("");
  });
});
