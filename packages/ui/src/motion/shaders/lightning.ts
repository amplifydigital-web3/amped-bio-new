// Theme Engine v2 phase 3b: scene.lightning. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=cv();float t=uTime;
float flick=step(.55,fract(sin(floor(t*3.)*43.7)*91.3));
float x=(fbm(vec2(p.y*3.,floor(t*6.)))-.5)*.5+(fbm(vec2(p.y*12.,t*4.))-.5)*.08;
float d=abs(p.x-x);float g=.004/(d+.003)*(.4+.6*flick);
vec3 col=uA*.06+pal(.8)*g+uC*smoothstep(.02,0.,d)*flick;gl_FragColor=vec4(fin(min(col,vec3(1.5))),1.);}`;
