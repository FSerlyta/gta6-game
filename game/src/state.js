// The single state store. The simulation reads and writes only this object; the
// renderer reads it to place meshes and the HUD reads it to draw. Nothing else in
// the game holds gameplay state, so saving is one JSON dump of this store.
export function createState(seed) {
  return {
    seed,
    time: 0,
    started: false,
    paused: false,
    over: null, // 'busted' | 'wasted' | null
    overTimer: 0,
    player: {
      x: 0,
      y: 0,
      z: 24,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: Math.PI,
      health: 100,
      cash: 250,
      weapon: 'fists',
      ammo: 12,
      reserve: 48,
      inCar: null,
      onGround: true,
      speed: 0,
      punchTimer: 0,
      shotTimer: 0,
      reloadTimer: 0,
    },
    cars: [], // { id, x, z, yaw, speed, color, kind: 'traffic'|'parked'|'player', driver }
    peds: [], // { id, x, z, yaw, speed, state: 'walk'|'flee'|'down', color, targetX, targetZ }
    police: [], // { id, x, z, yaw, speed, kind: 'car'|'foot', state: 'chase'|'bust', bustTimer, carId }
    wanted: 0,
    wantedTimer: 0,
    bustTimer: 0,
    mission: {
      index: 0,
      step: 0,
      active: false,
      done: false,
      timer: 0,
      target: null, // { x, z, label }
      reward: 0,
    },
    camera: { yaw: Math.PI, pitch: 0.32, dist: 7 },
    stats: { crimes: 0, carsStolen: 0, missionsDone: 0, shotsFired: 0 },
    message: null,
    messageTimer: 0,
    dialogue: null,
    dialogueTimer: 0,
    objective: 'Meet Mara at the Kessler office.',
    muted: false,
  };
}

/** A short-lived toast line for the HUD (pickups, rewards, warnings). */
export function showMessage(state, text, seconds = 3) {
  state.message = text;
  state.messageTimer = seconds;
}

/** A subtitle line for mission dialogue, shown at the bottom of the screen. */
export function showDialogue(state, speaker, text, seconds = 4) {
  state.dialogue = { speaker, text };
  state.dialogueTimer = seconds;
}
