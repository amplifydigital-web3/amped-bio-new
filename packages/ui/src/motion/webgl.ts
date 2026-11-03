// The shared WebGL engine (Theme Engine v2 decision 13, phase 3a, PR TE-3a).
// Raw WebGL, one full screen triangle, no library: the setup the landing hero
// shipped with in the motion layer (#26, #291), pulled out so the hero and the
// creator page showcase scenes run on the same code. About 2 KB.
//
// Every shader gets the same inputs:
//   uTime  seconds since start, scaled by speed
//   uRes   the host's CSS size in px
//   uPtr   the pointer in 0..1 (y up), eased; drifts on touch
//   uOn    0..1, how present the pointer is (0 when it leaves)
//   vUv    0..1 across the host
// plus any uniforms the caller passes (float, vec2, vec3, vec4).

import { createFrameWatchdog } from "./watchdog";

export const FULLSCREEN_VERTEX = `attribute vec2 position;varying vec2 vUv;
void main(){vUv=position*0.5+0.5;gl_Position=vec4(position,0.0,1.0);}`;

export type UniformValue = number | readonly number[];

export interface ShaderOptions {
  canvas: HTMLCanvasElement;
  /** The element whose size the canvas takes and whose visibility is watched. */
  host: HTMLElement;
  /** Fragment shader source (GLSL ES 1.0). */
  fragment: string;
  /** Pointer events are read here. Omit for no pointer (uOn stays 0). */
  pointerArea?: HTMLElement | null;
  /** Static uniforms, set once and again on update(). */
  uniforms?: Readonly<Record<string, UniformValue>>;
  /** Device pixel ratio cap: 2 on strong, 1.5 typical, 1 weak (spec 3.6). */
  dprCap?: number;
  /** Time multiplier. 0 holds the first frame. */
  speed?: number;
  /** The touch drift when no fine pointer is present (the hero's decision 6). */
  touchDrift?: boolean;
  /** Clear color is opaque; pass true for a scene drawn over a poster. */
  alpha?: boolean;
  /** The frame watchdog found the device too slow; the caller keeps its still version. */
  onSlow: () => void;
  /** The first frame drew; the caller can fade the canvas in. */
  onFirstFrame?: () => void;
}

