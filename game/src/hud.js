// The HUD: health, cash, wanted stars, objective, speed, ammo, toasts, dialogue
// and a live canvas minimap. All DOM — the 3D view stays clean for the game.
import { CONFIG, WANTED_NAMES } from './config.js';

function el(id) {
  return document.getElementById(id);
}

export function createHud() {
  const healthFill = el('hud-health-fill');
  const cash = el('hud-cash');
  const stars = el('hud-stars');
  const wantedName = el('hud-wanted-name');
  const objective = el('hud-objective');
  const speed = el('hud-speed');
  const ammo = el('hud-ammo');
  const weapon = el('hud-weapon');
  const message = el('hud-message');
  const dialogue = el('hud-dialogue');
  const dialogueSpeaker = el('hud-dialogue-speaker');
  const dialogueText = el('hud-dialogue-text');
  const flash = el('damage-flash');
  const minimap = el('minimap');
  const mctx = minimap.getContext('2d');
  const mapSize = CONFIG.minimap.size;
  minimap.width = mapSize;
  minimap.height = mapSize;

  function drawMinimap(state, city) {
    const range = CONFIG.minimap.range;
    const scale = mapSize / (range * 2);
    const px = state.player.x;
    const pz = state.player.z;
    const toMap = (x, z) => [(x - px) * scale + mapSize / 2, (z - pz) * scale + mapSize / 2];
    mctx.fillStyle = 'rgba(10, 16, 24, 0.82)';
    mctx.fillRect(0, 0, mapSize, mapSize);
    // Sea and sand at the south edge.
    const [bx0, by0] = toMap(city.bounds.minX, city.beach.z0);
    const [bx1, by1] = toMap(city.bounds.maxX, city.water.z1);
    mctx.fillStyle = '#ecd9a0';
    mctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    mctx.fillStyle = '#2e7fa8';
    mctx.fillRect(bx0, by1, bx1 - bx0, mapSize - by1);
    // Roads.
    mctx.strokeStyle = '#5a6068';
    mctx.lineWidth = Math.max(2, 8 * scale);
    for (const rx of city.roadsX) {
      const [x0, y0] = toMap(rx, city.bounds.minZ - 10);
      const [x1, y1] = toMap(rx, city.bounds.maxZ + 10);
      mctx.beginPath();
      mctx.moveTo(x0, y0);
      mctx.lineTo(x1, y1);
      mctx.stroke();
    }
    for (const rz of city.roadsZ) {
      const [x0, y0] = toMap(city.bounds.minX - 10, rz);
      const [x1, y1] = toMap(city.bounds.maxX + 10, rz);
      mctx.beginPath();
      mctx.moveTo(x0, y0);
      mctx.lineTo(x1, y1);
      mctx.stroke();
    }
    // Buildings in range.
    mctx.fillStyle = '#8b93a3';
    for (const b of city.buildings) {
      const [x, y] = toMap(b.x - b.hw, b.z - b.hd);
      const w = b.hw * 2 * scale;
      const h = b.hd * 2 * scale;
      if (x > -w && x < mapSize && y > -h && y < mapSize) mctx.fillRect(x, y, w, h);
    }
    // Traffic cars.
    mctx.fillStyle = '#ffffff';
    for (const car of state.cars) {
      if (car.kind === 'traffic') {
        const [x, y] = toMap(car.x, car.z);
        mctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }
    // Mission marker: a pulsing yellow diamond.
    if (state.mission.target) {
      const pulse = 6 + Math.sin(state.time * 5) * 2;
      const [x, y] = toMap(state.mission.target.x, state.mission.target.z);
      mctx.fillStyle = '#f2c94c';
      mctx.beginPath();
      mctx.moveTo(x, y - pulse);
      mctx.lineTo(x + pulse, y);
      mctx.lineTo(x, y + pulse);
      mctx.lineTo(x - pulse, y);
      mctx.closePath();
      mctx.fill();
    }
    // Police: red dots.
    mctx.fillStyle = '#ff4444';
    for (const unit of state.police) {
      const [x, y] = toMap(unit.x, unit.z);
      mctx.beginPath();
      mctx.arc(x, y, 3.5, 0, Math.PI * 2);
      mctx.fill();
    }
    // The player: a white arrow pointing where they face.
    const cx = mapSize / 2;
    const cy = mapSize / 2;
    const yaw = state.player.inCar
      ? (state.cars.find((c) => c.id === state.player.inCar)?.yaw ?? state.player.yaw)
      : state.player.yaw;
    mctx.save();
    mctx.translate(cx, cy);
    mctx.rotate(-yaw + Math.PI);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(0, -8);
    mctx.lineTo(5, 6);
    mctx.lineTo(-5, 6);
    mctx.closePath();
    mctx.fill();
    mctx.restore();
    // North tick.
    mctx.fillStyle = '#ffffff';
    mctx.font = 'bold 11px system-ui, sans-serif';
    mctx.textAlign = 'center';
    mctx.fillText('N', mapSize / 2, 13);
  }

  return {
    update(state, city) {
      const p = state.player;
      healthFill.style.width = `${Math.max(0, p.health)}%`;
      healthFill.style.background = p.health > 50 ? '#37b24d' : p.health > 25 ? '#f2c94c' : '#e5534b';
      cash.textContent = `$${Math.round(p.cash).toLocaleString('en-US')}`;
      stars.textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
      stars.style.color = state.wanted > 0 ? '#ff5a4e' : '#f2c94c';
      wantedName.textContent = WANTED_NAMES[state.wanted];
      objective.textContent = state.objective || '';
      const car = p.inCar ? state.cars.find((c) => c.id === p.inCar) : null;
      speed.textContent = car ? `${Math.round(Math.abs(car.speed) * 3.6)} km/h` : '';
      weapon.textContent = p.weapon === 'pistol' ? 'Pistol' : 'Fists';
      ammo.textContent = p.weapon === 'pistol' ? `${p.ammo} / ${CONFIG.combat.magSize}` : '—';
      if (state.message && state.messageTimer > 0) {
        message.textContent = state.message;
        message.style.opacity = Math.min(1, state.messageTimer).toFixed(2);
      } else {
        message.style.opacity = '0';
      }
      if (state.dialogue && state.dialogueTimer > 0) {
        dialogue.style.opacity = Math.min(1, state.dialogueTimer).toFixed(2);
        dialogueSpeaker.textContent = state.dialogue.speaker;
        dialogueText.textContent = state.dialogue.text;
      } else {
        dialogue.style.opacity = '0';
      }
      const sinceHit = state.time - (state.lastDamageTime ?? -100);
      flash.style.opacity = sinceHit < 0.35 ? '0.4' : '0';
      drawMinimap(state, city);
    },
  };
}
