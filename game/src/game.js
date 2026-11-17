// The simulation core: one game state and one fixed step that advances it.
// No drawing and no DOM here except the state the renderer reads — main.js
// owns the loop and the screens, shots.js owns the staged scenes.
import {
  WORLD, VIEW_W, VIEW_H, PLAYER, CAR, WANTED, MONEY, clamp, lerp, dist2,
} from './config.js';
import { makeRng } from './rng.js';
import { buildCity, LANDMARKS, collideCircle, collideBuildings } from './city.js';
import { createAudio } from './audio.js';
import { loadSave, writeSave } from './save.js';
import { createPistol, stepPistol, startReload, makeBullets, fireBullet, stepBullets, clampHealth } from './combat.js';
import { makeCar, spawnTrafficCar, spawnParkedCars, stepDrivenCar, stepTrafficCar, collideCars } from './vehicles.js';
import { spawnPeds, stepPed, scarePeds } from './people.js';
import { createWanted, commitCrime, stepWanted, starsOf } from './police.js';
import { createMissions, startMissions, stepMissions, currentObjective } from './missions.js';

export function addMessage(state, text, kind) {
  const colors = { info: '#e8e8e8', good: '#7ee787', danger: '#ff7a7a', mission: '#ffb02e', objective: '#37c8e8' };
  state.messages.push({ text, color: colors[kind] || colors.info, life: 7 });
  if (state.messages.length > 5) state.messages.shift();
}

export function createGameState(seed, opts) {
  const rng = makeRng(seed);
  const city = buildCity(rng);
  const cars = [];
  for (let i = 0; i < 34; i += 1) cars.push(spawnTrafficCar(city, rng));
  for (const c of spawnParkedCars(city, rng)) cars.push(c);
  const state = {
    seed,
    rng,
    city,
    landmarks: LANDMARKS,
    time: 0,
    screen: 'title',
    cash: MONEY.start,
    player: {
      x: LANDMARKS.hideout.x, y: LANDMARKS.hideout.y + 40,
      angle: 0, aimAngle: 0, health: PLAYER.maxHealth,
      inCar: null, car: null,
    },
    pistol: createPistol(),
    cars,
    peds: spawnPeds(rng, 42),
    enemies: [],
    bullets: makeBullets(),
    particles: [],
    wanted: createWanted(),
    missions: createMissions(),
    messages: [],
    camera: { x: 1700, y: 1700 },
    objective: null,
    audio: createAudio(),
    repairCooldown: 0,
    stats: { carsStolen: 0, shotsFired: 0 },
  };
  if (opts && opts.fromSave) {
    const save = loadSave();
    if (save) {
      state.cash = save.cash ?? MONEY.start;
      state.player.x = save.px ?? state.player.x;
      state.player.y = save.py ?? state.player.y;
      state.missions.index = save.mission ?? 0;
      state.missions.active = true;
      if (state.missions.index >= 6) { state.missions.done = true; state.missions.active = false; }
    }
  }
  state.objective = currentObjective(state.missions);
  return state;
}

export function saveGame(state) {
  writeSave({
    cash: state.cash,
    px: Math.round(state.player.x),
    py: Math.round(state.player.y),
    mission: state.missions.index,
  });
}

function spawnParticles(state, x, y, kind, count) {
  for (let i = 0; i < count; i += 1) {
    const a = state.rng.range(0, Math.PI * 2);
    const sp = state.rng.range(20, 90);
    state.particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: state.rng.range(0.3, 0.7), maxLife: 0.7,
      size: kind === 'smoke' ? 7 : 3,
      color: kind === 'smoke' ? 'rgba(90,90,90,A)' : kind === 'spark' ? 'rgba(255,176,46,A)' : 'rgba(255,240,160,A)',
    });
  }
}

