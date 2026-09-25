import * as THREE from "three";
import { fbm, smoothstep, clamp, lerp, angDiff } from "./noise.js";

export const WORLD_SIZE = 860;
export const GRID = 288;
export const ROAD_HALF = 4.2;
export const ZONES = { harbor: 1.2, beach: 2.6, cove: -2.3, lemon: -1.42, cape: -0.5 };

const gauss = (x) => Math.exp(-x * x);

export function coastRadius(theta, opts = {}) {
  const { cove = true, cape = true, harbor = 1 } = opts;
  let r = 292 + 24 * Math.sin(3 * theta + 0.6) + 14 * Math.sin(5 * theta + 2.1) + 7 * Math.sin(9 * theta + 0.3);
  r -= harbor * 62 * gauss(angDiff(theta, ZONES.harbor) / 0.2);
  if (cape) r += 46 * gauss(angDiff(theta, ZONES.cape) / 0.085);
  if (cove) r -= 60 * gauss(angDiff(theta, ZONES.cove) / 0.075);
  return r;
}

export function cliffAmount(theta) {
  const beach = gauss(angDiff(theta, ZONES.beach) / 0.36);
  const harbor = gauss(angDiff(theta, ZONES.harbor) / 0.3);
  return clamp(1 - Math.max(beach, harbor * 0.92), 0, 1);
}

export function baseHeight(x, z) {
  const r = Math.hypot(x, z);
  const th = Math.atan2(z, x);
  const R = coastRadius(th);
  const c = cliffAmount(th);
  const inland = R - r;
  const n = fbm(x * 0.011 + 13.1, z * 0.011 - 4.7, 4);
  if (inland > 0) {
    const s = inland / R;
    let h = 0.7 + inland * 0.07 + s * s * 62 + n * 16 * Math.min(1, s * 3.5);
    h += c * 16 * smoothstep(0, 16, inland);
    h += 48 * Math.exp(-((x + 40) ** 2 + (z + 25) ** 2) / (2 * 95 * 95));
    return h;
  }
  return Math.max(-34, 0.7 + inland * (0.1 + c * 0.5));
}

function roadInland(theta) {
  return 24
    - 12 * gauss(angDiff(theta, ZONES.harbor) / 0.22)
    + 72 * gauss(angDiff(theta, ZONES.lemon) / 0.32)
    + 8 * gauss(angDiff(theta, ZONES.beach) / 0.3);
}

export function zoneAt(theta) {
  if (Math.abs(angDiff(theta, ZONES.harbor)) < 0.34) return "town";
  if (Math.abs(angDiff(theta, ZONES.beach)) < 0.36) return "beach";
  if (Math.abs(angDiff(theta, ZONES.cove)) < 0.12) return "bridge";
  if (Math.abs(angDiff(theta, ZONES.lemon)) < 0.42) return "lemon";
  if (Math.abs(angDiff(theta, ZONES.cape)) < 0.28) return "cape";
  return "coast";
}

