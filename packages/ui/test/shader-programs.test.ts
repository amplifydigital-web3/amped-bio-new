import { describe, expect, it } from "vitest";
import { SHADER_SCENES, findEffect } from "@repo/constants";
import { SHADER_PROGRAM_KEYS, loadShaderProgram } from "../src/motion/shaders";

// Theme Engine v2 phase 3b (spec 3.6): one GLSL chunk per scene.

describe("shader programs", () => {
  it("has a program for every WebGL entry in the registry, and nothing else", () => {
    const keys = [...SHADER_SCENES, findEffect("cursor.blob")!].map(entry =>
      entry.render.kind === "webgl" ? entry.render.program : ""
    );
    expect([...SHADER_PROGRAM_KEYS].sort()).toEqual([...keys].sort());
  });

  it("loads the prelude plus the scene, with one main and the shared uniforms", async () => {
    for (const key of SHADER_PROGRAM_KEYS) {
      const source = (await loadShaderProgram(key))!;
      expect(source.startsWith("precision mediump float;")).toBe(true);
      expect(source.match(/void main\(\)/g)).toHaveLength(1);
      expect(source).toContain("gl_FragColor");
      expect(source).toContain("uniform vec3 uA;");
      // Under 5 KB per scene (spec 3.6: the active shader is 2 to 5 KB)
      expect(source.length).toBeLessThan(5000);
    }
  });

  it("returns null for an unknown key, so the layer keeps its poster", async () => {
    expect(await loadShaderProgram("no-such-scene")).toBeNull();
  });
});
