// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. Screens: title, play, paused and over (busted/wasted).
//
// ?seed=N fixes the city. ?shot=cover|streets|mission|vista (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { CONFIG } from './config.js';
import { makeRng } from './random.js';
import { createState, showMessage } from './state.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { buildCity } from './world.js';
import { spawnTraffic, spawnParkedCars, updateTrafficCar, updatePlayerCar } from './vehicles.js';
import { updatePlayerOnFoot, exitCar } from './player.js';
import { spawnPeds, updatePeds } from './pedestrians.js';
import { updatePolice, addWanted } from './police.js';
import { updateCombat, damagePlayer } from './combat.js';
import { startMission, updateMissions } from './missions.js';
import { createHud } from './hud.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';
import { saveGame, loadGame, hasSave } from './save.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;
const STEP = CONFIG.step;
const SAVE_EVERY = 15;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : CONFIG.seed;

const canvas = document.getElementById('game');
const city = buildCity(seed);
let state = createState(seed);
const rng = makeRng(seed + 1000);
const audio = createAudio();
const hud = createHud();
const renderer = createRenderer(canvas, city);
let input = createInput(canvas);

/** An input source that presses nothing: the title screen's living backdrop. */
const idleInput = {
  down: () => false,
  hit: () => false,
  mouseDown: () => false,
  mouseHit: () => false,
  takeMouse: () => ({ dx: 0, dy: 0 }),
  endFrame: () => {},
};

/** Fill a fresh state with traffic, parked cars, residents and the player. */
function initWorld(next) {
  const r1 = makeRng(seed + 1);
  const r2 = makeRng(seed + 2);
  const r3 = makeRng(seed + 3);
  spawnTraffic(next, city, r1);
  spawnParkedCars(next, city, r2);
  spawnPeds(next, city, r3);
  next.player.x = city.spawns.player.x;
  next.player.z = city.spawns.player.z;
  next.player.yaw = city.spawns.player.yaw;
  next.camera.yaw = city.spawns.player.yaw;
}

/** One fixed step of the whole game, driven by `inp`. */
function stepSim(dt, inp) {
  state.time += dt;
  const mouse = inp.takeMouse();
  state.camera.yaw -= mouse.dx * 0.0032;
  state.camera.pitch = Math.max(0.05, Math.min(0.9, state.camera.pitch + mouse.dy * 0.0022));

  const p = state.player;
  if (p.inCar) {
    const car = state.cars.find((c) => c.id === p.inCar);
    if (car) {
      const crash = updatePlayerCar(car, inp, city, state, dt);
      if (crash) audio.crash();
      p.x = car.x;
      p.z = car.z;
      p.yaw = car.yaw;
      p.speed = car.speed;
      if (inp.hit('KeyE')) exitCar(state);
      // Running someone over: they go down, the city sees it.
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - car.x, ped.z - car.z) < 2.3) {
          ped.state = 'down';
          ped.downTimer = 0;
          ped.health = 0;
          car.speed *= 0.7;
          addWanted(state, 1);
          audio.crash();
          showMessage(state, 'You ran someone over. The city saw that.');
        }
      }
    } else {
      p.inCar = null;
    }
  } else {
    updatePlayerOnFoot(state, city, inp, dt);
  }

  for (const car of state.cars) {
    if (car.driver === 'traffic') updateTrafficCar(car, state, city, rng, dt);
  }
  updatePeds(state, city, dt, rng);
  updatePolice(state, city, dt, rng);
  updateCombat(state, inp, dt, audio);
  updateMissions(state, city, dt, rng, audio);

  // A cruiser ramming Dario on foot hurts.
  for (const unit of state.police) {
    unit.attackTimer = Math.max(0, (unit.attackTimer ?? 0) - dt);
    if (unit.kind === 'car' && !p.inCar) {
      const d = Math.hypot(unit.x - p.x, unit.z - p.z);
      if (d < 2.6 && unit.attackTimer <= 0) {
        unit.attackTimer = 1.0;
        damagePlayer(state, 10);
        audio.crash();
      }
    }
  }

  if (state.messageTimer > 0) state.messageTimer -= dt;
  if (state.dialogueTimer > 0) state.dialogueTimer -= dt;
  if (state.over) state.overTimer += dt;

  // Sound follows the drive: engine by speed, sirens while cruisers chase.
  const car = p.inCar ? state.cars.find((c) => c.id === p.inCar) : null;
  audio.engine(car ? Math.abs(car.speed) / CONFIG.car.maxSpeed : 0);
  audio.siren(state.police.some((u) => u.kind === 'car'));

  inp.endFrame();
}

const game = {
  get state() {
    return state;
  },
  city,
  rng,
  stepSim,
};

// ---- Screens ----
const screens = {
  title: document.getElementById('screen-title'),
  pause: document.getElementById('screen-pause'),
  over: document.getElementById('screen-over'),
};
const overTitle = document.getElementById('over-title');
const overText = document.getElementById('over-text');
const btnContinue = document.getElementById('btn-continue');

