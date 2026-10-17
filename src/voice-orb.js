// The voice call's orb: a sphere with a soft, watercolour sky and a cloud bank at its foot that rises and rolls
// with the voices. Drawn with one small WebGL fragment shader (noise on the sphere's surface mapped onto four tones
// of the accent colour); when WebGL is missing the caller keeps a plain gradient disc.

const VERTEX = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uLevel;
uniform float uSpeak;
uniform float uWork;
uniform vec3 uAccent;

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vnoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
}
float fbm(vec2 p){
  float a=.5,s=0.;
  for(int i=0;i<4;i++){s+=a*vnoise(p);p=p*2.03+vec2(17.1,31.3);a*=.5;}
  return s/.9375;
}

void main(){
  vec2 frame=(gl_FragCoord.xy/uRes)*2.-1.;
  // the sphere fills .77 of the canvas and swells a little with the voices; the rest of the canvas holds its glow
  float radius=.77+uLevel*.08;
  float rr=length(frame)/radius;
  if(rr>1.){
    float glow=(1.-smoothstep(1.,1./radius,rr))*(.10+uLevel*.30);
    gl_FragColor=vec4(uAccent*glow,glow);
    return;
  }
  vec2 uv=frame/radius;
  float r=rr;
  float edge=1.-smoothstep(.975,1.,r);
  float z=sqrt(max(0.,1.-r*r));
  vec3 p=vec3(uv,z);
  // the sphere turns slowly, faster while the voice speaks
  float turn=uTime*(.10+uSpeak*.32);
  float c=cos(turn),s=sin(turn);
  p.xz=mat2(c,-s,s,c)*p.xz;
  // height from the top (0) to the foot (1): the clouds gather at the foot
  float h=.5-uv.y*.5;
  float flow=uTime*(.16+uLevel*.85+uWork*.6);
  float n=fbm(p.xy*2.1+vec2(flow*.35,-flow*.5)+p.z*1.4);
  float wave=sin(p.x*3.1+uTime*(1.+uSpeak*1.9))*(.05+uLevel*.17);
  float lift=uLevel*.14+uSpeak*.05;
  float f=h*1.28+(n-.5)*(.62+uLevel*.4)+wave-.34+lift;
  // four tones of the accent: shadow, body, light, cloud
  vec3 shadow=uAccent*.74;
  vec3 body=uAccent;
  vec3 light=mix(uAccent,vec3(1.),.5);
  vec3 cloud=vec3(1.);
  vec3 col=shadow;
  col=mix(col,body,smoothstep(.18,.40,f));
  col=mix(col,light,smoothstep(.44,.66,f));
  col=mix(col,cloud,smoothstep(.62,.84,f));
  // the sphere itself: darker toward the rim, a soft highlight at the upper left
  col*=.80+.20*z;
  vec3 n3=normalize(vec3(uv,z));
  col+=.09*pow(max(0.,dot(normalize(vec3(-.45,.55,.7)),n3)),5.);
  gl_FragColor=vec4(col*edge,edge);
}`

const parseColor = text => {
  const match = /(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/u.exec(String(text))
  return match ? [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255] : [0.25, 0.46, 0.9]
}

/** Returns a renderer for the canvas, or undefined when this browser cannot draw it. */
export function createOrb(canvas, accent) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true })
  if (!gl) return undefined
  const compile = (type, source) => {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('shader')
    return shader
  }
  let program
  try {
    program = gl.createProgram()
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('link')
  } catch { return undefined }
  gl.useProgram(program)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'a')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  const at = name => gl.getUniformLocation(program, name)
  const uniforms = { res: at('uRes'), time: at('uTime'), level: at('uLevel'), speak: at('uSpeak'), work: at('uWork'), accent: at('uAccent') }
  const color = parseColor(accent)
  let speak = 0
  let work = 0
  return {
    /** Draw one frame: time in seconds, the loudness (0..1), whether the voice is speaking and whether DSH is at work. */
    draw(time, level, speaking, working) {
      speak += ((speaking ? 1 : 0) - speak) * 0.08
      work += ((working ? 1 : 0) - work) * 0.06
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform2f(uniforms.res, canvas.width, canvas.height)
      gl.uniform1f(uniforms.time, time)
      gl.uniform1f(uniforms.level, level)
      gl.uniform1f(uniforms.speak, speak)
      gl.uniform1f(uniforms.work, work)
      gl.uniform3f(uniforms.accent, color[0], color[1], color[2])
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    dispose() { try { gl.getExtension('WEBGL_lose_context')?.loseContext() } catch { /* already gone */ } },
  }
}
