// Screenshot scenes: each one plays the real game forward from a fresh world
// for a fixed number of steps, steered by a scripted input plan, so the frame is
// what a short stretch of real play looks like — and the same seed always gives
// the same frame. The four shots together show the chase, the streets, a mission
// and the city itself.
import { CONFIG } from './config.js';
import { createScriptedInput } from './input.js';
import { startMission } from './missions.js';
import { createCar } from './vehicles.js';

const STEP = CONFIG.step;

/** Run `seconds` of the game with a fixed key plan. */
function playFor(game, seconds, plan) {
  const input = createScriptedInput(plan);
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) game.stepSim(STEP, input);
}

/** Point the camera from behind whatever the player is riding or walking. */
function chaseCamera(game, dist, height) {
  const p = game.state.player;
  const yaw = p.inCar
    ? (game.state.cars.find((c) => c.id === p.inCar)?.yaw ?? p.yaw)
    : p.yaw;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  game.state.cameraOverride = {
    x: p.x - fx * dist,
    y: height,
    z: p.z - fz * dist,
    lookX: p.x + fx * 10,
    lookY: 1.5,
    lookZ: p.z + fz * 10,
  };
}

/**
 * The cover: Dario fleeing down Bay Street in a stolen Comet, two cruisers on
 * his bumper, three stars on the HUD and the mission line up top. The chase is
 * played forward for real, then the cruisers are pulled into a tight staggered
 * formation behind the Comet — close enough that the camera, set low on the road
 * behind the rearmost cruiser, holds all three cars in one frame.
 */
function stageCover(game) {
  const { state, city } = game;
  const roadX = city.roadsX[4];
  const roadZ = city.roadsZ[3];
  const car = createCar(9500, roadX, roadZ, -Math.PI / 2, '#c0392b', 'player');
  car.driver = 'player';
  car.speed = 24;
  state.cars.push(car);
  state.player.inCar = car.id;
  state.player.x = car.x;
  state.player.z = car.z;
  state.player.yaw = car.yaw;
  state.camera.yaw = car.yaw;
  state.wanted = 3;
  state.wantedTimer = 0;
  state.objective = 'Lose the cops — stay out of sight';
  // Clear traffic off the chase road so the Comet never has to stop.
  state.cars = state.cars.filter((c) => !(c.kind === 'traffic' && Math.abs(c.z - roadZ) < 9 && c.x > roadX - 60 && c.x < roadX + 260));
  // Two cruisers starting on the road behind him, one a lane either side.
  for (let i = 0; i < 2; i += 1) {
    const copCar = createCar(9501 + i, roadX - 14 - i * 12, roadZ + (i === 0 ? -2.5 : 2.5), -Math.PI / 2, '#f2f2f2', 'police');
    copCar.driver = 'police';
    copCar.speed = 34;
    state.cars.push(copCar);
    state.police.push({ id: 9501 + i, x: copCar.x, z: copCar.z, yaw: copCar.yaw, kind: 'car', bustTimer: 0, carId: copCar.id, health: 100, attackTimer: 0 });
  }
  playFor(game, 2.5, () => ({ keys: new Set(['KeyW']), mouse: false }));
  // A bust mid-staging would ruin the shot: the cover is a chase, not an arrest.
  if (state.over) {
    state.over = null;
    state.overTimer = 0;
    state.dialogue = null;
    state.dialogueTimer = 0;
    for (const unit of state.police) unit.bustTimer = 0;
  }
  // Pull the cruisers into formation behind the Comet so both read in frame:
  // one 11 m back in the north lane, one 20 m back in the south lane, matching
  // the Comet's heading and speed. The chase was real; this is just the photo.
  const comet = state.cars.find((c) => c.id === 9500);
  if (comet) {
    const fx = -Math.sin(comet.yaw);
    const fz = -Math.cos(comet.yaw);
    const rx = -fz;
    const rz = fx;
    const cruisers = state.police.filter((u) => u.kind === 'car');
    const gaps = [11, 20];
    const lanes = [-2.5, 2.5];
    cruisers.forEach((unit, i) => {
      const copCar = state.cars.find((c) => c.id === unit.carId);
      if (!copCar) return;
      const gap = gaps[i % gaps.length];
      const lane = lanes[i % lanes.length];
      copCar.x = comet.x - fx * gap + rx * lane;
      copCar.z = comet.z - fz * gap + rz * lane;
      copCar.yaw = comet.yaw;
      copCar.speed = comet.speed;
      unit.x = copCar.x;
      unit.z = copCar.z;
      unit.yaw = copCar.yaw;
      unit.bustTimer = 0;
    });
    // Camera low on the road behind the rearmost cruiser, looking past both
    // cruisers at the fleeing Comet. The road itself is clear of buildings, so
    // the frame holds the whole chase train: cruiser, cruiser, Comet.
    const rear = cruisers
      .map((u) => state.cars.find((c) => c.id === u.carId))
      .filter(Boolean)
      .sort((a, b) => (a.x * fx + a.z * fz) - (b.x * fx + b.z * fz))[0];
    const camBase = rear ?? comet;
    game.state.cameraOverride = {
      x: camBase.x - fx * 13 + rx * 6,
      y: 8.5,
      z: camBase.z - fz * 13 + rz * 6,
      lookX: comet.x + fx * 9,
      lookY: 1.5,
      lookZ: comet.z + fz * 9,
    };
  }
}

/** On foot at a busy intersection: traffic rolling past, residents on the
 * sidewalks, the plaza fountain ahead. */
function stageStreets(game) {
  const { state, city } = game;
  state.player.x = city.roadsX[4] + 5;
  state.player.z = city.roadsZ[2] + 5;
  state.player.yaw = Math.PI;
  state.camera.yaw = Math.PI;
  playFor(game, 5, () => ({ keys: new Set(['KeyW']), mouse: false }));
  chaseCamera(game, 7, 3.2);
}

/** A mission in progress: Mara's first job, Dario closing in on the red Comet
 * with the objective marker and the dialogue line on screen. */
function stageMission(game) {
  const { state, city, rng } = game;
  startMission(state, city, rng, 1);
  const target = state.mission.target;
  if (target) {
    state.player.x = target.x - 10;
    state.player.z = target.z + 8;
    state.camera.yaw = Math.atan2(-(target.x - state.player.x), -(target.z - state.player.z));
    state.player.yaw = state.camera.yaw;
  }
  playFor(game, 1.2, () => ({ keys: new Set(['KeyW']), mouse: false }));
  chaseCamera(game, 8, 3.6);
}

/** The vista: Dario on the boardwalk at golden light, the whole of Solmar Bay —
 * blocks, palms, bridge and lighthouse — spread out behind him. */
function stageVista(game) {
  const { state, city } = game;
  state.player.x = 0;
  state.player.z = city.beach.z0 + 8;
  state.player.yaw = 0;
  playFor(game, 2, () => ({ keys: new Set(), mouse: false }));
  state.cameraOverride = {
    x: 30,
    y: 38,
    z: city.water.z0 + 55,
    lookX: -10,
    lookY: 6,
    lookZ: -40,
  };
}

/**
 * Set the world to the named scene and return the screen to show over it.
 * Any other name stages the streets.
 */
export function stageShot(name, game) {
  game.state.started = true;
  game.state.cameraOverride = null;
  if (name === 'cover') stageCover(game);
  else if (name === 'mission') stageMission(game);
  else if (name === 'vista') stageVista(game);
  else stageStreets(game);
  return { screen: 'play' };
}
