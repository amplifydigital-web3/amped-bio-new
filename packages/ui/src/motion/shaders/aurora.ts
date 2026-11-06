// Theme Engine v2 phase 3b: scene.aurora. Amped's own GLSL (decision 3), written
// for the shared WebGL engine (decision 13). Uses the prelude in common.ts.
export default `void main(){vec2 p=cv();float t=uTime*.15;vec3 col=uA*.05;
for(int i=0;i<3;i++){float fi=float(i);float x=p.x*(1.2+fi*.4)+t*(1.+fi*.3)+fi*3.1;
float band=fbm(vec2(x,fi*7.+t*.5));float y=p.y-(band-.5)*.9-.1+fi*.08;
float w=exp(-abs(y)*(6.+fi*3.))*smoothstep(-.6,.3,p.y+.2);
col+=pal(fract(fi*.37+band*.6))*w*(.7-fi*.15);}
gl_FragColor=vec4(fin(col),1.);}`;
