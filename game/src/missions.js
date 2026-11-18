// The story: Dario, a driver new to Solmar Bay, works jobs for the fixer Mara
// Kessler. Five missions, each a short chain of steps with an objective marker,
// dialogue and a cash reward. The mission controller advances steps on the
// conditions the world already tracks.
import { showMessage, showDialogue } from './state.js';
import { createCar } from './vehicles.js';
import { createPed } from './pedestrians.js';
import { addWanted } from './police.js';
import { randomNode } from './world.js';

export const MISSIONS = [
  {
    id: 'new-in-town',
    name: 'New in Town',
    reward: 150,
    intro: ['Mara Kessler', 'Dario. You made it to Solmar Bay. I have work — if you can drive. Come to the office.'],
    steps: [{ type: 'goto', x: 0, z: -16, label: 'Meet Mara at the Kessler office', radius: 6 }],
  },
  {
    id: 'hot-wheels',
    name: 'Hot Wheels',
    reward: 400,
    intro: ['Mara Kessler', 'A red Comet is parked on Bay Street. Bring it to the garage on Marina Row. Quietly.'],
    steps: [
      { type: 'steal', label: 'Steal the red Comet', radius: 5 },
      { type: 'goto', x: 120, z: 60, label: 'Deliver the Comet to the garage', radius: 8 },
    ],
  },
  {
    id: 'the-package',
    name: 'The Package',
    reward: 600,
    intro: ['Mara Kessler', 'Pick up the package on Coral Avenue. The lighthouse keeper is waiting — and the cops are jumpy tonight.'],
    steps: [
      { type: 'goto', x: 180, z: -60, label: 'Pick up the package', radius: 6 },
      { type: 'goto', x: 292, z: -40, label: 'Deliver it to the lighthouse', radius: 8 },
    ],
  },
  {
    id: 'shake-the-tail',
    name: 'Shake the Tail',
    reward: 800,
    intro: ['Mara Kessler', 'Three stars and climbing, Dario. Lose them — stay out of sight and let the heat die.'],
    steps: [{ type: 'survive', seconds: 45, label: 'Lose the cops — stay out of sight' }],
  },
  {
    id: 'the-bridge-meet',
    name: 'The Bridge Meet',
    reward: 1500,
    intro: ['Mara Kessler', 'One last job. Meet me at the bridge — and bring the pistol. My rivals want this city too.'],
    steps: [
      { type: 'goto', x: 266, z: 0, label: 'Meet Mara at the bridge', radius: 7 },
      { type: 'defend', label: 'Deal with Kessler\u2019s rivals', count: 3 },
      { type: 'goto', x: 292, z: -40, label: 'Get to the lighthouse', radius: 8 },
    ],
  },
];

/** Start a mission: set its first step, marker and intro line. */
export function startMission(state, city, rng, index) {
  const m = MISSIONS[index];
  if (!m) return false;
  state.mission.index = index;
  state.mission.step = 0;
  state.mission.active = true;
  state.mission.done = false;
  state.mission.timer = 0;
  state.mission.reward = m.reward;
  showDialogue(state, m.intro[0], m.intro[1], 6);
  state.objective = m.steps[0].label;
  setupStep(state, city, rng);
  return true;
}

