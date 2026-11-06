// Theme Engine v2 phase 3b: scene.orb. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=cv();float t=uTime*.3;p+=(uPtr-.5)*.08*uOn;
float r=length(p);float a=atan(p.y,p.x);float rim=.32+.04*fbm(vec2(a*2.,t))+.02*sin(a*6.+t*2.);
float edge=smoothstep(.06,0.,abs(r-rim));float inside=smoothstep(rim,rim-.2,r);
vec3 col=pal(fract(a/6.2832+t*.1))*edge*1.2+mix(uB,uC,.5)*inside*.35+uA*exp(-r*3.)*.25;gl_FragColor=vec4(fin(col),1.);}`;
