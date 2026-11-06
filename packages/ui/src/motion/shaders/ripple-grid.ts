// Theme Engine v2 phase 3b: scene.ripple-grid. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=cv();float t=uTime*.6;float r=length(p);
vec2 q=p+normalize(p+.0001)*sin(r*14.-t*3.)*.025;
vec2 g=abs(fract(q*10.)-.5);float line=smoothstep(.06,0.,min(g.x,g.y));
vec3 col=uA*.05+pal(.5+.5*sin(r*6.-t))*line*smoothstep(1.2,.1,r);gl_FragColor=vec4(fin(col),1.);}`;
