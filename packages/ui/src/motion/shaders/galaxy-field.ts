// Theme Engine v2 phase 3b: scene.galaxy-field. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `vec3 stars(vec2 p,float s,float dens){vec2 g=p*s;vec2 id=floor(g);vec2 f=fract(g)-.5;
float h=hash(id);float on=step(1.-dens,h);vec2 o=vec2(hash(id+1.),hash(id+2.))-.5;
float d=length(f-o*.7);float tw=.6+.4*sin(uTime*(1.+h*3.)+h*40.);
return pal(fract(h*7.))*on*(smoothstep(.09,0.,d)+.25/(d*30.+1.))*tw*1.4;}
void main(){vec2 p=cv();vec2 par=(uPtr-.5)*uOn*.06;float t=uTime*.02;float dens=.25+.5*uDensity;
vec3 col=stars(p+par*.3+vec2(t,0.),40.,dens)*.6+stars(p+par*.6+vec2(t*2.,1.3),22.,dens*.8)+stars(p+par+vec2(t*3.,7.1),11.,dens*.6)*1.2;
float neb=fbm(p*1.5+t)*smoothstep(.9,0.,abs(p.y+sin(p.x*1.5)*.2));col+=mix(uA,uB,neb)*neb*.18;
gl_FragColor=vec4(fin(col),1.);}`;
