// Theme Engine v2 phase 3b: scene.dot-field. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=cv();float t=uTime*.4;vec2 g=p*26.;vec2 id=floor(g);vec2 f=fract(g)-.5;
float w=.5+.5*sin(length(id)*.35-t*2.+fbm(id*.08+t*.2)*4.);
float rr=.08+.32*w;float dt=smoothstep(rr,rr-.08,length(f));
vec3 col=uA*.06+pal(w)*dt;gl_FragColor=vec4(fin(col),1.);}`;
