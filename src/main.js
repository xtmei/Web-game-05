import * as THREE from "three";

const host = document.querySelector("#canvas-host");
const game = document.querySelector("#game");
const startButton = document.querySelector("#start-button");
const intro = document.querySelector("#intro");
const hud = document.querySelector("#ride-hud");
const speedReadout = document.querySelector("#speed-value");
const speedFill = document.querySelector("#speed-track-fill");
const timeReadout = document.querySelector("#ride-time");
const soundButton = document.querySelector("#sound-toggle");
const notice = document.querySelector("#notice");
const edgeCaption = document.querySelector(".edge-caption");
const touchControls = document.querySelector("#touch-controls");

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xe9aa83, 0.0058);

const camera = new THREE.PerspectiveCamera(49, window.innerWidth / window.innerHeight, 0.1, 560);
camera.position.set(0, 4.25, 9.4);

const hemi = new THREE.HemisphereLight(0xffe9cf, 0x5c755e, 2.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffc77d, 3.05);
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

const colors = {
  road: 0x897760, shoulder: 0xd6b37e, grass: 0x788951, field: 0x8fae80,
  water: 0x7eaaa0, wood: 0x865d41, darkWood: 0x493e35, cream: 0xe4c59b,
  roof: 0x414844, roofLight: 0x59635a, leaf: 0x637b4c, leafLight: 0x82955b,
  flower: 0xf3d786, pink: 0xe69778, white: 0xf0e2be
};
const SEGMENT_LENGTH = 150;
const TRACK_SEGMENTS = 9;
const TRACK_LENGTH = SEGMENT_LENGTH * TRACK_SEGMENTS;

