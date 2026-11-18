// Save and load through localStorage. Only the player's progress is stored —
// cash, mission, position and health — never the whole world, which rebuilds
// deterministically from the seed on every load.
const SAVE_KEY = 'solmar-bay-save-v1';

export function saveGame(state) {
  try {
    const data = {
      cash: Math.round(state.player.cash),
      missionIndex: state.mission.index,
      x: Math.round(state.player.x * 10) / 10,
      z: Math.round(state.player.z * 10) / 10,
      health: Math.round(state.player.health),
      time: Math.round(state.time),
      carsStolen: state.stats.carsStolen,
      missionsDone: state.stats.missionsDone,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch { /* storage unavailable */ }
}