export interface ShaderHandle {
  /** Replaces uniforms (a param or color change) without a new context. */
  update: (uniforms: Readonly<Record<string, UniformValue>>) => void;
  /** Stops the loop and frees the context. */
  stop: () => void;
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

/** Links the full screen triangle program, or null when the browser refuses. */
export function createProgram(gl: WebGLRenderingContext, fragment: string) {
  const vs = compile(gl, gl.VERTEX_SHADER, FULLSCREEN_VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  return program;
}

function setUniform(
  gl: WebGLRenderingContext,
  location: WebGLUniformLocation | null,
  value: UniformValue
) {
  if (!location) return;
  if (typeof value === "number") gl.uniform1f(location, value);
  else if (value.length === 2) gl.uniform2f(location, value[0]!, value[1]!);
  else if (value.length === 3) gl.uniform3f(location, value[0]!, value[1]!, value[2]!);
  else if (value.length === 4) gl.uniform4f(location, value[0]!, value[1]!, value[2]!, value[3]!);
}

/**
 * Starts a full screen shader on a canvas. Returns null when WebGL or the
 * shader is unavailable, so the caller keeps its poster. Drawing pauses while
 * the host is off screen or the tab is hidden; the watchdog measures the
 * first 45 visible frames and calls onSlow when the median is over 28 ms.
 */
export function startShader(options: ShaderOptions): ShaderHandle | null {
  const { canvas, host, fragment, pointerArea, onSlow, onFirstFrame } = options;
  const gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: options.alpha ?? false,
    preserveDrawingBuffer: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;
  const program = createProgram(gl, fragment);
  if (!program) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const locations = new Map<string, WebGLUniformLocation | null>();
  const at = (name: string) => {
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
    return locations.get(name) ?? null;
  };
  const apply = (uniforms: Readonly<Record<string, UniformValue>> | undefined) => {
    for (const [name, value] of Object.entries(uniforms ?? {})) setUniform(gl, at(name), value);
  };
  apply(options.uniforms);

  const finePointer = window.matchMedia?.("(pointer: fine)").matches ?? false;
  const dpr = Math.min(options.dprCap ?? 1.5, window.devicePixelRatio || 1);
  const size = () => {
    const box = host.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(box.width * dpr));
    canvas.height = Math.max(1, Math.round(box.height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    setUniform(gl, at("uRes"), [box.width, box.height]);
  };
  size();

  const speed = options.speed ?? 1;
  const touchDrift = options.touchDrift ?? true;
  const pointer = [0.7, 0.6];
  const target = [0.7, 0.6];
  let on = 0;
  let onTarget = 0;
  let visible = true;
  let raf = 0;
  let drew = false;
  let stopped = false;
  const start = performance.now();

  const move = (event: PointerEvent) => {
    const box = host.getBoundingClientRect();
    target[0] = (event.clientX - box.left) / box.width;
    target[1] = 1 - (event.clientY - box.top) / box.height;
    onTarget = finePointer ? 1 : 0;
  };
  const leave = () => {
    onTarget = 0;
  };

  const watchdog = createFrameWatchdog({
    onSlow: () => {
      stop();
      onSlow();
    },
  });

  const frame = (now: number) => {
    raf = 0;
    if (stopped) return;
    if (!visible || document.hidden) {
      watchdog.pause();
      return;
    }
    if (!watchdog.sample(now)) return;
    const elapsed = ((now - start) / 1000) * speed;
    if (!finePointer && touchDrift) {
      target[0] = 0.62 + 0.18 * Math.sin(elapsed * 0.21);
      target[1] = 0.55 + 0.15 * Math.cos(elapsed * 0.17);
      onTarget = 0.6;
    }
    pointer[0]! += (target[0]! - pointer[0]!) * 0.08;
    pointer[1]! += (target[1]! - pointer[1]!) * 0.08;
    on += (onTarget - on) * 0.06;
    setUniform(gl, at("uTime"), elapsed);
    setUniform(gl, at("uPtr"), pointer);
    setUniform(gl, at("uOn"), on);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!drew) {
      drew = true;
      onFirstFrame?.();
    }
    // Speed 0 holds the first frame: no loop
    if (speed > 0) raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!stopped && !raf && visible && !document.hidden && (speed > 0 || !drew)) {
      raf = requestAnimationFrame(frame);
    }
  };

  const observer =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([entry]) => {
          visible = Boolean(entry?.isIntersecting);
          kick();
        });
  observer?.observe(host);
  pointerArea?.addEventListener("pointermove", move);
  pointerArea?.addEventListener("pointerleave", leave);
  document.addEventListener("visibilitychange", kick);
  window.addEventListener("resize", size);
  kick();

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    observer?.disconnect();
    pointerArea?.removeEventListener("pointermove", move);
    pointerArea?.removeEventListener("pointerleave", leave);
    document.removeEventListener("visibilitychange", kick);
    window.removeEventListener("resize", size);
    gl!.getExtension("WEBGL_lose_context")?.loseContext();
  }

  return {
    update(uniforms) {
      if (stopped) return;
      apply(uniforms);
      // A held frame redraws with the new values
      if (speed === 0) {
        drew = false;
        kick();
      }
    },
    stop,
  };
}

/** "#5650A2" to [r, g, b] in 0..1, for a vec3 uniform. Falls back to black. */
export function hexToVec3(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [0, 0, 0];
  const n = parseInt(match[1]!, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** The pixel ratio cap per device class (spec 3.6). */
export function dprCapFor(device: "strong" | "typical" | "weak" | undefined): number {
  return device === "strong" ? 2 : device === "weak" ? 1 : 1.5;
}
