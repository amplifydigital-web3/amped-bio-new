// Theme Engine v2 phase 3c: cursor.blob. A gooey metaball that follows the
// pointer, drawn transparent over the page. Amped's own GLSL (decision 3).
export default `void main(){vec2 p=cv();vec2 m=(uPtr-.5)*asp();float t=uTime;
float f=0.;for(int i=0;i<4;i++){float fi=float(i);
vec2 c=m+vec2(sin(t*1.3+fi*2.1),cos(t*1.1+fi*1.7))*.03*fi;
vec2 d=p-c;f+=.0009*(1.+fi*.3)/max(dot(d,d),1e-5);}
float s=smoothstep(.9,1.2,f)*uOn;vec3 col=mix(uA,uB,clamp(f*.3,0.,1.));
gl_FragColor=vec4(col*s*.9,s*.85);}`;
