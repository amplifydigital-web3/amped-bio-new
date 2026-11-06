// Theme Engine v2 phase 3b: scene.faulty-terminal. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=vUv;float t=uTime;vec2 grid=max(floor(uRes/vec2(9.,14.)),vec2(1.));
vec2 g=p*grid;vec2 id=floor(g);vec2 f=fract(g);
float near=uOn*uReact*smoothstep(.25,0.,length((p-uPtr)*asp()));
float r=hash(id+floor(t*(1.+near*12.)*(.5+hash(id+7.)*2.)));
float glyph=step(.45,hash(floor(f*vec2(3.,5.))+id*r));
float on=step(.55,hash(vec2(id.y,floor(t*.5))))*step(id.x,grid.x*hash(vec2(id.y,1.)));
float scan=.8+.2*sin(gl_FragCoord.y*1.5);
vec3 col=uA*.04+pal(.7)*glyph*on*scan*(.9+.1*sin(t*30.))*(.6+.4*r)+pal(.9)*near*glyph*.4;
gl_FragColor=vec4(fin(col),1.);}`;
