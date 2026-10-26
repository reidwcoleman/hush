// hush: an endless, quiet mountain to ski down.
import * as THREE from 'three';
import { heightAt, normalAt, powderAt, lineX, meshHeightAt } from './world.js';
import { AT, makeNoiseTexture } from './atmos.js';
import { Sky } from './sky.js';
import { Terrain } from './terrain.js';
import { Props } from './props.js';
import { Rider, KITS } from './rider.js';
import { Skier } from './skier.js';
import { CamRig } from './camera.js';
import { Spray, Tracks, AirSnow } from './fx.js';
import { Post } from './post.js';
import { Audio } from './audio.js';
import { dotTexture } from './textures.js';

const Q = new URLSearchParams(location.search);
const store = {
  get(k, d) { try { const v = localStorage.getItem('hush.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('hush.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.2, 40000);
scene.add(camera);

let quality = Q.get('q') ?? store.get('quality', 'med');
const QDPR = { low: 0.75, med: 1, high: 1.5 };
let dprScale = 1;
function dpr() { return Math.min(window.devicePixelRatio || 1, QDPR[quality] ?? 1) * dprScale; }
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(dpr());
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  post?.setSize(w, h, dpr());
}

// ------------------------------------------------------------------ world
const ORIGIN = new THREE.Vector3();
const G = {
  h: (x, z) => heightAt(x + ORIGIN.x, z + ORIGIN.z) - ORIGIN.y,
  n: (x, z, out) => normalAt(x + ORIGIN.x, z + ORIGIN.z, out),
  powder: (x, z) => powderAt(x + ORIGIN.x, z + ORIGIN.z),
  mesh: (x, z) => meshHeightAt(x + ORIGIN.x, z + ORIGIN.z) - ORIGIN.y,
};

makeNoiseTexture();
const tl = new THREE.TextureLoader();
const loadTex = (f, srgb) => tl.loadAsync('tex/' + f).then((t) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
});
const [snowN, rockC, rockN] = await Promise.all([loadTex('snow_02_n.webp'), loadTex('rock_face_04_c.webp', true), loadTex('rock_face_04_n.webp')]);
const tex = { snowN, rockC, rockN };

const sky = new Sky(renderer, scene);
sky.hours = Number(Q.get('tod') ?? store.get('tod', 17.0));
let timeFlows = Q.has('tod') ? false : store.get('flow', true);
let weather = Number(Q.get('wx') ?? store.get('wx', 0));
sky.overcast = weather >= 1 ? 0.75 : weather * 0.6;

const terrain = new Terrain(scene, ORIGIN, tex);
const props = new Props(scene, ORIGIN, tex);
terrain.onProps = (k, t, r) => props.add(k, t, r);
terrain.onPropsGone = (k) => props.remove(k);

let kitI = store.get('kit', 0) % KITS.length;
let rider = new Rider(KITS[kitI]);
scene.add(rider.root);
const headlamp = new THREE.SpotLight(0xfff1dc, 0, 60, 0.42, 0.6, 1.4);
headlamp.position.set(0, 1.78, 0.1);
headlamp.target.position.set(0, 0.3, 9);
rider.root.add(headlamp, headlamp.target);

const skier = new Skier(G);
const cam = new CamRig(camera, G);
const dot = dotTexture();
const spray = new Spray(scene, dot);
const tracks = new Tracks(scene);
const air = new AirSnow(scene, dot);
let post = new Post(renderer, scene, camera);
const audio = new Audio();
audio.musicOn = store.get('music', true);
resize();
addEventListener('resize', resize);

// where we start: on the valley floor, pointed down the fall line
function dropIn(az) {
  const ax = lineX(az);
  ORIGIN.set(Math.round(ax / 1024) * 1024, Math.round(heightAt(ax, az)), Math.round(az / 1024) * 1024);
  const lx = ax - ORIGIN.x, lz = az - ORIGIN.z;
  const n = G.n(lx, lz, new THREE.Vector3());
  skier.place(lx, lz, Math.atan2(n.x, n.z) * 0.5);
  cam.snap = true;
}
const startZ = Number(Q.get('z') ?? 0);
dropIn(startZ);

// floating origin: keep everything near zero
function rebase() {
  const p = skier.pos;
  if (Math.abs(p.x) < 1024 && Math.abs(p.z) < 1024 && Math.abs(p.y) < 600) return;
  const d = new THREE.Vector3(Math.round(p.x / 1024) * 1024, Math.round(p.y), Math.round(p.z / 1024) * 1024);
  ORIGIN.add(d);
  skier.pos.sub(d);
  cam.pos.sub(d); cam.look.sub(d);
  if (cam.shot?.at) cam.shot.at.sub(d);
  camera.position.sub(d);
  terrain.shift(d);
  spray.shift(d);
  tracks.shift(d);
  props.update(skier.pos.x + ORIGIN.x, skier.pos.z + ORIGIN.z, true);
}

// ------------------------------------------------------------------ input
const keys = new Set();
const pressed = new Set();
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code); pressed.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const touch = { steer: 0, jump: false, tuck: false, brake: false };
canvas.addEventListener('touchstart', onTouch, { passive: false });
canvas.addEventListener('touchmove', onTouch, { passive: false });
canvas.addEventListener('touchend', onTouch, { passive: false });
function onTouch(e) {
  e.preventDefault();
  touch.steer = 0; touch.jump = false; touch.tuck = false; touch.brake = false;
  for (const t of e.touches) {
    const x = t.clientX / innerWidth, y = t.clientY / innerHeight;
    if (x < 0.33) touch.steer += 1; else if (x > 0.67) touch.steer -= 1;
    else if (y > 0.7) touch.brake = true; else if (y < 0.3) touch.tuck = true; else touch.jump = true;
  }
  if (state === 'title') begin();
}
function readPad() {
  const pads = navigator.getGamepads?.() ?? [];
  for (const p of pads) {
    if (!p) continue;
    const ax = p.axes[0] ?? 0;
    return {
      steer: Math.abs(ax) > 0.12 ? -ax : (p.buttons[14]?.pressed ? 1 : 0) - (p.buttons[15]?.pressed ? 1 : 0),
      tuck: (p.buttons[7]?.value ?? 0) > 0.3 || p.buttons[12]?.pressed,
      brake: (p.buttons[6]?.value ?? 0) > 0.3 || p.buttons[13]?.pressed,
      jump: p.buttons[0]?.pressed,
      grab: p.buttons[2]?.pressed || p.buttons[5]?.pressed,
      start: p.buttons[9]?.pressed,
    };
  }
  return null;
}
function readInput() {
  const k = (...c) => c.some((x) => keys.has(x));
  const pad = readPad();
  const inp = {
    steer: (k('ArrowLeft', 'KeyA') ? 1 : 0) - (k('ArrowRight', 'KeyD') ? 1 : 0) + touch.steer,
    tuck: k('ArrowUp', 'KeyW') || touch.tuck,
    brake: k('ArrowDown', 'KeyS') || touch.brake,
    jump: k('Space') || touch.jump,
    grab: k('ShiftLeft', 'ShiftRight', 'KeyE'),
  };
  if (pad) {
    if (Math.abs(pad.steer) > Math.abs(inp.steer)) inp.steer = pad.steer;
    inp.tuck ||= pad.tuck; inp.brake ||= pad.brake; inp.jump ||= pad.jump; inp.grab ||= pad.grab;
  }
  inp.steer = THREE.MathUtils.clamp(inp.steer, -1, 1);
  return inp;
}

