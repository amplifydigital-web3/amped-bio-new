"use client";

import { useEffect, useRef, useState } from "react";
import { MOTION, PRISM_EASE, lowPower, startShader } from "@repo/ui";
import { useMotionOff } from "./motionState";

// Prism room light for the landing hero (Build Board #26, section 3.3).
// A CSS poster of three beams paints first and stays the LCP-safe layer. A
// small WebGL shader fades in over it after first paint: on a fine pointer the
// beams bend toward the pointer, on touch they drift slowly (decision 6).
// Raw WebGL, one full screen triangle, no library: the shared engine in
// packages/ui/src/motion/webgl.ts (Theme Engine v2 decision 13, TE-3a).

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
    let handle: ReturnType<typeof startShader> = null;
    // After first paint, so the poster stays the first frame
    const idle = window.setTimeout(() => {
      handle = startShader({
        canvas,
        host,
        pointerArea,
        fragment: FRAGMENT,
        dprCap: 1.5,
        onSlow: () => setSlow(true),
      });
      if (handle) requestAnimationFrame(() => setLive(true));
    }, 0);
    return () => {
      window.clearTimeout(idle);
      handle?.stop();
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
