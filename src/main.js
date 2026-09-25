import * as THREE from "three";
import { buildTrack, buildHeightfield, coastRadius, ROAD_HALF, ZONES } from "./island.js";
import { buildWorld } from "./world.js";
import { buildRider, buildVespa } from "./pelican.js";
import { Sound } from "./audio.js";
import { mulberry32, clamp, lerp, angDiff } from "./noise.js";

const $ = (id) => document.getElementById(id);
const ui = {
  host: $("canvas-host"), loading: $("loading"), intro: $("intro"), start: $("start-button"), hud: $("hud"),
  time: $("hud-time"), lemons: $("hud-lemons"), lemonTotal: $("hud-lemon-total"), stage: $("hud-stage"), stageName: $("hud-stage-name"),
  speed: $("hud-speed"), energy: $("energy-fill"), energyWrap: $("energy"), toast: $("toast"), countdown: $("countdown"),
  touch: $("touch-controls"), pause: $("pause-button"), pauseScreen: $("pause-screen"), resume: $("resume-button"), restartPause: $("restart-pause"),
  sound: $("sound-toggle"), result: $("result"), resultTitle: $("result-title"), resultMedal: $("result-medal"), resultStats: $("result-stats"),
  resultBest: $("result-best"), again: $("again-button"), minimap: $("minimap"), best: $("intro-best"), arrow: $("next-arrow"), wrongWay: $("wrong-way"),
  boostBtn: $("boost-button")
};

const isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
const lowPower = isTouch || Math.min(window.innerWidth, window.innerHeight) < 700;

const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
ui.host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xd6e6ea, 0.0026);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.3, 2400);

const rand = mulberry32(20260925);
const track = buildTrack();
const hf = buildHeightfield(track);
const world = buildWorld(scene, track, hf, renderer, rand);

scene.add(new THREE.HemisphereLight(0xcfe8ff, 0xd8b88a, 1.15));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.7);
sun.castShadow = true;
const SH = lowPower ? 1024 : 2048;
sun.shadow.mapSize.set(SH, SH);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// ---------- Course content ----------
const L = track.length;
const START_S = 38;
const indexNear = (theta) => {
  let best = 0, bd = Infinity;
  for (let i = 0; i < track.count; i++) {
    const d = Math.abs(angDiff(track.theta[i], theta));
    if (d < bd) { bd = d; best = i; }
  }
  return best;
};
const unwrap = (s) => { let v = s - START_S; v = ((v % L) + L) % L; return v; };
const CHECKPOINTS = [
  { name: "金沙滩 Spiaggia d'Oro", s: unwrap(track.cum[indexNear(ZONES.beach)]) },
  { name: "古石桥 Ponte Antico", s: unwrap(track.cum[indexNear(ZONES.cove)]) },
  { name: "柠檬园 Limonaia", s: unwrap(track.cum[indexNear(ZONES.lemon)]) },
  { name: "灯塔海角 Capo del Faro", s: unwrap(track.cum[indexNear(ZONES.cape)]) },
  { name: "钟楼广场 Piazza (终点)", s: L - 4 }
].sort((a, b) => a.s - b.s);
const FINISH_S = L - 4;
const courseS = (u) => u + START_S;

