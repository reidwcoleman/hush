// The lens: HDR render -> bloom -> a filmic grade (exposure, tone curve, warm highlights /
// cool shadows, soft vignette, fine grain) -> SMAA.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1 },
    uTime: { value: 0 },
    uVig: { value: 0.22 },
    uGrain: { value: 0.018 },
    uSat: { value: 1.0 },
    uWarm: { value: 0.5 },
    uShadowT: { value: new THREE.Color(0.92, 0.98, 1.08) },
    uHighT: { value: new THREE.Color(1.05, 1.0, 0.94) },
    uLift: { value: 0.012 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uFade: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uExposure, uTime, uVig, uGrain, uSat, uWarm, uLift, uFade;
uniform vec3 uShadowT, uHighT;
uniform vec2 uRes;
varying vec2 vUv;
// ACES fit (Hill)
vec3 RRTAndODTFit( vec3 v ) {
  vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
  vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
  return a / b;
}
vec3 aces( vec3 c ) {
  const mat3 I = mat3( 0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777 );
  const mat3 O = mat3( 1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602 );
  c = I * c; c = RRTAndODTFit( c ); c = O * c;
  return clamp( c, 0.0, 1.0 );
}
vec3 toSRGB( vec3 c ) { return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) ); }
float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
void main() {
  vec3 c = texture2D( tDiffuse, vUv ).rgb * uExposure;
  float L = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  // split tone before the curve: cool shadows, warm highlights
  float hk = smoothstep( 0.05, 1.2, L );
  c *= mix( uShadowT, uHighT, hk ) * mix( 1.0, 1.0, uWarm );
  c = aces( c * 1.05 );
  // saturation
  float l2 = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c = mix( vec3( l2 ), c, uSat );
  // soft lifted blacks, a film finish
  c = c * ( 1.0 - uLift ) + uLift;
  // vignette
  vec2 q = vUv - 0.5;
  q.x *= uRes.x / uRes.y;
  c *= 1.0 - uVig * smoothstep( 0.35, 1.05, length( q ) );
  c = toSRGB( clamp( c, 0.0, 1.0 ) );
  // grain
  float n = hash( vUv * uRes + fract( uTime * 13.7 ) * 100.0 ) - 0.5;
  c += n * uGrain;
  c = mix( c, vec3( 0.0 ), uFade );
  gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), 1.0 );
}`,
};

// god rays: march toward the sun on screen and gather the bright sky that trees and ridges let
// through
const SHAFTS = {
  uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uK: { value: 0 }, uCol: { value: new THREE.Color() }, uThresh: { value: 2.0 }, uAspect: { value: 1.6 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uK, uThresh, uAspect; uniform vec3 uCol;
varying vec2 vUv;
void main() {
  vec3 c = texture2D( tDiffuse, vUv ).rgb;
  if ( uK > 0.001 ) {
    vec2 d = ( uSun - vUv ) / 24.0;
    vec2 uv = vUv + d * fract( sin( dot( vUv, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
    float acc = 0.0, w = 1.0;
    for ( int i = 0; i < 24; i++ ) {
      uv += d;
      vec3 s = texture2D( tDiffuse, clamp( uv, 0.0, 1.0 ) ).rgb;
      float l = dot( s, vec3( 0.3, 0.59, 0.11 ) );
      acc += smoothstep( uThresh, uThresh * 2.5, l ) * w;
      w *= 0.94;
    }
    vec2 q = ( vUv - uSun ) * vec2( uAspect, 1.0 );
    float fall = 1.0 / ( 1.0 + dot( q, q ) * 6.0 );
    c += uCol * ( acc / 24.0 ) * uK * fall;
  }
  gl_FragColor = vec4( c, 1.0 );
}`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(renderer, rt);
    this.render = new RenderPass(scene, camera);
    this.composer.addPass(this.render);
    this.shafts = new ShaderPass(SHAFTS);
    this.composer.addPass(this.shafts);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.28, 0.65, 2.2);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GRADE);
    this.composer.addPass(this.grade);
    this.smaa = new SMAAPass(size.x, size.y);
    this.composer.addPass(this.smaa);
    this.u = this.grade.uniforms;
  }

  // sun: world direction; camera: the view
  updateShafts(camera, sunDir, color, k) {
    const u = this.shafts.uniforms;
    const p = camera.position.clone().addScaledVector(sunDir, 1000).project(camera);
    const facing = camera.getWorldDirection(new THREE.Vector3()).dot(sunDir);
    const on = facing > 0 && p.z < 1 ? THREE.MathUtils.smoothstep(facing, 0.3, 0.75) : 0;
    u.uSun.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    u.uK.value = on * k;
    u.uCol.value.copy(color);
    u.uAspect.value = camera.aspect;
    this.shafts.enabled = u.uK.value > 0.001;
  }

  setSize(w, h, dpr) {
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.u.uRes.value.set(w * dpr, h * dpr);
  }

  draw(dt) {
    this.u.uTime.value += dt;
    this.composer.render(dt);
  }
}