function showScreen(name) {
  for (const [key, node] of Object.entries(screens)) {
    node.classList.toggle('hidden', key !== name);
  }
  document.body.classList.toggle('playing', name !== 'title');
}

function startGame(fromSave) {
  state = createState(seed);
  initWorld(state);
  const save = fromSave ? loadGame() : null;
  if (save) {
    state.player.cash = save.cash;
    state.player.health = save.health;
    state.player.x = save.x;
    state.player.z = save.z;
    state.stats.carsStolen = save.carsStolen || 0;
    state.stats.missionsDone = save.missionsDone || 0;
    startMission(state, city, rng, Math.min(save.missionIndex, 4));
  } else {
    startMission(state, city, rng, 0);
  }
  state.started = true;
  screen = 'play';
  showScreen(null);
  audio.ensure();
  audio.startMusic();
  input.requestLock();
}

function respawn() {
  const p = state.player;
  if (state.over === 'busted') {
    p.cash = Math.round(p.cash * 0.8);
    showMessage(state, 'Bail set you back 20% of your cash.');
  }
  for (const unit of [...state.police]) {
    if (unit.kind === 'car') {
      const ci = state.cars.findIndex((c) => c.id === unit.carId);
      if (ci >= 0) state.cars.splice(ci, 1);
    }
  }
  state.police.length = 0;
  state.wanted = 0;
  state.wantedTimer = 0;
  p.health = CONFIG.player.health;
  p.inCar = null;
  p.x = city.plaza.x;
  p.z = city.plaza.z + 12;
  p.y = 0;
  p.vy = 0;
  state.over = null;
  state.overTimer = 0;
  screen = 'play';
  showScreen(null);
}

document.getElementById('btn-new').addEventListener('click', () => startGame(false));
if (btnContinue) {
  btnContinue.classList.toggle('hidden', !hasSave());
  btnContinue.addEventListener('click', () => startGame(true));
}
document.getElementById('btn-resume').addEventListener('click', () => {
  screen = 'play';
  showScreen(null);
});
document.getElementById('btn-quit').addEventListener('click', () => {
  screen = 'title';
  state.started = false;
  showScreen('title');
});
document.getElementById('btn-restart').addEventListener('click', respawn);
document.getElementById('btn-quit-over').addEventListener('click', () => {
  screen = 'title';
  state.started = false;
  showScreen('title');
});

let screen = 'title';
let saveTimer = 0;

// ---- Shot mode: stage the scene, paint twice, signal readiness. ----
function runShot(name) {
  showScreen(null);
  stageShot(name, game);
  let painted = 0;
  function paint() {
    renderer.sync(state, 0);
    hud.update(state, city);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      window.__solmar.ready = true;
    }
  }
  requestAnimationFrame(paint);
}

// ---- The live game loop. ----
function runGame() {
  let accumulator = 0;
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    if (input.hit('KeyM')) {
      audio.setMuted(!audio.isMuted());
      state.muted = audio.isMuted();
      showMessage(state, audio.isMuted() ? 'Sound off.' : 'Sound on.', 1.5);
    }

    if (screen === 'play') {
      if (input.hit('KeyP') || input.hit('Escape')) {
        screen = 'paused';
        showScreen('pause');
        saveGame(state);
      }
    } else if (screen === 'paused') {
      if (input.hit('KeyP') || input.hit('Escape')) {
        screen = 'play';
        showScreen(null);
      }
    }

    if (screen === 'title') {
      accumulator += frameDt;
      while (accumulator >= STEP) {
        stepSim(STEP, idleInput);
        accumulator -= STEP;
      }
    } else if (screen === 'play') {
      accumulator += frameDt;
      while (accumulator >= STEP) {
        stepSim(STEP, input);
        accumulator -= STEP;
      }
      saveTimer += frameDt;
      if (saveTimer > SAVE_EVERY) {
        saveTimer = 0;
        saveGame(state);
      }
      if (state.over) {
        screen = 'over';
        overTitle.textContent = state.over === 'busted' ? 'BUSTED' : 'WASTED';
        overText.textContent =
          state.over === 'busted'
            ? 'Solmar Bay PD caught up with you. Bail costs 20% of your cash.'
            : 'Dario is down. The city keeps moving without him.';
        showScreen('over');
        audio.siren(false);
        audio.engine(0);
      }
    } else {
      accumulator = 0;
    }

    renderer.sync(state, frameDt);
    if (screen !== 'title') hud.update(state, city);
    if (!window.__solmar.ready) window.__solmar.ready = true;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      showScreen('pause');
      saveGame(state);
    }
  });

  showScreen('title');
  requestAnimationFrame(frame);
}

window.__solmar = {
  get state() {
    return state;
  },
  city,
  stepSim,
  version: 'solmar-bay-1',
  ready: false,
};

initWorld(state);
if (shot) runShot(shot);
else runGame();
