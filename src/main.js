import * as THREE from "three";

const host = document.querySelector("#canvas-host");
const game = document.querySelector("#game");
const startButton = document.querySelector("#start-button");
const intro = document.querySelector("#intro");
const hud = document.querySelector("#ride-hud");
const speedReadout = document.querySelector("#speed-value");
const timeReadout = document.querySelector("#ride-time");
const soundButton = document.querySelector("#sound-toggle");
const notice = document.querySelector("#notice");
const rideCaption = document.querySelector("#ride-caption");
const touchControls = document.querySelector("#touch-controls");
const shellReadout = document.querySelector("#shell-count");
const heartsReadout = document.querySelector("#hearts");
const routeFill = document.querySelector("#route-fill");
const routeBike = document.querySelector(".route-bike");
const endScreen = document.querySelector("#end-screen");
const pauseScreen = document.querySelector("#pause-screen");

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xa6dfd9, 0.0048);

const camera = new THREE.PerspectiveCamera(49, window.innerWidth / window.innerHeight, 0.1, 560);
camera.position.set(0, 4.25, 9.4);

const hemi = new THREE.HemisphereLight(0xf6fbeb, 0x418c84, 2.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffedba, 3.05);
sun.position.set(-16, 23, -7);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xc0def0, 0.75);
fill.position.set(14, 12, 8);
scene.add(fill);

const gradientData = new Uint8Array([
  48, 48, 48, 255, 94, 94, 94, 255,
  164, 164, 164, 255, 255, 255, 255, 255
]);
const gradientMap = new THREE.DataTexture(gradientData, 4, 1, THREE.RGBAFormat);
gradientMap.magFilter = THREE.NearestFilter;
gradientMap.minFilter = THREE.NearestFilter;
gradientMap.colorSpace = THREE.NoColorSpace;
gradientMap.needsUpdate = true;
const contourMaterial = new THREE.MeshBasicMaterial({ color: 0x49483c, side: THREE.BackSide, transparent: true, opacity: 0.64, depthWrite: false });

const SEGMENT_LENGTH = 150;
const TRACK_SEGMENTS = 3;
const TRACK_LENGTH = SEGMENT_LENGTH * TRACK_SEGMENTS;
const FINISH_DISTANCE = TRACK_LENGTH - 20;
const REQUIRED_SHELLS = 7;

function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap, ...extra });
}
const mats = {
  dark: toon(0x343638),
  darkWood: toon(0x554d46),
  riderShirt: toon(0xfff9e9),
  riderPants: toon(0xf6a14f),
  skin: toon(0xffb458),
  bike: toon(0x127e8c),
  bikeAccent: toon(0xf8b764),
  butterfly: toon(0xf1c979),
  petalA: toon(0xe3a37c),
  petalB: toon(0xf0d486)
};

function box(parent, size, material, pos, rot = null) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  m.castShadow = false;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}
function sphere(parent, scale, material, pos, width = 10, height = 7) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, width, height), material);
  m.scale.set(scale[0], scale[1], scale[2]);
  m.position.set(pos[0], pos[1], pos[2]);
  parent.add(m);
  return m;
}
function cylinder(parent, rTop, rBottom, length, material, pos, seg = 7) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, length, seg), material);
  m.position.set(pos[0], pos[1], pos[2]);
  parent.add(m);
  return m;
}
function stick(parent, a, b, radius, material, seg = 6) {
  const A = new THREE.Vector3(a[0], a[1], a[2]);
  const B = new THREE.Vector3(b[0], b[1], b[2]);
  const delta = new THREE.Vector3().subVectors(B, A);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), seg), material);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  parent.add(m);
  return m;
}
function plane(parent, width, depth, material, pos, rotX = -Math.PI / 2) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  m.rotation.x = rotX;
  m.position.set(pos[0], pos[1], pos[2]);
  parent.add(m);
  return m;
}
function addContour(mesh, expand = 0.045) {
  const shell = new THREE.Mesh(mesh.geometry, contourMaterial);
  shell.position.copy(mesh.position);
  shell.quaternion.copy(mesh.quaternion);
  shell.scale.copy(mesh.scale).multiplyScalar(1 + expand);
  shell.renderOrder = 0;
  mesh.renderOrder = 1;
  mesh.parent.add(shell);
  return mesh;
}
function roadX(z) {
  return 1.2 * Math.sin(z / 57 + 0.18) + 0.48 * Math.sin(z / 24 + 0.72) + 0.24 * Math.sin(z / 113 + 1.6);
}
function roadY(z) {
  return 0.18 + 0.085 * Math.sin(z / 68 + 0.7) + 0.032 * Math.sin(z / 31 + 0.2);
}
function xAt(z, side, offset, trackOffset = 0) {
  return roadX(z + trackOffset) + side * offset;
}

function makeSky() {
  const geo = new THREE.SphereGeometry(430, 48, 28);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: "varying vec3 vDir; void main(){ vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader:
      "varying vec3 vDir; uniform float uTime;" +
      "void main(){ float h=normalize(vDir).y; " +
      "vec3 low=vec3(0.87,0.96,0.85); vec3 mid=vec3(0.57,0.84,0.89); vec3 high=vec3(0.27,0.66,0.84);" +
      "vec3 c=mix(low,mid,smoothstep(-0.28,0.12,h)); c=mix(c,high,smoothstep(0.08,0.82,h));" +
      "float sun=pow(max(dot(normalize(vDir),normalize(vec3(-0.33,0.25,-0.9))),0.0),72.0);" +
      "c=mix(c,vec3(1.0,0.97,0.75),sun*0.78); float grain=fract(sin(dot(gl_FragCoord.xy+uTime,vec2(12.9898,78.233)))*43758.5453);" +
      "c += (grain-0.5)*0.009; gl_FragColor=vec4(c,1.0); }"
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  scene.add(sky);
  return sky;
}
const sky = makeSky();