// an easy line down the hill: for the title screen, ?auto=1 and the screenshot tools
const auto = { t: Math.random() * 10, on: Q.get('auto') === '1' };
function autopilot(dt) {
  auto.t += dt;
  const p = skier.pos;
  const n = G.n(p.x, p.z, new THREE.Vector3());
  const fall = Math.atan2(n.x, n.z);
  let want = fall + Math.sin(auto.t * 0.55) * 0.75;
  // stay off the walls
  const ax = p.x + ORIGIN.x, az = p.z + ORIGIN.z;
  const off = ax - lineX(az);
  want -= THREE.MathUtils.clamp(off / 300, -0.6, 0.6);
  // look ahead for trees and rocks
  const sp = Math.max(6, skier.vel.length());
  for (const look of [0.6, 1.1, 1.7]) {
    const lx = ax + Math.sin(skier.yaw) * sp * look, lz = az + Math.cos(skier.yaw) * sp * look;
    const hit = props.nearest(lx, lz);
    if (hit && hit.d < 2.5) {
      const side = (hit.x - lx) * Math.cos(skier.yaw) - (hit.z - lz) * Math.sin(skier.yaw);
      want += side > 0 ? -0.9 : 0.9;
      break;
    }
  }
  const diff = Math.atan2(Math.sin(want - skier.yaw), Math.cos(want - skier.yaw));
  return { steer: THREE.MathUtils.clamp(diff * 2.2, -1, 1), tuck: sp < 9, brake: sp > 24, jump: false, grab: false };
}

