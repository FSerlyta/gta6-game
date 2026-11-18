// Dario on foot: WASD movement relative to the camera, sprint, jump, and getting
// in and out of cars. The player is a capsule that slides around building corners.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { resolveCollision } from './world.js';
import { nearestCar } from './vehicles.js';
import { showMessage } from './state.js';

/** Build Dario's mesh: teal shirt, dark trousers, simple and readable at distance. */
export function buildPlayerMesh() {
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: '#0f766e', roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: '#e8b88a', roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.95, 10), shirt);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), skin);
  head.position.y = 1.78;
  head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.31, 0.31, 0.1, 12),
    new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.8 }),
  );
  cap.position.y = 1.98;
  group.add(cap);
  for (const sx of [-0.2, 0.2]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.6, 8), pants);
    leg.position.set(sx, 0.3, 0);
    group.add(leg);
  }
  return group;
}

/**
 * One fixed step of on-foot movement. Returns 'enter' when the player got into
 * a car this step, 'exit' is handled by the caller through exitCar().
 */
export function updatePlayerOnFoot(state, city, input, dt) {
  const p = state.player;
  const cfg = CONFIG.player;
  const camYaw = state.camera.yaw;
  let mx = 0;
  let mz = 0;
  if (input.down('KeyW') || input.down('ArrowUp')) {
    mx += -Math.sin(camYaw);
    mz += -Math.cos(camYaw);
  }
  if (input.down('KeyS') || input.down('ArrowDown')) {
    mx += Math.sin(camYaw);
    mz += Math.cos(camYaw);
  }
  if (input.down('KeyA') || input.down('ArrowLeft')) {
    mx += -Math.cos(camYaw);
    mz += Math.sin(camYaw);
  }
  if (input.down('KeyD') || input.down('ArrowRight')) {
    mx += Math.cos(camYaw);
    mz += -Math.sin(camYaw);
  }
  const len = Math.hypot(mx, mz);
  const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = sprint ? cfg.sprintSpeed : cfg.walkSpeed;
  if (len > 0) {
    mx /= len;
    mz /= len;
    p.x += mx * speed * dt;
    p.z += mz * speed * dt;
    p.yaw = Math.atan2(-mx, -mz);
    p.speed = speed;
  } else {
    p.speed = 0;
  }
  resolveCollision(city, p, cfg.radius);
  // Clamp to the walkable map (beach included, sea not).
  p.x = Math.max(city.bounds.minX - 2, Math.min(city.canal.x1 + 38, p.x));
  p.z = Math.max(city.bounds.minZ - 2, Math.min(city.water.z0 - 1, p.z));

  // Gravity and jumping.
  if (input.hit('Space') && p.onGround) {
    p.vy = cfg.jumpSpeed;
    p.onGround = false;
  }
  if (!p.onGround) {
    p.vy -= cfg.gravity * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
      p.onGround = true;
    }
  }

  // Step into a car.
  if (input.hit('KeyE')) {
    const car = nearestCar(state, p.x, p.z, CONFIG.car.enterRange);
    if (car) {
      const wasParked = car.kind !== 'player';
      p.inCar = car.id;
      car.driver = 'player';
      car.kind = 'player';
      state.stats.carsStolen += 1;
      showMessage(state, wasParked ? 'Car taken. Drive it like you own it.' : 'Behind the wheel.');
      return 'enter';
    }
  }
  return null;
}

/** Climb out of the car to its right side. */
export function exitCar(state) {
  const p = state.player;
  const car = state.cars.find((c) => c.id === p.inCar);
  if (!car) {
    p.inCar = null;
    return;
  }
  const fx = -Math.sin(car.yaw);
  const fz = -Math.cos(car.yaw);
  p.x = car.x + -fz * 2.6;
  p.z = car.z + fx * 2.6;
  p.y = 0;
  p.yaw = car.yaw;
  p.inCar = null;
  car.driver = null;
}