function makeCloud(parent, x, y, z, s, warm = false) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const cloudMat = toon(warm ? 0xf2d6b5 : 0xfff3da);
  const forms = [
    [-1.25, -0.03, 0, 1.25, 0.75, 0.64],
    [-0.52, 0.36, -0.12, 1.16, 0.95, 0.76],
    [0.37, 0.22, 0.05, 1.43, 0.88, 0.72],
    [1.32, -0.03, 0.08, 0.98, 0.59, 0.60],
    [0.14, -0.15, 0.32, 1.42, 0.55, 0.6]
  ];
  forms.forEach((f, i) => sphere(g, [f[3] * s, f[4] * s, f[5] * s], cloudMat, [f[0] * s, f[1] * s, f[2] * s], 11, 8));
  parent.add(g);
  return g;
}
const clouds = [];
clouds.push(makeCloud(scene, -18, 15.2, -43, 1.55, false));
clouds.push(makeCloud(scene, 6, 16.4, -74, 1.9, false));
clouds.push(makeCloud(scene, 25, 13.4, -35, 1.25, true));
clouds.push(makeCloud(scene, -31, 18.4, -125, 1.8, false));
clouds.push(makeCloud(scene, 18, 19.2, -157, 2.0, true));

function makeRidge(color, z, top, amplitude, seed) {
  const positions = [];
  const indices = [];
  const count = 48;
  const span = 250;
  positions.push(-span, -9, z, span, -9, z);
  for (let i = 0; i <= count; i++) {
    const x = -span + span * 2 * i / count;
    const y = top + Math.sin(i * 0.51 + seed) * amplitude + Math.cos(i * 0.17 + seed) * amplitude * 0.75;
    positions.push(x, y, z);
  }
  for (let i = 0; i < count; i++) {
    const a = 2 + i, b = a + 1;
    indices.push(0, a, b, 1, b, a);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, toon(color, { side: THREE.DoubleSide }));
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
const ridges = [
  makeRidge(0x67ada4, -205, -3.8, 3.2, 1.2),
  makeRidge(0x8ac4ac, -194, -5.0, 2.5, 4.4),
  makeRidge(0x9ed5b4, -182, -5.8, 1.6, 2.0)
];

function createTerrainTexture(base, accents) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 240; i++) {
    const col = accents[i % accents.length];
    ctx.globalAlpha = 0.05 + Math.random() * 0.09;
    ctx.fillStyle = col;
    const w = 4 + Math.random() * 28, h = 1 + Math.random() * 5;
    ctx.save();
    ctx.translate(Math.random() * 256, Math.random() * 256);
    ctx.rotate(Math.random() * 1.2 - 0.6);
    ctx.beginPath();
    ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}
const roadWash = createTerrainTexture("#e6c18c", ["#fff2cb", "#cdab80", "#f7dfab"]);
const roadMaterial = toon(0xffffff, { map: roadWash });

const butterflies = [];
const glints = [];
const shells = [];
const crabs = [];

function buildRoadGeometry(trackOffset = 0) {
  const rows = 110, width = 7.2;
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= rows; i++) {
    const z = -SEGMENT_LENGTH + SEGMENT_LENGTH * i / rows;
    const center = roadX(z + trackOffset);
    const elevation = roadY(z + trackOffset);
    positions.push(center - width / 2, elevation, z, center + width / 2, elevation, z);
    uvs.push(0, i / rows * 5.5, 1, i / rows * 5.5);
    if (i < rows) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
const waterMaterial = toon(0x1ca4b7, { side: THREE.DoubleSide });
const shimmerMaterial = new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0.42, depthWrite: false });
const roadEdgeMat = toon(0xffe3a7);
const grassMat = toon(0x80bc77, { side: THREE.DoubleSide });
const sandMat = toon(0xf4d49a, { side: THREE.DoubleSide });
const flowerHeadMat = [mats.petalA, mats.petalB, toon(0xffead2)];
const palmTrunk = toon(0xa77853);
const palmStem = toon(0x428f68);
const palmLeaves = [toon(0x55aa71), toon(0x66b979)];
const coconutMat = toon(0xa57844);

