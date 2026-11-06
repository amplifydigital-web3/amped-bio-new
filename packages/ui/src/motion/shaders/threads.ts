// Theme Engine v2 phase 3b: scene.threads. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=cv();float t=uTime*.4;vec3 col=vec3(0.);
for(int i=0;i<12;i++){float fi=float(i)/12.;
float y=(fi-.5)*.9+sin(p.x*(2.+fi*3.)+t+fi*6.)*.08*(1.+sin(t*.3+fi*4.));
col+=pal(fi)*.0025/(abs(p.y-y)+.002);}
gl_FragColor=vec4(fin(min(col,vec3(1.2))),1.);}`;
