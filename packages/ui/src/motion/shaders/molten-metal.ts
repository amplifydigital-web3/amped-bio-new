// Theme Engine v2 phase 3b: scene.molten-metal. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=cv()*1.8;float t=uTime*.15;vec2 m=(uPtr-.5)*asp()*1.8;
vec2 d=p-m;p+=d*exp(-dot(d,d)*3.)*uOn*uReact*.6;
vec2 q=vec2(fbm(p+t),fbm(p-t+3.));float v=fbm(p+q*2.);
float heat=smoothstep(.3,.8,v);vec3 col=mix(vec3(.05),pal(heat),heat)+uC*pow(heat,6.)*.5;gl_FragColor=vec4(fin(col),1.);}`;