function makeGate(u, finish) {
  const info = track.pointAt(courseS(u), 0);
  const g = new THREE.Group();
  g.position.copy(info.p);
  g.rotation.y = Math.atan2(info.t.x, info.t.z);
  const postMat = new THREE.MeshStandardMaterial({ color: finish ? "#f4ecdf" : "#8a6b4a", roughness: 0.8 });
  const w = ROAD_HALF + 1.2;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 5.4, 10), postMat);
    post.position.set(sx * w, 2.7, 0); post.castShadow = true; g.add(post);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.4, 0.7, 12), new THREE.MeshStandardMaterial({ color: "#c0643c" }));
    pot.position.set(sx * w, 0.35, 0); g.add(pot);
    const flowers = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), new THREE.MeshStandardMaterial({ color: "#e0457b", flatShading: true }));
    flowers.position.set(sx * w, 0.9, 0); g.add(flowers);
  }
  const colors = ["#2e8b57", "#ffffff", "#d7263d", "#f4c430"];
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute("position", new THREE.Float32BufferAttribute([-0.28, 0, 0, 0.28, 0, 0, 0, -0.6, 0], 3));
  flagGeo.computeVertexNormals();
  const n = 16;
  for (let k = 0; k < n; k++) {
    const x = -w + (2 * w * (k + 0.5)) / n;
    const sag = 0.7 * (1 - (x / w) ** 2);
    const f = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: colors[k % colors.length], side: THREE.DoubleSide }));
    f.position.set(x, 5.2 - sag, 0);
    g.add(f);
  }
  const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-w, 5.3, 0), new THREE.Vector3(0, 4.55, 0), new THREE.Vector3(w, 5.3, 0)]), 12, 0.02, 4), postMat);
  g.add(rope);
  if (finish) {
    const c = document.createElement("canvas"); c.width = 512; c.height = 96;
    const x = c.getContext("2d");
    x.fillStyle = "#1f5e8c"; x.fillRect(0, 0, 512, 96);
    x.fillStyle = "#fff6df"; x.font = "bold 54px Georgia, serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText("ARRIVO · 终点", 256, 50);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.6, w * 0.3), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
    banner.position.set(0, 6.2, 0); banner.rotation.y = Math.PI; g.add(banner);
  }
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(w - 0.3, w - 0.3, 7, 32, 1, true), new THREE.MeshBasicMaterial({ color: "#ffe27a", transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  beacon.scale.z = 0.08;
  beacon.position.y = 3.5;
  g.add(beacon);
  scene.add(g);
  return { group: g, beacon };
}
const gates = CHECKPOINTS.map((cp) => makeGate(cp.s, cp.s === FINISH_S));

// Lemons
const lemonGeo = new THREE.SphereGeometry(0.42, 16, 12);
lemonGeo.scale(1, 0.95, 1.35);
const lemonMesh = new THREE.InstancedMesh(lemonGeo, new THREE.MeshStandardMaterial({ color: "#ffd83a", roughness: 0.35, emissive: "#8a6a00", emissiveIntensity: 0.35 }), 80);
const leafMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6).scale(0.5, 0.12, 1.3), new THREE.MeshStandardMaterial({ color: "#3c7a2e" }), 80);
lemonMesh.castShadow = true;
scene.add(lemonMesh, leafMesh);
const lemons = [];
{
  let u = 70;
  let k = 0;
  while (u < FINISH_S - 30 && lemons.length < 70) {
    const pattern = k % 4;
    const n = 4 + (k % 3);
    const baseLat = [-2, 0, 2, -1][k % 4];
    for (let j = 0; j < n; j++) {
      const lat = pattern === 3 ? Math.sin(j * 0.9) * 2.6 : pattern === 1 ? -2.4 + j * (4.8 / (n - 1)) : baseLat;
      const info = track.pointAt(courseS(u + j * 3.5), clamp(lat, -3.2, 3.2));
      lemons.push({ p: info.p.clone().add(new THREE.Vector3(0, 1.1, 0)), taken: false });
    }
    u += 36 + (k % 3) * 9;
    k++;
  }
}
const LEMON_TOTAL = lemons.length;
ui.lemonTotal.textContent = String(LEMON_TOTAL);

