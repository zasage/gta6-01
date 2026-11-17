// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game moves
// between six screens: title, play, paused, busted, wasted and finale.
//
// ?seed=N fixes the city. ?shot=title|drive|chase|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot. ?test=1 runs the scripted self-test
// and writes its result into the page.
import { STEP } from './config.js';
import { createGameState, stepGame, saveGame, addMessage } from './game.js';
import { startMissions, currentMission } from './missions.js';
import { loadSave } from './save.js';
import { createInput, readIntent } from './input.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_BUSTED, SCREEN_WASTED, SCREEN_FINALE, titleButtons } from './render.js';
import { stageShot } from './shots.js';
import { LANDMARKS } from './city.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const testMode = params.get('test') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);

function announce(message) {
  status.textContent = message;
}

function runShot(name) {
  const { state, screen } = stageShot(name, seed);
  state.screen = screen;
  let painted = 0;
  function paint() {
    renderer.draw(state, screen, !!loadSave());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// The scripted self-test: drives the real rules with synthetic input and
// reports what broke, if anything, into the page text.
function runSelfTest() {
  const results = [];
  const check = (name, ok) => results.push([name, !!ok]);
  try {
    const state = createGameState(7);
    const idle = { up: false, down: false, left: false, right: false, run: false, brake: false, action: false, reload: false, pause: false, mute: false, shoot: false, mouseX: 640, mouseY: 360, actionPressed: false };
    // 1. Walking moves the player.
    const x0 = state.player.x, y0 = state.player.y;
    for (let i = 0; i < 120; i += 1) stepGame(state, { ...idle, up: true }, STEP);
    check('walk moves player', Math.hypot(state.player.x - x0, state.player.y - y0) > 100);
    // 2. Stealing a car puts the player in it and raises the heat.
    const car = state.cars.find((c) => c.kind === 'parked');
    state.player.x = car.x - 20;
    state.player.y = car.y;
    const heat0 = state.wanted.heat;
    stepGame(state, { ...idle, actionPressed: true }, STEP);
    check('enter car', !!state.player.inCar);
    check('stealing raises wanted', state.wanted.heat > heat0);
    // 3. Driving builds speed.
    for (let i = 0; i < 180; i += 1) stepGame(state, { ...idle, up: true }, STEP);
    check('driving builds speed', Math.abs(state.player.car.speed) > 150);
    // 4. Police answer the heat.
    for (let i = 0; i < 240; i += 1) stepGame(state, { ...idle, up: true }, STEP);
    check('police spawn', state.wanted.policeCars.length > 0);
    // 5. Shooting spends ammo. Stand on an open road and aim east down it,
    // so the bullet has somewhere to fly.
    const ammo0 = state.pistol.ammo;
    state.player.inCar = null;
    state.player.car = null;
    state.player.x = 1530;
    state.player.y = 1530;
    state.camera.x = 1530;
    state.camera.y = 1530;
    stepGame(state, { ...idle, shoot: true, mouseX: 900, mouseY: 360 }, STEP);
    check('shooting spends ammo', state.pistol.ammo < ammo0);
    check('bullet flies', state.bullets.length > 0);
    // 6. Mission 1 advances when the player reaches the Docks.
    startMissions(state.missions, { addMessage: (t, k) => addMessage(state, t, k), audio: state.audio });
    state.player.x = LANDMARKS.docks.x;
    state.player.y = LANDMARKS.docks.y;
    const step0 = state.missions.step;
    for (let i = 0; i < 10; i += 1) stepGame(state, idle, STEP);
    check('mission advances at marker', state.missions.step > step0);
    check('objective text exists', !!state.objective && state.objective.text.length > 0);
    // 7. Save and load round-trip.
    state.cash = 9876;
    saveGame(state);
    const loaded = loadSave();
    check('save/load round-trip', loaded && loaded.cash === 9876);
    // 8. The renderer paints without throwing, minimap included.
    renderer.draw(state, SCREEN_PLAY, false);
    check('render paints', true);
    // 9. Traffic keeps moving on the roads.
    const tcar = state.cars.find((c) => c.kind === 'traffic');
    const tx0 = tcar.x, ty0 = tcar.y;
    for (let i = 0; i < 120; i += 1) stepGame(state, idle, STEP);
    check('traffic moves', Math.hypot(tcar.x - tx0, tcar.y - ty0) > 50);
  } catch (err) {
    results.push(['exception: ' + (err && err.message), false]);
  }
  const passed = results.filter((r) => r[1]).length;
  const lines = results.map(([n, ok]) => `${ok ? 'PASS' : 'FAIL'} ${n}`).join('\n');
  const summary = `TEST ${passed}/${results.length}\n${lines}`;
  document.title = `TEST ${passed}/${results.length}`;
  status.textContent = summary;
  const pre = document.createElement('pre');
  pre.id = 'test-result';
  pre.textContent = summary;
  document.body.appendChild(pre);
}

function runGame() {
  const input = createInput(canvas);
  let state = createGameState(seed);
  let screen = SCREEN_TITLE;
  let hasSave = !!loadSave();
  let accumulator = 0;
  let last = performance.now();
  let prevAction = false;
  let prevPause = false;
  let prevMute = false;
  let prevMissionIndex = 0;

  function startNewGame() {
    state = createGameState(seed);
    startMissions(state.missions, { addMessage: (t, k) => addMessage(state, t, k), audio: state.audio });
    screen = SCREEN_PLAY;
    prevMissionIndex = 0;
    announce('Playing. Marlow\'s first job is on the board.');
  }

  function continueGame() {
    state = createGameState(seed, { fromSave: true });
    const m = currentMission(state.missions);
    if (m) addMessage(state, `Back in Solmar Bay — ${m.name} is still open.`, 'mission');
    screen = SCREEN_PLAY;
    prevMissionIndex = state.missions.index;
    announce('Continuing your game.');
  }

  function applyBusted() {
    const p = state.player;
    if (p.inCar) { p.inCar = null; p.car = null; }
    state.cash = Math.max(0, state.cash - 200);
    state.wanted.heat = 0;
    state.wanted.stars = 0;
    state.wanted.policeCars = [];
    state.wanted.footCops = [];
    p.health = 100;
    p.x = LANDMARKS.policeStation.x;
    p.y = LANDMARKS.policeStation.y + 60;
    state.audio.busted();
    saveGame(state);
  }

  function applyWasted() {
    const p = state.player;
    if (p.inCar) { p.inCar = null; p.car = null; }
    state.cash = Math.max(0, state.cash - 150);
    state.wanted.heat = 0;
    state.wanted.stars = 0;
    state.wanted.policeCars = [];
    state.wanted.footCops = [];
    p.health = 100;
    p.x = LANDMARKS.hospital.x;
    p.y = LANDMARKS.hospital.y + 60;
    state.audio.busted();
    saveGame(state);
  }

  function handleEvents(events) {
    if (events.busted) {
      applyBusted();
      screen = SCREEN_BUSTED;
      announce('Busted. The precinct has you.');
    } else if (events.wasted) {
      applyWasted();
      screen = SCREEN_WASTED;
      announce('Wasted. You wake up at St. Anselm.');
    } else if (events.finale) {
      screen = SCREEN_FINALE;
      saveGame(state);
      announce('The last job is done. Solmar Bay is yours.');
    }
  }

  function step() {
    const intent = readIntent(input);
    const actionPressed = intent.action && !prevAction;
    const pausePressed = intent.pause && !prevPause;
    const mutePressed = intent.mute && !prevMute;
    prevAction = intent.action;
    prevPause = intent.pause;
    prevMute = intent.mute;
    if (mutePressed) {
      state.audio.setMuted(!state.audio.muted);
      addMessage(state, state.audio.muted ? 'Sound off.' : 'Sound on.', 'info');
    }
    if (pausePressed && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    if (pausePressed && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = stepGame(state, { ...intent, actionPressed }, STEP);
    if (state.missions.index !== prevMissionIndex) {
      prevMissionIndex = state.missions.index;
      saveGame(state);
    }
    handleEvents(events);
    input.clicked = false;
  }

  function handleClick() {
    if (!input.clicked) return;
    input.clicked = false;
    state.audio.unlock();
    if (screen === SCREEN_TITLE) {
      // The input stores the mouse in canvas device pixels; back out to client
      // coordinates so the renderer can map them to logical coordinates.
      const rect = canvas.getBoundingClientRect();
      const clientX = rect.left + (input.mouseX / canvas.width) * rect.width;
      const clientY = rect.top + (input.mouseY / canvas.height) * rect.height;
      const logical = renderer.toLogical(clientX, clientY);
      for (const b of titleButtons(hasSave)) {
        if (logical.x >= b.x && logical.x <= b.x + b.w && logical.y >= b.y && logical.y <= b.y + b.h) {
          if (b.id === 'new') startNewGame();
          else continueGame();
          return;
        }
      }
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED || screen === SCREEN_FINALE) {
      screen = SCREEN_PLAY;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (input.anyKey) state.audio.unlock();
    handleClick();
    // Enter starts a game from the title or recovers from busted/wasted/finale.
    if (input.keys.has('Enter') && screen !== SCREEN_PLAY && screen !== SCREEN_PAUSED) {
      if (screen === SCREEN_TITLE) startNewGame();
      else screen = SCREEN_PLAY;
      input.keys.delete('Enter');
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        if (screen === SCREEN_TITLE) {
          // The title's backdrop idles: time passes, nothing plays.
          state.time += STEP;
        } else {
          step();
        }
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(state, screen, hasSave);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('beforeunload', () => {
    if (screen === SCREEN_PLAY) saveGame(state);
  });

  announce('Solmar Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (testMode) runSelfTest();
else if (shot) runShot(shot);
else runGame();