function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap, ...extra });
}
function flat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}
const mats = {};
Object.keys(colors).forEach((key) => { mats[key] = toon(colors[key]); });
mats.water = toon(colors.water, { transparent: true, opacity: 0.83 });
mats.glass = toon(0xa5c8bd, { transparent: true, opacity: 0.48, side: THREE.DoubleSide });
mats.lightWindow = toon(0xffd287, { emissive: 0xf2a74e, emissiveIntensity: 0.72 });
mats.dark = toon(0x343638);
mats.riderShirt = toon(0x4f6872);
mats.riderPants = toon(0x414746);
mats.skin = toon(0xd69d76);
mats.hair = toon(0x302d2a);
mats.bike = toon(0x4c625d);
mats.bikeAccent = toon(0xb9b18d);
mats.mail = toon(0xc75242);
mats.butterfly = toon(0xf1c979);
mats.petalA = toon(0xe3a37c);
mats.petalB = toon(0xf0d486);

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
function addInstancedLines(parent, segments, radius, material) {
  if (!segments.length) return null;
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(radius, radius, 1, 5), material, segments.length);
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  segments.forEach((pair, i) => {
    const a = new THREE.Vector3(pair[0][0], pair[0][1], pair[0][2]);
    const b = new THREE.Vector3(pair[1][0], pair[1][1], pair[1][2]);
    const dir = new THREE.Vector3().subVectors(b, a);
    dummy.position.copy(a).add(b).multiplyScalar(0.5);
    dummy.quaternion.setFromUnitVectors(up, dir.clone().normalize());
    dummy.scale.set(1, dir.length(), 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);
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
      "vec3 low=vec3(0.99,0.70,0.53); vec3 mid=vec3(0.79,0.78,0.70); vec3 high=vec3(0.37,0.62,0.72);" +
      "vec3 c=mix(low,mid,smoothstep(-0.28,0.12,h)); c=mix(c,high,smoothstep(0.08,0.82,h));" +
      "float sun=pow(max(dot(normalize(vDir),normalize(vec3(-0.33,0.25,-0.9))),0.0),72.0);" +
      "c=mix(c,vec3(1.0,0.79,0.55),sun*0.78); float grain=fract(sin(dot(gl_FragCoord.xy+uTime,vec2(12.9898,78.233)))*43758.5453);" +
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
clouds.push(makeCloud(scene, -18, 15.2, -43, 1.55, true));
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
  makeRidge(0x758a76, -205, -1.0, 5.8, 1.2),
  makeRidge(0x9ca17f, -194, -2.9, 3.3, 4.4),
  makeRidge(0xc0a183, -182, -4.2, 2.1, 2.0)
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
const roadWash = createTerrainTexture("#9b896e", ["#ddd0ad", "#6f6b5e", "#cab990"]);
const wallWash = createTerrainTexture("#d7c09b", ["#fff0cd", "#ad9979", "#d6b389"]);
const roofWash = createTerrainTexture("#4a5350", ["#889187", "#333d3b", "#b0a27f"]);
mats.road.map = roadWash;
mats.road.color.set(0xffffff);
mats.road.needsUpdate = true;
mats.cream.map = wallWash;
mats.cream.needsUpdate = true;
mats.roof.map = roofWash;
mats.roof.needsUpdate = true;

const segments = [];
const butterflies = [];
const glints = [];
const collisionObjects = [];
const clock = new THREE.Clock();

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
const waterMaterial = toon(0x9bc0ae, { transparent: true, opacity: 0.83, side: THREE.DoubleSide });
const shimmerMaterial = new THREE.MeshBasicMaterial({ color: 0xffedc4, transparent: true, opacity: 0.18, depthWrite: false });
const roadEdgeMat = toon(0xc8ae7e);
const grassMat = toon(0x78905a);
const fenceMat = toon(0x8d6848);
const wireMat = new THREE.LineBasicMaterial({ color: 0x5a5850, transparent: true, opacity: 0.62 });
const flowerHeadMat = [mats.petalA, mats.petalB, toon(0xffead2)];
const trunkMat = toon(0x765740);
const leafMats = [toon(0x5e7448), toon(0x73834f), toon(0x88945c)];

function addRoadsideFence(parent, side, zStart, zEnd, trackOffset = 0) {
  const step = 2.75;
  const posts = [], lowerRails = [], upperRails = [];
  for (let z = zStart; z > zEnd; z -= step) {
    const x = xAt(z, side, 5.7, trackOffset);
    const y = roadY(z + trackOffset) + 0.1;
    posts.push([[x, y, z], [x, y + 1.05, z]]);
    if (z > zEnd + step) {
      const nextZ = z - step;
      const nextX = xAt(nextZ, side, 5.7, trackOffset);
      lowerRails.push([[x, y + 0.38, z], [nextX, roadY(nextZ + trackOffset) + 0.48, nextZ]]);
      upperRails.push([[x, y + 0.83, z], [nextX, roadY(nextZ + trackOffset) + 0.93, nextZ]]);
    }
  }
  addInstancedLines(parent, posts, 0.09, fenceMat);
  addInstancedLines(parent, lowerRails, 0.055, fenceMat);
  addInstancedLines(parent, upperRails, 0.06, fenceMat);
}
function addHouse(parent, side, z, shop = false, trackOffset = 0) {
  const g = new THREE.Group();
  const cx = xAt(z, side, 13.1, trackOffset);
  g.position.set(cx, roadY(z + trackOffset) - 0.15, z);
  const wallMat = toon(shop ? 0xdcc69f : 0xd8c6a7);
  wallMat.map = wallWash; wallMat.needsUpdate = true;
  const bodyW = shop ? 8.1 : 7.1;
  const bodyD = shop ? 6.1 : 5.4;
  addContour(box(g, [bodyW, 3.4, bodyD], wallMat, [0, 1.95, 0]), 0.012);
  box(g, [bodyW + 0.45, 0.36, bodyD + 0.35], mats.darkWood, [0, 0.22, 0]);
  // Layered broad eaves and a hand-cut gable silhouette.
  const roofMaterial = toon(shop ? 0x4c514b : colors.roof);
  roofMaterial.map = roofWash; roofMaterial.needsUpdate = true;
  const roof = new THREE.Group();
  roof.position.set(0, 3.72, 0);
  roof.rotation.z = -0.08;
  addContour(box(roof, [bodyW + 1.35, 0.34, bodyD + 1.15], roofMaterial, [0, 0, 0]), 0.018);
  addContour(box(roof, [bodyW + 0.75, 0.18, bodyD + 0.8], toon(0x6d7368), [0, 0.23, 0]), 0.018);
  // Raised roof ridge.
  cylinder(roof, 0.16, 0.16, bodyW + 1.25, mats.darkWood, [0, 0.28, 0], 8).rotation.z = Math.PI / 2;
  g.add(roof);
  // Timber posts at the corners and across the front.
  const frontZ = bodyD / 2 + 0.07;
  [-bodyW / 2 + 0.25, 0, bodyW / 2 - 0.25].forEach((x) => {
    box(g, [0.18, 3.15, 0.18], mats.darkWood, [x, 1.9, frontZ + 0.02]);
  });
  box(g, [bodyW + 0.25, 0.18, 0.2], mats.darkWood, [0, 3.25, frontZ + 0.02]);
  // Sliding panels and lantern-lit windows.
  box(g, [bodyW - 0.55, 1.58, 0.11], toon(0x9f8061), [0, 1.08, frontZ + 0.1]);
  box(g, [1.55, 1.65, 0.12], mats.lightWindow, [-bodyW / 2 + 1.45, 1.98, frontZ + 0.16]);
  box(g, [1.55, 1.65, 0.12], mats.lightWindow, [bodyW / 2 - 1.45, 1.98, frontZ + 0.16]);
  box(g, [0.08, 1.65, 0.08], mats.darkWood, [-bodyW / 2 + 1.45, 1.98, frontZ + 0.24]);
  box(g, [0.08, 1.65, 0.08], mats.darkWood, [bodyW / 2 - 1.45, 1.98, frontZ + 0.24]);
  // Small air conditioner and exhaust fan.
  box(g, [1.0, 0.72, 0.67], toon(0xd6d1bb), [side > 0 ? bodyW / 2 + 0.52 : -bodyW / 2 - 0.52, 1.16, 0.7]);
  box(g, [0.56, 0.06, 0.08], toon(0x777b70), [side > 0 ? bodyW / 2 + 0.52 : -bodyW / 2 - 0.52, 1.09, 0.34]);
  if (shop) {
    // Cloth shop curtain, separated panels that catch the light.
    const curtain = toon(0x52656a);
    addContour(box(g, [bodyW - 0.4, 0.9, 0.12], curtain, [0, 2.63, frontZ + 0.2]), 0.02);
    for (let x = -2.8; x <= 2.81; x += 1.4) {
      box(g, [0.09, 0.72, 0.04], toon(0xd9c7a0), [x, 2.58, frontZ + 0.28]);
      box(g, [1.22, 0.11, 0.16], toon(0xf0dcb9), [x, 2.19, frontZ + 0.3]);
    }
    box(g, [5.5, 0.5, 0.14], toon(0x493d32), [0, 3.3, frontZ + 0.18]);
    addSignLabel(g, "青空商店", [0, 3.3, frontZ + 0.28], 512, 128, "#f1deb4", "#553d32", 36);
  }
  parent.add(g);
  collisionObjects.push({ x: cx, z: z, radius: 4.4, side, edgeGuard: true, group: parent });
  return g;
}
function addSignLabel(parent, text, pos, width, height, bg, fg, fontSize) {
  const c = document.createElement("canvas"); c.width = width; c.height = height;
  const ctx = c.getContext("2d");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = fg; ctx.font = "700 " + fontSize + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width / 64, height / 64), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
  m.position.set(pos[0], pos[1], pos[2]);
  parent.add(m);
  return m;
}
function addTree(parent, x, z, scale = 1, bamboo = false, trackOffset = 0) {
  const g = new THREE.Group();
  g.position.set(x, roadY(z + trackOffset) - 0.02, z);
  g.scale.setScalar(scale);
  if (bamboo) {
    const stalks = 4;
    for (let i = 0; i < stalks; i++) {
      const dx = (i - (stalks - 1) / 2) * 0.28;
      cylinder(g, 0.08, 0.12, 5.0 + (i % 2) * 1.0, toon(0x799066), [dx, 2.8, 0], 6);
      for (let h = 1.2; h < 5.3; h += 1.25) {
        stick(g, [dx - 0.1, h, 0], [dx + 0.1, h, 0], 0.035, toon(0x4e6f4f), 5);
      }
      for (let leaf = 0; leaf < 3; leaf++) {
        const dir = leaf % 2 ? -1 : 1;
        stick(g, [dx, 2.5 + leaf * 0.9, 0], [dx + dir * (0.65 + (leaf % 3) * 0.3), 2.75 + leaf * 0.8, -0.08], 0.035, leafMats[1], 4);
        sphere(g, [0.42, 0.08, 0.14], leafMats[1], [dx + dir * 0.68, 2.8 + leaf * 0.8, -0.1], 7, 4);
      }
    }
  } else {
    cylinder(g, 0.15, 0.35, 4.8, trunkMat, [0, 2.45, 0], 7);
    const canopy = [
      [0, 5.35, 0, 2.45, 1.35, 1.95],
      [-1.2, 4.65, -0.3, 1.8, 1.05, 1.55],
      [1.15, 4.78, 0.28, 1.8, 1.1, 1.5],
      [0.15, 6.0, -0.1, 1.45, 0.98, 1.3]
    ];
    canopy.forEach((c, i) => {
      const crown = sphere(g, [c[3], c[4], c[5]], leafMats[i % leafMats.length], [c[0], c[1], c[2]], 9, 6);
      if (i < 3) addContour(crown, 0.025);
    });
    sphere(g, [2.0, 0.8, 1.8], toon(0xa0a166), [0, 4.4, 0.95], 8, 5);
  }
  parent.add(g);
  return g;
}
function addUtilityPole(parent, z, trackOffset = 0) {
  const side = -1;
  const x = xAt(z, side, 8.6, trackOffset);
  const y = roadY(z + trackOffset);
  cylinder(parent, 0.13, 0.2, 8.7, toon(0x77624c), [x, y + 4.35, z], 7);
  stick(parent, [x - 0.95, y + 7.7, z], [x + 0.95, y + 7.7, z], 0.13, toon(0x725d49));
  [-0.72, 0, 0.72].forEach((offset) => {
    cylinder(parent, 0.055, 0.055, 0.4, mats.dark, [x + offset, y + 7.48, z], 5);
  });
  const lamp = sphere(parent, [0.32, 0.38, 0.28], toon(0xffd28b, { emissive: 0xf2a74e, emissiveIntensity: 0.55 }), [x + 0.92, y + 7.05, z + 0.08], 8, 6);
  collisionObjects.push({ x, z, radius: 0.55, side, edgeGuard: true, group: parent });
}
function addWires(parent, zA, zB, trackOffset = 0) {
  const xA = xAt(zA, -1, 8.6, trackOffset), xB = xAt(zB, -1, 8.6, trackOffset);
  [-0.42, 0, 0.42].forEach((offset) => {
    const points = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, z = zA + (zB - zA) * t;
      const x = xA + (xB - xA) * t + offset;
      const sag = Math.sin(Math.PI * t) * 1.0;
      points.push(new THREE.Vector3(x, roadY(z + trackOffset) + 7.45 - sag, z));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(32)), wireMat);
    parent.add(line);
  });
}
function addMailbox(parent, side, z, trackOffset = 0) {
  const x = xAt(z, side, 5.3, trackOffset), y = roadY(z + trackOffset);
  cylinder(parent, 0.075, 0.09, 1.6, fenceMat, [x, y + 0.8, z], 6);
  box(parent, [0.72, 0.78, 0.58], mats.mail, [x, y + 1.55, z]);
  sphere(parent, [0.36, 0.39, 0.29], mats.mail, [x, y + 1.94, z], 8, 5);
  box(parent, [0.36, 0.12, 0.045], toon(0xead9bd), [x, y + 1.59, z - 0.31]);
  box(parent, [0.15, 0.3, 0.12], toon(0x332d28), [x, y + 1.18, z]);
  collisionObjects.push({ x, z, radius: 0.6, side, edgeGuard: true, group: parent });
}
function addWarningSign(parent, side, z, trackOffset = 0) {
  const x = xAt(z, side, 5.3, trackOffset), y = roadY(z + trackOffset);
  cylinder(parent, 0.045, 0.055, 1.65, fenceMat, [x, y + 0.82, z], 6);
  const sign = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.82, 3), toon(0xe5bc57));
  sign.position.set(x, y + 2.0, z);
  sign.rotation.z = Math.PI;
  parent.add(sign);
  box(parent, [0.36, 0.08, 0.04], toon(0x574638), [x, y + 1.96, z - 0.24]);
  collisionObjects.push({ x, z, radius: 0.45, side, edgeGuard: true, group: parent });
}
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
function addWaterField(parent, side, segmentIndex, trackOffset = 0) {
  const samples = 34;
  const positions = [], uvs = [], indices = [];
  const inner = 6.5, outer = 28;
  for (let i = 0; i <= samples; i++) {
    const z = -SEGMENT_LENGTH + SEGMENT_LENGTH * i / samples;
    const cx = roadX(z + trackOffset);
    const sign = side;
    positions.push(cx + sign * inner, roadY(z + trackOffset) - 0.12, z);
    positions.push(cx + sign * outer, roadY(z + trackOffset) - 0.2, z);
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
  const water = new THREE.Mesh(geo, waterMaterial);
  water.renderOrder = 1;
  parent.add(water);
  // Fine reed banks and floating highlights make the paddy read as a reflective surface.
  const count = 68;
  const glintMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), shimmerMaterial.clone(), count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const z = -3 - (i / count) * (SEGMENT_LENGTH - 6) + (segmentIndex % 2) * 0.8;
    const cx = xAt(z, side, 6.7, trackOffset);
    dummy.position.set(cx + side * (2.2 + Math.random() * 5.5), roadY(z + trackOffset) - 0.045, z);
    dummy.rotation.y = (Math.random() - 0.5) * 0.35;
    dummy.scale.set(0.35 + Math.random() * 0.8, 0.012, 0.04);
    dummy.updateMatrix();
    glintMesh.setMatrixAt(i, dummy.matrix);
  }
  glintMesh.instanceMatrix.needsUpdate = true;
  parent.add(glintMesh);
  glints.push(glintMesh);
  const reedMaterial = toon(0x84935a, { side: THREE.DoubleSide });
  const reeds = new THREE.InstancedMesh(new THREE.ConeGeometry(0.055, 0.52, 4), reedMaterial, 42);
  const reedTransform = new THREE.Object3D();
  for (let i = 0; i < 42; i++) {
    const z = -4 - (i / 42) * (SEGMENT_LENGTH - 8) + (segmentIndex % 2) * 0.45;
    const offset = 9.2 + (i % 6) * 2.55;
    reedTransform.position.set(xAt(z, side, offset, trackOffset), roadY(z + trackOffset) - 0.01, z);
    reedTransform.rotation.z = (Math.random() - 0.5) * 0.28;
    reedTransform.scale.set(1, 0.7 + Math.random() * 0.65, 1);
    reedTransform.updateMatrix();
    reeds.setMatrixAt(i, reedTransform.matrix);
    reeds.setColorAt(i, new THREE.Color().setHSL(0.23 + Math.random() * 0.035, 0.26 + Math.random() * 0.16, 0.38 + Math.random() * 0.19));
  }
  reeds.instanceMatrix.needsUpdate = true;
  if (reeds.instanceColor) reeds.instanceColor.needsUpdate = true;
  parent.add(reeds);
}
function addGround(parent, side, trackOffset = 0) {
  const z = -SEGMENT_LENGTH / 2;
  const x = roadX(z + trackOffset) + side * 18;
  const ground = plane(parent, 48, SEGMENT_LENGTH + 2, grassMat, [x, roadY(z + trackOffset) - 0.26, z]);
  ground.material.side = THREE.DoubleSide;
}

