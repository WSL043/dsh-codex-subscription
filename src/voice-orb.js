// The voice call's orb: a watercolour disc that is deep blue at the top, pale cloud at its foot, and flows with the voices.
// It follows the layered recipe of the Codex "Horizon" orb, written from scratch in one small WebGL fragment shader:
//   - a slow domain warp (noise moves the picture, faster and wider while the model speaks),
//   - a painted-paper texture read twice (right way up and flipped) and cross-faded, which gives the watercolour stains,
//   - a jittered-cell warp that makes the cloud edge uneven,
//   - three soft ramps over four tones of the accent colour (shadow, mid-low, white, highlight).
// The texture is generated in the shader (layered noise shaped like stains and fibre), so there is no image to ship.
// A small controller turns the call's loudness into the same kind of motion: clocks that run at 24 frames a second and
// speed up while speaking, a spring on the cloud edge while the person talks, a swell of the disc with the loudness.
// The disc, its swell and the edge are drawn inside the canvas, so no page style touches it; when WebGL is missing the
// caller keeps a plain gradient disc.

const VERTEX = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uWaveFrame;
uniform float uBaseFrame;
uniform float uAmp;
uniform float uFlowFrame;
uniform float uEdge;
uniform float uNoiseScale;
uniform float uSurface;
uniform float uMic;
uniform float uUser;
uniform float uFlat;
uniform vec2 uOff0;
uniform vec2 uOff1;
uniform vec2 uOff2;
uniform vec3 uAccent;

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec2 hash2(vec2 p){return vec2(hash(p),hash(p+vec2(19.19,73.73)));}
float vnoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
}
float fbm(vec2 p,float rough,float lac){
  float a=vnoise(p);
  float b=vnoise(p*lac+vec2(17.17,31.31));
  float c=vnoise(p*lac*lac+vec2(47.47,11.11));
  return (a+b*rough+c*rough*rough)/(1.+rough+rough*rough);
}
vec3 noise3(vec3 coord,float w,float scale,float rough,float lac,float unit){
  vec2 p=coord.xy*scale;
  float t=w*scale;
  vec2 d1=vec2(.17,.11),d2=vec2(-.13,.19),d3=vec2(.07,-.23);
  if(unit>.5){d1=normalize(d1);d2=normalize(d2);d3=normalize(d3);}
  return vec3(fbm(p+d1*t,rough,lac),fbm(p+vec2(41.41,17.17)+d2*t,rough,lac),fbm(p+vec2(23.23,59.59)+d3*t,rough,lac));
}

// the painted-paper texture: soft pale ground, darker stains with ragged edges, a fine fibre. Reads like grey watercolour.
float paint(vec2 uv){
  vec2 w=vec2(vnoise(uv*3.+vec2(4.2,1.7)),vnoise(uv*3.+vec2(9.1,6.3)))-.5;
  vec2 q=uv+w*.3;
  float body=vnoise(q*2.+vec2(3.1,8.3))*.5+vnoise(q*4.3+vec2(9.7,1.9))*.3+vnoise(q*9.+vec2(2.3,5.5))*.2;
  float stain=smoothstep(.5,.64,body);
  float wash=smoothstep(.28,.6,vnoise(q*2.6+vec2(14.2,4.4)));
  float mott=vnoise(q*vec2(18.,16.)+vec2(5.,5.))*.55+vnoise(q*vec2(42.,36.))*.45;
  float ragged=stain*(1.-stain)*4.;
  float v=.92-.2*wash-.5*stain+(mott-.5)*(.1+.2*ragged);
  return clamp(v,.16,1.);
}

vec3 warp3(vec3 c,float frame){
  vec2 pt=c.xy*8.;
  vec2 cell=floor(pt),local=fract(pt);
  vec2 nearest=vec2(0.);
  float best=3.4e38;
  float phase=frame*6.2831853/240.;
  for(int y=-1;y<=1;y++){for(int x=-1;x<=1;x++){
    vec2 off=vec2(float(x),float(y));
    vec2 r=hash2(cell+off);
    vec2 pos=off+r*.7185189723968506+sin(vec2(phase)+r*6.2831853)*.04;
    vec2 d=pos-local;
    float dd=dot(d,d);
    if(dd<best){best=dd;nearest=pos;}
  }}
  vec3 vor=vec3((nearest+cell)/8.,c.z);
  return (c-vec3(.5))*.26+(vor-c)*.06;
}

vec3 rotY(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(c*v.x+s*v.z,v.y,-s*v.x+c*v.z);}
float fac(vec3 v,float lift){vec3 r=rotY(v,.7853981852531433)+vec3(0.,lift,0.);return (r.x+r.y+r.z)/3.;}
// 1 below a, easing to 0 at b
float ramp(float f,float a,float b){float t=clamp((f-a)/max(b-a,1e-6),0.,1.);t=t*t*(3.-2.*t);return 1.-t;}