function addFlowers(parent, x, z, count = 12, trackOffset = 0) {
  for (let i = 0; i < count; i++) {
    const px = x + (Math.random() - 0.5) * 2.8;
    const pz = z + (Math.random() - 0.5) * 5.2;
    const y = roadY(pz + trackOffset);
    stick(parent, [px, y, pz], [px, y + 0.35 + Math.random() * 0.24, pz], 0.018, toon(0x718653), 4);
    sphere(parent, [0.09, 0.08, 0.07], flowerHeadMat[i % flowerHeadMat.length], [px, y + 0.43, pz], 7, 5);
    if (i % 3 === 0) {
      for (let p = 0; p < 4; p++) {
        const a = p * Math.PI / 2;
        sphere(parent, [0.095, 0.055, 0.06], flowerHeadMat[(i + p) % flowerHeadMat.length], [px + Math.cos(a) * 0.12, y + 0.43, pz + Math.sin(a) * 0.1], 6, 4);
      }
    }
  }
}
function addButterfly(parent, x, y, z, index) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const body = cylinder(g, 0.025, 0.025, 0.35, mats.dark, [0, 0, 0], 5);
  body.rotation.x = Math.PI / 2;
  const w1 = sphere(g, [0.18, 0.12, 0.035], mats.butterfly, [-0.15, 0.03, 0], 7, 5);
  const w2 = sphere(g, [0.18, 0.12, 0.035], mats.petalA, [0.15, 0.03, 0], 7, 5);
  g.userData.wings = [w1, w2];
  g.userData.phase = index * 2.2;
  g.userData.base = new THREE.Vector3(x, y, z);
  parent.add(g);
  butterflies.push(g);
}
function addCoastStrip(parent, side, inner, outer, material, trackOffset = 0, y = -0.15) {
  const samples = 34;
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= samples; i++) {
    const z = -SEGMENT_LENGTH + SEGMENT_LENGTH * i / samples;
    const cx = roadX(z + trackOffset);
    const sign = side;
    positions.push(cx + sign * inner, roadY(z + trackOffset) + y, z);
    positions.push(cx + sign * outer, roadY(z + trackOffset) + y - 0.04, z);
    uvs.push(0, i / samples * 5, 1, i / samples * 5);
    if (i < samples) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const strip = new THREE.Mesh(geo, material);
  parent.add(strip);
}
function addOcean(parent, side, segmentIndex, trackOffset = 0) {
  addCoastStrip(parent, side, 17, 220, waterMaterial, trackOffset, -0.36);
  addCoastStrip(parent, side, 16.8, 17.2, toon(0xe5f7e2, { side: THREE.DoubleSide }), trackOffset, -0.2);
  const count = 48;
  const glintMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), shimmerMaterial.clone(), count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const z = -3 - (i / count) * (SEGMENT_LENGTH - 6) + (segmentIndex % 2) * 0.8;
    const cx = xAt(z, side, 19, trackOffset);
    dummy.position.set(cx + side * (2 + Math.random() * 23), roadY(z + trackOffset) - 0.27, z);
    dummy.rotation.y = (Math.random() - 0.5) * 0.35;
    dummy.scale.set(0.4 + Math.random() * 1.6, 0.012, 0.06);
    dummy.updateMatrix();
    glintMesh.setMatrixAt(i, dummy.matrix);
  }
  glintMesh.instanceMatrix.needsUpdate = true;
  parent.add(glintMesh);
  glints.push(glintMesh);
}
function addSailboat(parent, side, z, trackOffset) {
  const x = xAt(z, side, 33, trackOffset);
  const y = roadY(z + trackOffset) - 0.16;
  const hull = sphere(parent, [1.8, 0.3, 0.65], toon(0xf5f0dc), [x, y, z], 10, 7);
  hull.rotation.y = 0.3;
  stick(parent, [x, y + 0.2, z], [x, y + 3.6, z], 0.055, toon(0x6c8c82));
  const sail = new THREE.Mesh(new THREE.ConeGeometry(1.35, 3.2, 3), toon(0xffe7b7, { side: THREE.DoubleSide }));
  sail.position.set(x + 0.62, y + 2.15, z);
  sail.rotation.z = -0.2;
  parent.add(sail);
}
function addPalm(parent, x, z, scale, trackOffset) {
  const g = new THREE.Group();
  g.position.set(x, roadY(z + trackOffset) - 0.04, z);
  g.scale.setScalar(scale);
  const lean = x < 0 ? -1 : 1;
  stick(g, [0, 0, 0], [lean * 0.45, 2.2, 0], 0.26, palmTrunk);
  stick(g, [lean * 0.45, 2.2, 0], [lean * 0.75, 5.3, -0.12], 0.2, palmTrunk);
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7;
    const dx = Math.cos(a), dz = Math.sin(a);
    const start = [lean * 0.75, 5.3, -0.12];
    const tip = [lean * 0.75 + dx * 3.7, 4.2, -0.12 + dz * 3.7];
    stick(g, start, tip, 0.075, palmStem);
    const frond = sphere(g, [0.48, 0.075, 1.9], palmLeaves[i % 2],
      [lean * 0.75 + dx * 1.95, 4.9, -0.12 + dz * 1.95], 8, 5);
    frond.rotation.y = Math.PI / 2 - a;
  }
  for (let i = 0; i < 3; i++) sphere(g, [0.31, 0.31, 0.31], coconutMat, [lean * 0.75 + (i - 1) * 0.27, 4.94, -0.05], 8, 6);
  parent.add(g);
}
function addShell(parent, x, z, trackOffset, index) {
  const g = new THREE.Group();
  g.position.set(x, roadY(z + trackOffset) + 0.7, z);
  const shellMat = toon(index % 2 ? 0xffd88f : 0xffa888, { side: THREE.DoubleSide });
  sphere(g, [0.48, 0.39, 0.18], shellMat, [0, 0, 0], 12, 8);
  for (let i = -2; i <= 2; i++) {
    stick(g, [0, -0.3, 0.16], [i * 0.18, 0.26, 0.13], 0.018, toon(0xfff0cb));
  }
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.025, 5, 24), toon(0xfff6d8));
  g.add(halo);
  parent.add(g);
  shells.push({ group: g, collected: false, baseY: g.position.y, index });
}
function addCrab(parent, x, z, trackOffset, index) {
  const g = new THREE.Group();
  g.position.set(x, roadY(z + trackOffset) + 0.19, z);
  const red = toon(0xeb745e);
  sphere(g, [0.48, 0.24, 0.36], red, [0, 0.1, 0], 10, 7);
  for (const side of [-1, 1]) {
    sphere(g, [0.17, 0.2, 0.17], red, [side * 0.6, 0.23, -0.24], 7, 5);
    stick(g, [side * 0.3, 0.1, 0], [side * 0.8, 0.03, 0.35], 0.06, red);
    stick(g, [side * 0.22, 0.18, -0.19], [side * 0.25, 0.44, -0.2], 0.055, toon(0xfff5de));
    sphere(g, [0.075, 0.075, 0.075], mats.dark, [side * 0.25, 0.47, -0.2], 7, 5);
  }
  parent.add(g);
  crabs.push({ group: g, hit: false, index });
}
function addLighthouse(parent, z, trackOffset) {
  const x = xAt(z, 1, 11, trackOffset);
  const y = roadY(z + trackOffset);
  cylinder(parent, 1.2, 1.7, 10, toon(0xfff6db), [x, y + 5, z], 12);
  for (const height of [2.5, 5.2, 8]) cylinder(parent, 1.31, 1.4, 0.7, toon(0xf08067), [x, y + height, z], 12);
  cylinder(parent, 1.65, 1.65, 0.4, toon(0x1c7f8e), [x, y + 10.1, z], 12);
  cylinder(parent, 1.05, 1.05, 1.25, toon(0xffe6a5, { emissive: 0xffd878, emissiveIntensity: 0.65 }), [x, y + 10.9, z], 12);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.25, 12), toon(0xee8f68));
  roof.position.set(x, y + 12.15, z); parent.add(roof);
  box(parent, [0.85, 1.8, 0.15], toon(0x177583), [x, y + 0.9, z + 1.52]);
  for (const side of [-1, 1]) {
    const px = xAt(z + 4, side, 4.65, trackOffset);
    cylinder(parent, 0.075, 0.08, 3.4, toon(0xffffff), [px, y + 1.7, z + 4], 7);
    const flag = box(parent, [1.1, 0.52, 0.08], toon(0xef8665), [px + side * 0.5, y + 2.95, z + 4]);
    flag.rotation.z = side * 0.1;
  }
  plane(parent, 7.5, 0.85, toon(0xfff2c9, { side: THREE.DoubleSide }), [roadX(z + trackOffset), y + 0.025, z + 4]);
}