function buildSegment(index, zOffset, trackOffset = zOffset) {
  const root = new THREE.Group();
  root.position.z = zOffset;
  const variation = Math.sin(index * 1.37) * 4.6;
  root.userData.obstacles = [];
  // Soft grass banks.
  addGround(root, -1, trackOffset); addGround(root, 1, trackOffset);
  const roadGeo = buildRoadGeometry(trackOffset);
  // Earthen road lips.
  const edge = new THREE.Mesh(roadGeo, roadEdgeMat);
  edge.scale.x = 1.12;
  edge.position.y = -0.03;
  root.add(edge);
  const road = new THREE.Mesh(roadGeo, toon(0xffffff, { map: roadWash }));
  road.position.y = 0.015;
  root.add(road);
  addWaterField(root, -1, index, trackOffset);
  addWaterField(root, 1, index, trackOffset);
  // Bamboo fencing follows the bends on both sides.
  addRoadsideFence(root, -1, -4, -SEGMENT_LENGTH + 6, trackOffset);
  addRoadsideFence(root, 1, -12, -SEGMENT_LENGTH + 7, trackOffset);

  // Patches of hand-painted trees, layered in depth.
  const trees = [
    [-1, -8, 1.05, true], [-1, -18, 0.93, false], [1, -29, 0.88, false],
    [1, -48, 1.1, true], [-1, -65, 1.14, false], [1, -77, 0.92, false],
    [-1, -95, 1.0, true], [1, -111, 1.05, false], [-1, -122, 0.95, false]
  ];
  trees.forEach((t) => {
    const z = t[1] - variation;
    const side = index % 2 ? -t[0] : t[0];
    addTree(root, xAt(z, side, 8.2 + Math.random() * 1.8, trackOffset), z, t[2], t[3], trackOffset);
  });
  // A few simple cloud banks continue across the long route.
  if (index % 2 === 0) {
    makeCloud(root, (index % 4 < 2 ? -1 : 1) * (18 + (index % 3) * 3), 15.0 + (index % 3) * 1.4, -94, 1.25 + (index % 2) * 0.28, index % 3 === 0);
  }
  // One noren-fronted shop and small homes sit at staggered intervals.
  if (index === 0 || index === 6) addHouse(root, 1, -31 - variation, true, trackOffset);
  addHouse(root, index % 2 ? -1 : 1, -81 - variation, false, trackOffset);
  addHouse(root, index % 2 ? 1 : -1, -116 - variation, false, trackOffset);
  const postZ = -54 - variation;
  const signZ = -76 - variation;
  if (index !== 2 && index !== 7) addMailbox(root, index % 2 ? 1 : -1, postZ, trackOffset);
  if (index !== 1 && index !== 5) addWarningSign(root, index % 2 ? -1 : 1, signZ, trackOffset);
  const flowerA = -59 - variation, flowerB = -99 - variation;
  const sideA = index % 2 ? 1 : -1, sideB = -sideA;
  addFlowers(root, xAt(flowerA, sideA, 6.1, trackOffset), flowerA, 13, trackOffset);
  addFlowers(root, xAt(flowerB, sideB, 6.1, trackOffset), flowerB, 13, trackOffset);
  addButterfly(root, xAt(flowerA, sideA, 6.7, trackOffset), roadY(flowerA + trackOffset) + 0.75, flowerA, index * 2);
  addButterfly(root, xAt(flowerB, sideB, 6.6, trackOffset), roadY(flowerB + trackOffset) + 0.95, flowerB, index * 2 + 1);
  // Utility poles and a gently sagging line.
  const poleZs = [-10 - variation, -47 - variation, -84 - variation, -121 - variation];
  poleZs.forEach((z) => addUtilityPole(root, z, trackOffset));
  for (let i = 0; i < poleZs.length - 1; i++) addWires(root, poleZs[i], poleZs[i + 1], trackOffset);
  // Collision entries use local segment coordinates; each entry retains the owning group.
  root.userData.index = index;
  scene.add(root);
  segments.push(root);
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
const pedals = [];
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
  pedals.push(arm);
  pedalContacts.push(contact);
});

