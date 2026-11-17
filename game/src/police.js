// The wanted level: heat that rises with every crime, stars the city answers
// with, police cars that chase and ram, and foot patrols that move in when
// the heat is high. Lay low, and the heat cools; get caught on foot, and it
// is over.
import { WANTED, WORLD, clamp, angleLerp } from './config.js';
import { ROADS, collideBuildings, collideCircle, nearestRoadPoint } from './city.js';
import { makeCar, stepDrivenCar, collideCars } from './vehicles.js';
import { fireBullet } from './combat.js';

export function createWanted() {
  return { heat: 0, stars: 0, quietTimer: 0, policeCars: [], footCops: [], spawnTimer: 0 };
}

export function starsOf(heat) {
  return clamp(Math.floor(heat / WANTED.heatPerStar), 0, WANTED.maxStars);
}

export function commitCrime(wanted, heat) {
  wanted.heat = clamp(wanted.heat + heat, 0, 100);
  wanted.quietTimer = 0;
  wanted.stars = starsOf(wanted.heat);
}

function spawnPoliceCar(wanted, ctx) {
  const rng = ctx.rng;
  const angle = rng.range(0, Math.PI * 2);
  const dist = rng.range(420, 620);
  const near = nearestRoadPoint(ctx.px + Math.cos(angle) * dist, ctx.py + Math.sin(angle) * dist);
  const car = makeCar(near.x, near.y, near.angle, '#1c2430', 'police', 'sedan');
  car.speed = 0;
  car.vx = 0; car.vy = 0;
  wanted.policeCars.push(car);
  return car;
}

function spawnFootCop(wanted, ctx) {
  const rng = ctx.rng;
  const angle = rng.range(0, Math.PI * 2);
  const dist = rng.range(260, 420);
  const cop = {
    x: clamp(ctx.px + Math.cos(angle) * dist, 40, WORLD.w - 40),
    y: clamp(ctx.py + Math.sin(angle) * dist, 40, WORLD.h - 40),
    angle: 0, speed: 0, health: 60, shootTimer: rng.range(0.4, 1.2), dead: false, radius: 13,
  };
  wanted.footCops.push(cop);
  return cop;
}

// Step the whole wanted system. ctx: {px, py, inCar, playerCar, city, rng,
// bullets, player, onBusted, onDamage}. Returns nothing; busted/wasted are
// reported through ctx callbacks so the main loop owns the screens.
export function stepWanted(wanted, dt, ctx) {
  // Heat cools only after a quiet spell with no police close by.
  const anyNear = wanted.policeCars.some((c) => (c.x - ctx.px) ** 2 + (c.y - ctx.py) ** 2 < WANTED.sightRange ** 2)
    || wanted.footCops.some((c) => (c.x - ctx.px) ** 2 + (c.y - ctx.py) ** 2 < WANTED.sightRange ** 2);
  if (anyNear) wanted.quietTimer = 0;
  else wanted.quietTimer += dt;
  if (wanted.quietTimer > WANTED.decayDelay && wanted.heat > 0) {
    wanted.heat = Math.max(0, wanted.heat - WANTED.decayRate * dt);
  }
  wanted.stars = starsOf(wanted.heat);

  // Police cars: one per star, up to five.
  const wantCars = wanted.stars;
  wanted.spawnTimer -= dt;
  if (wanted.policeCars.length < wantCars && wanted.spawnTimer <= 0) {
    spawnPoliceCar(wanted, ctx);
    wanted.spawnTimer = 1.2;
  }
  if (wanted.policeCars.length > wantCars) wanted.policeCars.length = wantCars;

  // Chase: steer at the player's predicted position, throttle on — but back
  // off for a beat after a ram, so three cars cannot shred the player at once.
  for (const car of wanted.policeCars) {
    const lead = 0.35;
    const tx = ctx.px + (ctx.playerCar ? ctx.playerCar.vx * lead : 0);
    const ty = ctx.py + (ctx.playerCar ? ctx.playerCar.vy * lead : 0);
    const wantAngle = Math.atan2(ty - car.y, tx - car.x);
    let diff = wantAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = clamp(diff * 2.2, -1, 1);
    const dist = Math.hypot(tx - car.x, ty - car.y);
    let throttle = dist > 60 ? 1 : 0.4;
    if (car.ramCooldown > 0) {
      car.ramCooldown -= dt;
      throttle = 0.25;
    }
    stepDrivenCar(car, throttle, steer, false, dt, ctx.city);
    // Too far behind to matter: reappear on a road near the player.
    if (dist > 1100) {
      const near = nearestRoadPoint(ctx.px + (ctx.rng.range(-1, 1)) * 450, ctx.py + (ctx.rng.range(-1, 1)) * 450);
      car.x = near.x; car.y = near.y;
      car.vx = 0; car.vy = 0; car.speed = 0;
    }
    // Ram the player's car.
    if (ctx.playerCar) {
      const closing = collideCars(car, ctx.playerCar);
      if (closing > 140 && ctx.onCrash) ctx.onCrash(closing, car);
    }
  }

  // Foot patrols from three stars up.
  const wantCops = wanted.stars >= 3 ? wanted.stars - 2 : 0;
  if (wanted.footCops.length < wantCops && wanted.spawnTimer <= 0) {
    spawnFootCop(wanted, ctx);
    wanted.spawnTimer = 1.2;
  }
  if (wanted.footCops.length > wantCops) wanted.footCops.length = wantCops;

  for (const cop of wanted.footCops) {
    if (cop.dead) continue;
    const dx = ctx.px - cop.x, dy = ctx.py - cop.y;
    const d = Math.hypot(dx, dy);
    cop.angle = Math.atan2(dy, dx);
    if (d > 26) {
      cop.x += (dx / d) * 205 * dt;
      cop.y += (dy / d) * 205 * dt;
    }
    const moved = collideBuildings(ctx.city, cop.x, cop.y, 12);
    cop.x = moved.x; cop.y = moved.y;
    const edge = collideCircle(cop.x, cop.y, 12);
    cop.x = edge.x; cop.y = edge.y;
    // Caught on foot: busted.
    if (!ctx.inCar && d < WANTED.bustRange && ctx.onBusted) ctx.onBusted();
    // Shoot when close enough, badly on purpose.
    cop.shootTimer -= dt;
    if (cop.shootTimer <= 0 && d < 340) {
      cop.shootTimer = 0.9 + ctx.rng.range(0, 0.5);
      const spread = ctx.rng.range(-0.25, 0.25);
      fireBullet(ctx.bullets, cop.x, cop.y, cop.angle + spread, 520, 8, false);
      if (ctx.onShot) ctx.onShot();
    }
  }
  wanted.footCops = wanted.footCops.filter((c) => !c.dead);
}
