#!/usr/bin/env tsx

/**
 * Build time tile videos (Theme Engine v2 decision 12, spec 3.10, phase 3g).
 *
 * Every registry entry with preview.video (the WebGL scenes, Blob and Splash)
 * gets a 2 second, muted H.264 loop for its editor tile, so the picker never
 * opens a WebGL context per tile. The script renders each entry with its own
 * GLSL or canvas module, steps the clock frame by frame (deterministic, no
 * timing), reads the pixels and encodes with ffmpeg:
 *
 *   pnpm exec tsx scripts/effects/render-thumbnails.ts
 *
 * Needs Chromium through Playwright and ffmpeg with libx264. Writes
 * apps/client/public/effects/<id>.mp4 and the manifest the tiles read,
 * apps/client/src/components/panels/design/kit/effectVideos.json. Run it again
 * after adding or changing a heavy entry; the files are committed.
 */

import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { promisify } from "util";
import { pathToFileURL } from "url";
import { ALL_EFFECTS, clampParams, type EffectEntry } from "../../packages/constants/src/index";
import { loadShaderProgram } from "../../packages/ui/src/motion/shaders/index";

const run = promisify(execFile);
const ROOT = path.resolve(__dirname, "../..");
const CLIENT = path.join(ROOT, "apps/client");
const OUT_DIR = path.join(CLIENT, "public/effects");
const MANIFEST = path.join(CLIENT, "src/components/panels/design/kit/effectVideos.json");

const WIDTH = 240;
const HEIGHT = 150;
const FPS = 24;
const FRAMES = FPS * 2;
const BACKDROP = "#24234a";
// The demo look the cursor tiles draw in (shader scenes use their own palette)
const COLORS = { button: "#ff6a3d", buttonText: "#ffffff", container: "#ffffff", text: "#f4f3fa" };

interface Job {
  id: string;
  kind: "webgl" | "canvas";
  source?: string;
  module?: string;
  uniforms?: Record<string, number | number[]>;
  params?: Record<string, number | string>;
  pointer: boolean;
  /** Time multiplier from the Speed param (50 is 1) */
  speed: number;
}

function speedOf(values: Record<string, number | string>): number {
  const raw = values["speed"];
  return typeof raw === "number" ? Math.max(0, raw) / 50 : 1;
}

async function jobs(): Promise<Job[]> {
  const out: Job[] = [];
  for (const entry of ALL_EFFECTS as readonly EffectEntry[]) {
    if (!entry.preview.video || entry.retired) continue;
    const values = clampParams(entry, {}) as Record<string, number | string>;
    const pointer = entry.layer === "cursor" || entry.pointer === "fine";
    if (entry.render.kind === "webgl") {
      const source = await loadShaderProgram(entry.render.program);
      if (!source) throw new Error(`No GLSL for ${entry.id}`);
      out.push({
        id: entry.id,
        kind: "webgl",
        source,
        uniforms: entry.render.uniforms(values, COLORS) as Record<string, number | number[]>,
        pointer,
        speed: speedOf(values),
      });
    } else if (entry.render.kind === "canvas") {
      out.push({
        id: entry.id,
        kind: "canvas",
        module: entry.render.module,
        params: values,
        pointer,
        speed: 1,
      });
    }
  }
  return out;
}

