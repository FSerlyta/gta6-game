// Pedestrians: Solmar Bay's residents walk the sidewalks, cross at corners, and
// run when a car bears down on them or a shot rings out.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { randomSidewalkPoint } from './world.js';

const SHIRTS = ['#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#1abc9c', '#ecf0f1', '#fd79a8', '#00b894'];

let nextPedId = 1;

/** Build a pedestrian mesh with a coloured shirt. */
export function buildPedMesh(color) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: '#2d3436', roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: '#e8b88a', roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.8, 8), shirt);
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.55;
  head.castShadow = true;
  group.add(head);
  for (const sx of [-0.13, 0.13]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.55, 6), pants);
    leg.position.set(sx, 0.28, 0);
    group.add(leg);
  }
  return group;
}

export function createPed(id, x, z, color, kind = 'civilian') {
  return {
    id,
    x,
    z,
    yaw: 0,
    speed: 0,
    color,
    kind, // 'civilian' | 'rival'
    state: 'walk', // 'walk' | 'flee' | 'down'
    health: kind === 'rival' ? 60 : 30,
    targetX: x,
    targetZ: z,
    fleeTimer: 0,
    downTimer: 0,
    attackTimer: 0,
  };
}

/** Fill the sidewalks with residents. */
export function spawnPeds(state, city, rng) {
  for (let i = 0; i < CONFIG.peds.count; i += 1) {
    const p = randomSidewalkPoint(rng, city);
    const ped = createPed(nextPedId, p.x, p.z, SHIRTS[i % SHIRTS.length]);
    nextPedId += 1;
    const t = randomSidewalkPoint(rng, city);
    ped.targetX = t.x;
    ped.targetZ = t.z;
    state.peds.push(ped);
  }
}

/** A new resident appears at a sidewalk far from the player (keeps the city full). */
function respawnPed(state, city, rng) {
  for (let tries = 0; tries < 8; tries += 1) {
    const p = randomSidewalkPoint(rng, city);
    if (Math.hypot(p.x - state.player.x, p.z - state.player.z) > 40) {
      const ped = createPed(nextPedId, p.x, p.z, SHIRTS[nextPedId % SHIRTS.length]);
      nextPedId += 1;
      const t = randomSidewalkPoint(rng, city);
      ped.targetX = t.x;
      ped.targetZ = t.z;
      state.peds.push(ped);
      return;
    }
  }
}

/** One fixed step for every pedestrian. */
export function updatePeds(state, city, dt, rng) {
  const p = state.player;
  const playerCar = p.inCar ? state.cars.find((c) => c.id === p.inCar) : null;
  for (let i = state.peds.length - 1; i >= 0; i -= 1) {
    const ped = state.peds[i];
    if (ped.state === 'down') {
      ped.downTimer += dt;
      if (ped.downTimer > 25) {
        state.peds.splice(i, 1);
        if (ped.kind === 'civilian') respawnPed(state, city, rng);
      }
      continue;
    }

    // Danger: a fast car close by, or a recent gunshot nearby.
    let threatX = null;
    let threatZ = null;
    if (playerCar && Math.abs(playerCar.speed) > 5) {
      const d = Math.hypot(playerCar.x - ped.x, playerCar.z - ped.z);
      if (d < 9) {
        threatX = playerCar.x;
        threatZ = playerCar.z;
      }
    }
    if (threatX === null && state.lastShotTime && state.time - state.lastShotTime < 2) {
      const d = Math.hypot(p.x - ped.x, p.z - ped.z);
      if (d < 25) {
        threatX = p.x;
        threatZ = p.z;
      }
    }
    if (threatX !== null && ped.kind === 'civilian') {
      ped.state = 'flee';
      ped.fleeTimer = 2.5;
    }

    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const dx = ped.x - (threatX ?? p.x);
      const dz = ped.z - (threatZ ?? p.z);
      const len = Math.hypot(dx, dz) || 1;
      ped.x += (dx / len) * CONFIG.peds.fleeSpeed * dt;
      ped.z += (dz / len) * CONFIG.peds.fleeSpeed * dt;
      ped.yaw = Math.atan2(-(dx / len), -(dz / len));
      if (ped.fleeTimer <= 0) {
        ped.state = 'walk';
        const t = randomSidewalkPoint(rng, city);
        ped.targetX = t.x;
        ped.targetZ = t.z;
      }
      continue;
    }

    // Rivals hunt the player instead of strolling.
    if (ped.kind === 'rival') {
      const dx = p.x - ped.x;
      const dz = p.z - ped.z;
      const d = Math.hypot(dx, dz);
      if (d > 10) {
        ped.x += (dx / d) * 3.4 * dt;
        ped.z += (dz / d) * 3.4 * dt;
        ped.yaw = Math.atan2(-(dx / d), -(dz / d));
      } else {
        ped.yaw = Math.atan2(-dx, -dz);
      }
      continue;
    }

    // Stroll toward the current sidewalk target, then pick a new one.
    const dx = ped.targetX - ped.x;
    const dz = ped.targetZ - ped.z;
    const d = Math.hypot(dx, dz);
    if (d < 2) {
      const t = randomSidewalkPoint(rng, city);
      ped.targetX = t.x;
      ped.targetZ = t.z;
    } else {
      ped.x += (dx / d) * CONFIG.peds.walkSpeed * dt;
      ped.z += (dz / d) * CONFIG.peds.walkSpeed * dt;
      ped.yaw = Math.atan2(-(dx / d), -(dz / d));
    }
  }
}
