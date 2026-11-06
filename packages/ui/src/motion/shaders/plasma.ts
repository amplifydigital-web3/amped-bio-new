// Theme Engine v2 phase 3b: scene.plasma. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=cv()*3.;float t=uTime*.6;
float v=sin(p.x+t)+sin(p.y*1.3-t*.7)+sin(p.x*.7+p.y*.9+t*.5)+sin(length(p+vec2(sin(t*.3),cos(t*.4)))*2.);
gl_FragColor=vec4(fin(pal(.5+.5*sin(v*1.2))),1.);}`;
