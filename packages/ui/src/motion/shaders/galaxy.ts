// Theme Engine v2 phase 3b: scene.galaxy. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=cv()*1.4;float t=uTime*.08;float r=length(p);float a=atan(p.y,p.x);
float arms=sin(a*2.-log(r+.001)*4.+t*3.);float n=fbm(p*3.+t);
float d=smoothstep(.2,1.,arms*.5+.5)*exp(-r*2.2)*(.6+n*.8);float core=exp(-r*9.);
vec2 cell=floor(gl_FragCoord.xy);float s=step(.996,hash(cell))*(.5+.5*sin(uTime*2.+hash(cell+3.)*20.));
vec3 col=pal(clamp(r*1.3,0.,1.))*d*1.6+uC*core+vec3(s)*.8;gl_FragColor=vec4(fin(col),1.);}`;