// Boost pads
const chevron = (() => {
  const c = document.createElement("canvas"); c.width = 128; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(25,160,200,0.8)"; g.fillRect(0, 0, 128, 256);
  g.strokeStyle = "#ffffff"; g.lineWidth = 18; g.lineJoin = "round"; g.lineCap = "round";
  for (let k = 0; k < 3; k++) { const y = 50 + k * 72; g.beginPath(); g.moveTo(18, y + 44); g.lineTo(64, y); g.lineTo(110, y + 44); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const padMat = new THREE.MeshBasicMaterial({ map: chevron, transparent: true, opacity: 0.92, depthWrite: false });
const pads = [];
for (const u of [150, 330, 520, 760, 980, 1180, 1400, 1560]) {
  if (u > FINISH_S - 40) continue;
  const lat = [0, -2, 2][pads.length % 3];
  const info = track.pointAt(courseS(u), lat);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.4), padMat);
  m.rotation.order = "YXZ";
  m.rotation.set(-Math.PI / 2, Math.atan2(info.t.x, info.t.z) + Math.PI, 0);
  m.position.copy(info.p).add(new THREE.Vector3(0, 0.06, 0));
  m.renderOrder = 2;
  scene.add(m);
  pads.push({ u, lat, p: info.p.clone() });
}

// Obstacles: crates and terracotta planters
const obstacles = [];
const crateTex = (() => {
  const c = document.createElement("canvas"); c.width = 64; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#b8864f"; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = "#7d5530"; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58);
  g.beginPath(); g.moveTo(4, 4); g.lineTo(60, 60); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.9 });
const potMat = new THREE.MeshStandardMaterial({ color: "#c46a3f", roughness: 0.8 });
const leafMat = new THREE.MeshStandardMaterial({ color: "#3f7d35", flatShading: true });
const lemonsOnCrate = new THREE.MeshStandardMaterial({ color: "#ffd83a", roughness: 0.4 });
{
  let u = 110, k = 0;
  while (u < FINISH_S - 25) {
    const lat = [-2.2, 2.2, 0, -2.6, 2.6, 0.6][k % 6];
    const info = track.pointAt(courseS(u), lat);
    const nearLemon = lemons.some((l) => l.p.distanceTo(info.p) < 4);
    const nearPad = pads.some((p) => p.p.distanceTo(info.p) < 8);
    if (!nearLemon && !nearPad) {
      const g = new THREE.Group();
      if (k % 2 === 0) {
        const c1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.1), crateMat); c1.position.y = 0.4; g.add(c1);
        const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 1.0), crateMat); c2.position.set(0.1, 1.15, 0); c2.rotation.y = 0.4; g.add(c2);
        for (let j = 0; j < 5; j++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), lemonsOnCrate); l.position.set(-0.25 + j * 0.13, 1.55, (j % 2) * 0.12 - 0.06); g.add(l); }
      } else {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.42, 0.9, 14), potMat); pot.position.y = 0.45; g.add(pot);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 6, 16), potMat); rim.rotation.x = Math.PI / 2; rim.position.y = 0.9; g.add(rim);
        const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), leafMat); plant.position.y = 1.4; g.add(plant);
        const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: "#e84a8a", flatShading: true })); fl.position.set(0.3, 1.8, 0.2); g.add(fl);
      }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.position.copy(info.p);
      g.rotation.y = rand() * 6;
      scene.add(g);
      obstacles.push({ p: info.p.clone(), r: 0.85, group: g });
    }
    u += 48 + (k % 4) * 11;
    k++;
  }
}

// Oncoming Vespa traffic
const vespas = ["#8fd3c4", "#e6533c", "#f3d37a", "#fbfbf5", "#5aa0d8"].map((c, k) => {
  const m = buildVespa(c);
  scene.add(m);
  return { mesh: m, s: START_S + 180 + k * (L / 5), speed: 7 + k * 0.6, lat: -2.3 };
});

// ---------- Rider ----------
const rider = buildRider();
scene.add(rider.root);
const riderShadowCatcher = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.18, depthWrite: false }));
riderShadowCatcher.rotation.x = -Math.PI / 2;
scene.add(riderShadowCatcher);

const state = {
  mode: "intro", x: 0, z: 0, y: 0, yaw: 0, speed: 0, hint: 0, s: 0, progress: 0, lean: 0, steer: 0,
  time: 0, lemons: 0, hits: 0, cp: 0, energy: 0.35, boosting: 0, padBoost: 0, countdown: 0, penalty: 0, toastT: 0, bumpT: 0, wrongT: 0, paused: false
};

function resetRide() {
  const info = track.pointAt(START_S - 10, 1.8);
  state.x = info.p.x; state.z = info.p.z; state.y = info.p.y;
  state.yaw = Math.atan2(info.t.x, info.t.z);
  state.speed = 0; state.hint = info.i; state.s = START_S - 10; state.progress = -10;
  Object.assign(state, { time: 0, lemons: 0, hits: 0, cp: 0, energy: 0.35, boosting: 0, padBoost: 0, penalty: 0, lean: 0, steer: 0, bumpT: 0, wrongT: 0 });
  lemons.forEach((l) => { l.taken = false; });
  obstacles.forEach((o) => { o.group.visible = true; o.hit = false; });
  gates.forEach((g, k) => { g.beacon.visible = k === 0; });
  updateHud(true);
}

// ---------- Input ----------
const keys = new Set();
const touch = { left: false, right: false, brake: false, boost: false };
window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  if ((e.key === "p" || e.key === "Escape") && (state.mode === "ride" || state.mode === "paused")) togglePause();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => { keys.clear(); Object.keys(touch).forEach((k) => { touch[k] = false; }); if (state.mode === "ride") togglePause(); });
document.querySelectorAll("[data-control]").forEach((btn) => {
  const action = btn.dataset.control;
  const on = (e) => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); touch[action] = true; btn.classList.add("active"); if (navigator.vibrate && action === "boost") navigator.vibrate(12); };
  const off = (e) => { e.preventDefault(); touch[action] = false; btn.classList.remove("active"); };
  btn.addEventListener("pointerdown", on);
  btn.addEventListener("pointerup", off);
  btn.addEventListener("pointercancel", off);
  btn.addEventListener("lostpointercapture", off);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
});
document.addEventListener("touchmove", (e) => { if (state.mode !== "intro") e.preventDefault(); }, { passive: false });
document.addEventListener("gesturestart", (e) => e.preventDefault());

