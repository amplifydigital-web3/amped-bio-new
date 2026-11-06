// Theme Engine v2 phase 3b: scene.liquid-chrome. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=cv()*1.6;float t=uTime*.18;
vec2 q=vec2(fbm(p+t),fbm(p+vec2(5.2,1.3)-t));
float v=fbm(p+2.5*q);float b=abs(sin(v*9.));
vec3 metal=mix(vec3(.08),vec3(.95),pow(b,1.5));
vec3 col=mix(metal,metal*mix(uB,uC,v),.35)+uA*pow(1.-b,8.)*.4;gl_FragColor=vec4(fin(col),1.);}`;
