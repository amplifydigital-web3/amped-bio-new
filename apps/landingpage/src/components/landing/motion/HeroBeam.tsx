"use client";

import { useEffect, useRef, useState } from "react";
import { MOTION, PRISM_EASE } from "@repo/ui";
import { useMotionOff } from "./motionState";

// Prism room light for the landing hero (Build Board #26, section 3.3).
// A CSS poster of three beams paints first and stays the LCP-safe layer. A
// small WebGL shader fades in over it after first paint: on a fine pointer the
// beams bend toward the pointer, on touch they drift slowly (decision 6).
// Raw WebGL, one full screen triangle, no library.

const VERTEX = `attribute vec2 position;varying vec2 vUv;
void main(){vUv=position*0.5+0.5;gl_Position=vec4(position,0.0,1.0);}`;

const FRAGMENT = `precision highp float;
uniform float uTime;uniform vec2 uRes;uniform vec2 uPtr;uniform float uOn;varying vec2 vUv;
float band(float x,float c,float w){return exp(-pow((x-c)/w,2.0));}
void main(){
  float asp=uRes.x/uRes.y; vec2 q=vec2(vUv.x*asp,vUv.y); vec2 p=vec2(uPtr.x*asp,uPtr.y);
  vec2 n=normalize(vec2(0.829,-0.559));
  float x=dot(q,n); float d=distance(q,p); float t=uTime*0.05;
  x+=uOn*0.07*exp(-d*d*5.0)*sign(dot(q-p,n))+0.012*sin(q.y*3.0+t*6.0);
  float s=asp*0.83;
  vec3 col=vec3(0.957,0.953,0.980);
  col=mix(col,vec3(0.153,0.667,0.882),band(x,0.02*s+0.02*sin(t*2.0),0.11*s)*0.30);
  col=mix(col,vec3(0.337,0.314,0.635),band(x,0.38*s+0.02*sin(t*2.3+1.0),0.12*s)*0.22);
  col=mix(col,vec3(0.533,0.302,0.620),band(x,0.74*s+0.02*sin(t*1.7+2.0),0.13*s)*0.28);
  col=mix(col,vec3(1.0,0.702,0.541),band(distance(q,vec2(0.05*asp,0.0)),0.0,0.5)*0.18);
  col=mix(col,vec3(1.0),uOn*0.30*exp(-d*d*16.0));
  gl_FragColor=vec4(col,1.0);
}`;

/** Weak devices keep the poster: Save-Data, under 4 cores or under 4 GB memory. */
function lowPower() {
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean };
    deviceMemory?: number;
  };
  return (
    Boolean(nav.connection?.saveData) ||
    (nav.hardwareConcurrency || 8) < 4 ||
    (nav.deviceMemory || 8) < 4
  );
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

/** Starts the shader on a canvas. Returns a stop function, or null to keep the poster. */
function startBeam(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  pointerArea: HTMLElement,
  onSlow: () => void
) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(program, "uTime");
  const uRes = gl.getUniformLocation(program, "uRes");
  const uPtr = gl.getUniformLocation(program, "uPtr");
  const uOn = gl.getUniformLocation(program, "uOn");

  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  const size = () => {
    const box = host.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(box.width * dpr));
    canvas.height = Math.max(1, Math.round(box.height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, box.width, box.height);
  };
  size();

  const pointer = [0.7, 0.6];
  const target = [0.7, 0.6];
  let on = 0;
  let onTarget = 0;
  let visible = true;
  let raf = 0;
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

  // Watchdog: the median of the first 45 visible frames over 28 ms keeps the poster
  const frames: number[] = [];
  let last = 0;

  const frame = (now: number) => {
    raf = 0;
    if (!visible || document.hidden) {
      last = 0;
      return;
    }
    if (frames.length < 45) {
      if (last) frames.push(now - last);
      last = now;
      if (frames.length === 45) {
        const median = [...frames].sort((a, b) => a - b)[22];
        if (median > 28) {
          onSlow();
          return;
        }
      }
    }
    const elapsed = (now - start) / 1000;
    if (!finePointer) {
      // Touch: a slow ambient drift, no device tilt (decision 6)
      target[0] = 0.62 + 0.18 * Math.sin(elapsed * 0.21);
      target[1] = 0.55 + 0.15 * Math.cos(elapsed * 0.17);
      onTarget = 0.6;
    }
    pointer[0] += (target[0] - pointer[0]) * 0.08;
    pointer[1] += (target[1] - pointer[1]) * 0.08;
    on += (onTarget - on) * 0.06;
    gl.uniform1f(uTime, elapsed);
    gl.uniform2f(uPtr, pointer[0], pointer[1]);
    gl.uniform1f(uOn, on);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
  };

  const observer = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    kick();
  });
  observer.observe(host);
  pointerArea.addEventListener("pointermove", move);
  pointerArea.addEventListener("pointerleave", leave);
  document.addEventListener("visibilitychange", kick);
  window.addEventListener("resize", size);
  kick();

  return () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
    pointerArea.removeEventListener("pointermove", move);
    pointerArea.removeEventListener("pointerleave", leave);
    document.removeEventListener("visibilitychange", kick);
    window.removeEventListener("resize", size);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
}

/**
 * Sits behind the hero content, full bleed to the viewport edges. The parent
 * must be position relative and isolate; the page root clips overflow on x.
 */
export function HeroBeam() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motionOff = useMotionOff();
  const [live, setLive] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const pointerArea = host?.parentElement;
    const canvas = canvasRef.current;
    if (motionOff || slow || !host || !pointerArea || !canvas || lowPower()) {
      setLive(false);
      return;
    }
    let stop: (() => void) | null = null;
    // After first paint, so the poster stays the first frame
    const idle = window.setTimeout(() => {
      stop = startBeam(canvas, host, pointerArea, () => setSlow(true));
      if (stop) requestAnimationFrame(() => setLive(true));
    }, 0);
    return () => {
      window.clearTimeout(idle);
      stop?.();
      setLive(false);
    };
  }, [motionOff, slow]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-[100vw] -translate-x-1/2"
    >
      {/* Poster: three Prism beams and the haze, CSS only */}
      <div className="motion-poster absolute inset-0 overflow-hidden">
        <i className="motion-beam left-[4%] w-[15%] bg-prism-create-light opacity-[0.28]" />
        <i className="motion-beam left-[44%] w-[16%] bg-prism-nav opacity-[0.22]" />
        <i className="motion-beam left-[82%] w-[18%] bg-prism-value opacity-[0.28]" />
        <i className="motion-haze" />
      </div>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ opacity: live ? 1 : 0, transition: `opacity ${MOTION.room}ms ${PRISM_EASE}` }}
      />
    </div>
  );
}