const inputSteer = () => {
  let s = 0;
  if (keys.has("arrowleft") || keys.has("a") || touch.left) s += 1;
  if (keys.has("arrowright") || keys.has("d") || touch.right) s -= 1;
  return s;
};

// ---------- Audio / UI ----------
const sound = new Sound();
const savedSound = localStorage.getItem("pelican-riviera-sound");
if (savedSound === "off") { sound.enabled = false; ui.sound.classList.add("off"); ui.sound.setAttribute("aria-pressed", "false"); }
ui.sound.addEventListener("click", () => {
  sound.init();
  sound.setEnabled(!sound.enabled);
  ui.sound.classList.toggle("off", !sound.enabled);
  ui.sound.setAttribute("aria-pressed", String(sound.enabled));
  localStorage.setItem("pelican-riviera-sound", sound.enabled ? "on" : "off");
});

function toast(text, kind = "") {
  ui.toast.textContent = text;
  ui.toast.className = "toast show " + kind;
  state.toastT = 1.8;
}

function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}
const MEDALS = [
  { id: "gold", name: "金柠檬", limit: 150 },
  { id: "silver", name: "银贝壳", limit: 185 },
  { id: "bronze", name: "铜铃铛", limit: 230 }
];
const bestKey = "pelican-riviera-best";
const getBest = () => { const v = parseFloat(localStorage.getItem(bestKey)); return Number.isFinite(v) ? v : null; };
function showBest() {
  const b = getBest();
  ui.best.textContent = b ? `最佳成绩 ${fmt(b)}` : "首次环岛，祝你好运！";
}
showBest();

let lastHud = { lemons: -1, cp: -1 };
function updateHud(force) {
  ui.time.textContent = fmt(state.time + state.penalty);
  ui.speed.textContent = String(Math.round(state.speed * 3.6));
  ui.energy.style.transform = `scaleX(${state.energy.toFixed(3)})`;
  ui.energyWrap.classList.toggle("ready", state.energy > 0.15);
  ui.boostBtn.classList.toggle("ready", state.energy > 0.15);
  if (force || lastHud.lemons !== state.lemons) { ui.lemons.textContent = String(state.lemons); ui.lemons.parentElement.classList.remove("pop"); void ui.lemons.offsetWidth; ui.lemons.parentElement.classList.add("pop"); }
  if (force || lastHud.cp !== state.cp) {
    ui.stage.textContent = `${Math.min(state.cp + 1, CHECKPOINTS.length)}/${CHECKPOINTS.length}`;
    ui.stageName.textContent = CHECKPOINTS[Math.min(state.cp, CHECKPOINTS.length - 1)].name;
  }
  lastHud = { lemons: state.lemons, cp: state.cp };
}