vec3 interior(vec3 gen){
  vec3 a=uAccent;
  vec3 soft=mix(((16.*a-12.)*a+4.)*a,sqrt(a),step(.25,a));
  vec3 cShadow=max(vec3(0.),a+.9465623-1.);
  vec3 cMidLow=a+(2.*.89882153-1.)*(soft-a);
  vec3 cMidHigh=vec3(1.);
  vec3 cHigh=1.-(1.-a)*(1.-.63704175);

  vec3 m=gen+vec3(0.,-.14,0.);
  vec2 cen=gen.xy-.5;
  float rad=length(cen);
  m.xy+=(rad>1e-6?cen/rad:vec2(0.))*smoothstep(.015,.44,rad)*uEdge;
  vec3 wave=noise3(m,uWaveFrame/100.,1.,.4,2.,1.);
  vec3 m2=m+(wave-.5)*(.8*uAmp);
  vec3 grain=noise3(m2,uFlowFrame/10.,4000.,.5,2.,0.);
  vec3 g2=(grain-.5)*uNoiseScale*.06;
  vec3 base=m2*.8+g2;
  float blend=clamp(.5-.5*cos(uBaseFrame*6.2831853/120.),0.,1.);
  vec3 cw=warp3(m2,uBaseFrame);

  // tone 3: highlight
  vec2 p0=base.xy+uOff0;
  vec2 f0=vec2(base.x,1.-base.y)+uOff0;
  float s0=mix(paint(p0)-.5,paint(f0)-.5,blend)*(.2-.06*cos((uBaseFrame-1.)*6.2831853/120.));
  vec3 v6=m2+vec3(s0,s0,0.)+cw;
  float rHigh=ramp(fac(v6,.56),.3431819975376129,.6200000047683716);

  // tone 2: white
  vec3 b1=m2*.8+vec3(.04,.02,0.)+g2;
  vec3 b2=m2*.8+vec3(-.04,-.02,0.)+g2;
  float s1=mix(paint(b1.xy+uOff1)-.5,paint(vec2(b2.x,1.-b2.y)+uOff1)-.5,blend)*(.2-.06*cos((uBaseFrame-1.)*6.2831853/80.));
  vec3 v5=m2+vec3(s1,s1,0.)+cw;
  float rMidHigh=ramp(fac(v5,.26),.4113636016845703,.5586364269256592);

  // tone 1: mid-low, with the left-to-right fade the original uses
  float gx=clamp(gen.y-.32,0.,1.);
  float gradient=gx*gx*(3.-2.*gx);
  vec3 c1=m2*.8+vec3(-.08,-.04,0.)+g2;
  vec3 c2=m2*.8+vec3(-.96,.06,0.)+g2;
  float t1=mix(paint(c1.xy+uOff2),1.,gradient)-.5;
  float t2=mix(paint(vec2(c2.x,1.-c2.y)+uOff2),1.,gradient)-.5;
  float s2=mix(t1,t2,blend)*(.14-.06*cos((uBaseFrame-1.)*6.2831853/100.));
  vec3 v9=m2+vec3(s2,s2,0.)+cw;
  float rMidLow=ramp(fac(v9,.12),.3522728383541107,.7400000095367432);

  vec3 col=cShadow;
  col=mix(col,cMidLow,rMidLow);
  col=mix(col,cMidHigh,rMidHigh);
  col=mix(col,cHigh,rHigh);
  return col;
}

