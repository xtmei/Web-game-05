import * as THREE from "three";
import { tube } from "./world.js";

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...extra });
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function ellipsoid(r, sx, sy, sz, mat, seg = 20) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), mat);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}

function wheel(radius, tireMat, rimMat, spokeMat) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.045, 10, 36), tireMat);
  tire.rotation.y = Math.PI / 2; tire.castShadow = true; g.add(tire);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.05, 0.015, 6, 36), rimMat);
  rim.rotation.y = Math.PI / 2; g.add(rim);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, radius - 0.05, 3), spokeMat);
    s.position.set(0, Math.cos(a) * (radius - 0.05) / 2, Math.sin(a) * (radius - 0.05) / 2);
    s.rotation.x = a;
    g.add(s);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 8), rimMat);
  hub.rotation.z = Math.PI / 2; g.add(hub);
  return g;
}

export function buildRider() {
  const root = new THREE.Group();
  const lean = new THREE.Group();
  root.add(lean);

  const frameMat = std("#86cfc0", { roughness: 0.35, metalness: 0.2 });
  const chrome = std("#d8dde0", { roughness: 0.25, metalness: 0.8 });
  const dark = std("#262626", { roughness: 0.8 });
  const leather = std("#7a4a2a", { roughness: 0.6 });
  const R = 0.36;
  const rearHub = V(0, R, -0.56), frontHub = V(0, R, 0.58);
  const bb = V(0, 0.33, -0.04);
  const seatTop = V(0, 0.98, -0.27);
  const headTop = V(0, 0.98, 0.44), headBot = V(0, 0.76, 0.48);

  const bike = new THREE.Group();
  lean.add(bike);
  bike.add(tube(bb, seatTop, 0.028, frameMat));
  bike.add(tube(bb, headBot, 0.032, frameMat));
  bike.add(tube(V(0, 0.9, -0.24), headTop.clone().add(V(0, -0.06, 0)), 0.026, frameMat));
  bike.add(tube(headBot, headTop, 0.035, frameMat));
  for (const sx of [-0.06, 0.06]) {
    bike.add(tube(bb.clone().setX(sx * 0.5), rearHub.clone().setX(sx), 0.016, frameMat));
    bike.add(tube(V(0, 0.9, -0.24), rearHub.clone().setX(sx), 0.014, frameMat));
    bike.add(tube(headBot, frontHub.clone().setX(sx), 0.018, chrome));
  }
  const fenderMat = std("#f4efe5", { roughness: 0.4 });
  for (const hub of [rearHub, frontHub]) {
    const f = new THREE.Mesh(new THREE.TorusGeometry(R + 0.05, 0.035, 6, 20, Math.PI * 0.8), fenderMat);
    f.rotation.y = Math.PI / 2;
    f.rotation.z = hub === rearHub ? Math.PI * 0.12 : Math.PI * 0.08;
    f.position.copy(hub);
    f.scale.set(1, 1, 1.6);
    bike.add(f);
  }
  const rearW = wheel(R, dark, chrome, chrome); rearW.position.copy(rearHub); bike.add(rearW);
  const frontW = wheel(R, dark, chrome, chrome); frontW.position.copy(frontHub); bike.add(frontW);
  bike.add(tube(seatTop, seatTop.clone().add(V(0, 0.06, 0)), 0.018, chrome));
  const saddle = ellipsoid(0.1, 1, 0.35, 1.7, leather);
  saddle.position.copy(seatTop).add(V(0, 0.08, 0.02)); bike.add(saddle);
  const steer = new THREE.Group();
  steer.position.copy(headTop);
  bike.add(steer);
  steer.add(tube(V(0, 0, 0), V(0, 0.1, -0.04), 0.02, chrome));
  const barL = V(-0.28, 0.12, -0.12), barR = V(0.28, 0.12, -0.12);
  steer.add(tube(barL, barR, 0.017, chrome));
  for (const b of [barL, barR]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.1, 8), leather);
    grip.rotation.z = Math.PI / 2; grip.position.copy(b); steer.add(grip);
  }
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.22, 12, 1, true), std("#c99a5b", { side: THREE.DoubleSide, roughness: 0.9 }));
  basket.position.set(0, 0.02, 0.22); steer.add(basket);
  const lemonMat = std("#f6d03a", { roughness: 0.45 });
  for (const [x, z] of [[-0.07, 0.2], [0.08, 0.24], [0, 0.3], [0.02, 0.15]]) {
    const l = ellipsoid(0.065, 1, 1, 1.3, lemonMat, 10);
    l.position.set(x, 0.12, z); steer.add(l);
  }
  const lampF = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.06, 10), chrome);
  lampF.rotation.x = Math.PI / 2; lampF.position.set(0, -0.06, 0.1); steer.add(lampF);

  const crank = new THREE.Group();
  crank.position.copy(bb);
  bike.add(crank);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 20), chrome);
  ring.rotation.y = Math.PI / 2; ring.position.x = 0.05; crank.add(ring);
  const pedalL = new THREE.Object3D(), pedalR = new THREE.Object3D();
  crank.add(tube(V(0.07, 0, 0), V(0.07, -0.17, 0), 0.012, chrome));
  crank.add(tube(V(-0.07, 0, 0), V(-0.07, 0.17, 0), 0.012, chrome));
  pedalR.position.set(0.12, -0.17, 0); pedalL.position.set(-0.12, 0.17, 0);
  crank.add(pedalL, pedalR);
  for (const p of [pedalL, pedalR]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.07), dark); p.add(b);
  }

  // Pelican
  const white = std("#f7f3ea", { roughness: 0.9 });
  const cream = std("#efe4c8", { roughness: 0.9 });
  const grey = std("#b9b6ad", { roughness: 0.9 });
  const black = std("#1c1c1e", { roughness: 0.6 });
  const beakMat = std("#f2a33a", { roughness: 0.45 });
  const pouchMat = std("#f0b877", { roughness: 0.6 });
  const legMat = std("#ee8f3a", { roughness: 0.6 });
  const bird = new THREE.Group();
  bird.position.set(0, 1.12, -0.2);
  lean.add(bird);
  const body = ellipsoid(0.33, 0.8, 0.85, 1.3, white, 28);
  body.rotation.x = -0.55; body.position.set(0, 0.32, 0.08); bird.add(body);
  const belly = ellipsoid(0.27, 0.8, 0.8, 1.1, cream, 20);
  belly.rotation.x = -0.55; belly.position.set(0, 0.24, 0.2); bird.add(belly);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 10), white);
  tail.rotation.x = -2.1; tail.position.set(0, 0.08, -0.36); bird.add(tail);
  const neckCurve = new THREE.CatmullRomCurve3([V(0, 0.55, 0.28), V(0, 0.78, 0.32), V(0, 0.96, 0.22), V(0, 1.1, 0.28)]);
  const neck = new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 16, 0.105, 12), white);
  neck.castShadow = true; bird.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 1.16, 0.32);
  bird.add(head);
  const skull = ellipsoid(0.16, 0.95, 0.9, 1.15, white, 20); head.add(skull);
  const crown = ellipsoid(0.12, 1, 0.5, 1.1, std("#f3e3a2"), 14); crown.position.set(0, 0.1, -0.02); head.add(crown);
  for (const sx of [-1, 1]) {
    const eyeRing = ellipsoid(0.042, 1, 1, 1, std("#f6c9b6"), 10); eyeRing.position.set(sx * 0.12, 0.04, 0.07); head.add(eyeRing);
    const eye = ellipsoid(0.026, 1, 1, 1, black, 8); eye.position.set(sx * 0.145, 0.045, 0.085); head.add(eye);
    const glint = ellipsoid(0.008, 1, 1, 1, std("#ffffff", { emissive: "#ffffff" }), 6); glint.position.set(sx * 0.165, 0.055, 0.095); head.add(glint);
  }
  const beakLen = 0.62;
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.065, beakLen, 12), beakMat);
  upper.scale.set(1.3, 1, 0.55);
  upper.rotation.x = Math.PI / 2 + 0.28; upper.position.set(0, -0.02, 0.1 + beakLen / 2); upper.castShadow = true; head.add(upper);
  const hook = ellipsoid(0.04, 1, 0.8, 1.2, std("#d9582b"), 10);
  hook.position.set(0, -0.1, 0.1 + beakLen * 0.97); head.add(hook);
  const pouch = ellipsoid(0.13, 0.75, 0.75, 2.2, pouchMat, 20);
  pouch.position.set(0, -0.13, 0.35); pouch.rotation.x = 0.28; head.add(pouch);
  const hat = new THREE.Group();
  hat.position.set(0, 0.14, -0.01);
  hat.rotation.x = -0.12;
  head.add(hat);
  const straw = std("#e9cf87", { roughness: 0.95 });
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.018, 28), straw); hat.add(brim);
  const crownHat = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.11, 24), straw); crownHat.position.y = 0.06; hat.add(crownHat);
  const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.035, 24), std("#c9302c")); ribbon.position.y = 0.03; hat.add(ribbon);
  hat.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 20), std("#2f78b8"));
  scarf.rotation.x = Math.PI / 2 - 0.3; scarf.position.set(0, 0.6, 0.29); bird.add(scarf);
  const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.02), std("#2f78b8"));
  scarfTail.position.set(0.05, 0.5, 0.12); scarfTail.rotation.set(0.5, 0, 0.3); bird.add(scarfTail);

  // Wings reach to the handlebars
  const wingParts = [];
  for (const sx of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(sx * 0.28, 0.46, 0.14);
    bird.add(w);
    const upperW = ellipsoid(0.13, 0.55, 0.35, 1.8, grey, 16);
    upperW.position.set(sx * 0.04, -0.05, 0.18); upperW.rotation.set(0.35, sx * -0.18, sx * 0.3); w.add(upperW);
    const tip = ellipsoid(0.1, 0.45, 0.3, 1.6, black, 12);
    tip.position.set(sx * 0.02, -0.19, 0.44); tip.rotation.set(0.5, sx * -0.12, 0); w.add(tip);
    const back = ellipsoid(0.13, 0.4, 0.4, 2.0, white, 14);
    back.position.set(0, 0.02, -0.22); back.rotation.x = -0.5; w.add(back);
    const backTip = ellipsoid(0.08, 0.4, 0.3, 1.8, black, 10);
    backTip.position.set(0, -0.12, -0.5); backTip.rotation.x = -0.9; w.add(backTip);
    wingParts.push(w);
  }

  const hipL = V(-0.13, 1.12 + 0.12, -0.2 + 0.02), hipR = V(0.13, 1.12 + 0.12, -0.2 + 0.02);
  const makeLeg = () => {
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 1, 8), legMat);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.024, 1, 8), legMat);
    const foot = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 3), legMat);
    foot.scale.set(1, 0.2, 1);
    thigh.castShadow = shin.castShadow = foot.castShadow = true;
    lean.add(thigh, shin, foot);
    return { thigh, shin, foot };
  };
  const legs = [makeLeg(), makeLeg()];
  const up = V(0, 1, 0);
  const placeSeg = (m, a, b) => {
    const d = new THREE.Vector3().subVectors(b, a);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.scale.set(1, d.length(), 1);
    m.quaternion.setFromUnitVectors(up, d.normalize());
  };
  const tmp = new THREE.Vector3();
  function solveLeg(leg, hip, foot) {
    const L1 = 0.44, L2 = 0.44;
    const d = tmp.subVectors(foot, hip);
    const dist = Math.min(d.length(), L1 + L2 - 0.001);
    const dir = d.clone().normalize();
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const bend = new THREE.Vector3(0, 0, 1).addScaledVector(dir, -dir.z).normalize();
    const knee = hip.clone().addScaledVector(dir, a).addScaledVector(bend, h);
    placeSeg(leg.thigh, hip, knee);
    placeSeg(leg.shin, knee, foot);
    leg.foot.position.copy(foot).add(V(0, 0.02, 0.05));
    leg.foot.rotation.set(Math.PI / 2 - 0.2, 0, Math.PI);
  }

  let wheelAngle = 0, crankAngle = 0, bob = 0;
  const pL = new THREE.Vector3(), pR = new THREE.Vector3();
  function update(dt, speed, steerInput, leanAngle, t) {
    wheelAngle += (speed * dt) / R;
    crankAngle += (speed * dt) / (R * 2.6);
    rearW.rotation.x = wheelAngle;
    frontW.rotation.x = wheelAngle;
    crank.rotation.x = crankAngle;
    steer.rotation.y = steerInput * 0.35;
    frontW.rotation.y = 0;
    lean.rotation.z = leanAngle;
    bob = Math.sin(crankAngle * 2) * 0.012 * Math.min(1, speed / 6);
    bird.position.y = 1.12 + bob;
    bird.rotation.z = Math.sin(crankAngle) * 0.04 * Math.min(1, speed / 6);
    head.rotation.y = -steerInput * 0.3 + Math.sin(t * 0.7) * 0.05;
    head.rotation.x = Math.sin(t * 1.3) * 0.03;
    wingParts[0].rotation.y = steerInput * 0.12;
    wingParts[1].rotation.y = steerInput * 0.12;
    scarfTail.rotation.x = 0.5 + Math.min(1.2, speed * 0.06) + Math.sin(t * 12) * 0.08;
    pedalL.updateWorldMatrix(true, false); pedalR.updateWorldMatrix(true, false);
    lean.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(lean.matrixWorld).invert();
    pL.setFromMatrixPosition(pedalL.matrixWorld).applyMatrix4(inv);
    pR.setFromMatrixPosition(pedalR.matrixWorld).applyMatrix4(inv);
    solveLeg(legs[0], hipL.clone().setY(hipL.y + bob), pL.add(V(0, 0.03, 0)));
    solveLeg(legs[1], hipR.clone().setY(hipR.y + bob), pR.add(V(0, 0.03, 0)));
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.scale.setScalar(1.25);
  return { root, update, lean };
}