// Rider is seated upright with steady shoulders and a small forward lean.
const torso = new THREE.Group();
torso.position.set(0.0, 1.45, 0.02);
riderRoot.add(torso);
addContour(sphere(torso, [0.38, 0.48, 0.27], mats.riderShirt, [0, 0, 0], 10, 8), 0.035);
addContour(sphere(torso, [0.29, 0.34, 0.25], toon(0x637d84), [0, -0.13, 0.04], 9, 7), 0.025);
const neck = cylinder(riderRoot, 0.13, 0.14, 0.2, mats.skin, [0, 1.87, -0.02], 8);
const head = new THREE.Group();
head.position.set(0, 2.15, -0.06);
riderRoot.add(head);
addContour(sphere(head, [0.31, 0.38, 0.31], mats.skin, [0, 0, 0], 11, 8), 0.035);
addContour(sphere(head, [0.32, 0.25, 0.34], mats.hair, [0, 0.22, -0.03], 10, 7), 0.035);
addContour(sphere(head, [0.32, 0.26, 0.19], mats.hair, [0, 0.09, 0.26], 9, 6), 0.04);
// Ears and simplified eyes seen in the gentle three-quarter rear view.
sphere(head, [0.055, 0.085, 0.045], mats.skin, [-0.3, -0.03, 0.02], 7, 5);
sphere(head, [0.055, 0.085, 0.045], mats.skin, [0.3, -0.03, 0.02], 7, 5);
const hairTail = sphere(head, [0.12, 0.1, 0.14], mats.hair, [-0.17, -0.2, -0.08], 7, 5);
const armL = new THREE.Group(), armR = new THREE.Group();
armL.position.set(-0.29, 1.73, 0.04); armR.position.set(0.29, 1.73, 0.04);
riderRoot.add(armL, armR);
stick(armL, [0, 0, 0], [-0.055, -0.22, -0.34], 0.13, mats.riderShirt);
stick(armL, [-0.055, -0.22, -0.34], [-0.06, -0.38, -0.76], 0.105, mats.skin);
stick(armR, [0, 0, 0], [0.055, -0.22, -0.34], 0.13, mats.riderShirt);
stick(armR, [0.055, -0.22, -0.34], [0.06, -0.38, -0.76], 0.105, mats.skin);
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
  const shoe = sphere(riderRoot, [0.22, 0.105, 0.29], toon(0xd2b48d), [0, 0, 0], 8, 5);
  return { side, hip, knee, shoe, thigh: movingBone(0.13), calf: movingBone(0.095) };
});
const backPack = addContour(box(riderRoot, [0.42, 0.5, 0.22], toon(0x9b7555), [0, 1.52, 0.33]), 0.025);
backPack.rotation.x = -0.12;