function nearestCar(state, x, y, maxDist) {
  let best = null, bestD = maxDist * maxDist;
  for (const car of state.cars) {
    if (car.dead) continue;
    const d = dist2(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  for (const car of state.wanted.policeCars) {
    if (car.dead) continue;
    const d = dist2(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function placePlayerInCar(state, x, y, color, model) {
  const car = makeCar(x, y, 0, color || '#c94f3d', 'player', model || 'sedan');
  car.stolen = true;
  state.cars.push(car);
  state.player.inCar = car;
  state.player.car = car;
  state.player.x = x;
  state.player.y = y;
  return car;
}

export function setWanted(state, stars) {
  state.wanted.heat = stars * WANTED.heatPerStar;
  state.wanted.stars = stars;
  state.wanted.quietTimer = 0;
}

export function setMission(state, index, step) {
  state.missions.active = true;
  state.missions.index = index;
  state.missions.step = step || 0;
  state.missions.done = false;
  state.objective = currentObjective(state.missions);
}

function spawnGang(state, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    state.enemies.push({
      x: x + state.rng.range(-70, 70),
      y: y + state.rng.range(-70, 70),
      angle: 0, health: 60, shootTimer: state.rng.range(0.5, 1.5),
      dead: false, radius: 13,
    });
  }
}

function spawnTaxiPed(state) {
  const p = state.player;
  for (const ped of state.peds) {
    if (ped.down || ped.taxi) continue;
    const d = Math.hypot(ped.x - p.x, ped.y - p.y);
    if (d > 120 && d < 420) {
      ped.taxi = true;
      return ped;
    }
  }
  return null;
}

// One fixed step of the whole game. `intent` is readIntent()'s shape plus
// actionPressed / pausePressed / mutePressed edge flags and mouse position in
// logical view coordinates. Returns {busted, wasted, finale}.
export function stepGame(state, intent, dt) {
  const events = { busted: false, wasted: false, finale: false };
  const p = state.player;
  const rng = state.rng;
  state.time += dt;

  // --- Player on foot or in a car ---
  if (p.inCar) {
    const car = p.car;
    const steer = (intent.left ? -1 : 0) + (intent.right ? 1 : 0);
    const throttle = intent.up ? 1 : intent.down ? -1 : 0;
    const impact = stepDrivenCar(car, throttle, steer, intent.brake, dt, state.city);
    p.x = car.x;
    p.y = car.y;
    p.aimAngle = car.angle;
    if (impact > 120) {
      car.health -= impact * 0.06;
      state.audio.crash(impact / 400);
      spawnParticles(state, car.x, car.y, 'spark', 6);
      scarePeds(state.peds, car.x, car.y, 260);
    }
    if (car.health <= 0 && !car.dead) {
      car.dead = true;
      car.speed = 0;
      addMessage(state, 'The car is wrecked — get out!', 'danger');
      p.inCar = null;
      p.car = null;
      p.x = car.x + 30;
      p.y = car.y;
    }
    // Hitting pedestrians with the car.
    if (Math.abs(car.speed) > 70) {
      for (const ped of state.peds) {
        if (ped.down) continue;
        if (dist2(car.x, car.y, ped.x, ped.y) < 26 * 26) {
          ped.down = true;
          ped.downTimer = 5;
          ped.taxi = false;
          commitCrime(state.wanted, WANTED.hitPed);
          addMessage(state, 'You hit a pedestrian! The heat is on.', 'danger');
          state.audio.crash(0.5);
          scarePeds(state.peds, car.x, car.y, 320);
          spawnParticles(state, ped.x, ped.y, 'smoke', 4);
        }
      }
    }
    // Repair shop: drive in, pay, patch up and cool off one star.
    const rs = LANDMARKS.repairShop;
    if (state.repairCooldown <= 0 && Math.hypot(car.x - rs.x, car.y - rs.y) < 70
      && (car.health < 100 || state.wanted.stars > 0) && state.cash >= MONEY.repairCost) {
      state.cash -= MONEY.repairCost;
      car.health = 100;
      car.dead = false;
      state.wanted.heat = Math.max(0, state.wanted.heat - WANTED.heatPerStar);
      state.wanted.stars = starsOf(state.wanted.heat);
      state.repairCooldown = 5;
      state.audio.pickup();
      addMessage(state, `Rico's Auto: repaired and one star cooler (-$${MONEY.repairCost}).`, 'good');
    }
    if (intent.actionPressed) {
      p.inCar = null;
      p.car = null;
      const side = car.angle + Math.PI / 2;
      p.x = car.x + Math.cos(side) * 30;
      p.y = car.y + Math.sin(side) * 30;
      const fixed = collideBuildings(state.city, p.x, p.y, PLAYER.radius);
      p.x = fixed.x; p.y = fixed.y;
    }
  } else {
    const speed = intent.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    let mx = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
    let my = (intent.down ? 1 : 0) - (intent.up ? 1 : 0);
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len; my /= len;
      p.x += mx * speed * dt;
      p.y += my * speed * dt;
      p.angle = Math.atan2(my, mx);
    }
    const moved = collideBuildings(state.city, p.x, p.y, PLAYER.radius);
    p.x = moved.x; p.y = moved.y;
    const edge = collideCircle(p.x, p.y, PLAYER.radius);
    p.x = edge.x; p.y = edge.y;
    // Aim follows the mouse.
    const wx = intent.mouseX + state.camera.x - VIEW_W / 2;
    const wy = intent.mouseY + state.camera.y - VIEW_H / 2;
    p.aimAngle = Math.atan2(wy - p.y, wx - p.x);
    // Shooting.
    if (intent.reload) startReload(state.pistol);
    const fired = stepPistol(state.pistol, dt, intent.shoot, true);
    if (fired) {
      state.stats.shotsFired += 1;
      state.audio.gunshot();
      fireBullet(state.bullets, p.x + Math.cos(p.aimAngle) * 18, p.y + Math.sin(p.aimAngle) * 18,
        p.aimAngle + rng.range(-0.03, 0.03), 900, PLAYER.pistolDamage, true);
      spawnParticles(state, p.x + Math.cos(p.aimAngle) * 22, p.y + Math.sin(p.aimAngle) * 22, 'flash', 3);
      commitCrime(state.wanted, 2); // a shot rings out
      scarePeds(state.peds, p.x, p.y, 300);
    }
    // Enter / steal a car.
    if (intent.actionPressed) {
      const car = nearestCar(state, p.x, p.y, 52);
      if (car) {
        if (!car.stolen) {
          car.stolen = true;
          state.stats.carsStolen += 1;
          commitCrime(state.wanted, WANTED.stealCar);
          addMessage(state, 'Car stolen! The heat is on.', 'danger');
          state.audio.pickup();
        }
        car.kind = 'player';
        p.inCar = car;
        p.car = car;
        p.x = car.x;
        p.y = car.y;
      }
    }
  }

  // --- Traffic ---
  for (const car of state.cars) {
    if (car === p.car || car.dead) continue;
    if (car.kind === 'traffic') stepTrafficCar(car, dt, rng);
  }
  // Car-to-car collisions (player car vs the world, traffic vs traffic).
  const allCars = [...state.cars, ...state.wanted.policeCars];
  for (let i = 0; i < allCars.length; i += 1) {
    for (let j = i + 1; j < allCars.length; j += 1) {
      const a = allCars[i], b = allCars[j];
      if (a.dead || b.dead) continue;
      if (a.kind === 'parked' && b.kind === 'parked') continue;
      const closing = collideCars(a, b);
      if (closing > 160) {
        a.health -= closing * 0.03;
        b.health -= closing * 0.03;
        if ((a === p.car || b === p.car) && closing > 200) {
          state.audio.crash(closing / 500);
          spawnParticles(state, (a.x + b.x) / 2, (a.y + b.y) / 2, 'spark', 5);
        }
        if (a.kind === 'traffic' || b.kind === 'traffic') {
          const t = a.kind === 'traffic' ? a : b;
          t.knockX += (t.x - (t === a ? b.x : a.x)) * 0.5;
          t.knockY += (t.y - (t === a ? b.y : a.y)) * 0.5;
        }
      }
      if (a.health <= 0) a.dead = true;
      if (b.health <= 0) b.dead = true;
    }
  }

  // --- Pedestrians ---
  const threats = [{ x: p.x, y: p.y }];
  if (p.inCar) threats.push({ x: p.car.x, y: p.car.y });
  for (const cop of state.wanted.footCops) threats.push({ x: cop.x, y: cop.y });
  for (const ped of state.peds) stepPed(ped, dt, rng, threats);

  // --- Gang members (mission 4) ---
  for (const g of state.enemies) {
    if (g.dead) continue;
    const dx = p.x - g.x, dy = p.y - g.y;
    const d = Math.hypot(dx, dy);
    g.angle = Math.atan2(dy, dx);
    if (d > 240) {
      g.x += (dx / d) * 90 * dt;
      g.y += (dy / d) * 90 * dt;
    }
    g.shootTimer -= dt;
    if (g.shootTimer <= 0 && d < 380) {
      g.shootTimer = 1.1 + rng.range(0, 0.6);
      fireBullet(state.bullets, g.x, g.y, g.angle + rng.range(-0.3, 0.3), 480, 7, false);
      state.audio.gunshot();
    }
  }

  // --- Bullets ---
  const targets = [
    ...state.enemies,
    ...state.wanted.footCops,
    ...state.peds.filter((ped) => !ped.down),
    ...allCars.filter((c) => c !== p.car),
    p,
  ];
  const hits = stepBullets(state.bullets, dt, state.city, targets);
  for (const hit of hits) {
    if (hit.spark) {
      spawnParticles(state, hit.x, hit.y, 'spark', 3);
      continue;
    }
    const t = hit.target;
    if (!t) continue;
    if (t === p) {
      p.health = clampHealth(p.health - hit.damage);
      if (p.health <= 0) events.wasted = true;
    } else if (t.health !== undefined && t.kind !== undefined) {
      // A car takes the bullet.
      t.health -= hit.damage;
      spawnParticles(state, hit.x, hit.y, 'spark', 4);
      if (t.health <= 0) t.dead = true;
    } else if (t.shootTimer !== undefined) {
      // A gang member or a foot cop.
      t.health -= hit.damage;
      if (t.health <= 0) {
        t.dead = true;
        if (state.enemies.includes(t)) {
          state.missions.kills += 1;
          addMessage(state, `Viper down (${state.missions.kills}/3).`, 'good');
        } else {
          commitCrime(state.wanted, WANTED.killCop);
          addMessage(state, 'You shot a cop! Every unit in the city is coming.', 'danger');
        }
      }
    } else {
      // A pedestrian.
      t.down = true;
      t.downTimer = 6;
      commitCrime(state.wanted, WANTED.hitPed);
      addMessage(state, 'You shot a pedestrian!', 'danger');
    }
  }
  state.enemies = state.enemies.filter((g) => !g.dead);
  state.wanted.policeCars = state.wanted.policeCars.filter((c) => !c.dead);

  // --- Wanted / police ---
  stepWanted(state.wanted, dt, {
    px: p.x, py: p.y, inCar: !!p.inCar, playerCar: p.car,
    city: state.city, rng, bullets: state.bullets, player: p,
    onBusted: () => { events.busted = true; },
    onCrash: (closing) => {
      if (p.car) {
        p.car.health -= closing * 0.05;
        state.audio.crash(closing / 500);
        spawnParticles(state, p.car.x, p.car.y, 'spark', 6);
      }
    },
    onShot: () => state.audio.gunshot(),
  });

  // --- Missions ---
  const missionCtx = {
    px: p.x, py: p.y, inCar: !!p.inCar, car: p.car,
    wanted: state.wanted, rng, city: state.city,
    cash: state.cash,
    addMessage: (t, k) => addMessage(state, t, k),
    audio: state.audio,
    spawnGang: (x, y, n) => spawnGang(state, x, y, n),
    spawnTaxiPed: () => spawnTaxiPed(state),
    onFinale: () => { events.finale = true; },
  };
  stepMissions(state.missions, dt, missionCtx);
  state.cash = missionCtx.cash;
  state.objective = currentObjective(state.missions);

  // --- Particles, messages, camera ---
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const pt = state.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    state.messages[i].life -= dt;
    if (state.messages[i].life <= 0) state.messages.splice(i, 1);
  }
  const camTargetX = clamp(p.x, VIEW_W / 2, WORLD.w - VIEW_W / 2);
  const camTargetY = clamp(p.y, VIEW_H / 2, WORLD.h - VIEW_H / 2);
  state.camera.x = lerp(state.camera.x, camTargetX, 1 - Math.exp(-6 * dt));
  state.camera.y = lerp(state.camera.y, camTargetY, 1 - Math.exp(-6 * dt));
  if (state.repairCooldown > 0) state.repairCooldown -= dt;

  // Audio follows the drive.
  const driving = !!p.inCar;
  state.audio.engine(driving ? Math.abs(p.car.speed) / CAR.maxSpeed : 0, driving);
  state.audio.update(dt, driving, state.wanted.stars);

  // Slow health regen out of trouble.
  if (state.wanted.stars === 0 && p.health > 0 && p.health < PLAYER.maxHealth) {
    p.health = clampHealth(p.health + 2 * dt);
  }
  return events;
}