// ------------------------------------------------------------------ ui
const $ = (id) => document.getElementById(id);
const ui = { title: $('title'), hud: $('hud'), menu: $('menu'), veil: $('veil'), toasts: $('toasts'), photo: $('photo') };
function toast(text, sub) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
  ui.toasts.appendChild(el);
  while (ui.toasts.children.length > 3) ui.toasts.firstChild.remove();
  requestAnimationFrame(() => el.classList.add('on'));
  setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 900); }, 2300);
}
function todName(h) {
  h = ((h % 24) + 24) % 24;
  if (h < 5.4 || h > 19.7) return 'night';
  if (h < 6.9) return 'first light';
  if (h < 8.5) return 'morning';
  if (h < 14.6) return 'midday';
  if (h < 16.2) return 'afternoon';
  if (h < 18.25) return 'golden hour';
  return 'dusk';
}

let state = 'loading'; // loading -> title -> ride (menu/photo overlay)
let menuOpen = false, photo = false;
const stats = { dist: 0, top: 0, air: 0, bestAir: 0, wipes: 0 };

function setChips(id, attr, val) {
  for (const b of $(id).querySelectorAll('button')) b.classList.toggle('on', b.dataset[attr] === String(val));
}
function refreshMenu() {
  const near = [...$('todChips').querySelectorAll('button')].reduce((a, b) => (Math.abs(b.dataset.tod - sky.hours) < Math.abs(a.dataset.tod - sky.hours) ? b : a));
  for (const b of $('todChips').querySelectorAll('button')) b.classList.toggle('on', b === near);
  setChips('flowChips', 'flow', timeFlows ? 1 : 0);
  setChips('wxChips', 'wx', weather);
  setChips('camChips', 'cam', cam.mode === 'photo' ? 'chase' : cam.mode);
  setChips('musChips', 'mus', audio.musicOn ? 1 : 0);
  setChips('qChips', 'q', quality);
  const kc = $('kitChips');
  if (!kc.children.length) KITS.forEach((k, i) => {
    const b = document.createElement('button');
    b.style.background = '#' + new THREE.Color(k.jacket).getHexString(THREE.SRGBColorSpace);
    b.dataset.kit = i;
    kc.appendChild(b);
  });
  setChips('kitChips', 'kit', kitI);
  const ft = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  $('stats').innerHTML = `<div><b>${(stats.dist / 1000).toFixed(1)}</b><span>km skied</span></div><div><b>${Math.round(stats.top * 3.6)}</b><span>top km/h</span></div><div><b>${ft(stats.air)}</b><span>in the air</span></div><div><b>${stats.bestAir.toFixed(1)}s</b><span>longest air</span></div>`;
}
function openMenu(on) {
  menuOpen = on;
  ui.menu.classList.toggle('show', on);
  if (on) refreshMenu();
}
$('resume').onclick = () => openMenu(false);
$('menu').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) { if (e.target === ui.menu) openMenu(false); return; }
  const d = b.dataset;
  if (d.tod) { sky.hours = Number(d.tod); store.set('tod', sky.hours); }
  if (d.flow) { timeFlows = d.flow === '1'; store.set('flow', timeFlows); }
  if (d.wx) { weather = Number(d.wx); store.set('wx', weather); }
  if (d.cam) { cam.mode = d.cam; cam.snap = true; cam.shot = null; store.set('cam', d.cam); }
  if (d.mus) { audio.setMusic(d.mus === '1'); store.set('music', audio.musicOn); }
  if (d.q) { quality = d.q; store.set('quality', quality); dprScale = 1; resize(); }
  if (d.kit) { setKit(Number(d.kit)); }
  refreshMenu();
});
function setKit(i) {
  kitI = i; store.set('kit', i);
  const old = rider;
  rider = new Rider(KITS[i]);
  rider.root.add(headlamp, headlamp.target);
  scene.remove(old.root);
  scene.add(rider.root);
}

