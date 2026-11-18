// The wanted system: crimes raise the heat, Solmar Bay PD answers with foot
// officers and black-and-white cruisers, and a long quiet stretch cools it off.
// Get caught and it's a bust; get away clean and the stars fall one by one.
import { CONFIG } from './config.js';
import { showMessage, showDialogue } from './state.js';
import { randomNode } from './world.js';
import { createCar, buildCarMesh } from './vehicles.js';
import { buildPedMesh } from './pedestrians.js';

let nextPoliceId = 1000;

export function buildCopMesh() {
  return buildPedMesh('#1e3a5f');
}

export function buildPoliceCarMesh() {
  return buildCarMesh('#f2f2f2', 'police');
}

/** Raise the wanted level (capped at 5) and reset the cool-down clock. */
export function addWanted(state, amount) {
  if (state.wanted >= CONFIG.police.maxLevel) return;
  state.wanted = Math.min(CONFIG.police.maxLevel, state.wanted + amount);
  state.wantedTimer = 0;
  state.stats.crimes += 1;
  if (state.wanted === 1) showDialogue(state, 'Dispatch', 'All units: suspect spotted in Solmar Bay. Move in.', 4);
  if (state.wanted >= 3) showMessage(state, 'The whole city is looking for you.');
}

/** How many foot officers and cruisers the current heat calls for. */
function wantedCounts(wanted) {
  return {
    foot: Math.min(4, wanted),
    cars: wanted >= 2 ? Math.min(3, wanted - 1) : 0,
  };
}

/** A foot officer's chase step: run at the player, grab them when close. */
function updateFootCop(cop, state, dt) {
  const p = state.player;
  const dx = p.x - cop.x;
  const dz = p.z - cop.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.1) {
    const speed = Math.min(CONFIG.police.chaseSpeed, d * 2);
    cop.x += (dx / d) * speed * dt;
    cop.z += (dz / d) * speed * dt;
    cop.yaw = Math.atan2(-(dx / d), -(dz / d));
  }
  if (d < CONFIG.police.bustRange) {
    cop.bustTimer += dt;
  } else {
    cop.bustTimer = Math.max(0, cop.bustTimer - dt * 2);
  }
}

/** A cruiser's chase step: steer hard at the player and try to box them in. */
function updatePoliceCar(cop, state, dt) {
  const p = state.player;
  const car = state.cars.find((c) => c.id === cop.carId);
  if (!car) return;
  const dx = p.x - car.x;
  const dz = p.z - car.z;
  const d = Math.hypot(dx, dz);
  const wantYaw = Math.atan2(-dx, -dz);
  let dyaw = wantYaw - car.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  car.yaw += Math.max(-2.6 * dt, Math.min(2.6 * dt, dyaw));
  const playerSpeed = p.inCar ? Math.abs(car.speed) : 0;
  const targetSpeed = d > 6 ? CONFIG.police.carChaseSpeed : Math.min(6, playerSpeed);
  car.speed += Math.max(-20 * dt, Math.min(16 * dt, targetSpeed - car.speed));
  car.x += -Math.sin(car.yaw) * car.speed * dt;
  car.z += -Math.cos(car.yaw) * car.speed * dt;
  cop.x = car.x;
  cop.z = car.z;
  cop.yaw = car.yaw;
  if (d < 5 && (!p.inCar || Math.abs(car.speed) < 5)) {
    cop.bustTimer += dt;
  } else {
    cop.bustTimer = Math.max(0, cop.bustTimer - dt * 2);
  }
}

/** Spawn a fresh unit on a road at least spawnDistance away from the player. */
function spawnUnit(state, city, rng, kind) {
  const p = state.player;
  for (let tries = 0; tries < 10; tries += 1) {
    const node = randomNode(rng, city);
    const n = city.nodes[node];
    if (Math.hypot(n.x - p.x, n.z - p.z) < CONFIG.police.spawnDistance) continue;
    const id = nextPoliceId;
    nextPoliceId += 1;
    if (kind === 'foot') {
      state.police.push({ id, x: n.x, z: n.z, yaw: 0, kind: 'foot', bustTimer: 0, carId: null, health: 100, attackTimer: 0 });
    } else {
      const car = createCar(nextPoliceId, n.x, n.z, 0, '#f2f2f2', 'police');
      nextPoliceId += 1;
      car.driver = 'police';
      state.cars.push(car);
      state.police.push({ id, x: n.x, z: n.z, yaw: 0, kind: 'car', bustTimer: 0, carId: car.id });
    }
    return;
  }
}

/** One fixed step of the whole wanted system. */
export function updatePolice(state, city, dt, rng) {
  const counts = wantedCounts(state.wanted);
  const foot = state.police.filter((u) => u.kind === 'foot');
  const cars = state.police.filter((u) => u.kind === 'car');
  if (state.wanted > 0) {
    while (foot.length < counts.foot) {
      spawnUnit(state, city, rng, 'foot');
      foot.push({});
    }
    while (cars.length < counts.cars) {
      spawnUnit(state, city, rng, 'car');
      cars.push({});
    }
  }
  // Too many units (heat fell): the furthest ones give up first.
  if (foot.length > counts.foot || cars.length > counts.cars) {
    const p = state.player;
    state.police.sort((a, b) => Math.hypot(b.x - p.x, b.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z));
    while (state.police.filter((u) => u.kind === 'foot').length > counts.foot) {
      const i = state.police.findIndex((u) => u.kind === 'foot');
      state.police.splice(i, 1);
    }
    while (state.police.filter((u) => u.kind === 'car').length > counts.cars) {
      const i = state.police.findIndex((u) => u.kind === 'car');
      const unit = state.police[i];
      const ci = state.cars.findIndex((c) => c.id === unit.carId);
      if (ci >= 0) state.cars.splice(ci, 1);
      state.police.splice(i, 1);
    }
  }

  let busting = false;
  for (const unit of state.police) {
    if (unit.kind === 'foot') updateFootCop(unit, state, dt);
    else updatePoliceCar(unit, state, dt);
    if (unit.bustTimer >= CONFIG.police.bustSeconds) busting = true;
  }
  if (busting && !state.over) {
    state.over = 'busted';
    state.overTimer = 0;
    showDialogue(state, 'Solmar Bay PD', 'Hands where we can see them. You are under arrest.', 4);
  }

  // Cool down: quiet for long enough with no unit close by, lose a star.
  if (state.wanted > 0) {
    state.wantedTimer += dt;
    const nearest = state.police.reduce((best, u) => {
      const d = Math.hypot(u.x - state.player.x, u.z - state.player.z);
      return Math.min(best, d);
    }, Infinity);
    if (state.wantedTimer > CONFIG.police.decaySeconds && nearest > 30) {
      state.wanted -= 1;
      state.wantedTimer = 0;
      showMessage(state, state.wanted === 0 ? 'You lost them. Clean again.' : 'Heat dying down…');
    }
  } else {
    state.wantedTimer = 0;
  }
}