function buildSegment(index, zOffset, trackOffset = zOffset) {
  const root = new THREE.Group();
  root.position.z = zOffset;
  for (const side of [-1, 1]) {
    addCoastStrip(root, side, 3.65, 8.2, grassMat, trackOffset, -0.14);
    addCoastStrip(root, side, 8.2, 17.4, sandMat, trackOffset, -0.19);
    addOcean(root, side, index, trackOffset);
  }
  const roadGeo = buildRoadGeometry(trackOffset);
  const edge = new THREE.Mesh(roadGeo, roadEdgeMat);
  edge.scale.x = 1.16;
  edge.position.y = -0.03;
  root.add(edge);
  const road = new THREE.Mesh(roadGeo, roadMaterial);
  road.position.y = 0.015;
  root.add(road);
  for (const side of [-1, 1]) {
    for (const z of [-18, -58, -103, -137]) {
      addPalm(root, xAt(z, side, 10 + (Math.abs(z) % 3), trackOffset), z, 0.72 + (Math.abs(z) % 5) * 0.07, trackOffset);
    }
    addFlowers(root, xAt(-34, side, 5.7, trackOffset), -34, 9, trackOffset);
    addFlowers(root, xAt(-91, side, 6.3, trackOffset), -91, 9, trackOffset);
  }
  addSailboat(root, index % 2 ? -1 : 1, -62, trackOffset);
  makeCloud(root, index % 2 ? 22 : -22, 16, -93, 1.5);
  addButterfly(root, xAt(-68, -1, 6.5, trackOffset), roadY(-68 + trackOffset) + 1, -68, index);
  const shellLanes = [0, -1.7, 1.7, 0];
  [-22, -54, -88, -123].forEach((z, i) => {
    addShell(root, roadX(z + trackOffset) + shellLanes[(i + index) % 4], z, trackOffset, index * 4 + i);
  });
  [-74, -110].forEach((z, i) => {
    addCrab(root, roadX(z + trackOffset) + (i === 0 ? -1.65 : 1.65), z, trackOffset, index * 2 + i);
  });
  if (index === TRACK_SEGMENTS - 1) addLighthouse(root, -128, trackOffset);
  scene.add(root);
}

for (let i = 0; i < TRACK_SEGMENTS; i++) {
  const offset = -SEGMENT_LENGTH * i;
  buildSegment(i, offset, offset);
}

