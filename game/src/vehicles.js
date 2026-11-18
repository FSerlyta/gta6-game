// Cars: the player's arcade driving, traffic that follows the road graph, and the
// meshes that draw them. A car's forward is (-sin yaw, -cos yaw) in (x, z).
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeRng } from './random.js';
import { resolveCollision, randomNode } from './world.js';

export const CAR_COLORS = ['#c0392b', '#2e86c1', '#e67e22', '#7d3c98', '#f1c40f', '#1abc9c', '#ecf0f1', '#2c3e50'];

let nextCarId = 1;

/** A car state object. `driver` is 'player', 'traffic' or null (parked). */
export function createCar(id, x, z, yaw, color, kind) {
  return {
    id,
    x,
    z,
    yaw,
    speed: 0,
    color,
    kind, // 'traffic' | 'parked' | 'player' | 'police'
    driver: kind === 'traffic' ? 'traffic' : null,
    node: -1,
    from: -1,
    stuckTimer: 0,
    target: null,
  };
}

/** Build a low-poly car mesh: body, cabin, wheels. Wheels spin via userData. */
export function buildCarMesh(color, kind) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.25 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#1c2733', roughness: 0.2, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 4.4), bodyMat);
  body.position.y = 0.65;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 2.2), glassMat);
  cabin.position.set(0, 1.35, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  if (kind === 'police') {
    const barMat = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.4 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5), barMat);
    bar.position.set(0, 1.78, -0.2);
    group.add(bar);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.22, 0.5),
      new THREE.MeshStandardMaterial({ color: '#ff2222', emissive: '#ff2222', emissiveIntensity: 2 }),
    );
    red.position.set(-0.3, 1.8, -0.2);
    group.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.22, 0.5),
      new THREE.MeshStandardMaterial({ color: '#2244ff', emissive: '#2244ff', emissiveIntensity: 2 }),
    );
    blue.position.set(0.3, 1.8, -0.2);
    group.add(blue);
    group.userData.lights = [red, blue];
  }
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  group.userData.wheels = wheels;
  return group;
}

/** Fill the city with traffic cars sitting on road intersections. */
export function spawnTraffic(state, city, rng) {
  for (let i = 0; i < CONFIG.traffic.count; i += 1) {
    const node = randomNode(rng, city);
    const n = city.nodes[node];
    const next = city.neighbours[node][rng.int(0, city.neighbours[node].length - 1)];
    const car = createCar(nextCarId, n.x, n.z, 0, CAR_COLORS[i % CAR_COLORS.length], 'traffic');
    nextCarId += 1;
    car.node = next;
    car.from = node;
    const t = city.nodes[next];
    car.yaw = Math.atan2(-(t.x - n.x), -(t.z - n.z));
    state.cars.push(car);
  }
}

/** A few parked cars along the roads, free for the stealing. */
export function spawnParkedCars(state, city, rng) {
  for (let i = 0; i < 8; i += 1) {
    const node = randomNode(rng, city);
    const n = city.nodes[node];
    const vertical = rng.chance(0.5);
    const x = vertical ? n.x + 5.5 : n.x + rng.range(-30, 30);
    const z = vertical ? n.z + rng.range(-30, 30) : n.z + 5.5;
    const car = createCar(nextCarId, x, z, vertical ? 0 : Math.PI / 2, CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)], 'parked');
    nextCarId += 1;
    state.cars.push(car);
  }
}

/** Forward direction of a car as {x, z}. */
export function carForward(car) {
  return { x: -Math.sin(car.yaw), z: -Math.cos(car.yaw) };
}

function carAhead(state, car, distance) {
  const f = carForward(car);
  for (const other of state.cars) {
    // A stopped car with no driver is parked: it is not traffic to follow.
    if (other === car || (other.speed === 0 && other.driver === null)) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const along = dx * f.x + dz * f.z;
    const side = Math.abs(dx * f.z - dz * f.x);
    if (along > 0 && along < distance && side < 2.6) return other;
  }
  return null;
}

