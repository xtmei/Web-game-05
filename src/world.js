import * as THREE from "three";
import { WORLD_SIZE, GRID, ROAD_HALF, ZONES, coastRadius, cliffAmount, zoneAt } from "./island.js";
import { fbm, clamp, lerp, smoothstep, angDiff } from "./noise.js";

const TAU = Math.PI * 2;

function canvasTexture(w, h, draw, renderer, repeat = true) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

class Instancer {
  constructor(geo, mat, max, { shadow = true, receive = true } = {}) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.castShadow = shadow;
    this.mesh.receiveShadow = receive;
    this.n = 0;
    this.max = max;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.s = new THREE.Vector3();
    this.p = new THREE.Vector3();
  }
  add(x, y, z, rotY = 0, sx = 1, sy = sx, sz = sx, color = null, rotX = 0, rotZ = 0) {
    if (this.n >= this.max) return -1;
    this.e.set(rotX, rotY, rotZ);
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.s.set(sx, sy, sz);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(this.n, this.m);
    if (color) this.mesh.setColorAt(this.n, color);
    return this.n++;
  }
  finish(parent) {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    parent.add(this.mesh);
    return this.mesh;
  }
}

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });

export function tube(a, b, r, mat, radial = 8) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, radial);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  return m;
}

function makeSky() {
  const geo = new THREE.SphereGeometry(1800, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sunDir: { value: new THREE.Vector3() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 zenith = vec3(0.23,0.52,0.82);
        vec3 horizon = vec3(0.98,0.88,0.74);
        vec3 col = mix(horizon, zenith, pow(smoothstep(-0.02, 0.55, h), 0.7));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += vec3(1.0,0.78,0.5) * pow(s, 8.0) * 0.35 + vec3(1.0,0.95,0.85) * pow(s, 400.0) * 2.0;
        if (h < 0.0) col = mix(horizon, vec3(0.55,0.72,0.8), smoothstep(0.0,-0.2,h));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

function makeWater(hf, sunDir) {
  const size = hf.size;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const h = hf.H[i];
    data[i * 4] = clamp(Math.round((-h / 26) * 255), 0, 255);
    data[i * 4 + 1] = h > 0 ? 255 : 0;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    time: { value: 0 },
    depthMap: { value: null },
    worldSize: { value: WORLD_SIZE },
    sunDir: { value: new THREE.Vector3() }
  }]);
  uniforms.depthMap.value = tex;
  uniforms.sunDir.value.copy(sunDir);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms,
    vertexShader: `
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float time; uniform sampler2D depthMap; uniform float worldSize; uniform vec3 sunDir;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
      void main(){
        vec2 uv = (vWorld.xz + worldSize*0.5) / worldSize;
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        vec4 d = texture2D(depthMap, clamp(uv, 0.0, 1.0));
        float depth = mix(1.0, d.r, inside);
        vec2 p = vWorld.xz;
        float t = time;
        vec2 g = vec2(0.0);
        g += vec2(cos(p.x*0.21 + t*1.1), cos(p.y*0.17 + t*0.9)) * 0.10;
        g += vec2(cos((p.x+p.y)*0.53 + t*1.7), cos((p.x-p.y)*0.47 - t*1.4)) * 0.06;
        g += (vec2(noise(p*0.9 + t*0.6), noise(p*0.9 - t*0.5)) - 0.5) * 0.12;
        vec3 n = normalize(vec3(g.x, 1.0, g.y));
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 shallow = vec3(0.30,0.86,0.80);
        vec3 mid = vec3(0.06,0.55,0.72);
        vec3 deep = vec3(0.03,0.24,0.50);
        vec3 col = mix(shallow, mid, smoothstep(0.0, 0.22, depth));
        col = mix(col, deep, smoothstep(0.2, 0.9, depth));
        vec3 sky = vec3(0.72,0.86,0.95);
        col = mix(col, sky, fres * 0.55);
        vec3 h = normalize(normalize(sunDir) + v);
        float spec = pow(max(dot(n, h), 0.0), 220.0) * 3.0 + pow(max(dot(n, h), 0.0), 24.0) * 0.12;
        col += vec3(1.0,0.93,0.8) * spec;
        float shore = 1.0 - smoothstep(0.0, 0.05, depth);
        float waves = sin(depth * 160.0 - t * 2.2 + noise(p*0.3)*6.0) * 0.5 + 0.5;
        float foam = shore * smoothstep(0.55, 0.95, waves + noise(p*1.8 + t)*0.4) * inside;
        foam += (1.0 - smoothstep(0.0, 0.012, depth)) * 0.8 * inside;
        col = mix(col, vec3(0.97,0.98,0.96), clamp(foam, 0.0, 1.0));
        float alpha = mix(0.55, 0.97, smoothstep(0.0, 0.18, depth));
        alpha = max(alpha, clamp(foam,0.0,1.0));
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200), mat);
  water.rotation.x = -Math.PI / 2;
  water.renderOrder = 1;
  return { water, uniforms };
}

function makeTerrain(track, hf) {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, GRID, GRID);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const sand = new THREE.Color("#ecd3a0"), wetSand = new THREE.Color("#c9ae7c");
  const stone = new THREE.Color("#d9c6a6"), rock = new THREE.Color("#b8a792"), rockDark = new THREE.Color("#8f8272");
  const olive = new THREE.Color("#8a9652"), dry = new THREE.Color("#bba96c"), green = new THREE.Color("#5d7b3d"), lemonG = new THREE.Color("#4f7a32");
  const size = hf.size;
  for (let i = 0; i < pos.count; i++) {
    const h = hf.H[i];
    pos.setY(i, h);
    const ix = i % size, iz = Math.floor(i / size);
    const x = pos.getX(i), z = pos.getZ(i);
    const hx = hf.H[iz * size + Math.min(size - 1, ix + 1)] - hf.H[iz * size + Math.max(0, ix - 1)];
    const hz = hf.H[Math.min(size - 1, iz + 1) * size + ix] - hf.H[Math.max(0, iz - 1) * size + ix];
    const slope = Math.hypot(hx, hz) / (2 * hf.step);
    const th = Math.atan2(z, x);
    const n = fbm(x * 0.05, z * 0.05, 3);
    const n2 = fbm(x * 0.013 + 7, z * 0.013 - 3, 3);
    if (h < 0.6) {
      c.copy(wetSand).lerp(new THREE.Color("#7f8f7a"), smoothstep(0, -20, h));
    } else if (hf.paved[i]) {
      c.copy(stone).offsetHSL(0, 0, n * 0.05);
    } else {
      const beach = 1 - cliffAmount(th);
      const sandy = beach * (1 - smoothstep(2.2, 4.5, h));
      c.copy(olive).lerp(dry, clamp(0.5 + n2 * 1.2, 0, 1)).lerp(green, clamp(0.35 + n * 1.5, 0, 1) * 0.6);
      if (zoneAt(th) === "lemon") c.lerp(lemonG, 0.55);
      const rockiness = smoothstep(0.55, 1.1, slope + n * 0.25);
      c.lerp(new THREE.Color().copy(rock).lerp(rockDark, clamp(0.5 + n * 2, 0, 1)), rockiness);
      c.lerp(sand, sandy);
      if (h < 1.6) c.lerp(sand, 0.8);
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  mesh.receiveShadow = true;
  return mesh;
}

function ribbon(track, { latA, latB, yA = 0.03, yB = 0.03, filter = null, uvScale = 6, material }) {
  const pos = [], uv = [], idx = [];
  const { P, N, cum, count } = track;
  let prevOk = false;
  for (let k = 0; k <= count; k++) {
    const i = k % count;
    const ok = !filter || filter(i);
    const la = typeof latA === "function" ? latA(i) : latA;
    const lb = typeof latB === "function" ? latB(i) : latB;
    const v = (k === count ? track.length : cum[i]) / uvScale;
    pos.push(P[i].x + N[i].x * la, P[i].y + yA, P[i].z + N[i].z * la);
    pos.push(P[i].x + N[i].x * lb, P[i].y + yB, P[i].z + N[i].z * lb);
    uv.push(0, v, 1, v);
    const base = k * 2;
    if (k > 0 && ok && prevOk) idx.push(base - 2, base - 1, base, base - 1, base + 1, base);
    prevOk = ok;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  material.side = THREE.DoubleSide;
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  return m;
}

function wall(track, parent, { lat, width, bottom, height, filter, material, uvScale = 4 }) {
  const latFn = typeof lat === "function" ? lat : () => lat;
  const b = (i) => (typeof bottom === "function" ? bottom(i) : bottom);
  const lo = (i) => latFn(i) - width / 2, hi = (i) => latFn(i) + width / 2;
  const top = height;
  const group = new THREE.Group();
  const parts = [
    ribbon(track, { latA: lo, latB: hi, yA: top, yB: top, filter, material, uvScale }),
    ribbon(track, { latA: hi, latB: hi, yA: top, yB: 0, filter, material, uvScale }),
    ribbon(track, { latA: lo, latB: lo, yA: 0, yB: top, filter, material, uvScale })
  ];
  for (const p of parts) {
    const arr = p.geometry.attributes.position;
    for (let k = 0; k < arr.count; k++) {
      const i = Math.floor(k / 2) % track.count;
      const isTopRow = p === parts[0] || (p === parts[1] ? k % 2 === 0 : k % 2 === 1);
      arr.setY(k, track.P[i].y + b(i) + (isTopRow ? top : 0));
    }
    p.geometry.computeVertexNormals();
    p.castShadow = true;
    group.add(p);
  }
  parent.add(group);
  return group;
}

function facadeTexture(renderer) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = "#f7f2ea"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(${150 + Math.random() * 60},${130 + Math.random() * 50},${110},${Math.random() * 0.06})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 2 + Math.random() * 6);
    }
    g.fillStyle = "rgba(120,90,60,0.18)"; g.fillRect(0, h - 8, w, 4);
    const ww = 34, wh = 60, x = (w - ww) / 2, y = 30;
    g.fillStyle = "#fbfaf6"; g.fillRect(x - 5, y - 5, ww + 10, wh + 12);
    g.fillStyle = "#2c3a44"; g.fillRect(x, y, ww, wh);
    g.fillStyle = "rgba(160,200,220,0.35)"; g.fillRect(x + 3, y + 3, ww / 2 - 4, wh - 6);
    g.fillStyle = "#2f6a52";
    g.fillRect(x - 22, y, 18, wh); g.fillRect(x + ww + 4, y, 18, wh);
    g.fillStyle = "rgba(0,0,0,0.25)";
    for (let k = 0; k < wh; k += 5) { g.fillRect(x - 22, y + k, 18, 1.5); g.fillRect(x + ww + 4, y + k, 18, 1.5); }
    g.fillStyle = "#3b3b3b"; g.fillRect(x - 6, y + wh + 6, ww + 12, 3);
  }, renderer);
}

function cobbleTexture(renderer) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#5e544b"; g.fillRect(0, 0, w, h);
    const rows = 10, cols = 6;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols + 1; c++) {
        const cw = w / cols, ch = h / rows;
        const x = c * cw - (r % 2) * cw / 2 + 2, y = r * ch + 2;
        const l = 48 + Math.random() * 20;
        g.fillStyle = `hsl(${28 + Math.random() * 14}, ${14 + Math.random() * 12}%, ${l}%)`;
        g.beginPath();
        g.roundRect(x, y, cw - 4, ch - 4, 5);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.12)";
        g.fillRect(x + 3, y + 2, cw - 12, 3);
      }
    }
  }, renderer);
}

function stripeTexture(renderer, colors) {
  return canvasTexture(256, 32, (g, w, h) => {
    const n = 16;
    for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.fillRect((i * w) / n, 0, w / n + 1, h); }
  }, renderer);
}

function chevronTexture(renderer) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(20,150,190,0.55)"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#ffffff"; g.lineWidth = 16; g.lineJoin = "round";
    for (let k = 0; k < 3; k++) {
      const y = 40 + k * 80;
      g.beginPath(); g.moveTo(16, y + 40); g.lineTo(w / 2, y); g.lineTo(w - 16, y + 40); g.stroke();
    }
  }, renderer, false);
}

const PALETTE = ["#f0b35d", "#e7835e", "#f5d27a", "#f2a7a0", "#f6e3c4", "#dd9a63", "#f3c94b", "#e6b8a2", "#c9d8c5", "#f1c7a3", "#ea6f55"];

export function buildWorld(scene, track, hf, renderer, rand) {
  const root = new THREE.Group();
  scene.add(root);
  const sunDir = new THREE.Vector3(-0.55, 0.62, 0.42).normalize();
  const sky = makeSky();
  sky.material.uniforms.sunDir.value.copy(sunDir);
  scene.add(sky);
  const { water, uniforms: waterU } = makeWater(hf, sunDir);
  scene.add(water);
  root.add(makeTerrain(track, hf));

  const color = new THREE.Color();
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const rs = (a, b) => a + rand() * (b - a);
  const { P, N, T, zone, seaSide, count, bridge } = track;
  const reserved = [];
  const isFree = (x, z, r) => reserved.every((o) => (o.x - x) ** 2 + (o.z - z) ** 2 > (o.r + r) ** 2);
  const reserve = (x, z, r) => reserved.push({ x, z, r });

  // Road
  const cobble = cobbleTexture(renderer);
  cobble.repeat.set(2.4, 1);
  const road = ribbon(track, { latA: -ROAD_HALF, latB: ROAD_HALF, material: new THREE.MeshStandardMaterial({ map: cobble, roughness: 0.92, color: "#ffffff" }) });
  root.add(road);
  const curbMat = std("#efe7da");
  for (const side of [-1, 1]) {
    root.add(ribbon(track, { latA: side * ROAD_HALF, latB: side * (ROAD_HALF + 0.55), yA: 0.12, yB: 0.12, material: curbMat }));
  }
  const stucco = std("#f3ede2");
  const stoneMat = std("#cdb899");
  const seaWall = (i) => zone[i] !== "beach" && zone[i] !== "town" || bridge[i];
  wall(track, root, { lat: (i) => seaSide[i] * (ROAD_HALF + 0.75), width: 0.45, bottom: -0.2, height: 1.05, filter: seaWall, material: stucco });
  wall(track, root, { lat: (i) => -seaSide[i] * (ROAD_HALF + 0.75), width: 0.55, bottom: -0.3, height: 0.7, filter: (i) => (zone[i] !== "town" && zone[i] !== "beach") || bridge[i], material: stoneMat });
  // Bridge deck slab and arches
  wall(track, root, { lat: 0, width: ROAD_HALF * 2 + 2.4, bottom: -1.5, height: 1.45, filter: (i) => bridge[i] || bridge[(i + 1) % count] || bridge[(i - 1 + count) % count], material: stoneMat });
  const bridgeIdx = [];
  for (let i = 0; i < count; i++) if (bridge[i]) bridgeIdx.push(i);
  const pierMat = std("#c9b08b");
  for (let k = 0; k < bridgeIdx.length; k += 4) {
    const i = bridgeIdx[k];
    const p = P[i];
    const ground = Math.min(hf.getHeight(p.x, p.z), -2);
    const hgt = p.y - 1.4 - ground;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 2, hgt, 2.2), pierMat);
    pier.position.set(p.x, ground + hgt / 2, p.z);
    pier.rotation.y = Math.atan2(T[i].x, T[i].z);
    pier.castShadow = pier.receiveShadow = true;
    root.add(pier);
    if (k + 4 < bridgeIdx.length) {
      const j = bridgeIdx[k + 4];
      const mid = new THREE.Vector3().addVectors(P[i], P[j]).multiplyScalar(0.5);
      const span = P[i].distanceTo(P[j]) - 2.2;
      const arch = new THREE.Mesh(new THREE.CylinderGeometry(span / 2, span / 2, ROAD_HALF * 2 + 1.9, 20, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: "#b59a74", side: THREE.DoubleSide, roughness: 0.9 }));
      arch.rotation.order = "YXZ";
      arch.rotation.y = Math.atan2(T[i].x, T[i].z);
      arch.rotation.z = Math.PI / 2;
      arch.rotation.x = 0;
      arch.position.set(mid.x, mid.y - 1.5 - span * 0.12, mid.z);
      arch.scale.set(1, 1, 1);
      const archGroup = new THREE.Group();
      archGroup.position.copy(arch.position);
      archGroup.rotation.y = Math.atan2(T[i].x, T[i].z);
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(span / 2, span / 2, ROAD_HALF * 2 + 1.9, 20, 1, true, -Math.PI / 2, Math.PI), arch.material);
      inner.rotation.z = Math.PI / 2;
      inner.scale.set(1, 1, 0.9);
      archGroup.add(inner);
      archGroup.position.y = mid.y - 1.5 - span * 0.45;
      root.add(archGroup);
    }
  }

  // Buildings
  const facade = facadeTexture(renderer);
  const buildingSets = [2, 3, 4].map((floors) => {
    const H = floors * 3.2 + 8;
    const g = new THREE.BoxGeometry(6, H, 6);
    g.translate(0, H / 2 - 8, 0);
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let k = 0; k < p.count; k++) {
      const u = Math.abs(n.getX(k)) > 0.5 ? p.getZ(k) : p.getX(k);
      uv.setXY(k, (u + 3) / 3, p.getY(k) / 3.2);
    }
    const mat = new THREE.MeshStandardMaterial({ map: facade, roughness: 0.9 });
    return { floors, inst: new Instancer(g, mat, 260) };
  });
  const roofGeo = new THREE.ConeGeometry(6 * 0.76, 2.1, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.translate(0, 1.05, 0);
  const roofs = new Instancer(roofGeo, std("#c4572f", { flatShading: true }), 800);
  const flatTopGeo = new THREE.BoxGeometry(6.3, 0.5, 6.3);
  flatTopGeo.translate(0, 0.25, 0);
  const flatTops = new Instancer(flatTopGeo, std("#f4efe7"), 400);
  const awningGeo = new THREE.BoxGeometry(4.6, 0.12, 1.6);
  const awnings = new Instancer(awningGeo, new THREE.MeshStandardMaterial({ map: stripeTexture(renderer, ["#ffffff", "#2f7fb8"]), roughness: 0.8 }), 200);
  const flowerGeo = new THREE.IcosahedronGeometry(0.9, 0);
  const bougainvillea = new Instancer(flowerGeo, std("#d63d8a", { flatShading: true }), 500);

  function placeBuilding(x, z, rotY, floorsWanted, scaleX, colorHex, roofType) {
    const set = buildingSets.find((s) => s.floors === floorsWanted) || buildingSets[0];
    const corners = [[-3, -3], [3, -3], [-3, 3], [3, 3]].map(([a, b]) => hf.getHeight(x + a * scaleX, z + b));
    const base = Math.min(...corners);
    const top = Math.max(...corners);
    const y = base + (top - base) * 0.35;
    color.set(colorHex);
    set.inst.add(x, y, z, rotY, scaleX, 1, 1, color);
    const roofY = y + set.floors * 3.2;
    color.set("#c4572f").offsetHSL(rs(-0.02, 0.02), rs(-0.1, 0.05), rs(-0.06, 0.06));
    if (roofType === 0) roofs.add(x, roofY, z, rotY, scaleX, 1, 1, color);
    else {
      flatTops.add(x, roofY, z, rotY, scaleX, 1, 1, color.set("#f5efe4"));
    }
    return { y, roofY };
  }

  // Terraced town on the landward slope around the harbor
  const townTheta = ZONES.harbor;
  const piazzaInfo = track.pointAt(60, 0);
  const landSign = -piazzaInfo.seaSide;
  const campanilePos = track.pointAt(60, landSign * (ROAD_HALF + 11)).p;
  reserve(campanilePos.x, campanilePos.z, 16);
  for (let tries = 0; tries < 5000; tries++) {
    const th = townTheta + rs(-0.42, 0.42);
    const R = coastRadius(th);
    const r = R - rs(4, 105);
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const nr = track.nearest(x, z);
    if (!nr) continue;
    const i = nr.i;
    const seaward = Math.sign(nr.lat) === seaSide[i];
    if (nr.d < ROAD_HALF + 5.5) continue;
    if (seaward && nr.d < 60) continue;
    const h = hf.getHeight(x, z);
    if (h < 2 || hf.slopeAt(x, z) > 1.6) continue;
    const density = Math.exp(-((angDiff(th, townTheta) / 0.3) ** 2));
    if (rand() > density * 1.15) continue;
    if (!isFree(x, z, 4.2)) continue;
    reserve(x, z, 4.2);
    const rotY = Math.atan2(T[i].x, T[i].z) + (rand() < 0.15 ? Math.PI / 2 : 0);
    const floors = nr.d < 20 ? pick([3, 4, 4]) : pick([2, 3, 3, 4]);
    const res = placeBuilding(x, z, rotY, floors, rs(0.85, 1.25), pick(PALETTE), rand() < 0.6 ? 0 : 1);
    if (nr.d < 14 && rand() < 0.5) {
      const fx = x - N[i].x * Math.sign(nr.lat) * 3.9, fz = z - N[i].z * Math.sign(nr.lat) * 3.9;
      awnings.add(fx, res.y + 2.9, fz, rotY, 1, 1, 1, null, Math.sign(nr.lat) * -0.25 * Math.sign(seaSide[i] || 1));
    }
    if (rand() < 0.35) bougainvillea.add(x + rs(-3.5, 3.5), res.y + rs(0.5, 5), z + rs(-3.5, 3.5), rand() * 3, rs(0.8, 1.5), rs(0.9, 1.6), rs(0.8, 1.4));
  }
  // Scattered villas along the coast
  for (let tries = 0, placed = 0; tries < 3000 && placed < 55; tries++) {
    const s = rand() * track.length;
    const info = track.pointAt(s, 0);
    if (info.zone === "town" || info.zone === "bridge") continue;
    const side = rand() < 0.75 ? -info.seaSide : info.seaSide;
    const d = rs(ROAD_HALF + 9, side === info.seaSide ? 16 : 40);
    const p = track.pointAt(s, side * d).p;
    const h = hf.getHeight(p.x, p.z);
    if (h < 3 || hf.slopeAt(p.x, p.z) > 1.2 || !isFree(p.x, p.z, 5)) continue;
    const nr = track.nearest(p.x, p.z);
    if (!nr || nr.d < ROAD_HALF + 6) continue;
    reserve(p.x, p.z, 5);
    placed++;
    placeBuilding(p.x, p.z, Math.atan2(info.t.x, info.t.z), pick([2, 2, 3]), rs(0.9, 1.3), pick(PALETTE), rand() < 0.5 ? 0 : 1);
    if (rand() < 0.6) bougainvillea.add(p.x + rs(-3, 3), h + rs(0.5, 3), p.z + rs(-3, 3), 0, rs(1, 1.6));
  }
  for (const s of buildingSets) s.inst.finish(root);
  roofs.finish(root); flatTops.finish(root); awnings.finish(root); bougainvillea.finish(root);

  // Campanile, church and piazza
  const landmark = new THREE.Group();
  const cy = hf.getHeight(campanilePos.x, campanilePos.z) - 1;
  landmark.position.set(campanilePos.x, cy, campanilePos.z);
  landmark.rotation.y = Math.atan2(piazzaInfo.t.x, piazzaInfo.t.z);
  const towerMat = std("#f0d9a8");
  const tower = new THREE.Mesh(new THREE.BoxGeometry(4.2, 22, 4.2), towerMat);
  tower.position.y = 11; landmark.add(tower);
  const belfry = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.6, 4.6), std("#fbf3e4"));
  belfry.position.y = 22.3; landmark.add(belfry);
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4, 0.8), towerMat);
    post.position.set(dx * 1.8, 24.6, dz * 1.8); landmark.add(post);
  }
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 10, 0, TAU, 0, Math.PI / 2), std("#b5873a", { metalness: 0.6, roughness: 0.4 }));
  bell.position.y = 23.2; bell.rotation.x = Math.PI; bell.position.y = 25.2; landmark.add(bell);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.6, 4.6), std("#fbf3e4"));
  cap.position.y = 26.9; landmark.add(cap);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.3, 20, 12, 0, TAU, 0, Math.PI / 2), std("#3f9c8c", { roughness: 0.5 }));
  dome.position.y = 27.2; landmark.add(dome);
  const clockFace = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), std("#fffaf0"));
  for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const f = clockFace.clone();
    f.position.set(Math.sin(r) * 2.12, 18.5, Math.cos(r) * 2.12);
    f.rotation.y = r;
    landmark.add(f);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.02), std("#222"));
    hand.position.set(Math.sin(r) * 2.14, 18.8, Math.cos(r) * 2.14); hand.rotation.y = r; landmark.add(hand);
  }
  const church = new THREE.Mesh(new THREE.BoxGeometry(10, 9, 14), std("#fbefd9"));
  church.position.set(-8, 4.5, -2); landmark.add(church);
  const cDome = new THREE.Mesh(new THREE.SphereGeometry(3.6, 24, 14, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: stripeTexture(renderer, ["#2f8f7e", "#e8c14a", "#2f8f7e", "#ffffff"]), roughness: 0.5 }));
  cDome.position.set(-8, 10.4, -2); landmark.add(cDome);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 1.6, 24), std("#fbefd9"));
  drum.position.set(-8, 9.6, -2); landmark.add(drum);
  landmark.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.add(landmark);

  // Harbour: boats, bollards, lamps, cafe umbrellas
  const boatHull = new THREE.SphereGeometry(1, 12, 8, 0, TAU, Math.PI / 2, Math.PI / 2);
  boatHull.scale(1.1, 0.7, 3);
  const boats = new Instancer(boatHull, std("#ffffff", { roughness: 0.6 }), 60);
  const boatBand = new Instancer(new THREE.BoxGeometry(2.1, 0.25, 5.2), std("#ffffff"), 60);
  const boatData = [];
  const boatColors = ["#2c6fb5", "#d9442f", "#2f8f5b", "#e8b830", "#1f4f8a"];
  for (let tries = 0; tries < 2500 && boatData.length < 44; tries++) {
    const th = ZONES.harbor + rs(-0.35, 0.35);
    const R = coastRadius(th);
    const r = R + rs(-10, 60);
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const h = hf.getHeight(x, z);
    if (h > -1.2 || h < -14 || !isFree(x, z, 3)) continue;
    reserve(x, z, 3);
    const rot = th + (rand() < 0.5 ? 0 : Math.PI) + rs(-0.3, 0.3);
    const s = rs(0.8, 1.3);
    boatData.push({ x, z, rot, s, ph: rand() * TAU });
    boats.add(x, 0.62, z, rot, s);
    boatBand.add(x, 0.5, z, rot, s * 0.98, 1, s * 0.96, color.set(pick(boatColors)));
  }
  boats.finish(root); boatBand.finish(root);

  const lampPole = new Instancer(new THREE.CylinderGeometry(0.07, 0.1, 4.2, 6), std("#2b2b2b", { metalness: 0.4, roughness: 0.5 }), 200);
  const lampHead = new Instancer(new THREE.SphereGeometry(0.28, 10, 8), std("#fff4d6", { emissive: "#ffd98a", emissiveIntensity: 0.4 }), 200);
  const bollards = new Instancer(new THREE.CylinderGeometry(0.22, 0.28, 0.7, 8), std("#3a3a3a"), 300);
  for (let s = 4; s < track.length; s += 13) {
    const info = track.pointAt(s, 0);
    if (info.zone !== "town" && info.zone !== "beach") continue;
    for (const side of [-1, 1]) {
      if (info.zone === "beach" && side !== -info.seaSide) continue;
      const p = track.pointAt(s, side * (ROAD_HALF + 1.4)).p;
      lampPole.add(p.x, p.y + 2.1, p.z);
      lampHead.add(p.x, p.y + 4.25, p.z);
    }
    if (info.zone === "town") {
      for (let k = 0; k < 3; k++) {
        const p = track.pointAt(s + k * 4, info.seaSide * (ROAD_HALF + 1.2)).p;
        bollards.add(p.x, p.y + 0.35, p.z);
      }
    }
  }
  lampPole.finish(root); lampHead.finish(root); bollards.finish(root);

  // Umbrellas: cafe umbrellas on the quay, striped parasols on the beach
  const umbGeo = new THREE.ConeGeometry(1.7, 0.7, 16, 1, true);
  umbGeo.translate(0, 2.35, 0);
  const umbMat = new THREE.MeshStandardMaterial({ map: stripeTexture(renderer, ["#ffffff", "#ffffff"]), side: THREE.DoubleSide, roughness: 0.8 });
  const stripeUmb = new THREE.MeshStandardMaterial({ map: stripeTexture(renderer, ["#ffffff", "#e4523b", "#ffffff", "#f2b631", "#ffffff", "#2a78b6"]), side: THREE.DoubleSide, roughness: 0.8 });
  const umbrellas = new Instancer(umbGeo, stripeUmb, 260);
  const cafeUmb = new Instancer(umbGeo, umbMat, 80);
  const poles = new Instancer(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), std("#f5f0e6"), 340);
  const loungers = new Instancer(new THREE.BoxGeometry(0.7, 0.18, 1.9), std("#f7f1e3"), 260);
  const towels = new Instancer(new THREE.BoxGeometry(0.9, 0.03, 1.8), std("#ffffff"), 200);
  for (let tries = 0; tries < 6000 && umbrellas.n < 240; tries++) {
    const th = ZONES.beach + rs(-0.33, 0.33);
    const R = coastRadius(th);
    const r = R + rs(-18, 4);
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const h = hf.getHeight(x, z);
    if (h < 0.9 || h > 3.4) continue;
    const nr = track.nearest(x, z);
    if (nr && nr.d < ROAD_HALF + 3) continue;
    if (!isFree(x, z, 1.9)) continue;
    reserve(x, z, 1.9);
    umbrellas.add(x, h, z, rand() * TAU, 1, 1, 1, null, rs(-0.12, 0.12), rs(-0.12, 0.12));
    poles.add(x, h + 1.2, z);
    if (rand() < 0.8) loungers.add(x + rs(0.8, 1.4), h + 0.15, z + rs(-0.5, 0.5), th + Math.PI / 2);
    if (rand() < 0.5) towels.add(x - rs(0.8, 1.5), h + 0.03, z + rs(-0.8, 0.8), rand() * TAU, 1, 1, 1, color.set(pick(["#e4523b", "#2a78b6", "#f2b631", "#38a38a", "#f28ab2"])));
  }
  for (let s = 0; s < track.length && cafeUmb.n < 60; s += 6.5) {
    const info = track.pointAt(s, 0);
    if (info.zone !== "town") continue;
    const p = track.pointAt(s, info.seaSide * (ROAD_HALF + 5 + rand() * 6)).p;
    if (hf.getHeight(p.x, p.z) < 1) continue;
    color.set(pick(["#f7f0e1", "#e9d27a", "#f3b9a6", "#bfe0d5"]));
    cafeUmb.add(p.x, p.y - 0.3, p.z, 0, 1, 1, 1, color);
    poles.add(p.x, p.y + 0.9, p.z);
  }
  umbrellas.finish(root); cafeUmb.finish(root); poles.finish(root); loungers.finish(root); towels.finish(root);

  // Vegetation
  const pineCanopy = new Instancer(new THREE.IcosahedronGeometry(1, 1).scale(1, 0.38, 1), std("#6a8c46", { flatShading: true }), 420);
  const trunks = new Instancer(new THREE.CylinderGeometry(0.12, 0.2, 1, 6).translate(0, 0.5, 0), std("#6d5540"), 1400);
  const cypress = new Instancer(new THREE.IcosahedronGeometry(1, 1).scale(0.55, 2.6, 0.55).translate(0, 2.6, 0), std("#476b3a", { flatShading: true }), 520);
  const lemonCanopy = new Instancer(new THREE.IcosahedronGeometry(1, 1), std("#3f6e2b", { flatShading: true }), 700);
  const lemonFruit = new Instancer(new THREE.SphereGeometry(0.17, 8, 6).scale(1, 1, 1.3), std("#f7d23a", { roughness: 0.5, emissive: "#6b5000", emissiveIntensity: 0.15 }), 3200, { shadow: false });
  const bush = new Instancer(new THREE.IcosahedronGeometry(1, 0), std("#5c7a3a", { flatShading: true }), 900);
  const pergola = new Instancer(new THREE.BoxGeometry(0.18, 2.6, 0.18).translate(0, 1.3, 0), std("#8a6b4a"), 900);
  const pergolaBeam = new Instancer(new THREE.BoxGeometry(0.12, 0.12, 1).translate(0, 0, 0), std("#8a6b4a"), 900);

  const landOk = (x, z, minRoad, maxSlope = 0.9) => {
    const h = hf.getHeight(x, z);
    if (h < 2.2) return null;
    if (hf.slopeAt(x, z) > maxSlope) return null;
    const nr = track.nearest(x, z);
    if (nr && nr.d < minRoad) return null;
    return h;
  };
  for (let tries = 0; tries < 9000 && pineCanopy.n < 400; tries++) {
    const x = rs(-340, 340), z = rs(-340, 340);
    const h = landOk(x, z, ROAD_HALF + 3.5, 0.8);
    if (h === null || !isFree(x, z, 3)) continue;
    const th = Math.atan2(z, x);
    if (zoneAt(th) === "lemon" && rand() < 0.8) continue;
    reserve(x, z, 2.5);
    const s = rs(2.8, 4.6), ht = rs(4.5, 8);
    trunks.add(x, h - 0.2, z, 0, 1.2, ht, 1.2, null, rs(-0.12, 0.12), rs(-0.12, 0.12));
    color.set("#6a8c46").offsetHSL(rs(-0.02, 0.02), 0, rs(-0.05, 0.05));
    pineCanopy.add(x, h + ht, z, rand() * TAU, s, s, s, color);
  }
  for (let tries = 0; tries < 9000 && cypress.n < 500; tries++) {
    let x, z;
    if (rand() < 0.4) {
      const info = track.pointAt(rand() * track.length, 0);
      const side = -info.seaSide;
      const p = track.pointAt(info.i * 2 + rs(-1, 1), side * rs(ROAD_HALF + 2.6, ROAD_HALF + 6)).p;
      x = p.x; z = p.z;
    } else { x = rs(-320, 320); z = rs(-320, 320); }
    const h = landOk(x, z, ROAD_HALF + 2.4, 1.1);
    if (h === null || !isFree(x, z, 1.2)) continue;
    reserve(x, z, 1.2);
    const s = rs(0.8, 1.4);
    color.set("#476b3a").offsetHSL(0, 0, rs(-0.04, 0.05));
    cypress.add(x, h - 0.3, z, rand() * TAU, s, s * rs(0.9, 1.3), s, color);
  }
  // Lemon terraces with pergolas
  const lemonS = [];
  for (let i = 0; i < count; i++) if (zone[i] === "lemon") lemonS.push(track.cum[i]);
  for (const s of lemonS.filter((_, k) => k % 3 === 0)) {
    const info = track.pointAt(s, 0);
    for (let row = 0; row < 9; row++) {
      const lat = -info.seaSide * (ROAD_HALF + 4 + row * 5.2);
      const p = track.pointAt(s + (row % 2) * 1.5, lat).p;
      const h = landOk(p.x, p.z, ROAD_HALF + 3, 1.2);
      if (h === null || !isFree(p.x, p.z, 1.6)) continue;
      reserve(p.x, p.z, 1.6);
      const sc = rs(1.3, 1.8);
      trunks.add(p.x, h - 0.1, p.z, 0, 0.9, 1.3, 0.9);
      color.set("#3f6e2b").offsetHSL(rs(-0.02, 0.02), 0, rs(-0.04, 0.05));
      lemonCanopy.add(p.x, h + 1.3 + sc * 0.6, p.z, rand() * TAU, sc, sc * 0.85, sc, color);
      for (let f = 0; f < 5; f++) {
        const a = rand() * TAU, b = rs(-0.2, 0.9);
        lemonFruit.add(p.x + Math.cos(a) * sc * 0.95 * Math.cos(b), h + 1.3 + sc * 0.6 + Math.sin(b) * sc * 0.8, p.z + Math.sin(a) * sc * 0.95 * Math.cos(b), rand() * TAU);
      }
      if (row % 3 === 0) {
        pergola.add(p.x + 1.8, h - 0.1, p.z + 1.8);
      }
    }
  }
  for (let tries = 0; tries < 8000 && bush.n < 850; tries++) {
    const x = rs(-340, 340), z = rs(-340, 340);
    const h = landOk(x, z, ROAD_HALF + 1.5, 1.4);
    if (h === null) continue;
    const s = rs(0.7, 1.8);
    color.set(pick(["#6a8440", "#5c7a3a", "#7d8a4a", "#4f6d35", "#8c8f55"]));
    bush.add(x, h + s * 0.25, z, rand() * TAU, s * 1.2, s * 0.8, s, color);
  }
  pineCanopy.finish(root); trunks.finish(root); cypress.finish(root); lemonCanopy.finish(root); lemonFruit.finish(root); bush.finish(root); pergola.finish(root); pergolaBeam.finish(root);

  // Lighthouse on the cape
  const capeR = coastRadius(ZONES.cape) - 10;
  const lx = Math.cos(ZONES.cape) * capeR, lz = Math.sin(ZONES.cape) * capeR;
  const lh = new THREE.Group();
  lh.position.set(lx, hf.getHeight(lx, lz) - 0.5, lz);
  const lBase = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 3, 20), std("#e8dcc6"));
  lBase.position.y = 1.5; lh.add(lBase);
  const lTower = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.1, 15, 20), std("#fbf8f1"));
  lTower.position.y = 10.5; lh.add(lTower);
  const lGallery = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.4, 20), std("#2e3a40"));
  lGallery.position.y = 18.2; lh.add(lGallery);
  const lLamp = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 16), std("#fff7d0", { emissive: "#ffe28a", emissiveIntensity: 1.4 }));
  lLamp.position.y = 19.3; lh.add(lLamp);
  const lRoof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.6, 16), std("#2e3a40"));
  lRoof.position.y = 21; lh.add(lRoof);
  const beamGeo = new THREE.ConeGeometry(4, 60, 20, 1, true).translate(0, -30, 0).rotateZ(Math.PI / 2);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: "#fff2b8", transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 19.3; lh.add(beam);
  lh.traverse((o) => { if (o.isMesh && o !== beam) o.castShadow = true; });
  root.add(lh);

  // Saracen watchtower on the cove headland
  const tR = coastRadius(ZONES.cove + 0.16) - 14;
  const tx = Math.cos(ZONES.cove + 0.16) * tR, tz = Math.sin(ZONES.cove + 0.16) * tR;
  const watch = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4, 10, 16), std("#c9b28d"));
  watch.position.set(tx, hf.getHeight(tx, tz) + 4.5, tz);
  watch.castShadow = true; root.add(watch);

  // Sailboats offshore
  const sailboats = [];
  const sailMat = std("#fffdf6", { side: THREE.DoubleSide });
  for (let k = 0; k < 9; k++) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(boatHull, std("#ffffff"));
    hull.scale.set(1.2, 1, 1.4); g.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 9, 5), std("#ddd"));
    mast.position.y = 4.5; g.add(mast);
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 1, 0, 0, 8.8, 0, 0, 1, -3.8, 0, 1, 0, 0, 7.5, 0, 0, 1, 2.6], 3));
    sailGeo.computeVertexNormals();
    g.add(new THREE.Mesh(sailGeo, sailMat));
    const th = rand() * TAU;
    const r = coastRadius(th) + rs(50, 170);
    g.position.set(Math.cos(th) * r, 0.2, Math.sin(th) * r);
    g.userData = { th, r, speed: rs(0.004, 0.009) * (rand() < 0.5 ? 1 : -1) };
    root.add(g);
    sailboats.push(g);
  }

  // Seagulls
  const gullGeo = new THREE.BufferGeometry();
  gullGeo.setAttribute("position", new THREE.Float32BufferAttribute([-1.2, 0.25, 0, 0, 0, 0.25, 0, 0, -0.25, 1.2, 0.25, 0, 0, 0, -0.25, 0, 0, 0.25], 3));
  gullGeo.computeVertexNormals();
  const gulls = [];
  const gullMat = new THREE.MeshBasicMaterial({ color: "#fdfdfd", side: THREE.DoubleSide });
  for (let k = 0; k < 14; k++) {
    const m = new THREE.Mesh(gullGeo, gullMat);
    m.userData = { cx: 0, cz: 0, r: rs(8, 30), h: rs(14, 30), sp: rs(0.3, 0.6), ph: rand() * TAU, anchor: k < 8 ? "town" : "cape" };
    root.add(m);
    gulls.push(m);
  }

  return {
    root, waterU, sunDir, beam, boatData, boats, boatBand, sailboats, gulls, lighthousePos: lh.position.clone(), campanilePos, bell,
    update(t, focus) {
      waterU.time.value = t;
      beam.rotation.y = t * 0.8;
      for (const b of sailboats) {
        b.userData.th += b.userData.speed * 0.016;
        const { th, r } = b.userData;
        b.position.set(Math.cos(th) * r, 0.2 + Math.sin(t + r) * 0.1, Math.sin(th) * r);
        b.rotation.y = -th + (b.userData.speed > 0 ? 0 : Math.PI);
        b.rotation.z = Math.sin(t * 0.8 + r) * 0.05;
      }
      gulls.forEach((g, k) => {
        const u = g.userData;
        const a = t * u.sp + u.ph;
        const c = u.anchor === "town" ? campanilePos : lh.position;
        g.position.set(c.x + Math.cos(a) * u.r, c.y + u.h + Math.sin(a * 2.3) * 1.5, c.z + Math.sin(a) * u.r);
        g.rotation.y = -a;
        g.scale.y = 1 + Math.sin(t * 6 + k) * 0.8;
      });
      bell.rotation.z = Math.sin(t * 2) * 0.05;
    }
  };
}