// Character and bicycle: simple painted shapes with readable silhouette.
const riderRoot = new THREE.Group();
scene.add(riderRoot);
const bike = new THREE.Group();
bike.rotation.y = Math.PI / 2;
riderRoot.add(bike);
const bikeMat = mats.bike;
const framePoints = [
  [[-0.67, 0.72, 0], [0.68, 0.72, 0]],
  [[-0.67, 0.72, 0], [-0.18, 1.05, 0]],
  [[-0.18, 1.05, 0], [0.68, 0.72, 0]],
  [[-0.18, 1.05, 0], [0.08, 0.72, 0]],
  [[0.68, 0.72, 0], [0.83, 1.18, 0]]
];
framePoints.forEach((line) => addContour(stick(bike, line[0], line[1], 0.047, bikeMat), 0.2));
const wheelGroups = [];
function makeWheel(x) {
  const g = new THREE.Group();
  g.position.set(x, 0.58, 0);
  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 7, 22), toon(0x403e39));
  g.add(torus);
  const hub = cylinder(g, 0.09, 0.09, 0.12, mats.bikeAccent, [0, 0, 0], 8);
  hub.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.018, 5, 18), mats.bikeAccent);
  g.add(rim);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    stick(g, [0, 0, 0], [Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0], 0.012, mats.bikeAccent, 4);
  }
  bike.add(g); wheelGroups.push(g);
}
makeWheel(-0.68); makeWheel(0.68);
stick(bike, [-0.23, 0.78, 0.02], [-0.14, 0.99, 0.02], 0.065, mats.bikeAccent);
stick(bike, [-0.18, 1.03, -0.24], [-0.18, 1.03, 0.24], 0.065, mats.darkWood);
box(bike, [0.34, 0.11, 0.25], toon(0x353b39), [-0.18, 1.09, 0]);
stick(bike, [0.81, 1.15, 0.02], [0.81, 1.35, 0.02], 0.055, mats.bikeAccent);
stick(bike, [0.81, 1.34, -0.34], [0.81, 1.34, 0.34], 0.055, mats.darkWood);
// Chain ring and crank arms.
const crank = new THREE.Group();
crank.position.set(0.08, 0.72, 0.08);
bike.add(crank);
const chainring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 5, 16), mats.bikeAccent);
crank.add(chainring);
stick(crank, [-0.22, 0, 0], [0.22, 0, 0], 0.025, mats.dark);
const pedalContacts = [];
[-1, 1].forEach((side) => {
  const arm = new THREE.Group();
  arm.position.set(side * 0.12, 0, side * 0.14);
  crank.add(arm);
  stick(arm, [0, 0, 0], [side * 0.14, 0, 0], 0.035, mats.dark);
  box(arm, [0.2, 0.07, 0.12], mats.dark, [side * 0.16, 0, 0]);
  const contact = new THREE.Object3D();
  contact.position.set(side * 0.16, 0, 0);
  arm.add(contact);
  pedalContacts.push(contact);
});

const torso = new THREE.Group();
torso.position.set(0, 1.5, 0.05);
riderRoot.add(torso);
addContour(sphere(torso, [0.47, 0.54, 0.41], mats.riderShirt, [0, 0, 0], 12, 9), 0.035);
sphere(torso, [0.43, 0.25, 0.26], toon(0xe9e9d7), [0, -0.12, 0.3], 10, 7);
sphere(riderRoot, [0.21, 0.36, 0.22], mats.riderShirt, [0, 1.94, -0.09], 10, 8);
const head = new THREE.Group();
head.position.set(0, 2.27, -0.18);
riderRoot.add(head);
addContour(sphere(head, [0.37, 0.37, 0.37], mats.riderShirt, [0, 0, 0], 12, 9), 0.025);
const pouch = sphere(head, [0.23, 0.19, 0.51], toon(0xf3a24e), [0, -0.21, -0.53], 11, 8);
pouch.rotation.x = -0.18;
const beak = sphere(head, [0.14, 0.075, 0.73], toon(0xffba57), [0, -0.105, -0.72], 10, 6);
beak.rotation.x = -0.08;
sphere(head, [0.065, 0.075, 0.055], toon(0x253f47), [-0.32, 0.04, -0.12], 8, 6);
sphere(head, [0.065, 0.075, 0.055], toon(0x253f47), [0.32, 0.04, -0.12], 8, 6);
for (let i = -1; i <= 1; i++) {
  const feather = sphere(head, [0.09, 0.28, 0.13], mats.riderShirt, [i * 0.13, 0.33 + (i === 0 ? 0.08 : 0), 0.06], 8, 6);
  feather.rotation.z = i * -0.3;
}
const tailFeather = sphere(riderRoot, [0.28, 0.11, 0.43], mats.riderShirt, [0, 1.17, 0.57], 9, 6);
const armL = new THREE.Group(), armR = new THREE.Group();
armL.position.set(-0.35, 1.73, -0.01); armR.position.set(0.35, 1.73, -0.01);
riderRoot.add(armL, armR);
const leftWing = sphere(armL, [0.19, 0.33, 0.28], mats.riderShirt, [-0.04, -0.13, -0.16], 9, 7);
const rightWing = sphere(armR, [0.19, 0.33, 0.28], mats.riderShirt, [0.04, -0.13, -0.16], 9, 7);
leftWing.rotation.x = rightWing.rotation.x = -0.5;
stick(armL, [-0.06, -0.24, -0.32], [-0.06, -0.38, -0.76], 0.095, mats.skin);
stick(armR, [0.06, -0.24, -0.32], [0.06, -0.38, -0.76], 0.095, mats.skin);
box(riderRoot, [0.58, 0.13, 0.13], toon(0x379aa2), [0, 1.82, 0.09]);
function movingBone(radius) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.9, radius, 1, 8), mats.riderPants);
  riderRoot.add(mesh);
  return mesh;
}
function placeBone(mesh, a, b) {
  const delta = new THREE.Vector3().subVectors(b, a);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
  mesh.scale.y = delta.length();
}
const movingLegs = [-1, 1].map((side) => {
  const hip = new THREE.Vector3(side * 0.18, 1.18, 0.1);
  const knee = sphere(riderRoot, [0.135, 0.15, 0.13], mats.riderPants, [0, 0, 0], 8, 6);
  const shoe = sphere(riderRoot, [0.24, 0.075, 0.29], mats.skin, [0, 0, 0], 8, 5);
  return { side, hip, knee, shoe, thigh: movingBone(0.13), calf: movingBone(0.095) };
});
const satchel = addContour(box(riderRoot, [0.44, 0.42, 0.23], toon(0xee9f64), [0, 1.54, 0.43]), 0.025);
satchel.rotation.x = -0.12;

