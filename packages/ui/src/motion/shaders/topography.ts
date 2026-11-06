// Theme Engine v2 phase 3b: scene.topography. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=cv()*2.;float t=uTime*.05;vec2 m=(uPtr-.5)*asp()*2.;vec2 d=p-m;
float h=fbm(p*.8+t)+uOn*uReact*.6*exp(-dot(d,d)*2.);
float line=smoothstep(.08,0.,abs(fract(h*12.)-.5))*.9;
float major=smoothstep(.04,0.,abs(fract(h*3.)-.5));
vec3 col=uA*.06+pal(h)*(line*.6+major*.6);gl_FragColor=vec4(fin(col),1.);}`;