const keys = new Set();
const touchState = { left: false, right: false, accelerate: false, brake: false };
let started = false, travel = 0, speed = 4.8, lateral = 0, steering = 0, rideSeconds = 0, messageTimer = 0;
let collisionFlash = 0;

const keyMap = {
  KeyW: "accelerate", ArrowUp: "accelerate",
  KeyS: "brake", ArrowDown: "brake",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right"
};
window.addEventListener("keydown", (e) => {
  if (keyMap[e.code]) { keys.add(keyMap[e.code]); e.preventDefault(); }
  if (e.code === "KeyM") toggleAudio();
  if (e.code === "KeyR") { lateral = 0; speed = Math.max(speed, 3.5); }
});
window.addEventListener("keyup", (e) => { if (keyMap[e.code]) keys.delete(keyMap[e.code]); });
window.addEventListener("blur", () => keys.clear());
document.querySelectorAll("[data-control]").forEach((button) => {
  const action = button.dataset.control;
  const press = (e) => { e.preventDefault(); touchState[action] = true; };
  const release = (e) => { e.preventDefault(); touchState[action] = false; };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
});
startButton.addEventListener("click", beginRide);
soundButton.addEventListener("click", toggleAudio);

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
function toggleAudio() {
  if (!audio) { audio = createAudio(); }
  if (!audio) return;
  audio.enabled = !audio.enabled;
  audio.master.gain.setTargetAtTime(audio.enabled ? 0.5 : 0.0001, audio.ctx.currentTime, 0.12);
  soundButton.classList.toggle("muted", !audio.enabled);
}
async function beginRide() {
  if (started) return;
  started = true; intro.classList.add("leaving"); hud.classList.add("visible");
  edgeCaption.classList.add("visible");
  if (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 820) touchControls.classList.add("visible");
  window.setTimeout(() => { intro.hidden = true; }, 820);
  game.classList.add("riding");
  if (!audio) { audio = createAudio(); }
  if (audio) {
    audio.enabled = true;
    audio.master.gain.setTargetAtTime(0.5, audio.ctx.currentTime, 0.12);
    soundButton.classList.remove("muted");
    audio.ctx.resume();
  }
}

