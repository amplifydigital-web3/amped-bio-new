// Theme Engine v2 phase 3b: scene.letter-glitch. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=vUv;float t=uTime;vec2 grid=floor(uRes/vec2(12.,16.))+1.;
vec2 g=p*grid;vec2 id=floor(g);vec2 f=fract(g);
float near=uOn*uReact*smoothstep(.3,0.,length((p-uPtr)*asp()));
float seed=hash(id+floor(t*(2.+hash(id)*4.+near*20.)));
float glyph=step(.5,hash(floor(f*vec2(4.,5.))+seed*31.))*step(.1,f.x)*step(f.x,.9)*step(.1,f.y)*step(f.y,.9);
gl_FragColor=vec4(fin(pal(seed)*glyph*(.35+.65*seed)),1.);}`;