export function buildTrack() {
  const ctrl = [];
  const COUNT = 120;
  const start = ZONES.harbor - 0.1;
  for (let i = 0; i < COUNT; i++) {
    const th = start + (i / COUNT) * Math.PI * 2;
    const r = coastRadius(th, { cove: false, cape: false, harbor: 0.78 }) - roadInland(th);
    ctrl.push(new THREE.Vector3(Math.cos(th) * r, 0, Math.sin(th) * r));
  }
  const curve = new THREE.CatmullRomCurve3(ctrl, true, "centripetal");
  const length = curve.getLength();
  const n = Math.round(length / 2);
  const pts = curve.getSpacedPoints(n);
  pts.pop();
  const count = pts.length;
  const base = pts.map((p) => baseHeight(p.x, p.z));
  const bridge = base.map((h) => h < 0.4);
  // Bridge deck: linear between the nearest land samples on each side.
  const raw = base.slice();
  for (let i = 0; i < count; i++) {
    if (!bridge[i]) continue;
    let a = i, b = i;
    while (bridge[(a - 1 + count) % count]) a = (a - 1 + count) % count;
    while (bridge[(b + 1) % count]) b = (b + 1) % count;
    const ha = base[(a - 1 + count) % count], hb = base[(b + 1) % count];
    const span = ((b - a + count) % count) + 2;
    const k = ((i - a + count) % count + 1) / span;
    raw[i] = lerp(ha, hb, k);
  }
  let heights = raw.map((h) => Math.max(h, 2.2));
  for (let pass = 0; pass < 6; pass++) {
    const next = new Array(count);
    for (let i = 0; i < count; i++) {
      let sum = 0;
      for (let k = -10; k <= 10; k++) sum += heights[(i + k + count) % count];
      next[i] = sum / 21;
    }
    heights = next;
    if (pass === 2 || pass === 5) {
      // Limit the grade so every climb stays rideable.
      const g = 0.13;
      for (let sweep = 0, changed = true; changed && sweep < 60; sweep++) {
        changed = false;
        for (let k = 0; k < count; k++) {
          const a = k, b = (k + 1) % count;
          if (heights[b] > heights[a] + g) { heights[b] = heights[a] + g; changed = true; }
          if (heights[a] > heights[b] + g) { heights[a] = heights[b] + g; changed = true; }
        }
        for (let k = count - 1; k >= 0; k--) {
          const a = k, b = (k + 1) % count;
          if (heights[a] > heights[b] + g) { heights[a] = heights[b] + g; changed = true; }
          if (heights[b] > heights[a] + g) { heights[b] = heights[a] + g; changed = true; }
        }
      }
    }
  }
  const P = [], T = [], N = [], cum = [], zone = [], seaSide = [], theta = [];
  let s = 0;
  for (let i = 0; i < count; i++) {
    const p = pts[i];
    const a = pts[(i - 1 + count) % count], b = pts[(i + 1) % count];
    const t = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
    const nrm = new THREE.Vector3(-t.z, 0, t.x);
    P.push(new THREE.Vector3(p.x, heights[i], p.z));
    T.push(t); N.push(nrm);
    cum.push(s);
    s += Math.hypot(b.x - p.x, b.z - p.z);
    const th = Math.atan2(p.z, p.x);
    theta.push(th);
    zone.push(bridge[i] ? "bridge" : zoneAt(th));
    seaSide.push(Math.sign(nrm.x * p.x + nrm.z * p.z) || 1);
  }
  const track = { P, T, N, cum, zone, seaSide, theta, bridge, count, length: s };

  const CELL = 16;
  const cells = new Map();
  const key = (cx, cz) => cx * 10007 + cz;
  P.forEach((p, i) => {
    const k = key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(i);
  });
  // Nearest point on the centerline; searches a 5x5 cell window.
  track.nearest = function nearest(x, z) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = null, bestD = Infinity;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const list = cells.get(key(cx + dx, cz + dz));
      if (!list) continue;
      for (const i of list) {
        const a = P[i], b = P[(i + 1) % count];
        const ex = b.x - a.x, ez = b.z - a.z;
        const len2 = ex * ex + ez * ez;
        const t = clamp(((x - a.x) * ex + (z - a.z) * ez) / len2, 0, 1);
        const px = a.x + ex * t, pz = a.z + ez * t;
        const d = Math.hypot(x - px, z - pz);
        if (d < bestD) { bestD = d; best = { i, t, d }; }
      }
    }
    if (!best) return null;
    const i = best.i;
    best.lat = (x - P[i].x) * N[i].x + (z - P[i].z) * N[i].z;
    best.y = lerp(P[i].y, P[(i + 1) % count].y, best.t);
    return best;
  };
  // Local search from a known index, used every frame for the rider.
  track.track = function trackFrom(x, z, hint) {
    let best = null, bestD = Infinity;
    for (let k = -14; k <= 14; k++) {
      const i = (hint + k + count) % count;
      const a = P[i], b = P[(i + 1) % count];
      const ex = b.x - a.x, ez = b.z - a.z;
      const len2 = ex * ex + ez * ez;
      const t = clamp(((x - a.x) * ex + (z - a.z) * ez) / len2, 0, 1);
      const d = Math.hypot(x - (a.x + ex * t), z - (a.z + ez * t));
      if (d < bestD) { bestD = d; best = { i, t, d }; }
    }
    const i = best.i;
    best.lat = (x - P[i].x) * N[i].x + (z - P[i].z) * N[i].z;
    best.y = lerp(P[i].y, P[(i + 1) % count].y, best.t);
    best.s = track.cum[i] + best.t * Math.hypot(P[(i + 1) % count].x - P[i].x, P[(i + 1) % count].z - P[i].z);
    return best;
  };
  track.pointAt = function pointAt(sDist, lat = 0) {
    const L = track.length;
    let d = ((sDist % L) + L) % L;
    let lo = 0, hi = count - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid - 1; }
    const i = lo, j = (i + 1) % count;
    const segLen = (j === 0 ? L : cum[j]) - cum[i];
    const t = segLen > 0 ? (d - cum[i]) / segLen : 0;
    const p = new THREE.Vector3().lerpVectors(P[i], P[j], t);
    const nrm = new THREE.Vector3().lerpVectors(N[i], N[j], t).normalize();
    const tan = new THREE.Vector3().lerpVectors(T[i], T[j], t).normalize();
    p.addScaledVector(nrm, lat);
    return { p, n: nrm, t: tan, i, zone: zone[i], seaSide: seaSide[i] };
  };
  return track;
}

export function buildHeightfield(track) {
  const size = GRID + 1;
  const H = new Float32Array(size * size);
  const paved = new Uint8Array(size * size);
  const step = WORLD_SIZE / GRID;
  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      const x = -WORLD_SIZE / 2 + ix * step, z = -WORLD_SIZE / 2 + iz * step;
      let h = baseHeight(x, z);
      const nr = track.nearest(x, z);
      const idx = iz * size + ix;
      if (nr && !track.bridge[nr.i] && !track.bridge[(nr.i + 1) % track.count]) {
        const roadY = nr.y - 0.28;
        const town = track.zone[nr.i] === "town";
        const seaward = Math.sign(nr.lat) === track.seaSide[nr.i];
        if (town && seaward && h > -1.2 && nr.d < 40) {
          h = roadY;
          paved[idx] = 1;
        } else if (nr.d < ROAD_HALF + 18) {
          const w = smoothstep(ROAD_HALF + 1.4, ROAD_HALF + 17, nr.d);
          h = lerp(roadY, h, w);
          if (nr.d < ROAD_HALF + 2.4) paved[idx] = 1;
        }
      }
      H[idx] = h;
    }
  }
  function getHeight(x, z) {
    const fx = clamp((x + WORLD_SIZE / 2) / step, 0, GRID - 0.001);
    const fz = clamp((z + WORLD_SIZE / 2) / step, 0, GRID - 0.001);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const a = H[iz * size + ix], b = H[iz * size + ix + 1];
    const c = H[(iz + 1) * size + ix], d = H[(iz + 1) * size + ix + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }
  function slopeAt(x, z) {
    const e = 1.5;
    const dx = getHeight(x + e, z) - getHeight(x - e, z);
    const dz = getHeight(x, z + e) - getHeight(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }
  return { H, paved, size, step, getHeight, slopeAt };
}
