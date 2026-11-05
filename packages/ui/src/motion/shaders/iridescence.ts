// Theme Engine v2 phase 3b: scene.iridescence. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=cv();float t=uTime*.25;float r=length(p);
float ph=fbm(p*2.+t*.3)*2.+r*1.5-t*.4;
vec3 film=.5+.5*cos(6.2832*(ph+vec3(0.,.33,.67)));
vec3 col=mix(pal(fract(ph*.5)),film,.55);gl_FragColor=vec4(fin(col),1.);}`;
