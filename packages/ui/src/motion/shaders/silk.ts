// Theme Engine v2 phase 3b: scene.silk. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=cv()*2.;float t=uTime*.2;
float a=sin(p.x*1.3+t)+sin(p.y*1.7-t*.8)+sin((p.x+p.y)*.9+t*.6);
float f=sin(p.x*3.+a*1.6+t)*.5+.5;float sheen=pow(f,6.);
vec3 col=mix(uA*.6,uB,f)+uC*sheen*.6;gl_FragColor=vec4(fin(col),1.);}`;