// photo mode: orbit with the mouse
let drag = null;
canvas.addEventListener('pointerdown', (e) => { if (photo) drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.orbit.yaw -= (e.clientX - drag.x) * 0.006;
  cam.orbit.pitch = THREE.MathUtils.clamp(cam.orbit.pitch + (e.clientY - drag.y) * 0.004, -0.15, 1.3);
  drag = { x: e.clientX, y: e.clientY };
});
addEventListener('wheel', (e) => { if (photo) cam.orbit.dist = THREE.MathUtils.clamp(cam.orbit.dist * (1 + e.deltaY * 0.001), 2, 60); }, { passive: true });
let prevCam = 'chase';
function setPhoto(on) {
  photo = on;
  ui.photo.classList.toggle('show', on);
  ui.hud.classList.toggle('show', !on && state === 'ride');
  if (on) {
    prevCam = cam.mode;
    cam.mode = 'photo';
    const d = new THREE.Vector3().subVectors(camera.position, skier.pos);
    cam.orbit.yaw = Math.atan2(d.x, d.z);
    cam.orbit.dist = THREE.MathUtils.clamp(d.length(), 3, 40);
    cam.orbit.pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp((d.y - 1) / d.length(), -1, 1)), -0.15, 1.3);
  } else { cam.mode = prevCam; cam.snap = true; }
}

function begin() {
  if (state !== 'title') return;
  state = 'ride';
  audio.start();
  auto.on = Q.get('auto') === '1';
  ui.title.classList.remove('show');
  ui.hud.classList.add('show');
  cam.mode = store.get('cam', 'chase');
  if (cam.mode === 'photo') cam.mode = 'chase';
  cam.snap = true; cam.shot = null;
  setTimeout(() => toast('breathe out', 'the whole mountain is yours'), 900);
}

function handleKeys() {
  for (const c of pressed) {
    if (state === 'title' && !['Escape', 'MetaLeft', 'MetaRight', 'Tab'].includes(c)) { begin(); continue; }
    if (state !== 'ride') continue;
    if (c === 'Escape') { if (photo) setPhoto(false); else openMenu(!menuOpen); }
    if (menuOpen) continue;
    if (c === 'KeyP') setPhoto(!photo);
    if (c === 'KeyC' && !photo) {
      const order = ['chase', 'cine', 'drone'];
      cam.mode = order[(order.indexOf(cam.mode) + 1) % order.length];
      cam.snap = true; cam.shot = null; store.set('cam', cam.mode);
      showHint({ chase: 'follow camera', cine: 'cinematic camera', drone: 'drone camera' }[cam.mode]);
    }
    if (c === 'KeyT') {
      const stops = [6.4, 11.5, 17.2, 18.6, 22.5];
      const h = ((sky.hours % 24) + 24) % 24;
      sky.hours = stops.find((s) => s > h + 0.05) ?? stops[0];
      showHint(todName(sky.hours));
    }
    if (c === 'KeyM') { audio.setMusic(!audio.musicOn); store.set('music', audio.musicOn); showHint(audio.musicOn ? 'music on' : 'music off'); }
    if (c === 'KeyR') { dropIn(skier.pos.z + ORIGIN.z + 400); tracks.lift('L'); tracks.lift('R'); showHint('a fresh line'); }
  }
  pressed.clear();
}
let hintT = null;
function showHint(t) {
  const h = $('hint');
  h.textContent = t; h.classList.add('on');
  clearTimeout(hintT); hintT = setTimeout(() => h.classList.remove('on'), 1600);
}

// ------------------------------------------------------------------ the frame
const clock = new THREE.Clock();
const STEP = 1 / 120;
let acc = 0;
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const riderUp = new THREE.Vector3(0, 1, 0);
const basis = new THREE.Matrix4();
let lastEdgeSign = 0;
let nearMissCD = 0;
let trackAcc = 0;
let fpsAcc = 0, fpsN = 0, slowT = 0, fastT = 0;
let flow = 0;
let powderToastCD = 0;

