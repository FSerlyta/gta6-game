// Solmar Bay's city: a deterministic grid of blocks, roads, beach, canal and
// bridge, built once from the seed. This module owns the layout data (used by the
// simulation for collision and traffic) and the meshes that draw it.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeRng, pickByIndex } from './random.js';

const PALETTE = ['#f2e3c6', '#e8b48c', '#d97b5f', '#f6f1e7', '#cfe3dd', '#e9c46a'];
const ROOF = '#5d5348';

/** A canvas texture of a building facade: base colour with a grid of windows. */
function makeFacadeTexture(base, litRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  const rng = makeRng(base.length * 7919 + Math.floor(litRatio * 100));
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const lit = rng.next() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : '#2e3a4a';
      g.fillRect(14 + col * 28, 16 + row * 30, 18, 20);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Build the pure layout data for the city. No THREE objects here. */
export function buildCity(seed) {
  const rng = makeRng(seed);
  const { blocksX, blocksZ, blockSize, roadWidth } = CONFIG.city;
  const pitch = blockSize + roadWidth;
  const minX = (-blocksX * pitch) / 2;
  const maxX = (blocksX * pitch) / 2;
  const minZ = (-blocksZ * pitch) / 2;
  const maxZ = (blocksZ * pitch) / 2;

  const roadsX = [];
  for (let i = 0; i <= blocksX; i += 1) roadsX.push(minX + i * pitch);
  const roadsZ = [];
  for (let j = 0; j <= blocksZ; j += 1) roadsZ.push(minZ + j * pitch);

  // Intersections form the traffic graph: node (i, j) sits at roadsX[i], roadsZ[j].
  const nodes = [];
  for (let j = 0; j <= blocksZ; j += 1) {
    for (let i = 0; i <= blocksX; i += 1) nodes.push({ x: roadsX[i], z: roadsZ[j] });
  }
  const nodeAt = (i, j) => j * (blocksX + 1) + i;
  const neighbours = nodes.map((_, n) => {
    const i = n % (blocksX + 1);
    const j = Math.floor(n / (blocksX + 1));
    const out = [];
    if (i > 0) out.push(nodeAt(i - 1, j));
    if (i < blocksX) out.push(nodeAt(i + 1, j));
    if (j > 0) out.push(nodeAt(i, j - 1));
    if (j < blocksZ) out.push(nodeAt(i, j + 1));
    return out;
  });

  // Buildings: one to three per block, varied heights and warm stucco colours.
  const buildings = [];
  const colliders = [];
  for (let j = 0; j < blocksZ; j += 1) {
    for (let i = 0; i < blocksX; i += 1) {
      const cx = minX + i * pitch + pitch / 2;
      const cz = minZ + j * pitch + pitch / 2;
      // The two central blocks are the plaza: no buildings, a fountain square.
      if ((i === 3 || i === 4) && j === 2) continue;
      const count = rng.int(1, 3);
      for (let k = 0; k < count; k += 1) {
        const w = rng.range(14, 26);
        const d = rng.range(14, 26);
        const h = rng.range(9, 38);
        const ox = rng.range(-8, 8);
        const oz = rng.range(-8, 8);
        const b = {
          x: cx + ox,
          z: cz + oz,
          hw: w / 2,
          hd: d / 2,
          h,
          color: pickByIndex(PALETTE, rng.int(0, 1000)),
        };
        buildings.push(b);
        colliders.push({ x: b.x, z: b.z, hw: b.hw + 0.4, hd: b.hd + 0.4 });
      }
    }
  }

  // Palms along the sidewalks and the beach front.
  const palms = [];
  for (let i = 0; i <= blocksX; i += 1) {
    for (const z of [minZ - 6, maxZ + 6]) {
      palms.push({ x: roadsX[i] + rng.range(-4, 4), z: z + rng.range(-2, 2), s: rng.range(0.8, 1.3) });
    }
  }
  for (let k = 0; k < 14; k += 1) {
    palms.push({ x: minX + rng.range(0, maxX - minX), z: maxZ + 8 + rng.range(0, 26), s: rng.range(0.9, 1.4) });
  }

  // Street lamps at every other intersection corner.
  const lamps = [];
  for (let j = 0; j <= blocksZ; j += 1) {
    for (let i = 0; i <= blocksX; i += 1) {
      if ((i + j) % 2 === 0) lamps.push({ x: roadsX[i] + 8, z: roadsZ[j] + 8 });
    }
  }

  return {
    bounds: { minX, maxX, minZ, maxZ },
    roadsX,
    roadsZ,
    nodes,
    neighbours,
    nodeAt,
    buildings,
    colliders,
    palms,
    lamps,
    beach: { z0: maxZ + 2, z1: maxZ + CONFIG.beach.depth },
    water: { z0: maxZ + CONFIG.beach.depth, z1: maxZ + CONFIG.beach.depth + CONFIG.beach.waterWidth },
    canal: { x0: maxX + 12, x1: maxX + 40 },
    bridge: { x: maxX + 26, z: 0, w: 30, d: 16 },
    plaza: { x: 0, z: 0 },
    spawns: {
      player: { x: -30, z: 0, yaw: Math.PI },
      maraOffice: { x: 0, z: -16 },
      garage: { x: 120, z: 60 },
      packagePickup: { x: 180, z: -60 },
      bridgeMeet: { x: maxX + 52, z: 0 },
      lighthouse: { x: maxX + 52, z: -40 },
    },
  };
}

/** True when the circle at (x, z) with radius r hits a building or leaves the map. */
export function collides(city, x, z, r) {
  if (x < city.bounds.minX - 2 || x > city.canal.x1 + 40) return true;
  if (z < city.bounds.minZ - 2 || z > city.water.z0 - 1) return true;
  for (let i = 0; i < city.colliders.length; i += 1) {
    const c = city.colliders[i];
    if (Math.abs(x - c.x) < c.hw + r && Math.abs(z - c.z) < c.hd + r) return true;
  }
  return false;
}

/** Push a circle out of any building it overlaps; returns true if it was moved. */
export function resolveCollision(city, pos, r) {
  let moved = false;
  for (let i = 0; i < city.colliders.length; i += 1) {
    const c = city.colliders[i];
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const px = c.hw + r - Math.abs(dx);
    const pz = c.hd + r - Math.abs(dz);
    if (px > 0 && pz > 0) {
      if (px < pz) pos.x = c.x + Math.sign(dx || 1) * (c.hw + r);
      else pos.z = c.z + Math.sign(dz || 1) * (c.hd + r);
      moved = true;
    }
  }
  return moved;
}

/** The nearest point on any road centre line to (x, z). */
export function nearestRoadPoint(city, x, z) {
  let best = { x: city.roadsX[0], z, d: Infinity };
  for (const rx of city.roadsX) {
    const d = Math.abs(x - rx);
    if (d < best.d) best = { x: rx, z, d };
  }
  for (const rz of city.roadsZ) {
    const d = Math.abs(z - rz);
    if (d < best.d) best = { x, z: rz, d };
  }
  return best;
}

/** A random intersection node index. */
export function randomNode(rng, city) {
  return rng.int(0, city.nodes.length - 1);
}

/** A random point on a sidewalk, beside a road. */
export function randomSidewalkPoint(rng, city) {
  const vertical = rng.chance(0.5);
  if (vertical) {
    const x = rng.pick(city.roadsX) + (rng.chance(0.5) ? 8.5 : -8.5);
    const z = rng.range(city.bounds.minZ, city.bounds.maxZ);
    return { x, z };
  }
  const z = rng.pick(city.roadsZ) + (rng.chance(0.5) ? 8.5 : -8.5);
  const x = rng.range(city.bounds.minX, city.bounds.maxX);
  return { x, z };
}

/**
 * Build the THREE meshes for the city. The facade textures are created here so
 * the city paints itself warm and sunny.
 */
export function buildCityMeshes(city) {
  const group = new THREE.Group();
  group.name = 'solmar-bay-city';
  const rng = makeRng(CONFIG.seed + 77);
  const m4 = new THREE.Matrix4();
  const v3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();

  // Facade materials: warm stucco with window grids, a few lit windows each.
  const facadeMats = PALETTE.map((color) => {
    const tex = makeFacadeTexture(color, 0.18);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  });
  const roofMat = new THREE.MeshStandardMaterial({ color: ROOF, roughness: 1 });

  // Ground: pale concrete for the whole city slab.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(city.bounds.maxX - city.bounds.minX + 120, city.bounds.maxZ - city.bounds.minZ + 200),
    new THREE.MeshStandardMaterial({ color: '#b9b3a4', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 40);
  ground.receiveShadow = true;
  group.add(ground);

  // Roads: dark asphalt strips, with dashed centre lines and pale sidewalks.
  const roadMat = new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.95 });
  const roadW = CONFIG.city.roadWidth;
  for (const rx of city.roadsX) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(roadW, city.bounds.maxZ - city.bounds.minZ + roadW), roadMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(rx, 0.02, 0);
    strip.receiveShadow = true;
    group.add(strip);
  }
  for (const rz of city.roadsZ) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(city.bounds.maxX - city.bounds.minX + roadW, roadW), roadMat);
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = Math.PI / 2;
    strip.position.set(0, 0.02, rz);
    strip.receiveShadow = true;
    group.add(strip);
  }
  // Sidewalks: pale strips edging every road, one instanced draw call.
  const walkGeo = new THREE.PlaneGeometry(1, 1);
  const walkMat = new THREE.MeshStandardMaterial({ color: '#cfc9b8', roughness: 1 });
  const walkCount = (city.roadsX.length + city.roadsZ.length) * 2;
  const walks = new THREE.InstancedMesh(walkGeo, walkMat, walkCount);
  let wi = 0;
  const walkLen = city.bounds.maxZ - city.bounds.minZ + roadW;
  const walkLenH = city.bounds.maxX - city.bounds.minX + roadW;
  const qV = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const qH = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2));
  for (const rx of city.roadsX) {
    for (const side of [-1, 1]) {
      m4.compose(v3.set(rx + side * (roadW / 2 + 1.5), 0.03, 0), qV, s3.set(3, walkLen, 1));
      walks.setMatrixAt(wi, m4);
      wi += 1;
    }
  }
  for (const rz of city.roadsZ) {
    for (const side of [-1, 1]) {
      m4.compose(v3.set(0, 0.03, rz + side * (roadW / 2 + 1.5)), qH, s3.set(3, walkLenH, 1));
      walks.setMatrixAt(wi, m4);
      wi += 1;
    }
  }
  walks.receiveShadow = true;
  group.add(walks);
  // Block interiors: muted sage lots under the buildings, so the ground is not
  // one flat beige sheet.
  const lotGeo = new THREE.PlaneGeometry(1, 1);
  const lotMat = new THREE.MeshStandardMaterial({ color: '#a3ad88', roughness: 1 });
  const lots = new THREE.InstancedMesh(lotGeo, lotMat, CONFIG.city.blocksX * CONFIG.city.blocksZ);
  let li = 0;
  for (let j = 0; j < CONFIG.city.blocksZ; j += 1) {
    for (let i = 0; i < CONFIG.city.blocksX; i += 1) {
      const cx = city.bounds.minX + i * (CONFIG.city.blockSize + roadW) + (CONFIG.city.blockSize + roadW) / 2;
      const cz = city.bounds.minZ + j * (CONFIG.city.blockSize + roadW) + (CONFIG.city.blockSize + roadW) / 2;
      m4.compose(v3.set(cx, 0.015, cz), qV, s3.set(CONFIG.city.blockSize, CONFIG.city.blockSize, 1));
      lots.setMatrixAt(li, m4);
      li += 1;
    }
  }
  lots.count = li;
  lots.receiveShadow = true;
  group.add(lots);
  // Dashed centre lines down every road, one instanced draw call.
  const dashGeo = new THREE.BoxGeometry(0.35, 0.05, 3);
  const dashMat = new THREE.MeshStandardMaterial({ color: '#d8d3c0', roughness: 0.9 });
  const dashPositions = [];
  for (const rx of city.roadsX) {
    for (let z = city.bounds.minZ; z < city.bounds.maxZ; z += 12) dashPositions.push({ x: rx, z: z + 6, rotY: 0 });
  }
  for (const rz of city.roadsZ) {
    for (let x = city.bounds.minX; x < city.bounds.maxX; x += 12) dashPositions.push({ x: x + 6, z: rz, rotY: Math.PI / 2 });
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashPositions.length);
  const qD = new THREE.Quaternion();
  dashPositions.forEach((d, i) => {
    qD.setFromEuler(new THREE.Euler(0, d.rotY, 0));
    m4.compose(v3.set(d.x, 0.05, d.z), qD, s3.set(1, 1, 1));
    dashes.setMatrixAt(i, m4);
  });
  group.add(dashes);

  // Buildings: one shared unit box, scaled per building, with a roof cap.
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const b of city.buildings) {
    const mat = facadeMats[PALETTE.indexOf(b.color) % facadeMats.length];
    const mesh = new THREE.Mesh(box, mat);
    mesh.scale.set(b.hw * 2, b.h, b.hd * 2);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const roof = new THREE.Mesh(box, roofMat);
    roof.scale.set(b.hw * 2 + 0.6, 0.5, b.hd * 2 + 0.6);
    roof.position.set(b.x, b.h + 0.25, b.z);
    group.add(roof);
  }

  // Central plaza: a fountain disc where the two middle blocks are.
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(9, 11, 1.2, 24),
    new THREE.MeshStandardMaterial({ color: '#8fb8c9', roughness: 0.4 }),
  );
  plaza.position.set(city.plaza.x, 0.6, city.plaza.z);
  plaza.castShadow = true;
  group.add(plaza);

  // Beach sand and sea.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(city.bounds.maxX - city.bounds.minX + 120, CONFIG.beach.depth),
    new THREE.MeshStandardMaterial({ color: '#ecd9a0', roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.08, (city.beach.z0 + city.beach.z1) / 2);
  sand.receiveShadow = true;
  group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(city.bounds.maxX - city.bounds.minX + 120, CONFIG.beach.waterWidth),
    new THREE.MeshStandardMaterial({ color: '#2e7fa8', roughness: 0.25, metalness: 0.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.06, (city.water.z0 + city.water.z1) / 2);
  group.add(sea);
  // Boardwalk planks along the sand's edge.
  const boardwalk = new THREE.Mesh(
    new THREE.BoxGeometry(city.bounds.maxX - city.bounds.minX + 120, 0.3, 6),
    new THREE.MeshStandardMaterial({ color: '#a97e4f', roughness: 1 }),
  );
  boardwalk.position.set(0, 0.15, city.beach.z0 + 3);
  boardwalk.receiveShadow = true;
  group.add(boardwalk);

  // Canal water and the bridge to the lighthouse plaza.
  const canal = new THREE.Mesh(
    new THREE.PlaneGeometry(city.canal.x1 - city.canal.x0, city.bounds.maxZ - city.bounds.minZ + 60),
    new THREE.MeshStandardMaterial({ color: '#2e7fa8', roughness: 0.25 }),
  );
  canal.rotation.x = -Math.PI / 2;
  canal.position.set((city.canal.x0 + city.canal.x1) / 2, 0.01, 0);
  group.add(canal);
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(city.bridge.w, 0.8, city.bridge.d),
    new THREE.MeshStandardMaterial({ color: '#c65b4e', roughness: 0.8 }),
  );
  deck.position.set(city.bridge.x, 0.9, city.bridge.z);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);
  const railMat = new THREE.MeshStandardMaterial({ color: '#f2ede0', roughness: 0.6 });
  for (const dz of [-7, 7]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(city.bridge.w, 1.1, 0.4), railMat);
    rail.position.set(city.bridge.x, 1.8, city.bridge.z + dz);
    group.add(rail);
  }

  // Lighthouse on the far plaza.
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 3, 22, 12),
    new THREE.MeshStandardMaterial({ color: '#f2ede0', roughness: 0.8 }),
  );
  tower.position.set(city.spawns.lighthouse.x, 11, city.spawns.lighthouse.z);
  tower.castShadow = true;
  group.add(tower);
  const lampRoom = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 3, 12),
    new THREE.MeshStandardMaterial({ color: '#222831', emissive: '#ffd98a', emissiveIntensity: 1.4 }),
  );
  lampRoom.position.set(city.spawns.lighthouse.x, 23, city.spawns.lighthouse.z);
  group.add(lampRoom);

  // Palms: instanced trunks and crowns so dozens cost two draw calls.
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 6, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#8a6b46', roughness: 1 });
  const crownGeo = new THREE.IcosahedronGeometry(2.4, 0);
  const crownMat = new THREE.MeshStandardMaterial({ color: '#3f8f4f', roughness: 0.9 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, city.palms.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, city.palms.length);
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();
  city.palms.forEach((p, i) => {
    euler.set(0, 0, rng.range(-0.08, 0.08));
    q.setFromEuler(euler);
    m4.compose(v3.set(p.x, 3 * p.s, p.z), q, s3.set(p.s, p.s, p.s));
    trunks.setMatrixAt(i, m4);
    m4.compose(v3.set(p.x, 7.2 * p.s, p.z), q, s3.set(p.s, p.s * 0.6, p.s));
    crowns.setMatrixAt(i, m4);
  });
  trunks.castShadow = true;
  crowns.castShadow = true;
  group.add(trunks);
  group.add(crowns);

  // Street lamps: instanced poles with warm glowing heads.
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.5, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: '#2f3540', roughness: 0.7 });
  const headGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({ color: '#fff2c0', emissive: '#ffd98a', emissiveIntensity: 1.2 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, city.lamps.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, city.lamps.length);
  city.lamps.forEach((lamp, i) => {
    m4.compose(v3.set(lamp.x, 2.75, lamp.z), q.identity(), s3.set(1, 1, 1));
    poles.setMatrixAt(i, m4);
    m4.compose(v3.set(lamp.x, 5.6, lamp.z), q.identity(), s3.set(1, 1, 1));
    heads.setMatrixAt(i, m4);
  });
  group.add(poles);
  group.add(heads);

  return group;
}