const keys = new Set();
const touchState = { left: false, right: false, accelerate: false, brake: false };
let started = false, travel = 0, speed = 4.8, lateral = 0, steering = 0, rideSeconds = 0, messageTimer = 0;
let shellCount = 0, hearts = 3, invulnerable = 0, paused = false, finished = false;

const keyMap = {
  KeyW: "accelerate", ArrowUp: "accelerate",
  KeyS: "brake", ArrowDown: "brake",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right"
};
window.addEventListener("keydown", (e) => {
  if (keyMap[e.code] && !paused && !finished) { keys.add(keyMap[e.code]); e.preventDefault(); }
  if (e.code === "KeyM") toggleAudio();
  if (e.code === "Space" && started && !finished) { e.preventDefault(); togglePause(); }
  if (e.code === "KeyR" && finished) restartRide();
});
window.addEventListener("keyup", (e) => { if (keyMap[e.code]) keys.delete(keyMap[e.code]); });
window.addEventListener("blur", () => {
  keys.clear();
  Object.keys(touchState).forEach((action) => { touchState[action] = false; });
  if (started && !finished && !paused) togglePause();
});
document.querySelectorAll("[data-control]").forEach((button) => {
  const action = button.dataset.control;
  const press = (e) => { e.preventDefault(); button.setPointerCapture(e.pointerId); touchState[action] = true; };
  const release = (e) => { e.preventDefault(); touchState[action] = false; };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
});
startButton.addEventListener("click", beginRide);
soundButton.addEventListener("click", toggleAudio);
document.querySelector("#pause-button").addEventListener("click", togglePause);
document.querySelector("#resume-button").addEventListener("click", togglePause);
document.querySelector("#restart-button").addEventListener("click", restartRide);

let audio = null;
function makeNoiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = last * 0.91 + white * 0.09;
    data[i] = last * 0.85;
  }
  return buffer;
}
function createAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  const noise = ctx.createBufferSource(); noise.buffer = makeNoiseBuffer(ctx); noise.loop = true;
  const windFilter = ctx.createBiquadFilter(); windFilter.type = "lowpass"; windFilter.frequency.value = 460;
  const windGain = ctx.createGain(); windGain.gain.value = 0.024;
  noise.connect(windFilter).connect(windGain).connect(master); noise.start();
  const drone = ctx.createOscillator(); drone.type = "triangle"; drone.frequency.value = 55;
  const droneGain = ctx.createGain(); droneGain.gain.value = 0.012;
  drone.connect(droneGain).connect(master); drone.start();
  return { ctx, master, windGain, drone, droneGain, chainTimer: 0, birdTimer: 1.4, enabled: true };
}
function chirp() {
  if (!audio || !audio.enabled || audio.ctx.state !== "running") return;
  const ctx = audio.ctx;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  const start = ctx.currentTime;
  const base = 2150 + Math.random() * 950;
  osc.type = "sine";
  osc.frequency.setValueAtTime(base, start);
  osc.frequency.exponentialRampToValueAtTime(base * (0.72 + Math.random() * 0.2), start + 0.11);
  osc.frequency.exponentialRampToValueAtTime(base * 1.08, start + 0.23);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.026, start + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.27);
  osc.connect(gain).connect(audio.master);
  osc.start(start); osc.stop(start + 0.3);
}
function chainClick() {
  if (!audio || !audio.enabled || audio.ctx.state !== "running") return;
  const ctx = audio.ctx, t = ctx.currentTime;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = "square"; osc.frequency.value = 340 + Math.random() * 100;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.018, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.034);
  osc.connect(gain).connect(audio.master); osc.start(t); osc.stop(t + 0.04);
}
function playCue(frequency) {
  if (!audio || !audio.enabled || audio.ctx.state !== "running") return;
  const t = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator(), gain = audio.ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, t);
  osc.frequency.exponentialRampToValueAtTime(frequency * 1.35, t + 0.18);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.085, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
  osc.connect(gain).connect(audio.master);
  osc.start(t); osc.stop(t + 0.35);
}
function toggleAudio() {
  if (!audio) { audio = createAudio(); }
  if (!audio) return;
  audio.enabled = !audio.enabled;
  audio.master.gain.setTargetAtTime(audio.enabled ? 0.5 : 0.0001, audio.ctx.currentTime, 0.12);
  soundButton.classList.toggle("muted", !audio.enabled);
  soundButton.setAttribute("aria-label", audio.enabled ? "关闭声音" : "开启声音");
  soundButton.querySelector("span").textContent = audio.enabled ? "声音开" : "声音关";
  if (audio.enabled) audio.ctx.resume();
}
function beginRide() {
  if (started) return;
  started = true; intro.classList.add("leaving"); hud.hidden = false;
  rideCaption.hidden = false;
  document.querySelector("#pause-button").hidden = false;
  if (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 820) touchControls.hidden = false;
  window.setTimeout(() => { intro.hidden = true; }, 550);
  game.classList.add("riding");
  if (!audio) { audio = createAudio(); }
  if (audio) {
    audio.master.gain.setTargetAtTime(audio.enabled ? 0.5 : 0.0001, audio.ctx.currentTime, 0.12);
    audio.ctx.resume();
  }
}
function togglePause() {
  if (!started || finished) return;
  paused = !paused;
  pauseScreen.hidden = !paused;
  document.querySelector("#pause-button").setAttribute("aria-label", paused ? "继续游戏" : "暂停游戏");
  document.querySelector("#pause-button").textContent = paused ? "▶" : "Ⅱ";
  keys.clear();
  Object.keys(touchState).forEach((action) => { touchState[action] = false; });
}
function formatTime(seconds) {
  const secs = Math.floor(seconds);
  return String(Math.floor(secs / 60)).padStart(2, "0") + ":" + String(secs % 60).padStart(2, "0");
}
function endRide(reason) {
  if (finished) return;
  finished = true;
  keys.clear();
  Object.keys(touchState).forEach((action) => { touchState[action] = false; });
  const success = reason === "finish" && shellCount >= REQUIRED_SHELLS;
  document.querySelector("#end-kicker").textContent = success ? "岛屿探险完成" : "今天先歇一歇";
  document.querySelector("#end-title").textContent = success ? "抵达灯塔！" : reason === "hearts" ? "哎呀，摔跤啦" : "贝壳还不够哦";
  document.querySelector("#end-description").textContent = success ? "阿啾把今天的海风装进了回忆里。" : reason === "hearts" ? "小螃蟹赢了这一回，再来一次吧！" : "再来一圈，收集至少 7 枚贝壳吧！";
  document.querySelector("#final-shells").textContent = shellCount + " / " + shells.length;
  document.querySelector("#final-time").textContent = formatTime(rideSeconds);
  endScreen.hidden = false;
  touchControls.hidden = true;
  document.querySelector("#pause-button").hidden = true;
}
function restartRide() {
  travel = 0; speed = 4.8; lateral = 0; steering = 0; rideSeconds = 0;
  shellCount = 0; hearts = 3; invulnerable = 0; paused = false; finished = false;
  riderRoot.position.set(roadX(0), roadY(0), 0);
  camera.position.set(roadX(0) * 0.58, 4.1, 9.45);
  camera.lookAt(roadX(0) * 0.28, 1, -5.6);
  shells.forEach((shell) => { shell.collected = false; shell.group.visible = true; });
  crabs.forEach((crab) => { crab.hit = false; });
  shellReadout.textContent = "0";
  heartsReadout.textContent = "♥ ♥ ♥";
  heartsReadout.setAttribute("aria-label", "剩余三颗爱心");
  routeFill.style.width = "0%";
  routeBike.style.left = "0%";
  timeReadout.textContent = "00:00";
  endScreen.hidden = true;
  pauseScreen.hidden = true;
  document.querySelector("#pause-button").hidden = false;
  notice.classList.remove("visible");
  messageTimer = 0;
  if (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 820) touchControls.hidden = false;
  keys.clear();
}