function showNotice(text) {
  notice.textContent = text;
  notice.classList.add("visible");
  messageTimer = 1.1;
}
function checkCollisions() {
  const riderWorldX = roadX(-travel) + lateral;
  const zNear = 1.05;
  for (const obj of collisionObjects) {
    const group = obj.group;
    if (!group || !group.parent) continue;
    const wz = obj.z + group.position.z;
    const wx = obj.x;
    const directContact = Math.abs(wx - riderWorldX) < obj.radius + 0.34;
    const roadsideContact = obj.edgeGuard && Math.abs(lateral) > 2.28 && Math.sign(lateral) === obj.side;
    if (Math.abs(wz - riderRoot.position.z) < zNear && (directContact || roadsideContact)) {
      speed = 0;
      collisionFlash = 0.22;
      showNotice("轻轻停下了");
      return true;
    }
  }
  return false;
}

const tempTarget = new THREE.Vector3();
let lastFrame = performance.now();
let routeEnded = false;
function updateRide(dt, time) {
  const accelerating = keys.has("accelerate") || touchState.accelerate;
  const braking = keys.has("brake") || touchState.brake;
  const left = keys.has("left") || touchState.left;
  const right = keys.has("right") || touchState.right;
  steering = (right ? 1 : 0) - (left ? 1 : 0);
  const targetSpeed = travel >= TRACK_LENGTH - 20 ? 0 : accelerating ? 8.6 : braking ? 0.75 : 5.0;
  speed += (targetSpeed - speed) * Math.min(1, dt * (accelerating ? 0.82 : braking ? 1.1 : 0.42));
  if (speed < 0.16) speed = 0;
  const currentCenter = roadX(-travel);
  lateral += steering * dt * (1.25 + speed * 0.19);
  lateral *= Math.pow(0.994, dt * 60);
  const safeEdge = 2.72;
  if (Math.abs(lateral) > safeEdge) {
    lateral = Math.sign(lateral) * safeEdge;
    speed = Math.min(speed, 0.3);
    showNotice("路边水田就在旁边");
  }
  if (started) {
    travel = Math.min(TRACK_LENGTH - 14, travel + speed * dt);
    rideSeconds += dt;
    checkCollisions();
    if (!routeEnded && travel >= TRACK_LENGTH - 20) {
      routeEnded = true;
      showNotice("小路在远处收进薄雾里");
    }
  }
  // A small lift over the road's long, gentle rise.
  const roadCenter = roadX(-travel);
  riderRoot.position.set(roadCenter + lateral, roadY(-travel), -travel);
  const roadHeading = Math.atan2(roadX(-travel + 1) - roadX(-travel - 1), 2);
  riderRoot.rotation.y = roadHeading - steering * 0.055;
  riderRoot.rotation.z = -steering * 0.085;
  torso.rotation.x = Math.sin(time * 4.3) * 0.018;
  head.rotation.x = Math.sin(time * 3.2) * 0.012;
  hairTail.rotation.z = Math.sin(time * 5.2) * 0.08;
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
  speedFill.style.width = Math.min(100, speed / 9 * 100) + "%";
  if (started) {
    const secs = Math.floor(rideSeconds);
    timeReadout.textContent = String(Math.floor(secs / 60)).padStart(2, "0") + ":" + String(secs % 60).padStart(2, "0");
  }
  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0) notice.classList.remove("visible");
  }
  if (collisionFlash > 0) collisionFlash -= dt;
}

function onResize() {
  const width = window.innerWidth, height = window.innerHeight;
  camera.aspect = width / height; camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 800 ? 1.1 : 1.2));
  renderer.setSize(width, height);
}
window.addEventListener("resize", onResize);
window.addEventListener("orientationchange", onResize);

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.04, (now - lastFrame) / 1000);
  lastFrame = now;
  const time = now / 1000;
  if (started) updateRide(dt, time);
  else {
    // Keep the scene breathing before input; this is useful for a quiet opening frame.
    updateRide(0, time);
    camera.position.x += (riderRoot.position.x * 0.58 - camera.position.x) * 0.01;
    camera.lookAt(riderRoot.position.x * 0.28, 1.0, -5.6);
    butterflies.forEach((b) => {
      const phase = time * 3.1 + b.userData.phase;
      b.position.x = b.userData.base.x + Math.sin(phase) * 0.28;
      b.position.y = b.userData.base.y + Math.sin(phase * 1.6) * 0.13;
      b.userData.wings[0].rotation.z = Math.sin(phase * 2.5) * 0.5;
      b.userData.wings[1].rotation.z = -Math.sin(phase * 2.5) * 0.5;
    });
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