/** Prepare the current step: markers, target cars, rivals, scripted heat. */
function setupStep(state, city, rng) {
  const m = MISSIONS[state.mission.index];
  const step = m.steps[state.mission.step];
  state.mission.target = null;
  if (step.type === 'goto') {
    state.mission.target = { x: step.x, z: step.z, label: step.label };
  } else if (step.type === 'steal') {
    // A red Comet parked on a road near the player.
    const p = state.player;
    let best = null;
    let bestD = Infinity;
    for (let tries = 0; tries < 12; tries += 1) {
      const node = randomNode(rng, city);
      const n = city.nodes[node];
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d > 25 && d < bestD) {
        bestD = d;
        best = n;
      }
    }
    const spot = best ?? { x: p.x + 30, z: p.z };
    const car = createCar(9000 + state.mission.index, spot.x + 5.5, spot.z, 0, '#c0392b', 'parked');
    state.cars.push(car);
    state.mission.target = { x: car.x, z: car.z, label: step.label, carId: car.id };
  } else if (step.type === 'survive') {
    state.mission.timer = step.seconds;
    addWanted(state, 3);
    state.mission.target = { x: state.player.x, z: state.player.z, label: step.label };
  } else if (step.type === 'defend') {
    const meet = { x: 266, z: 0 };
    for (let i = 0; i < step.count; i += 1) {
      const ped = createPed(8000 + i, meet.x + (i - 1) * 6, meet.z + 10 + i * 3, '#7d3c98', 'rival');
      state.peds.push(ped);
    }
    state.mission.target = { x: meet.x, z: meet.z, label: step.label };
    showDialogue(state, 'Rival', 'Kessler sent a new errand boy? This city is ours.', 4);
  }
}

/** Complete the current step, pay out, and move on or finish the mission. */
function completeStep(state, city, rng, audio) {
  const m = MISSIONS[state.mission.index];
  state.mission.step += 1;
  audio.cash();
  if (state.mission.step >= m.steps.length) {
    completeMission(state, city, rng, audio);
  } else {
    const step = m.steps[state.mission.step];
    state.objective = step.label;
    setupStep(state, city, rng);
  }
}

function completeMission(state, city, rng, audio) {
  const m = MISSIONS[state.mission.index];
  state.player.cash += m.reward;
  state.stats.missionsDone += 1;
  state.mission.active = false;
  state.mission.done = true;
  state.mission.target = null;
  showMessage(state, `Mission complete: ${m.name} — $${m.reward}.`);
  showDialogue(state, 'Mara Kessler', m.id === 'the-bridge-meet' ? 'That is the last of them. Solmar Bay is ours, Dario.' : 'Clean work. The money is yours.', 5);
  audio.cash();
  state.mission.nextTimer = 4;
}

/** One fixed step of the mission controller. */
export function updateMissions(state, city, dt, rng, audio) {
  const m = state.mission;
  // Between missions: a short breather, then the next one starts itself.
  if (!m.active) {
    if (m.nextTimer !== undefined && m.nextTimer > 0) {
      m.nextTimer -= dt;
      if (m.nextTimer <= 0) {
        m.nextTimer = undefined;
        if (m.index + 1 < MISSIONS.length) startMission(state, city, rng, m.index + 1);
        else {
          state.objective = 'Solmar Bay is yours. Free roam — cause trouble or cruise the beach.';
          showDialogue(state, 'Mara Kessler', 'That is the whole story, Dario. The city is yours now.', 6);
        }
      }
    }
    return;
  }
  const mission = MISSIONS[m.index];
  const step = mission.steps[m.step];
  const p = state.player;
  if (step.type === 'goto') {
    const d = Math.hypot(p.x - step.x, p.z - step.z);
    if (d < step.radius) {
      if (mission.id === 'the-package' && m.step === 0) {
        showMessage(state, 'Package picked up. The cops are watching — drive careful.');
        addWanted(state, 2);
      }
      completeStep(state, city, rng, audio);
    }
  } else if (step.type === 'steal') {
    if (p.inCar === m.target?.carId) {
      showMessage(state, 'The Comet is yours. Get it to the garage.');
      completeStep(state, city, rng, audio);
    }
  } else if (step.type === 'survive') {
    const nearest = state.police.reduce((best, u) => Math.min(best, Math.hypot(u.x - p.x, u.z - p.z)), Infinity);
    if (nearest > 25) {
      m.timer -= dt;
      state.objective = `${step.label} — ${Math.ceil(m.timer)}s`;
    } else {
      state.objective = `${step.label} — they can still see you!`;
    }
    if (m.timer <= 0) completeStep(state, city, rng, audio);
  } else if (step.type === 'defend') {
    const alive = state.peds.filter((ped) => ped.kind === 'rival' && ped.state !== 'down').length;
    state.objective = `${step.label} — ${alive} left`;
    if (alive === 0) completeStep(state, city, rng, audio);
  }
}
