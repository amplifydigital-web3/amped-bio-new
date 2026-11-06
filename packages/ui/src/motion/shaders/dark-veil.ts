// Theme Engine v2 phase 3b: scene.dark-veil. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=cv();float t=uTime*.07;
float n=fbm(p*1.5+vec2(t,-t*.6)+fbm(p*3.-t));float v=1.-smoothstep(.2,.9,length(p));
vec3 col=mix(vec3(.02),pal(n)*.9,smoothstep(.25,.75,n)*v*1.4);gl_FragColor=vec4(fin(col),1.);}`;
