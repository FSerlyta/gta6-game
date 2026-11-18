// Keyboard and mouse input. Pointer lock gives mouse-look on desktop; every key
// press is also recorded as an edge (`pressed`) so actions fire once per press.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let mousePressed = false;
  let locked = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    pressed.add(event.code);
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault();
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseMove(event) {
    if (!locked) return;
    mouseDX += event.movementX || 0;
    mouseDY += event.movementY || 0;
  }
  function onMouseDown(event) {
    if (event.button !== 0) return;
    mouseDown = true;
    mousePressed = true;
    if (!locked && document.pointerLockElement !== canvas) {
      try {
        const r = canvas.requestPointerLock?.();
        if (r instanceof Promise) r.catch(() => {});
      } catch {
        // Pointer lock needs a user gesture; a synthetic click has none.
      }
    }
  }
  function onMouseUp(event) {
    if (event.button === 0) mouseDown = false;
  }
  function onLockChange() {
    locked = document.pointerLockElement === canvas;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    keys,
    pressed,
    down(code) {
      return keys.has(code);
    },
    /** True only on the frame the key went down. */
    hit(code) {
      return pressed.has(code);
    },
    mouseDown() {
      return mouseDown;
    },
    mouseHit() {
      return mousePressed;
    },
    takeMouse() {
      const out = { dx: mouseDX, dy: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return out;
    },
    isLocked() {
      return locked;
    },
    requestLock() {
      try {
        const r = canvas.requestPointerLock?.();
        if (r instanceof Promise) r.catch(() => {});
      } catch {
        // Pointer lock needs a user gesture; a synthetic click has none.
      }
    },
    /** Call at the end of each frame to clear edge-triggered state. */
    endFrame() {
      pressed.clear();
      mousePressed = false;
    },
  };
}

/**
 * A scripted input source for screenshots and tests: it answers the same
 * questions `createInput` does, from a fixed plan instead of the keyboard.
 */
export function createScriptedInput(plan) {
  let frame = 0;
  return {
    keys: new Set(),
    pressed: new Set(),
    down(code) {
      return plan(frame).keys.has(code);
    },
    hit(code) {
      return frame > 0 && plan(frame).keys.has(code) && !plan(frame - 1).keys.has(code);
    },
    mouseDown() {
      return plan(frame).mouse;
    },
    mouseHit() {
      return false;
    },
    takeMouse() {
      return plan(frame).mouseDelta || { dx: 0, dy: 0 };
    },
    isLocked() {
      return true;
    },
    requestLock() {},
    endFrame() {
      frame += 1;
    },
  };
}