// Minimap
const mm = ui.minimap;
const mmCtx = mm.getContext("2d");
const mmBase = document.createElement("canvas");
const MM = 220;
mm.width = mm.height = mmBase.width = mmBase.height = MM;
const mmScale = MM / 760;
const toMM = (x, z) => [MM / 2 + x * mmScale, MM / 2 + z * mmScale];
{
  const g = mmBase.getContext("2d");
  g.fillStyle = "rgba(24,110,160,0.0)"; g.fillRect(0, 0, MM, MM);
  g.beginPath();
  for (let k = 0; k <= 360; k++) {
    const th = (k / 360) * Math.PI * 2;
    const r = coastRadius(th);
    const [x, y] = toMM(Math.cos(th) * r, Math.sin(th) * r);
    k ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.fillStyle = "#e9d9a8"; g.fill();
  g.strokeStyle = "#fff8e6"; g.lineWidth = 2; g.stroke();
  g.beginPath();
  track.P.forEach((p, k) => { const [x, y] = toMM(p.x, p.z); k ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.closePath();
  g.strokeStyle = "#b5654a"; g.lineWidth = 3; g.stroke();
  const [cx, cy] = toMM(world.campanilePos.x, world.campanilePos.z);
  g.fillStyle = "#e36f4b"; g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
}
function drawMinimap() {
  mmCtx.clearRect(0, 0, MM, MM);
  mmCtx.drawImage(mmBase, 0, 0);
  const next = CHECKPOINTS[Math.min(state.cp, CHECKPOINTS.length - 1)];
  const np = track.pointAt(courseS(next.s), 0).p;
  const [nx, ny] = toMM(np.x, np.z);
  mmCtx.fillStyle = "#ffd83a"; mmCtx.strokeStyle = "#1f4f73"; mmCtx.lineWidth = 2;
  mmCtx.beginPath(); mmCtx.arc(nx, ny, 6 + Math.sin(performance.now() / 200) * 1.5, 0, Math.PI * 2); mmCtx.fill(); mmCtx.stroke();
  const [px, py] = toMM(state.x, state.z);
  mmCtx.save();
  mmCtx.translate(px, py);
  mmCtx.rotate(-state.yaw + Math.PI);
  mmCtx.fillStyle = "#ffffff"; mmCtx.strokeStyle = "#1f4f73"; mmCtx.lineWidth = 2.2;
  mmCtx.beginPath(); mmCtx.moveTo(0, -9); mmCtx.lineTo(6, 7); mmCtx.lineTo(0, 3); mmCtx.lineTo(-6, 7); mmCtx.closePath(); mmCtx.fill(); mmCtx.stroke();
  mmCtx.restore();
}

// ---------- Flow ----------
function startRide() {
  sound.init();
  resetRide();
  ui.intro.hidden = true;
  ui.result.hidden = true;
  ui.pauseScreen.hidden = true;
  ui.hud.hidden = false;
  ui.touch.hidden = false;
  ui.pause.hidden = false;
  document.body.classList.add("playing");
  state.mode = "countdown";
  state.countdown = 3.2;
}
ui.start.addEventListener("click", startRide);
ui.again.addEventListener("click", startRide);
ui.restartPause.addEventListener("click", startRide);
ui.resume.addEventListener("click", () => togglePause());
ui.pause.addEventListener("click", () => togglePause());

function togglePause() {
  if (state.mode === "ride") {
    state.mode = "paused"; ui.pauseScreen.hidden = false; ui.touch.classList.add("disabled");
  } else if (state.mode === "paused") {
    state.mode = "ride"; ui.pauseScreen.hidden = true; ui.touch.classList.remove("disabled"); last = performance.now();
  }
}

function finishRide() {
  state.mode = "done";
  Object.keys(touch).forEach((k) => { touch[k] = false; });
  document.querySelectorAll("[data-control]").forEach((b) => b.classList.remove("active"));
  const raw = state.time;
  const final = Math.max(0, raw + state.penalty - state.lemons * 1);
  const medal = MEDALS.find((m) => final <= m.limit);
  const prev = getBest();
  const isBest = prev === null || final < prev;
  if (isBest) localStorage.setItem(bestKey, String(final));
  ui.resultTitle.textContent = medal ? "Bravo！环岛完成" : "环岛完成！";
  ui.resultMedal.className = "medal " + (medal ? medal.id : "none");
  ui.resultMedal.querySelector("span").textContent = medal ? medal.name : "完赛";
  ui.resultStats.innerHTML = `
    <div><dt>骑行用时</dt><dd>${fmt(raw)}</dd></div>
    <div><dt>柠檬奖励 × ${state.lemons}</dt><dd class="good">−${state.lemons.toFixed(0)}.0 秒</dd></div>
    <div><dt>撞到障碍 × ${state.hits}</dt><dd class="bad">+${state.penalty.toFixed(1)} 秒</dd></div>
    <div class="total"><dt>最终成绩</dt><dd>${fmt(final)}</dd></div>`;
  ui.resultBest.textContent = isBest ? "新纪录！" : `最佳成绩 ${fmt(prev)}`;
  if (!medal) ui.resultBest.textContent += ` · ${MEDALS[2].name}需 ${fmt(MEDALS[2].limit)} 内`;
  else if (medal.id !== "gold") ui.resultBest.textContent += ` · ${MEDALS[MEDALS.indexOf(medal) - 1].name}需 ${fmt(MEDALS[MEDALS.indexOf(medal) - 1].limit)} 内`;
  ui.hud.hidden = true;
  ui.touch.hidden = true;
  ui.pause.hidden = true;
  ui.result.hidden = false;
  document.body.classList.remove("playing");
  sound.fanfare();
  showBest();
}

// ---------- Simulation ----------
const CRUISE = 11.5, FAST = 14.5, BOOST = 21, MAX_LAT = ROAD_HALF - 0.55;
const fwd = new THREE.Vector3();

function step(dt) {
  const steerIn = inputSteer();
  state.steer = lerp(state.steer, steerIn, 1 - Math.exp(-dt * (steerIn ? 9 : 12)));
  const accel = keys.has("arrowup") || keys.has("w");
  const brake = keys.has("arrowdown") || keys.has("s") || touch.brake;
  const wantBoost = keys.has(" ") || keys.has("shift") || touch.boost;

  const tr = track.track(state.x, state.z, state.hint);
  state.hint = tr.i;
  const tan = track.T[tr.i];
  const roadYaw = Math.atan2(tan.x, tan.z);
  const rel = angDiff(state.yaw, roadYaw);

  if (wantBoost && state.energy > 0.02 && state.bumpT <= 0) {
    if (state.boosting <= 0) sound.boost();
    state.boosting = 0.15;
    state.energy = Math.max(0, state.energy - dt * 0.32);
  }
  state.boosting -= dt;
  state.padBoost -= dt;
  const grade = (track.P[(tr.i + 1) % track.count].y - track.P[tr.i].y) / 2;
  let target = accel ? FAST : CRUISE;
  target -= grade * 28;
  if (state.boosting > 0 || state.padBoost > 0) target = BOOST;
  if (brake) target = 2;
  if (state.bumpT > 0) target = Math.min(target, 4);
  const rate = target > state.speed ? (state.boosting > 0 || state.padBoost > 0 ? 9 : 3.2) : brake ? 9 : 2.4;
  state.speed += clamp(target - state.speed, -rate * dt, rate * dt);
  state.speed = Math.max(0, state.speed);

  const turnRate = lerp(2.1, 1.25, clamp(state.speed / BOOST, 0, 1));
  state.yaw += state.steer * turnRate * dt * clamp(state.speed / 3, 0, 1);
  if (Math.abs(steerIn) < 0.01 && Math.abs(rel) < 1.2) state.yaw -= rel * Math.min(1, dt * 2.2);

  fwd.set(Math.sin(state.yaw), 0, Math.cos(state.yaw));
  state.x += fwd.x * state.speed * dt;
  state.z += fwd.z * state.speed * dt;

  const t2 = track.track(state.x, state.z, state.hint);
  state.hint = t2.i;
  if (Math.abs(t2.lat) > MAX_LAT) {
    const n = track.N[t2.i];
    const over = Math.abs(t2.lat) - MAX_LAT;
    const sg = Math.sign(t2.lat);
    state.x -= n.x * over * sg; state.z -= n.z * over * sg;
    state.yaw -= angDiff(state.yaw, Math.atan2(track.T[t2.i].x, track.T[t2.i].z)) * 0.25;
    state.speed *= 1 - Math.min(0.5, dt * 3);
  }
  state.y = lerp(state.y, t2.y + 0.02, 1 - Math.exp(-dt * 20));

  let ds = t2.s - state.s;
  if (ds < -L / 2) ds += L;
  if (ds > L / 2) ds -= L;
  state.s = t2.s;
  state.progress += ds;

  const relNow = angDiff(state.yaw, Math.atan2(track.T[t2.i].x, track.T[t2.i].z));
  state.wrongT = Math.abs(relNow) > 2.0 ? state.wrongT + dt : 0;
  ui.wrongWay.hidden = state.wrongT < 0.8;

  state.time += dt;
  state.bumpT -= dt;

  // Checkpoints
  const cp = CHECKPOINTS[state.cp];
  if (cp && state.progress >= cp.s) {
    gates[state.cp].beacon.visible = false;
    state.cp++;
    sound.bell();
    if (state.cp >= CHECKPOINTS.length) { finishRide(); return; }
    gates[state.cp].beacon.visible = true;
    toast(`✓ ${cp.name.split(" ")[0]} · 下一站 ${CHECKPOINTS[state.cp].name.split(" ")[0]}`, "cp");
  }

  const pos = new THREE.Vector3(state.x, state.y, state.z);
  for (const l of lemons) {
    if (l.taken) continue;
    const dx = l.p.x - pos.x, dz = l.p.z - pos.z;
    if (dx * dx + dz * dz < 1.6 * 1.6) {
      l.taken = true;
      state.lemons++;
      state.energy = Math.min(1, state.energy + 0.1);
      sound.pickup(state.lemons);
    }
  }
  for (const p of pads) {
    const dx = p.p.x - pos.x, dz = p.p.z - pos.z;
    if (dx * dx + dz * dz < 2.2 * 2.2 && state.padBoost < 0.5) {
      state.padBoost = 1.6; sound.boost(); toast("冲刺坡道！Vai!", "boost");
    }
  }
  if (state.bumpT <= 0) {
    for (const o of obstacles) {
      if (o.hit) continue;
      const dx = o.p.x - pos.x, dz = o.p.z - pos.z;
      if (dx * dx + dz * dz < (o.r + 0.55) ** 2) { hit(o); break; }
    }
    for (const v of vespas) {
      const dx = v.mesh.position.x - pos.x, dz = v.mesh.position.z - pos.z;
      if (dx * dx + dz * dz < 1.5 * 1.5) { hit(null); break; }
    }
  }
}

function hit(o) {
  if (o) { o.hit = true; o.group.visible = false; }
  state.hits++;
  state.penalty += 3;
  state.speed *= 0.3;
  state.bumpT = 1.0;
  sound.bump();
  if (navigator.vibrate) navigator.vibrate(60);
  toast(o ? "哎呀！撞翻了 · +3 秒" : "小心摩托！ · +3 秒", "bad");
  ui.hud.classList.remove("shake"); void ui.hud.offsetWidth; ui.hud.classList.add("shake");
}

// ---------- Visual update ----------
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camInit = false;
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
const eul = new THREE.Euler();

function updateVisuals(dt, t) {
  rider.root.position.set(state.x, state.y, state.z);
  rider.root.rotation.y = state.yaw;
  const tr = track.track(state.x, state.z, state.hint);
  const n = track.N[tr.i];
  const nextI = (tr.i + 2) % track.count;
  const pitch = -Math.atan2(track.P[nextI].y - track.P[tr.i].y, 4);
  rider.root.rotation.x = 0;
  const targetLean = -state.steer * clamp(state.speed / 10, 0, 1) * 0.32;
  state.lean = lerp(state.lean, targetLean, 1 - Math.exp(-dt * 6));
  rider.root.rotation.order = "YXZ";
  rider.root.rotation.x = pitch;
  const wobble = state.bumpT > 0 ? Math.sin(t * 40) * 0.1 * state.bumpT : 0;
  rider.update(dt, state.speed, state.steer, state.lean + wobble, t);
  riderShadowCatcher.position.set(state.x, state.y + 0.04, state.z);
  void n;

  // Lemons spin
  lemons.forEach((l, k) => {
    const s = l.taken ? 0 : 1;
    eul.set(0.3, t * 2 + k, 0);
    q.setFromEuler(eul);
    pv.copy(l.p); pv.y += Math.sin(t * 3 + k) * 0.15;
    sc.set(s, s, s);
    m4.compose(pv, q, sc);
    lemonMesh.setMatrixAt(k, m4);
    pv.y += 0.42;
    m4.compose(pv, q, sc);
    leafMesh.setMatrixAt(k, m4);
  });
  lemonMesh.count = leafMesh.count = lemons.length;
  lemonMesh.instanceMatrix.needsUpdate = leafMesh.instanceMatrix.needsUpdate = true;

  gates.forEach((g) => { if (g.beacon.visible) { g.beacon.material.opacity = 0.14 + Math.sin(t * 4) * 0.06; g.beacon.rotation.y = t; } });

  for (const v of vespas) {
    if (state.mode === "ride") v.s -= v.speed * dt;
    const info = track.pointAt(v.s, v.lat);
    v.mesh.position.copy(info.p);
    v.mesh.rotation.y = Math.atan2(info.t.x, info.t.z) + Math.PI;
  }

  world.update(t, rider.root.position);

  // Camera
  const portrait = window.innerHeight > window.innerWidth;
  const dist = (portrait ? 8.2 : 6.6) + state.speed * 0.08;
  const height = (portrait ? 4.4 : 3.6) + state.speed * 0.03;
  const camYaw = state.yaw;
  const side = portrait ? 0.6 : 1.1;
  const desired = new THREE.Vector3(state.x - Math.sin(camYaw) * dist - Math.cos(camYaw) * side, state.y + height, state.z - Math.cos(camYaw) * dist + Math.sin(camYaw) * side);
  const groundAtCam = hf.getHeight(desired.x, desired.z);
  desired.y = Math.max(desired.y, groundAtCam + 1.5);
  const look = new THREE.Vector3(state.x + Math.sin(camYaw) * 6, state.y + (portrait ? 0.9 : 1.3), state.z + Math.cos(camYaw) * 6);
  if (!camInit) { camPos.copy(desired); camLook.copy(look); camInit = true; }
  camPos.lerp(desired, 1 - Math.exp(-dt * 4.5));
  camLook.lerp(look, 1 - Math.exp(-dt * 8));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  const fovTarget = (portrait ? 66 : 56) + (state.boosting > 0 || state.padBoost > 0 ? 9 : 0);
  camera.fov = lerp(camera.fov, fovTarget, 1 - Math.exp(-dt * 4));
  camera.updateProjectionMatrix();

  sun.position.set(state.x + world.sunDir.x * 120, state.y + world.sunDir.y * 120, state.z + world.sunDir.z * 120);
  sun.target.position.set(state.x, state.y, state.z);

  // Next-checkpoint arrow
  if (state.mode === "ride" && state.cp < CHECKPOINTS.length) {
    const target = track.pointAt(courseS(CHECKPOINTS[state.cp].s), 0).p;
    const ang = Math.atan2(target.x - state.x, target.z - state.z);
    const d = Math.hypot(target.x - state.x, target.z - state.z);
    ui.arrow.style.setProperty("--rot", `${(-angDiff(ang, state.yaw) * 180) / Math.PI}deg`);
    ui.arrow.querySelector("b").textContent = `${Math.max(0, Math.round(CHECKPOINTS[state.cp].s - state.progress))} m`;
    void d;
  }
}

// Intro orbit camera
let orbit = 0;
function introCamera(dt, t) {
  orbit += dt * 0.05;
  const c = world.campanilePos;
  const a = 1.95 + Math.sin(orbit) * 0.35;
  camera.position.set(c.x + Math.cos(a) * 95, c.y + 42, c.z + Math.sin(a) * 95);
  camera.lookAt(c.x, c.y + 6, c.z);
  camera.fov = window.innerHeight > window.innerWidth ? 70 : 52;
  camera.updateProjectionMatrix();
  sun.position.set(c.x + world.sunDir.x * 150, c.y + world.sunDir.y * 150, c.z + world.sunDir.z * 150);
  sun.target.position.copy(c);
  Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110 });
  sun.shadow.camera.updateProjectionMatrix();
  world.update(t, c);
}

let last = performance.now();
let elapsed = 0;
let shadowMode = "intro";
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;
  if (state.mode === "intro") {
    introCamera(dt, elapsed);
    rider.root.visible = false;
  } else {
    rider.root.visible = true;
    if (shadowMode !== "ride") { Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45 }); sun.shadow.camera.updateProjectionMatrix(); shadowMode = "ride"; }
    if (state.mode === "countdown") {
      const before = Math.ceil(state.countdown);
      state.countdown -= dt;
      const after = Math.ceil(state.countdown);
      if (after !== before && after > 0) sound.tone(660, 0.15, "square", 0.08);
      ui.countdown.hidden = false;
      ui.countdown.textContent = state.countdown > 0.2 ? String(Math.max(1, after)) : "VIA!";
      if (state.countdown <= -0.4) { ui.countdown.hidden = true; }
      if (state.countdown <= 0 && state.mode === "countdown") { state.mode = "ride"; sound.tone(990, 0.35, "square", 0.1); }
    } else if (state.mode === "ride") {
      step(dt);
      if (ui.countdown.textContent === "VIA!" && !ui.countdown.hidden) { state.countdown -= dt; if (state.countdown <= -0.8) ui.countdown.hidden = true; }
    }
    if (state.mode !== "paused") updateVisuals(dt, elapsed);
    if (state.mode === "ride" || state.mode === "countdown") { updateHud(false); drawMinimap(); }
  }
  if (state.toastT > 0) { state.toastT -= dt; if (state.toastT <= 0) ui.toast.classList.remove("show"); }
  sound.update(state.speed, state.mode === "ride");
  if (state.mode !== "paused") world.waterU.time.value = elapsed;
  renderer.render(scene, camera);
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 200));

resetRide();
ui.touch.classList.toggle("is-touch", isTouch);
document.body.classList.toggle("touch", isTouch);
ui.loading.hidden = true;
ui.intro.hidden = false;
requestAnimationFrame(frame);

window.__pelican = {
  state, track, CHECKPOINTS, start: startRide, touch,
  teleport(u, lat = 0) {
    const info = track.pointAt(courseS(u), lat);
    state.x = info.p.x; state.z = info.p.z; state.y = info.p.y; state.yaw = Math.atan2(info.t.x, info.t.z);
    state.hint = info.i; state.s = courseS(u) % L; state.progress = u; camInit = false;
  }
};