function showNotice(text) {
  notice.textContent = text;
  notice.classList.add("visible");
  messageTimer = 1.1;
}
function checkPickups() {
  const riderX = roadX(-travel) + lateral;
  for (const shell of shells) {
    if (shell.collected) continue;
    const obj = shell.group;
    if (Math.abs(obj.position.z + obj.parent.position.z + travel) < 1.35 && Math.abs(obj.position.x - riderX) < 1.12) {
      shell.collected = true;
      obj.visible = false;
      shellCount++;
      shellReadout.textContent = String(shellCount);
      playCue(600 + shellCount * 30);
      showNotice(shellCount >= REQUIRED_SHELLS ? "贝壳集齐！去灯塔吧 ✦" : "捡到贝壳 +1 ✦");
    }
  }
  if (invulnerable > 0) return;
  for (const crab of crabs) {
    if (crab.hit) continue;
    const obj = crab.group;
    if (Math.abs(obj.position.z + obj.parent.position.z + travel) < 1.1 && Math.abs(obj.position.x - riderX) < 0.91) {
      crab.hit = true;
      hearts--;
      speed = Math.max(1, speed * 0.35);
      invulnerable = 1.5;
      heartsReadout.textContent = "♥ ".repeat(hearts) + "♡ ".repeat(3 - hearts);
      heartsReadout.setAttribute("aria-label", "剩余" + hearts + "颗爱心");
      playCue(180);
      showNotice(hearts ? "小心螃蟹！少了一颗心" : "哎呀！撞上螃蟹了");
      if (hearts === 0) endRide("hearts");
      break;
    }
  }
}