function onEvents() {
  for (const e of skier.events) {
    if (e.type === 'land') {
      if (e.airT < 0.15) continue;
      audio.thump(Math.min(1.5, e.impact / 8 + 0.3));
      const p = skier.pos;
      spray.emit(p.x, p.y + 0.05, p.z, skier.vel.x * 0.3, 1.2, skier.vel.z * 0.3, 2.5 + e.impact * 0.25, Math.round(30 + e.impact * 6), 0.32, 1.1);
      cam.shake = Math.min(3, e.impact * 0.2);
      if (state === 'ride' && !auto.on) {
        stats.air += e.airT;
        stats.bestAir = Math.max(stats.bestAir, e.airT);
        const parts = [];
        if (e.turns >= 180) parts.push(e.turns);
        if (skier.grab > 0.3 || e.grab) parts.push('grab');
        if (e.turns >= 180) toast(e.clean ? `clean ${e.turns}` : `${e.turns}`, e.airT > 0.8 ? `${e.airT.toFixed(1)} s of air` : '');
        else if (e.airT > 1.1) toast(e.airT > 2.2 ? 'floating' : 'airborne', `${e.airT.toFixed(1)} s`);
        flow = Math.min(1, flow + Math.min(0.3, e.airT * 0.12));
      }
    } else if (e.type === 'wipe') {
      const p = skier.pos;
      spray.emit(p.x, p.y + 0.3, p.z, skier.vel.x * 0.4, 1.5, skier.vel.z * 0.4, 3.5, 120, 0.4, 1.4);
      audio.thump(1.3);
      cam.shake = 3;
      if (state === 'ride' && !auto.on) { stats.wipes++; toast(['soft landing', 'face shot', 'all good', 'snow angel'][stats.wipes % 4], 'shake it off'); }
      flow *= 0.3;
      tracks.lift('L'); tracks.lift('R');
    } else if (e.type === 'takeoff') {
      tracks.lift('L'); tracks.lift('R');
    }
  }
  skier.events.length = 0;
}

function placeRider(dt) {
  const R = rider;
  const p = skier.pos;
  const n = G.n(p.x, p.z, tmp);
  // soften the ground normal under the rider; in the air drift back to upright
  riderUp.lerp(skier.air ? up : n, 1 - Math.exp(-(skier.air ? 3 : 14) * dt)).normalize();
  const fwd = tmp2.set(Math.sin(skier.visYaw), 0, Math.cos(skier.visYaw));
  fwd.addScaledVector(riderUp, -fwd.dot(riderUp)).normalize();
  const left = new THREE.Vector3().crossVectors(riderUp, fwd).normalize();
  basis.makeBasis(left, riderUp, fwd);
  R.root.quaternion.setFromRotationMatrix(basis);
  const lift = skier.air ? 0 : Math.max(0, G.mesh(p.x, p.z) - p.y);
  R.root.position.set(p.x, p.y + lift + 0.005, p.z);
  // pole plants at each turn's start
  const es = Math.abs(skier.edge) > 0.18 ? Math.sign(skier.edge) : 0;
  if (es !== 0 && es !== lastEdgeSign && skier.speed > 4 && !skier.air) R.plant[es > 0 ? 'L' : 'R'] = 1;
  if (es !== 0) lastEdgeSign = es;
  for (const s of ['L', 'R']) R.plant[s] = Math.max(0, R.plant[s] - dt * 2.6);
  const head = Math.atan2(skier.vel.x, skier.vel.z);
  const twist = skier.speed > 2 ? THREE.MathUtils.clamp(-Math.atan2(Math.sin(skier.visYaw - head), Math.cos(skier.visYaw - head)) * 0.7, -0.7, 0.7) : 0;
  R.pose({
    crouch: skier.crouch, tuck: skier.tuck, lean: skier.wipe > 0 ? 1.35 * skier.wipeK : skier.lean, edge: skier.edge,
    twist, grab: skier.grab, air: skier.air, wipe: skier.wipeK * 0.3,
  });
}

