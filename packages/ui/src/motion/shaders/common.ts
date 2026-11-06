// Theme Engine v2 phase 3b (spec 3.5 and 3.6): the prelude every scene shader
// shares. The engine (webgl.ts) sets uTime, uRes, uPtr and uOn; the scene
// entry's uniforms() sets the rest:
//   uI       intensity, 0..1
//   uReact   pointer reactivity, 0..1 (pointer reactive scenes)
//   uDensity star density, 0..1 (Galaxy field)
//   uA uB uC the palette (the scene's own, the creator's, or a custom color)
// Helpers: hash, value noise, fbm (5 octaves), cv() centered and aspect
// corrected coordinates, pal() a three stop ramp, fin() applies intensity.

export const SHADER_PRELUDE = `precision mediump float;
varying vec2 vUv;
uniform float uTime;uniform vec2 uRes;uniform vec2 uPtr;uniform float uOn;
uniform float uI;uniform float uReact;uniform float uDensity;
uniform vec3 uA;uniform vec3 uB;uniform vec3 uC;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){float v=0.;float a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
vec2 asp(){return vec2(uRes.x/max(uRes.y,1.),1.);}
vec2 cv(){return (vUv-.5)*asp();}
vec3 pal(float t){t=clamp(t,0.,1.);return t<.5?mix(uA,uB,t*2.):mix(uB,uC,t*2.-1.);}
vec3 fin(vec3 c){return c*(.25+.75*uI);}
`;