export function buildVespa(colorHex) {
  const g = new THREE.Group();
  const body = std(colorHex, { roughness: 0.3, metalness: 0.1 });
  const dark = std("#222");
  const chrome = std("#ddd", { metalness: 0.8, roughness: 0.3 });
  const rear = ellipsoid(0.4, 0.9, 0.75, 1.3, body); rear.position.set(0, 0.55, -0.35); g.add(rear);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.7), body); floor.position.set(0, 0.3, 0.2); g.add(floor);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.8, 0.1), body); shield.position.set(0, 0.7, 0.58); shield.rotation.x = -0.25; g.add(shield);
  const seat = ellipsoid(0.2, 1, 0.35, 2, std("#3a2a20")); seat.position.set(0, 0.95, -0.3); g.add(seat);
  const fender = ellipsoid(0.24, 0.8, 0.8, 1.2, body); fender.position.set(0, 0.42, 0.72); g.add(fender);
  for (const z of [-0.45, 0.72]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.08, 8, 20), dark);
    w.rotation.y = Math.PI / 2; w.position.set(0, 0.22, z); g.add(w);
  }
  g.add(tube(V(0, 0.9, 0.62), V(0, 1.15, 0.6), 0.03, chrome));
  g.add(tube(V(-0.3, 1.15, 0.58), V(0.3, 1.15, 0.58), 0.025, chrome));
  const lamp = ellipsoid(0.08, 1, 1, 0.6, std("#fff6d0", { emissive: "#ffe9a0", emissiveIntensity: 0.6 })); lamp.position.set(0, 1.18, 0.66); g.add(lamp);
  const skin = std("#e8b48a"), shirt = std(["#ffffff", "#f2d06b", "#e76f51", "#8ecae6"][Math.floor(Math.random() * 4)]);
  const torso = ellipsoid(0.22, 1, 1.5, 0.8, shirt); torso.position.set(0, 1.35, -0.2); g.add(torso);
  const headM = ellipsoid(0.14, 1, 1.1, 1, skin); headM.position.set(0, 1.78, -0.15); g.add(headM);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), std("#f5f5f0")); helmet.position.set(0, 1.8, -0.15); g.add(helmet);
  g.add(tube(V(-0.18, 1.45, -0.15), V(-0.3, 1.15, 0.55), 0.05, shirt));
  g.add(tube(V(0.18, 1.45, -0.15), V(0.3, 1.15, 0.55), 0.05, shirt));
  g.add(tube(V(-0.12, 1.0, -0.2), V(-0.15, 0.4, 0.3), 0.07, std("#3b4a6b")));
  g.add(tube(V(0.12, 1.0, -0.2), V(0.15, 0.4, 0.3), 0.07, std("#3b4a6b")));
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(1.15);
  return g;
}