function emitSpray(dt) {
  if (skier.air || skier.wipe > 0) return;
  const R = rider;
  const sp = skier.speed;
  const pw = skier.powder;
  const rate = sp * (skier.carve * 14 + pw * 9 + 2) + skier.skid * 40 + skier.brake * sp * 30;
  let n = rate * dt;
  const whole = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
  if (!whole) return;
  const v = skier.vel;
  const side = tmp.set(Math.cos(skier.yaw), 0, -Math.sin(skier.yaw)); // rider's left
  const out = -Math.sign(skier.edge || 0.01);
  for (const s of ['L', 'R']) {
    const ski = R.skis[s];
    ski.getWorldPosition(tmp2);
    const k = 0.5 + skier.brake * 1.2 + skier.skid * 0.1;
    spray.emit(tmp2.x - v.x * 0.03, tmp2.y + 0.03, tmp2.z - v.z * 0.03,
      v.x * 0.45 + side.x * out * k * 2.2, 0.9 + pw * 1.5 + skier.brake * 1.5, v.z * 0.45 + side.z * out * k * 2.2,
      0.8 + pw * 1.2 + skier.brake * 1.5, Math.ceil(whole / 2), 0.045 + pw * 0.07 + skier.brake * 0.05, 0.5 + pw * 0.8);
  }
}

function layTracks(dt) {
  if (skier.air || skier.wipe > 0) return;
  trackAcc += skier.speed * dt;
  if (trackAcc < 0.35) return;
  trackAcc = 0;
  const R = rider;
  const side = new THREE.Vector3(Math.cos(skier.visYaw), 0, -Math.sin(skier.visYaw));
  const w = 0.05 + skier.powder * 0.05 + skier.brake * 0.35 + Math.min(0.15, skier.skid * 0.02);
  const depth = 0.25 + skier.powder * 0.75;
  for (const s of ['L', 'R']) {
    R.skis[s].getWorldPosition(tmp2);
    const y0 = G.mesh(tmp2.x, tmp2.z);
    const l = tmp2.clone().addScaledVector(side, w);
    const r = tmp2.clone().addScaledVector(side, -w);
    l.y = G.mesh(l.x, l.z) + 0.012; r.y = G.mesh(r.x, r.z) + 0.012;
    if (Math.abs(y0 - skier.pos.y) > 1) continue;
    tracks.add(s, l, r, depth);
  }
}

function collide() {
  if (skier.wipe > 0) return;
  const p = skier.pos;
  const hit = props.nearest(p.x + ORIGIN.x, p.z + ORIGIN.z);
  nearMissCD -= 1 / 60;
  if (!hit) return;
  const top = hit.kind === 'tree' ? hit.y + 14 * hit.s : hit.y + hit.s * 0.4;
  const feet = p.y + ORIGIN.y;
  if (hit.d < 0 && feet < top) {
    const away = new THREE.Vector3(p.x + ORIGIN.x - hit.x, 0, p.z + ORIGIN.z - hit.z).normalize();
    const sp = skier.vel.length();
    skier.vel.multiplyScalar(0.25).addScaledVector(away, Math.min(4, sp * 0.3));
    skier.startWipe(hit.kind);
  } else if (hit.d < 1.4 && hit.kind === 'tree' && skier.speed > 11 && nearMissCD <= 0 && state === 'ride' && !auto.on) {
    nearMissCD = 6;
    toast('threaded it', 'close to the trees');
    flow = Math.min(1, flow + 0.15);
  }
}