/** Bundles the canvas effect modules into one IIFE the page can load. */
async function bundleCanvasEffects(dir: string): Promise<string> {
  const require = createRequire(path.join(CLIENT, "package.json"));
  // The ESM entry of the client's Vite (the CJS Node API is deprecated)
  const viteDir = path.dirname(require.resolve("vite/package.json"));
  const vite = (await import(
    pathToFileURL(path.join(viteDir, "dist/node/index.js")).href
  )) as typeof import("vite");
  await vite.build({
    configFile: false,
    logLevel: "warn",
    build: {
      outDir: dir,
      emptyOutDir: true,
      lib: {
        entry: path.join(ROOT, "packages/ui/src/motion/canvas-effects/index.ts"),
        name: "AmpedCanvasEffects",
        formats: ["iife"],
        fileName: () => "canvas-effects.js",
      },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  return fs.readFile(path.join(dir, "canvas-effects.js"), "utf8");
}

const VERTEX =
  "attribute vec2 position;varying vec2 vUv;void main(){vUv=position*0.5+0.5;gl_Position=vec4(position,0.0,1.0);}";

/** Runs in the page: draws every frame of one job and returns PNG data URLs. */
const RENDER = async ([job, size, frames, fps, backdrop, colors, vertex]: [
  Job,
  [number, number],
  number,
  number,
  string,
  typeof COLORS,
  string,
]) => {
  const [w, h] = size;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const o = out.getContext("2d")!;
  // A slow figure eight across the tile, the pointer path for reactive entries
  const path = (t: number) => ({
    x: 0.5 + 0.32 * Math.sin(t * 2.1),
    y: 0.5 + 0.22 * Math.sin(t * 4.2),
  });
  const shots: string[] = [];
  if (job.kind === "webgl") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const gl = c.getContext("webgl", { preserveDrawingBuffer: true, premultipliedAlpha: true })!;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s) ?? "");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vertex));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, job.source!));
    gl.linkProgram(p);
    gl.useProgram(p);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, "position");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const set = (n: string, v: number | number[]) => {
      const l = gl.getUniformLocation(p, n);
      if (!l) return;
      if (typeof v === "number") gl.uniform1f(l, v);
      else if (v.length === 2) gl.uniform2f(l, v[0]!, v[1]!);
      else if (v.length === 3) gl.uniform3f(l, v[0]!, v[1]!, v[2]!);
    };
    for (const [n, v] of Object.entries(job.uniforms ?? {})) set(n, v);
    set("uRes", [w, h]);
    gl.viewport(0, 0, w, h);
    for (let i = 0; i < frames; i++) {
      const t = i / fps;
      const ptr = path(t);
      set("uTime", 3 + t * job.speed);
      set("uPtr", [ptr.x, 1 - ptr.y]);
      set("uOn", job.pointer ? 1 : 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      o.fillStyle = backdrop;
      o.fillRect(0, 0, w, h);
      o.drawImage(c, 0, 0);
      shots.push(out.toDataURL("image/png"));
    }
  } else {
    const mod = (
      window as unknown as {
        AmpedCanvasEffects: {
          loadCanvasEffect: (
            k: string
          ) => Promise<
            | ((
                p: unknown,
                c: unknown
              ) => { frame: (f: unknown) => boolean; press?: (x: number, y: number) => void })
            | null
          >;
        };
      }
    ).AmpedCanvasEffects;
    const factory = await mod.loadCanvasEffect(job.module!);
    if (!factory) throw new Error(`No canvas module ${job.module}`);
    const effect = factory(job.params ?? {}, colors);
    const layer = document.createElement("canvas");
    layer.width = w;
    layer.height = h;
    const ctx = layer.getContext("2d")!;
    // Warm up so the first frame already shows the effect
    for (let i = -12; i < frames; i++) {
      const t = Math.max(0, i) / fps + (i < 0 ? i / fps : 0);
      const ptr = path(t + 0.6);
      ctx.clearRect(0, 0, w, h);
      effect.frame({
        ctx,
        width: w,
        height: h,
        time: t,
        dt: 1 / fps,
        pointer: { x: ptr.x * w, y: ptr.y * h, inside: true },
      });
      if (i < 0) continue;
      o.fillStyle = backdrop;
      o.fillRect(0, 0, w, h);
      o.drawImage(layer, 0, 0);
      shots.push(out.toDataURL("image/png"));
    }
  }
  return shots;
};

async function main() {
  const list = await jobs();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "effect-thumbs-"));
  const bundle = await bundleCanvasEffects(path.join(tmp, "bundle"));
  const { chromium } = createRequire(path.join(CLIENT, "package.json"))(
    "playwright"
  ) as typeof import("playwright");
  const browser = await chromium.launch({
    args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage();
  await page.setContent("<html><body></body></html>");
  // tsx names functions with an __name helper; the page needs it to run RENDER
  await page.addScriptTag({ content: "window.__name = function (f) { return f; };" });
  await page.addScriptTag({ content: bundle });
  await fs.mkdir(OUT_DIR, { recursive: true });
  const manifest: Record<string, { src: string; bytes: number }> = {};
  for (const job of list) {
    const shots = (await page.evaluate(RENDER, [
      job,
      [WIDTH, HEIGHT],
      FRAMES,
      FPS,
      BACKDROP,
      COLORS,
      VERTEX,
    ])) as string[];
    const dir = path.join(tmp, job.id);
    await fs.mkdir(dir, { recursive: true });
    await Promise.all(
      shots.map((url, i) =>
        fs.writeFile(
          path.join(dir, `${String(i).padStart(3, "0")}.png`),
          Buffer.from(url.split(",")[1]!, "base64")
        )
      )
    );
    const file = path.join(OUT_DIR, `${job.id}.mp4`);
    await run("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-framerate",
      String(FPS),
      "-i",
      path.join(dir, "%03d.png"),
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "30",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      file,
    ]);
    const { size } = await fs.stat(file);
    manifest[job.id] = { src: `/effects/${job.id}.mp4`, bytes: size };
    console.log(`${job.id}: ${(size / 1024).toFixed(1)} KB`);
  }
  await browser.close();
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  const total = Object.values(manifest).reduce((sum, item) => sum + item.bytes, 0);
  console.log(
    `${Object.keys(manifest).length} videos, ${(total / 1024).toFixed(0)} KB, manifest ${MANIFEST}`
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