const tempTarget = new THREE.Vector3();
let lastFrame = performance.now();
function updateRide(dt, time) {
  const accelerating = keys.has("accelerate") || touchState.accelerate;
  const braking = keys.has("brake") || touchState.brake;
  const left = keys.has("left") || touchState.left;
  const right = keys.has("right") || touchState.right;
  steering = (right ? 1 : 0) - (left ? 1 : 0);
  const targetSpeed = accelerating ? 8.6 : braking ? 0.75 : 5.0;
  speed += (targetSpeed - speed) * Math.min(1, dt * (accelerating ? 0.82 : braking ? 1.1 : 0.42));
  if (speed < 0.16) speed = 0;
  lateral += steering * dt * (1.25 + speed * 0.19);
  lateral *= Math.pow(0.994, dt * 60);
  const safeEdge = 2.72;
  if (Math.abs(lateral) > safeEdge) {
    lateral = Math.sign(lateral) * safeEdge;
    speed = Math.min(speed, 2.2);
  }
  if (started) {
    travel = Math.min(FINISH_DISTANCE, travel + speed * dt);
    rideSeconds += dt;
    invulnerable = Math.max(0, invulnerable - dt);
    checkPickups();
    if (travel >= FINISH_DISTANCE && !finished) endRide("finish");
  }
  // A small lift over the road's long, gentle rise.
  const roadCenter = roadX(-travel);
  riderRoot.position.set(roadCenter + lateral, roadY(-travel), -travel);
  const roadHeading = Math.atan2(roadX(-travel + 1) - roadX(-travel - 1), 2);
  riderRoot.rotation.y = roadHeading - steering * 0.055;
  riderRoot.rotation.z = -steering * 0.085;
  torso.rotation.x = Math.sin(time * 4.3) * 0.018;
  head.rotation.x = Math.sin(time * 3.2) * 0.012;
  tailFeather.rotation.z = Math.sin(time * 5.2) * 0.08;
  armL.rotation.x = steering * 0.04 + Math.sin(time * 4) * 0.018;
  armR.rotation.x = steering * 0.04 + Math.sin(time * 4 + 0.4) * 0.018;
  const pedalPhase = travel * 2.25;
  crank.rotation.z = pedalPhase;
  riderRoot.updateMatrixWorld(true);
  movingLegs.forEach((leg, i) => {
    const foot = pedalContacts[i].getWorldPosition(new THREE.Vector3());
    riderRoot.worldToLocal(foot);
    const kneePos = leg.hip.clone().lerp(foot, 0.48);
    kneePos.y += 0.075;
    kneePos.z -= 0.12;
    kneePos.x += leg.side * 0.045;
    placeBone(leg.thigh, leg.hip, kneePos);
    placeBone(leg.calf, kneePos, foot);
    leg.knee.position.copy(kneePos);
    leg.shoe.position.set(foot.x, foot.y - 0.015, foot.z - 0.035);
  });
  wheelGroups.forEach((w) => { w.rotation.z = -travel / 0.55; });
  const desiredCameraZ = riderRoot.position.z + 9.45;
  camera.position.x += (riderRoot.position.x * 0.58 - camera.position.x) * Math.min(1, dt * 1.8);
  camera.position.y += (4.1 + Math.sin(time * 0.58) * 0.035 - camera.position.y) * Math.min(1, dt * 1.35);
  camera.position.z += (desiredCameraZ - camera.position.z) * Math.min(1, dt * 1.2);
  tempTarget.set(riderRoot.position.x * 0.28, 1.0 + Math.sin(time * 0.65) * 0.025, riderRoot.position.z - 5.6);
  camera.lookAt(tempTarget);
  sky.position.copy(camera.position);
  ridges.forEach((ridge) => {
    ridge.position.set(camera.position.x * 0.4, 0, camera.position.z);
  });
  clouds.forEach((c, i) => {
    c.position.x += Math.sin(time * 0.04 + i) * dt * 0.025;
  });
  butterflies.forEach((b) => {
    const phase = time * 3.1 + b.userData.phase;
    b.position.x = b.userData.base.x + Math.sin(phase) * 0.28;
    b.position.y = b.userData.base.y + Math.sin(phase * 1.6) * 0.13;
    b.position.z = b.userData.base.z + Math.cos(phase * 0.75) * 0.25;
    b.userData.wings[0].rotation.z = Math.sin(phase * 2.5) * 0.5;
    b.userData.wings[1].rotation.z = -Math.sin(phase * 2.5) * 0.5;
  });
  shells.forEach((shell) => {
    if (!shell.collected) {
      shell.group.rotation.y = time * 1.4 + shell.index;
      shell.group.position.y = shell.baseY + Math.sin(time * 3 + shell.index) * 0.13;
    }
  });
  crabs.forEach((crab) => { crab.group.rotation.y = Math.sin(time * 2.7 + crab.index) * 0.17; });
  glints.forEach((g, i) => { g.material.opacity = 0.1 + (0.5 + 0.5 * Math.sin(time * 2.2 + i * 1.7)) * 0.19; });
  if (audio) {
    const t = audio.ctx.currentTime;
    audio.windGain.gain.setTargetAtTime(audio.enabled ? 0.014 + speed * 0.002 : 0, t, 0.2);
    audio.drone.frequency.setTargetAtTime(48 + speed * 1.7, t, 0.22);
    audio.chainTimer -= dt;
    if (started && speed > 1 && audio.chainTimer <= 0) {
      chainClick();
      audio.chainTimer = 0.26 + Math.random() * 0.1;
    }
    audio.birdTimer -= dt;
    if (audio.enabled && audio.birdTimer <= 0) {
      chirp(); audio.birdTimer = 2.4 + Math.random() * 4.8;
    }
  }
  speedReadout.textContent = String(Math.round(speed * 3.6));
  if (started) {
    timeReadout.textContent = formatTime(rideSeconds);
    routeFill.style.width = travel / FINISH_DISTANCE * 100 + "%";
    routeBike.style.left = travel / FINISH_DISTANCE * 100 + "%";
  }
  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0) notice.classList.remove("visible");
  }
}

function onResize() {
  const width = window.innerWidth, height = window.innerHeight;
  camera.aspect = width / height; camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 800 ? 1.1 : 1.2));
  renderer.setSize(width, height);
  if (started && !finished) touchControls.hidden = !(window.matchMedia("(pointer: coarse)").matches || width < 820);
}
window.addEventListener("resize", onResize);
window.addEventListener("orientationchange", onResize);

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.04, (now - lastFrame) / 1000);
  lastFrame = now;
  const time = now / 1000;
  if (started && !paused && !finished) updateRide(dt, time);
  else {
    if (!started) updateRide(0, time);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
