// Keyboard and mouse state, plus the scripted-input hook the screenshot
// scenes and the self-test use to drive the game without a human.
export function createInput(canvas) {
  const keys = new Set();
  const input = {
    keys,
    mouseX: 640,
    mouseY: 360,
    mouseDown: false,
    clicked: false, // set for one frame when the mouse button goes down
    scripted: null, // {up,down,left,right,run,action,shoot,mouseX,mouseY} or null
    anyKey: false,
  };
  const code = (e) => e.code;
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    keys.add(code(e));
    input.anyKey = true;
  });
  window.addEventListener('keyup', (e) => keys.delete(code(e)));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouseX = (e.clientX - r.left) * (canvas.width / r.width);
    input.mouseY = (e.clientY - r.top) * (canvas.height / r.height);
  });
  canvas.addEventListener('mousedown', (e) => {
    input.mouseDown = true;
    input.clicked = true;
    const r = canvas.getBoundingClientRect();
    input.mouseX = (e.clientX - r.left) * (canvas.width / r.width);
    input.mouseY = (e.clientY - r.top) * (canvas.height / r.height);
  });
  window.addEventListener('mouseup', () => { input.mouseDown = false; });
  return input;
}

// Read the current frame's intent, from the keyboard or from a script.
export function readIntent(input) {
  if (input.scripted) return input.scripted;
  const k = input.keys;
  return {
    up: k.has('KeyW') || k.has('ArrowUp'),
    down: k.has('KeyS') || k.has('ArrowDown'),
    left: k.has('KeyA') || k.has('ArrowLeft'),
    right: k.has('KeyD') || k.has('ArrowRight'),
    run: k.has('ShiftLeft') || k.has('ShiftRight'),
    brake: k.has('Space'),
    action: k.has('KeyE'),
    reload: k.has('KeyR'),
    pause: k.has('KeyP') || k.has('Escape'),
    mute: k.has('KeyM'),
    shoot: input.mouseDown,
    mouseX: input.mouseX,
    mouseY: input.mouseY,
  };
}