/** One traffic car follows the road graph, keeps its lane and avoids the car ahead. */
export function updateTrafficCar(car, state, city, rng, dt) {
  const target = city.nodes[car.node];
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 3) {
    const options = city.neighbours[car.node].filter((n) => n !== car.from);
    const next = options.length > 0 ? options[rng.int(0, options.length - 1)] : city.neighbours[car.node][0];
    car.from = car.node;
    car.node = next;
    return;
  }
  const f = carForward(car);
  // Right-hand lane: aim 2.4 m to the right of the centre line.
  const right = { x: -f.z, z: f.x };
  const aimX = target.x + right.x * 2.4;
  const aimZ = target.z + right.z * 2.4;
  const wantYaw = Math.atan2(-(aimX - car.x), -(aimZ - car.z));
  let dyaw = wantYaw - car.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  car.yaw += Math.max(-2.2 * dt, Math.min(2.2 * dt, dyaw));
  const ahead = carAhead(state, car, 11);
  const wantSpeed = ahead ? 0 : CONFIG.traffic.speed;
  car.speed += Math.max(-14 * dt, Math.min(10 * dt, wantSpeed - car.speed));
  car.x += -Math.sin(car.yaw) * car.speed * dt;
  car.z += -Math.cos(car.yaw) * car.speed * dt;
  if (Math.abs(car.speed) < 0.3) {
    car.stuckTimer += dt;
    if (car.stuckTimer > 6) {
      const node = randomNode(rng, city);
      car.x = city.nodes[node].x;
      car.z = city.nodes[node].z;
      car.node = city.neighbours[node][0];
      car.from = node;
      car.stuckTimer = 0;
    }
  } else {
    car.stuckTimer = 0;
  }
}

/**
 * Arcade driving for the player's car. Returns 'crash' when it hit something
 * hard enough to make a sound, else null.
 */
export function updatePlayerCar(car, input, city, state, dt) {
  const cfg = CONFIG.car;
  const forward = input.down('KeyW') || input.down('ArrowUp');
  const back = input.down('KeyS') || input.down('ArrowDown');
  const handbrake = input.down('Space');
  if (forward) car.speed += cfg.accel * dt;
  else if (back) car.speed -= (car.speed > 0.5 ? cfg.brake : cfg.reverseAccel) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 9 * dt);
  if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 30 * dt);
  car.speed = Math.max(-cfg.maxReverse, Math.min(cfg.maxSpeed, car.speed));

  const steerInput = (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0) - (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0);
  const grip = Math.min(1, Math.abs(car.speed) / 8);
  const steer = steerInput * cfg.steer * grip * (handbrake ? 1.6 : 1) * (car.speed >= 0 ? 1 : -1);
  car.yaw += (steer * car.speed * dt) / 7;

  const prevX = car.x;
  const prevZ = car.z;
  car.x += -Math.sin(car.yaw) * car.speed * dt;
  car.z += -Math.cos(car.yaw) * car.speed * dt;
  let crash = false;
  if (resolveCollision(city, car, 1.9)) {
    if (Math.abs(car.speed) > 6) crash = true;
    car.speed *= 0.4;
  }
  // Car-to-car bumps: push apart and bleed speed.
  for (const other of state.cars) {
    if (other === car) continue;
    const dx = car.x - other.x;
    const dz = car.z - other.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01 && d < 4.2) {
      const push = (4.2 - d) / 2;
      const nx = dx / d;
      const nz = dz / d;
      car.x += nx * push;
      car.z += nz * push;
      other.x -= nx * push;
      other.z -= nz * push;
      if (Math.abs(car.speed) > 6) crash = true;
      car.speed *= 0.75;
      other.speed *= 0.6;
    }
  }
  if (crash) {
    car.x = prevX;
    car.z = prevZ;
  }
  return crash ? 'crash' : null;
}

/** The nearest stealable car to (x, z) within range, or null. */
export function nearestCar(state, x, z, range) {
  let best = null;
  let bestD = range;
  for (const car of state.cars) {
    if (car.driver === 'player') continue;
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}