function adaptRes(dt) {
  fpsAcc += dt; fpsN++;
  if (fpsAcc < 1) return;
  const fps = fpsN / fpsAcc;
  fpsAcc = 0; fpsN = 0;
  window.__fps = fps;
  if (Q.has('fixdpr')) return;
  if (fps < 48) { slowT++; fastT = 0; } else if (fps > 58) { fastT++; slowT = 0; } else { slowT = 0; fastT = 0; }
  if (slowT >= 2 && dprScale > 0.55) { dprScale = Math.max(0.55, dprScale - 0.12); slowT = 0; resize(); }
  if (fastT >= 6 && dprScale < 1) { dprScale = Math.min(1, dprScale + 0.08); fastT = 0; resize(); }
}

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  handleKeys();
  AT.uTime.value += dt;
  const abs = tmp.set(skier.pos.x + ORIGIN.x, 0, skier.pos.z + ORIGIN.z);
  terrain.update(abs.x, abs.z);
  props.update(abs.x, abs.z);

  if (state === 'loading') {
    $('cta').textContent = 'finding the snow · ' + Math.round(terrain.progress() * 100) + '%';
    if (terrain.ready()) {
      state = 'title';
      cam.mode = 'title'; cam.snap = true;
      ui.veil.classList.add('off');
      $('cta').textContent = 'press any key to drop in';
      window.__ready = true;
      if (Q.get('menu') === '0') begin();
    }
  }

  const live = state !== 'loading' && !menuOpen && !photo;
  if (live) {
    acc += dt;
    const inp = state === 'title' || auto.on ? autopilot(dt) : readInput();
    const z0 = skier.pos.z;
    const x0 = skier.pos.x;
    while (acc >= STEP) {
      skier.step(STEP, inp);
      acc -= STEP;
    }
    if (state === 'ride') {
      stats.dist += Math.hypot(skier.pos.x - x0, skier.pos.z - z0);
      stats.top = Math.max(stats.top, skier.speed);
    }
    collide();
    onEvents();
    // flow: carving, speed and air build it, braking lets it go
    flow += ((skier.carve > 0.3 && skier.speed > 12 ? 0.04 : 0) - skier.brake * 0.2 - 0.01) * dt;
    flow = THREE.MathUtils.clamp(flow, 0, 1);
    powderToastCD -= dt;
    if (state === 'ride' && skier.powder > 0.9 && skier.speed > 10 && powderToastCD <= 0 && !skier.air && !auto.on) {
      powderToastCD = 40; toast('deep and quiet', 'fresh powder');
    }
    if (timeFlows) sky.hours += dt / 90;
  }
  rebase();
  placeRider(live ? dt : 0);
  if (live) { emitSpray(dt); layTracks(dt); }
  spray.update(live ? dt : 0);
  tracks.flush();

  cam.update(dt, skier);
  // inspection hook for the tools: { p: [x,y,z], l: [x,y,z], fov } in local coordinates
  const fc = window.__freeCam;
  if (fc) { camera.position.set(...fc.p); camera.lookAt(...fc.l); if (fc.fov && camera.fov !== fc.fov) { camera.fov = fc.fov; camera.updateProjectionMatrix(); } }
  // lights, sky, air
  sky.overcast += ((weather >= 1 ? 0.75 : weather * 0.6) - sky.overcast) * (1 - Math.exp(-0.6 * dt));
  const elev = sky.update(dt, camera.position, scene);
  air.update(camera);
  air.u.uSnow.value += ((weather >= 1 ? 1 : 0) - air.u.uSnow.value) * (1 - Math.exp(-0.5 * dt));
  air.u.uDust.value = (1 - sky.overcast) * THREE.MathUtils.smoothstep(elev, -2, 6) * 0.8;
  air.u.uAmb.value.copy(AT.uFogCol.value).multiplyScalar(0.9);
  spray.uAmb.value.copy(AT.uFogCol.value);
  headlamp.intensity = AT.uNight.value * 40;
  post.u.uExposure.value = sky.exposure;
  post.u.uShadowT.value.setRGB(0.95, 1.0, 1.06 + AT.uNight.value * 0.1);
  post.u.uHighT.value.setRGB(1.02, 1.01, 0.95);

  audio.update({ speed: skier.speed, carve: skier.carve, skid: skier.skid + skier.brake * 6, powder: skier.powder, air: skier.air, wipe: skier.wipe > 0 });

  // hud
  if (state === 'ride') {
    $('kmh').textContent = Math.round(skier.speed * 3.6);
    $('km').textContent = (stats.dist / 1000).toFixed(1);
    const h = ((sky.hours % 24) + 24) % 24;
    $('tod').textContent = todName(h);
    $('hhmm').textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
  }
  post.draw(dt);
  adaptRes(dt);
  requestAnimationFrame(frame);
}

// warm the shaders before the first frame
renderer.compile(scene, camera);
requestAnimationFrame(frame);

window.__game = { tracks, spray, THREE, nearestTree: (x, z) => props.nearest(x + ORIGIN.x, z + ORIGIN.z), skier, cam, sky, terrain, props, rider: () => rider, ORIGIN, G, renderer, scene, camera, post, setKit, begin, stats, auto };