void main(){
  if(uFlat>.5){gl_FragColor=vec4(interior(vec3(gl_FragCoord.xy/uRes,.5)),1.);return;}
  vec2 frame=(gl_FragCoord.xy/uRes)*2.-1.;
  float user=clamp(uUser,0.,1.);
  float voice=max(1.-user*.14+user*clamp(uMic,0.,1.)*.08,.75);
  float scale=voice*uSurface;
  vec2 sdf=frame/scale;
  float dist=length(sdf)-1.;
  float px=2./uRes.x/scale;
  float shape=1.-smoothstep(-px,px,dist+px*.5);
  if(shape<=0.){gl_FragColor=vec4(0.);return;}
  vec3 col=interior(vec3(sdf*.5+.5,.5));
  gl_FragColor=vec4(col*shape,shape);
}`

const parseColor = text => {
  const match = /(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/u.exec(String(text))
  return match ? [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255] : [0.25, 0.46, 0.9]
}

const clamp = (value, low = 0, high = 1) => Math.min(Math.max(value, low), high)
const smooth = (low, high, value) => { const t = clamp((value - low) / (high - low)); return t * t * (3 - 2 * t) }
const ease = (current, target, dt, attack, release) => current + (target - current) * (1 - Math.exp(-dt / (target > current ? attack : release)))
// a damped spring, stepped in 1/120 s slices so it stays stable
const spring = (value, velocity, target, dt, frequency, damping) => {
  const omega = 2 * Math.PI * frequency
  const steps = Math.max(1, Math.ceil(dt * 120))
  const h = dt / steps
  let v = value
  let w = velocity
  for (let i = 0; i < steps; i += 1) { w += ((target - v) * omega * omega - w * 2 * damping * omega) * h; v += w * h }
  return { value: v, velocity: w }
}

const TUNE = {
  fps: 24, startFrame: 350, surface: .34, fit: 1.4,
  speakSpeedScale: .56, speakSpeedBase: 1.8, speakSlowEnergy: 4.6, speakAmp: 1.5, minWaveSpeed: .72,
  edgeDistance: .102, edgeFrequency: 7, edgeDamping: .36, listenNoise: 2.2,
  flowScale: .96, driftScale: .1, windScale: .3, windSpeed: 0.65,
}
const WIND = [.72, 1, 1.28]

/** Returns a renderer for the canvas, or undefined when this browser cannot draw it. */
export function createOrb(canvas, accent, options = {}) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false })
  if (!gl) return undefined
  const compile = (type, source) => {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader')
    return shader
  }
  let program
  try {
    program = gl.createProgram()
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('link')
  } catch (error) { options.onError?.(error); return undefined }
  gl.useProgram(program)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'a')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  const at = name => gl.getUniformLocation(program, name)
  const u = {}
  for (const name of ['uRes', 'uWaveFrame', 'uBaseFrame', 'uAmp', 'uFlowFrame', 'uEdge', 'uNoiseScale', 'uSurface', 'uMic', 'uUser', 'uFlat', 'uOff0', 'uOff1', 'uOff2', 'uAccent']) u[name] = at(name)
  const color = parseColor(accent)
  const flat = options.flat ? Number(options.flat) : 0

  // controller state: what the shader needs, eased and sprung the way the Codex orb's controller does
  const s = {
    last: undefined, base: TUNE.startFrame, wave: TUNE.startFrame, flow: TUNE.startFrame,
    listen: 1, speak: 0, think: 0, level: 0, motion: 0, prevOverall: 0, accent: 0, cumulative: [0, 0, 0],
    drive: 0, boost: 0, boostV: 0, amp: 1, edge: 0, edgeV: 0, flowBoost: 0,
    colour: [0, 0, 0], phase: [0, 2.1, 4.2], user: 0, userOn: false, userFrom: 0, userAt: 0,
  }

  return {
    /** Draw one frame. `now` in seconds; `input` = { mic, assistant, working, reduce } with levels 0..1. */
    draw(now, input) {
      const dt = s.last === undefined ? 0.016 : clamp(now - s.last, 0, .1)
      s.last = now
      const assistant = clamp(input.assistant ?? 0)
      const mic = clamp((input.mic ?? 0) * 1.75)
      const speaking = assistant > .05
      const thinking = !speaking && !!input.working
      const pace = input.reduce ? 0.5 : 1 // reduced motion: the orb keeps moving (it is the call's feedback), only slower

      // state mix: listening, speaking, thinking ease toward their targets in about 0.3 s
      const target = speaking ? { listen: .2, speak: 1, think: 0 } : thinking ? { listen: .65, speak: 0, think: 1 } : { listen: 1, speak: 0, think: 0 }
      const k = 1 - Math.exp(-dt / .28)
      s.listen += (target.listen - s.listen) * k
      s.speak += (target.speak - s.speak) * k
      s.think += (target.think - s.think) * k

      // loudness-driven motion
      const overall = speaking ? assistant : 0
      s.motion += (overall - s.motion) * (1 - Math.exp(-dt / .2))
      s.accent = Math.max(overall - s.prevOverall, 0) * 3.6
      s.prevOverall = overall
      for (let i = 0; i < 3; i += 1) s.cumulative[i] += overall * (i === 0 ? .82 : i === 1 ? .76 : .68) * dt * 60 * 40 * (1 - Math.exp(-dt / 2))
      const energy = clamp(Math.max(...s.cumulative) / 12)
      const waveLevel = overall > .024 ? (1 - Math.exp(-overall * 4)) ** 1.15 : 0

      // wave clock: quicker while speaking, driven through a spring so it eases rather than jumps
      s.drive = ease(s.drive, waveLevel, dt, .045, .14)
      const speedTarget = s.drive * TUNE.speakSpeedScale * (TUNE.speakSpeedBase + Math.max(s.motion, energy) * TUNE.speakSlowEnergy + s.accent * .5)
      const boost = spring(s.boost, s.boostV, speedTarget, dt, 6, .76)
      s.boost = boost.value; s.boostV = boost.velocity
      const waveSpeed = Math.max(TUNE.minWaveSpeed, 1 + s.boost)
      s.amp = ease(s.amp, 1 - waveLevel * (1 - TUNE.speakAmp), dt, .1, .28)

      // the cloud edge: bounces outward on the person's voice
      const userDrive = clamp(s.user) * clamp(input.mic ?? 0)
      const edge = spring(s.edge, s.edgeV, userDrive * TUNE.edgeDistance, dt, TUNE.edgeFrequency, TUNE.edgeDamping)
      s.edge = edge.value; s.edgeV = edge.velocity
      const noiseScale = 1 + userDrive * (TUNE.listenNoise - 1)
      s.flowBoost = ease(s.flowBoost, Math.max(s.motion, energy) * TUNE.flowScale, dt, .055, .16)

      // person speaking: the disc shrinks a little and breathes with the mic (a 140 ms tween on a level trigger)
      const talking = !speaking && !thinking && (s.userOn ? mic > .32 : mic >= .48)
      if (talking !== s.userOn) { s.userFrom = s.user; s.userOn = talking; s.userAt = now }
      s.user = s.userFrom + ((s.userOn ? 1 : 0) - s.userFrom) * clamp((now - s.userAt) / .14)

      // watercolour drift while speaking
      const offsets = [[0, 0], [0, 0], [0, 0]]
      const audio = s.cumulative.map(value => clamp(value / 12))
      for (let i = 0; i < 3; i += 1) s.colour[i] = ease(s.colour[i], audio[i] * (speaking ? 1 : 0) * 1, dt, .07, .22)
      if (speaking) for (let i = 0; i < 3; i += 1) s.phase[i] += dt * TUNE.windSpeed * WIND[i] * (1 + s.colour[i] * 1.5)
      const [r, g, b] = s.colour
      const [p0, p1, p2] = s.phase
      const d = TUNE.driftScale
      const w = TUNE.windScale
      offsets[0] = [r * d + Math.sin(p0) * r * w, -g * d * .55 + Math.cos(p0 * .82) * g * w * .65]
      offsets[1] = [-g * d * .75 + Math.cos(p1 * .91) * g * w * .8, b * d + Math.sin(p1) * b * w]
      offsets[2] = [b * d * 1.1 + Math.sin(p2 * 1.07) * b * w * 1.1, r * d * .7 + Math.cos(p2) * r * w * .75]

      // clocks run at 24 frames a second
      s.base += dt * pace * TUNE.fps
      s.wave += dt * pace * TUNE.fps * waveSpeed
      s.flow += dt * pace * TUNE.fps * (1 + s.flowBoost)

      // size: grows with the voice, breathes slowly when quiet (the Codex scale curve)
      s.level = ease(s.level, speaking ? assistant : 0, dt, .09, .3)
      const out = smooth(.04, .46, s.level)
      const breath = Math.sin(now * Math.PI * .34) * .5 + .5
      const state = Math.max(s.listen, s.think, s.speak)
      let size = TUNE.surface * (.88 + .06 * s.think) * (.82 + .18 * smooth(0, .9, state))
      size += out * TUNE.surface * .12
      size += (1 - s.think) * (1 - out) * breath * TUNE.surface * .01
      const surface = Math.min(TUNE.surface, size) * 2 * TUNE.fit

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform2f(u.uRes, canvas.width, canvas.height)
      gl.uniform1f(u.uWaveFrame, s.wave)
      gl.uniform1f(u.uBaseFrame, s.base)
      gl.uniform1f(u.uAmp, s.amp)
      gl.uniform1f(u.uFlowFrame, s.flow)
      gl.uniform1f(u.uEdge, s.edge)
      gl.uniform1f(u.uNoiseScale, noiseScale)
      gl.uniform1f(u.uSurface, surface)
      gl.uniform1f(u.uMic, mic)
      gl.uniform1f(u.uUser, s.user)
      gl.uniform1f(u.uFlat, flat)
      gl.uniform2f(u.uOff0, offsets[0][0], offsets[0][1])
      gl.uniform2f(u.uOff1, offsets[1][0], offsets[1][1])
      gl.uniform2f(u.uOff2, offsets[2][0], offsets[2][1])
      gl.uniform3f(u.uAccent, color[0], color[1], color[2])
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    dispose() { try { gl.getExtension('WEBGL_lose_context')?.loseContext() } catch { /* already gone */ } },
  }
}
