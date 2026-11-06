// Theme Engine v2 phase 3b: scene.grainient. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=cv();float t=uTime*.12;
float n=fbm(p*1.2+vec2(t,t*.7));float g=clamp(vUv.y*.7+n*.6-.15,0.,1.);
float grain=(hash(gl_FragCoord.xy+fract(uTime)*100.)-.5)*.09;
gl_FragColor=vec4(fin(pal(g)+grain),1.);}`;
