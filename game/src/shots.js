// The screenshot scenes behind ?shot=title|drive|chase|mission. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot that follows the road grid, so the
// frame is what real play looks like and the same seed always gives the
// same frame.
import { STEP } from './config.js';
import { createGameState, stepGame, placePlayerInCar, setWanted, setMission } from './game.js';
import { stepTrafficCar } from './vehicles.js';
import { stepPed } from './people.js';
import { SCREEN_TITLE, SCREEN_PLAY } from './render.js';

// An autopilot that drives a route of intersections: aim at the next
// waypoint, brake for sharp turns, advance when close.
function makeDriver(route) {
  let leg = 0;
  return function driveIntent(state) {
    const car = state.player.car;
    if (!car) return { up: false, down: false, left: false, right: false, run: false, brake: false, action: false, reload: false, pause: false, mute: false, shoot: false, mouseX: 640, mouseY: 360 };
    const target = route[Math.min(leg, route.length - 1)];
    const dx = target[0] - car.x, dy = target[1] - car.y;
    if (Math.hypot(dx, dy) < 70 && leg < route.length - 1) leg += 1;
    const want = Math.atan2(dy, dx);
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return {
      up: Math.abs(diff) < 1.1, down: false,
      left: diff < -0.08, right: diff > 0.08,
      run: false, brake: Math.abs(diff) >= 1.1,
      action: false, reload: false, pause: false, mute: false,
      shoot: false, mouseX: 640, mouseY: 360,
    };
  };
}

// An autopilot that walks toward a point.
function walkIntent(state, tx, ty) {
  const dx = tx - state.player.x, dy = ty - state.player.y;
  return {
    up: dy < -24, down: dy > 24, left: dx < -24, right: dx > 24,
    run: true, brake: false, action: false, reload: false,
    pause: false, mute: false, shoot: false, mouseX: 640, mouseY: 360,
  };
}

// The title screen's backdrop: traffic and pedestrians move, the camera
// drifts over Downtown.
function attractStep(state, dt) {
  state.time += dt;
  for (const car of state.cars) {
    if (car.kind === 'traffic') stepTrafficCar(car, dt, state.rng);
  }
  for (const ped of state.peds) stepPed(ped, dt, state.rng, []);
  state.camera.x = 1700 + Math.sin(state.time * 0.05) * 260;
  state.camera.y = 1500 + Math.cos(state.time * 0.04) * 180;
}

export function stageShot(name, seed) {
  const state = createGameState(seed);
  if (name === 'title') {
    for (let i = 0; i < 6 / STEP; i += 1) attractStep(state, STEP);
    return { state, screen: SCREEN_TITLE };
  }
  if (name === 'drive') {
    const car = placePlayerInCar(state, 1530, 1700, '#e8384f', 'sport');
    car.angle = -Math.PI / 2; // facing north, up the road
    const drive = makeDriver([[1530, 1530], [1870, 1530], [2210, 1530], [2550, 1530], [2890, 1530], [2890, 1190]]);
    for (let i = 0; i < 9 / STEP; i += 1) stepGame(state, drive(state), STEP);
    return { state, screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    const car = placePlayerInCar(state, 1870, 1530, '#ffb02e', 'sedan');
    car.angle = Math.PI; // facing west, down the road
    setWanted(state, 3);
    const drive = makeDriver([[1530, 1530], [1190, 1530], [850, 1530], [510, 1530], [510, 1870], [510, 2210], [510, 2550], [510, 2890]]);
    for (let i = 0; i < 10 / STEP; i += 1) stepGame(state, drive(state), STEP);
    return { state, screen: SCREEN_PLAY };
  }
  // mission: The Package, on foot at the Marina. No wanted level here — the
  // chase scene already shows the police; this one shows the mission itself.
  setMission(state, 2, 1);
  state.missions.hasPackage = true;
  state.player.x = 2620;
  state.player.y = 800;
  for (let i = 0; i < 4 / STEP; i += 1) stepGame(state, walkIntent(state, 2890, 510), STEP);
  return { state, screen: SCREEN_PLAY };
}
