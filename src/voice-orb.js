// The voice call's orb: a flat watercolour disc, deep blue at the top and a bank of white cloud at its foot, that flows and
// swells with the voices. One small WebGL fragment shader does it in four steps:
//   1. a domain warp (slow noise pushes the coordinates around, more when someone speaks),
//   2. a fine grain and a soft "paper" texture (noise standing in for a painted texture),
//   3. a cell warp (a jittered grid that makes the cloud edge uneven),
//   4. height -> colour: the warped height goes through three smooth ramps over four tones of the accent colour.
// The disc, its swell and its glow are drawn inside the canvas, so no page style (rounding, scaling, shadow) touches it;
// when WebGL is missing the caller keeps a plain gradient disc.

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
vec2 hash2(vec2 p){return vec2(hash(p),hash(p+vec2(19.19,73.73)));}
float vnoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
}
// three octaves; roughness is how much each finer octave counts
float fbm(vec2 p,float rough){
  float a=vnoise(p);
  float b=vnoise(p*2.+vec2(17.17,31.31));
  float c=vnoise(p*4.+vec2(47.47,11.11));
  return (a+b*rough+c*rough*rough)/(1.+rough+rough*rough);
}
vec2 fbm2(vec2 p,float rough){return vec2(fbm(p,rough),fbm(p+vec2(41.41,17.17),rough));}

// a jittered 8x8 grid: every point is pulled a little toward the nearest cell's drifting centre
vec2 cellWarp(vec2 q,float t){
  vec2 pt=q*8.;
  vec2 cell=floor(pt),local=fract(pt);
  float best=1e9;vec2 centre=vec2(0.);
  for(int y=-1;y<=1;y++){for(int x=-1;x<=1;x++){
    vec2 off=vec2(float(x),float(y));
    vec2 r=hash2(cell+off);
    vec2 pos=off+r*.72+sin(vec2(t)+r*6.2831853)*.04;
    vec2 d=pos-local;
    float dd=dot(d,d);
    if(dd<best){best=dd;centre=pos;}
  }}
  vec2 nearest=(centre+cell)/8.;
  return (q-.5)*.26+(nearest-q)*.06;
}

// 1 for small x, easing down to 0 between a and b
float ramp(float x,float a,float b){float t=clamp((x-a)/(b-a),0.,1.);t=t*t*(3.-2.*t);return 1.-t;}

void main(){
  vec2 frame=(gl_FragCoord.xy/uRes)*2.-1.;
  // the disc fills .74 of the canvas and swells with the voices; the rest of the canvas holds the glow
  float radius=.74+uLevel*.07;
  float rr=length(frame)/radius;
  if(rr>1.){
    float glow=(1.-smoothstep(1.,1./radius,rr))*(.08+uLevel*.26);
    gl_FragColor=vec4(uAccent*glow,glow);
    return;
  }
  float edge=1.-smoothstep(.985,1.,rr);
  vec2 g=frame/radius*.5+.5; // 0..1 across the disc, y up

  // the clock: slower when idle, quicker as the voices speak
  float calm=.55+uSpeak*.9+uLevel*.7+uWork*.4;
  float t=uTime*calm;

  // 1. domain warp: slow noise moves the whole picture, the more the louder
  vec2 m=g+vec2(0.,-.14);
  vec2 c=g-.5;
  float rad=length(c);
  m+=(rad>1e-5?c/rad:vec2(0.))*smoothstep(.015,.44,rad)*(uLevel*.10+uSpeak*.05);
  vec2 wave=fbm2(m*1.0+vec2(.17,.11)*t*.12,.4);
  vec2 m2=m+(wave-.5)*(.8*(1.+uLevel*.9+uSpeak*.4));

  // 2. grain and paper texture
  float grain=fbm(m2*38.+vec2(t*.4,-t*.3),.5);
  vec2 m3=m2*.8+(grain-.5)*.06*(1.+uLevel*1.6);
  float blend=.5-.5*cos(t*.9);
  float paperA=fbm(m3*3.1+vec2(t*.07,t*.05),.5);
  float paperB=fbm(vec2(m3.x,1.-m3.y)*3.1+vec2(-t*.05,t*.06)+7.3,.5);
  float paper=mix(paperA,paperB,blend)-.5;
  float paperAmp=.2-.06*cos(t*1.3);

  // 3. cell warp
  vec2 cw=cellWarp(m2,t*.9);

  // 4. depth -> colour: 0 at the top of the disc (deep blue) to 1 at its foot (cloud), bent by the warps above
  float y=g.y+(wave.y-.5)*.36*(1.+uLevel*1.1+uSpeak*.4)+paper*paperAmp*.9+cw.y*.5;
  float s=1.-y+.16+uLevel*.08;
  vec3 shadow=uAccent*.90;
  vec3 deep=mix(uAccent,vec3(0.,.03,.2),.18);
  vec3 light=mix(uAccent,vec3(1.),.6);
  vec3 white=vec3(1.);
  vec3 col=shadow;
  col=mix(col,deep,smoothstep(.06,.40,s));
  col=mix(col,light,smoothstep(.42,.68,s));
  col=mix(col,white,smoothstep(.64,.88,s));
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
