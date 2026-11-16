const vertex = `
precision highp float;
attribute vec3 aPosition;
attribute float aSeed;
uniform float uTime;
uniform float uScatter;
uniform float uActivity;
uniform float uScale;
uniform vec2 uPointer;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 p = aPosition;
  float phase = aSeed * 6.283;
  vec3 drift = vec3(sin(phase*1.7),cos(phase*2.3),sin(phase*3.1));
  p = p * (1. + uScatter*.48) + drift * uScatter * (.12 + aSeed*.32);
  p += sin(uTime*.8 + phase) * (.008 + uActivity*.012) * normalize(p + .001);
  float ax = .48 + uPointer.y*.12;
  float ay = -.62 + sin(uTime*.16)*.09 + uPointer.x*.15;
  p.yz = mat2(cos(ax),-sin(ax),sin(ax),cos(ax)) * p.yz;
  p.xz = mat2(cos(ay),-sin(ay),sin(ay),cos(ay)) * p.xz;
  float depth = 2.7 / (2.7 - p.z*.35);
  gl_Position = vec4(p.xy * depth,0.,1.);
  gl_PointSize = uScale * (1.6 + depth*.75 + uActivity*.35);
  float face = max(max(abs(aPosition.x),abs(aPosition.y)),abs(aPosition.z));
  float front = smoothstep(-.65,.7,p.z);
  vec3 ice = mix(vec3(.18,.19,.20),vec3(.39,.40,.42),front);
  vec3 violet = vec3(.31,.32,.33);
  vColor = mix(ice,violet,smoothstep(.3,.95,aSeed)*.45);
  float sweep = .80 + .20*sin(p.y*4.0 + uTime*.7);
  vAlpha = (.22 + smoothstep(.45,.58,face)*.55) * sweep;
}`;
const fragment = `
precision highp float;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 uv = abs(gl_PointCoord-.5)*2.;
  float edge = 1.-smoothstep(.55,1.,max(uv.x,uv.y));
  gl_FragColor = vec4(vColor,vAlpha*edge);
}`;
export function createMatrixRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { alpha:true, antialias:true, powerPreference:'low-power' });
  if (!gl) return;
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null;
  const dispose = () => { if(program) gl.deleteProgram(program); if(buffer) gl.deleteBuffer(buffer); shaders.forEach(shader => gl.deleteShader(shader)); };
  try {
    const compile = (type:number,source:string) => { const shader=gl.createShader(type); if(!shader) throw Error('Allocation failed'); shaders.push(shader); gl.shaderSource(shader,source); gl.compileShader(shader); if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error('Matrix shader failed'); return shader; };
    program=gl.createProgram(); if(!program) throw Error('Allocation failed');
    gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex)); gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment)); gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error('Matrix program failed'); gl.useProgram(program);
    const points:number[]=[]; let index=0;
    for(let x=0;x<11;x++) for(let y=0;y<11;y++) for(let z=0;z<11;z++) { points.push((x-5)*.112,(y-5)*.112,(z-5)*.112,((index++*73)%997)/997); }
    buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'aPosition'),seed=gl.getAttribLocation(program,'aSeed');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,3,gl.FLOAT,false,16,0);
    gl.enableVertexAttribArray(seed); gl.vertexAttribPointer(seed,1,gl.FLOAT,false,16,12);
    const time=gl.getUniformLocation(program,'uTime'),scatter=gl.getUniformLocation(program,'uScatter'),activity=gl.getUniformLocation(program,'uActivity'),pointer=gl.getUniformLocation(program,'uPointer'),scale=gl.getUniformLocation(program,'uScale');
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0,0,0,0);
    return {
      render(t:number,s:number,a:number,p:readonly[number,number]) { gl.clear(gl.COLOR_BUFFER_BIT); gl.uniform1f(time,t); gl.uniform1f(scatter,s); gl.uniform1f(activity,a); gl.uniform2f(pointer,p[0],p[1]); gl.drawArrays(gl.POINTS,0,points.length/4); },
      resize(size:number) { const dpr=Math.min(devicePixelRatio||1,1.5),pixels=Math.max(1,Math.min(640,Math.round(size*dpr))); canvas.width=pixels; canvas.height=pixels; gl.viewport(0,0,pixels,pixels); gl.uniform1f(scale,pixels/280); }, dispose,
    };
  } catch { dispose(); return; }
}
