// Theme Engine v2 phase 3b: scene.ferrofluid. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=cv();float t=uTime*.5;vec2 m=(uPtr-.5)*asp();float pull=uOn*uReact;
float f=0.;for(int i=0;i<7;i++){float fi=float(i);
vec2 c=vec2(sin(t*.7+fi*1.9),cos(t*.6+fi*2.7))*.35;c=mix(c,m+(c-m)*.35,pull);
vec2 d=p-c;f+=.018/max(dot(d,d),1e-4);}
vec2 dm=p-m;f+=pull*.03/max(dot(dm,dm),1e-4);
float s=smoothstep(.9,1.1,f);float rim=smoothstep(1.4,1.,f)*s;
vec3 col=mix(uA*.05,vec3(.03),s)+pal(.8)*rim*.9+uC*pow(s,3.)*.08;gl_FragColor=vec4(fin(col),1.);}`;
