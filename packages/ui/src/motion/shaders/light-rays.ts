// Theme Engine v2 phase 3b: scene.light-rays. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=cv();float t=uTime*.2;vec2 d=p-vec2(0.,.75);
float a=atan(d.x,-d.y);float r=length(d);
float rays=fbm(vec2(a*6.,t))*.7+.3*sin(a*24.+t*2.);
float fall=smoothstep(1.6,0.,r)*smoothstep(1.2,.2,abs(a));
vec3 col=uA*.08+pal(.7)*max(rays,0.)*fall*1.2;gl_FragColor=vec4(fin(col),1.);}`;
