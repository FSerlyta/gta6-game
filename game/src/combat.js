// Combat: fists and the pistol, on foot. Shots are hitscan against the nearest
// person near the camera's aim; hurting people raises the heat, and the police
// and Mara's rivals hit back.
import { CONFIG } from './config.js';
import { addWanted } from './police.js';
import { showMessage } from './state.js';

function angleTo(state, tx, tz) {
  const p = state.player;
  return Math.atan2(-(tx - p.x), -(tz - p.z));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** Every living person the player can hurt: residents, rivals and foot officers. */
function damageableTargets(state) {
  const out = [];
  for (const ped of state.peds) {
    if (ped.state !== 'down') out.push({ kind: ped.kind, ref: ped, x: ped.x, z: ped.z });
  }
  for (const unit of state.police) {
    if (unit.kind === 'foot') out.push({ kind: 'police', ref: unit, x: unit.x, z: unit.z });
  }
  return out;
}

/** Apply damage; a kill raises the heat and, for rivals, clears the way. */
export function damageTarget(state, target, amount) {
  const ref = target.ref;
  ref.health -= amount;
  if (ref.health > 0) return false;
  if (target.kind === 'civilian') {
    ref.state = 'down';
    ref.downTimer = 0;
    addWanted(state, 1);
    showMessage(state, 'You took a resident down. The city saw that.');
  } else if (target.kind === 'police') {
    const i = state.police.indexOf(ref);
    if (i >= 0) state.police.splice(i, 1);
    addWanted(state, 2);
    showMessage(state, 'You dropped an officer. Every cruiser in Solmar Bay is coming.');
  } else {
    ref.state = 'down';
    ref.downTimer = 0;
    showMessage(state, 'Rival down.');
  }
  return true;
}

export function damagePlayer(state, amount) {
  const p = state.player;
  if (state.over) return;
  p.health -= amount;
  state.lastDamageTime = state.time;
  if (p.health <= 0) {
    p.health = 0;
    state.over = 'wasted';
    state.overTimer = 0;
  }
}

/** One fixed step of combat. */
export function updateCombat(state, input, dt, audio) {
  const p = state.player;
  if (state.over || p.inCar) return;
  p.punchTimer = Math.max(0, p.punchTimer - dt);
  p.shotTimer = Math.max(0, p.shotTimer - dt);

  // Reload timing.
  if (p.reloadTimer > 0) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) {
      p.ammo = CONFIG.combat.magSize;
      showMessage(state, 'Pistol reloaded.');
    }
  }

  // Weapon switching: 1 fists, 2 pistol.
  if (input.hit('Digit1') && p.weapon !== 'fists') {
    p.weapon = 'fists';
    showMessage(state, 'Fists.', 1.5);
  }
  if (input.hit('Digit2') && p.weapon !== 'pistol') {
    p.weapon = 'pistol';
    showMessage(state, 'Pistol.', 1.5);
  }

  // Punch: the nearest person in front, within arm's reach.
  if (p.weapon === 'fists' && p.punchTimer <= 0 && (input.hit('KeyF') || input.mouseHit())) {
    p.punchTimer = CONFIG.combat.fistCooldown;
    audio.punch();
    const facing = p.yaw;
    let best = null;
    let bestD = CONFIG.combat.fistRange;
    for (const t of damageableTargets(state)) {
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d < bestD && angleDiff(angleTo(state, t.x, t.z), facing) < 1.2) {
        bestD = d;
        best = t;
      }
    }
    if (best) damageTarget(state, best, CONFIG.combat.fistDamage);
  }

  // Pistol: hitscan near the camera's aim; a held trigger fires on cooldown, and
  // a quick click fires once even on a slow frame (mouseHit survives the frame).
  if (p.weapon === 'pistol' && p.shotTimer <= 0 && p.reloadTimer <= 0 && (input.mouseDown() || input.mouseHit())) {
    if (p.ammo <= 0) {
      p.reloadTimer = 1.1;
      showMessage(state, 'Reloading…', 1.2);
    } else {
      p.shotTimer = CONFIG.combat.shotCooldown;
      p.ammo -= 1;
      state.stats.shotsFired += 1;
      state.lastShotTime = state.time;
      audio.shot();
      const aim = state.camera.yaw;
      let best = null;
      let bestD = CONFIG.combat.pistolRange;
      for (const t of damageableTargets(state)) {
        const d = Math.hypot(t.x - p.x, t.z - p.z);
        if (d < bestD && angleDiff(angleTo(state, t.x, t.z), aim) < 0.16) {
          bestD = d;
          best = t;
        }
      }
      if (best) damageTarget(state, best, CONFIG.combat.pistolDamage);
    }
  }
  if (input.hit('KeyR') && p.weapon === 'pistol' && p.reloadTimer <= 0 && p.ammo < CONFIG.combat.magSize) {
    p.reloadTimer = 1.1;
    showMessage(state, 'Reloading…', 1.2);
  }

  // Foot officers and rivals hit back when they get close.
  for (const unit of state.police) {
    if (unit.kind !== 'foot') continue;
    unit.attackTimer = (unit.attackTimer ?? 0) - dt;
    const d = Math.hypot(unit.x - p.x, unit.z - p.z);
    if (d < 1.9 && unit.attackTimer <= 0) {
      unit.attackTimer = 0.9;
      damagePlayer(state, 8);
      audio.punch();
    }
  }
  for (const ped of state.peds) {
    if (ped.kind !== 'rival' || ped.state === 'down') continue;
    ped.attackTimer -= dt;
    const d = Math.hypot(ped.x - p.x, ped.z - p.z);
    if (d < 12 && ped.attackTimer <= 0) {
      ped.attackTimer = 1.2;
      damagePlayer(state, 6);
      audio.shot();
    }
  }

  // Slow health recovery after a quiet stretch.
  if (state.time - (state.lastDamageTime ?? -100) > 8 && p.health > 0 && p.health < CONFIG.player.health) {
    p.health = Math.min(CONFIG.player.health, p.health + 5 * dt);
  }
}
