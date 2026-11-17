// Cars: the player's driving physics, the traffic that fills the roads, and
// the police cars that chase. A car is a position, a heading and a speed;
// traffic follows the road grid, the player drives with arcade physics.
import { CAR, WORLD, clamp, lerp } from './config.js';
import { ROADS, collideBuildings, collideCircle } from './city.js';

const CAR_COLORS = ['#c94f3d', '#3d7dc9', '#d8a23c', '#5a9e6a', '#8a6fc9', '#c9c9c9', '#3a3f4a', '#d86a9e'];
const SPORT_COLORS = ['#ffb02e', '#e8384f', '#37c8e8'];

export function makeCar(x, y, angle, color, kind, model) {
  return {
    x, y, angle, speed: 0, vx: 0, vy: 0,
    color, kind, model: model || 'sedan',
    health: 100, stolen: false,
    // Traffic state: which road it is on and which way it drives.
    horizontal: true, road: 0, dir: 1, lane: 11,
    targetI: 0, targetJ: 0, decidedAt: -1,
    knockX: 0, knockY: 0, dead: false, ramCooldown: 0,
  };
}

function laneOffset(horizontal, dir) {
  if (horizontal) return dir > 0 ? 11 : -11;
  return dir > 0 ? -11 : 11;
}

export function spawnTrafficCar(city, rng, x, y) {
  const horizontal = rng.chance(0.5);
  const road = rng.int(0, ROADS.length - 1);
  const dir = rng.chance(0.5) ? 1 : -1;
  const car = makeCar(
    horizontal ? (x ?? rng.range(200, WORLD.w - 200)) : ROADS[road] + laneOffset(false, dir),
    horizontal ? ROADS[road] + laneOffset(true, dir) : (y ?? rng.range(200, WORLD.h - 200)),
    horizontal ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
    rng.pick(CAR_COLORS), 'traffic', rng.chance(0.12) ? 'van' : 'sedan',
  );
  car.horizontal = horizontal;
  car.road = road;
  car.dir = dir;
  car.lane = laneOffset(horizontal, dir);
  car.speed = rng.range(85, 135);
  return car;
}

export function spawnParkedCars(city, rng) {
  const cars = [];
  for (let i = 0; i < 16; i += 1) {
    const horizontal = rng.chance(0.5);
    const road = rng.int(0, ROADS.length - 1);
    const along = ROADS[rng.int(0, ROADS.length - 1)] + rng.range(-90, 90);
    const side = rng.chance(0.5) ? 1 : -1;
    const x = horizontal ? along : ROADS[road] + side * (38 + 14);
    const y = horizontal ? ROADS[road] + side * (38 + 14) : along;
    if (x < 60 || x > WORLD.w - 60 || y < 60 || y > WORLD.h - 60) continue;
    const car = makeCar(x, y, horizontal ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2),
      rng.pick(CAR_COLORS), 'parked', rng.chance(0.15) ? 'sport' : 'sedan');
    cars.push(car);
  }
  // The one sports car mission 2 wants, parked on Beachfront.
  const sport = makeCar(1190, 2550 + 52, 0, SPORT_COLORS[0], 'parked', 'sport');
  sport.isMissionCar = true;
  cars.push(sport);
  return cars;
}

// One arcade-physics step for a driven car: throttle -1..1, steer -1..1.
export function stepDrivenCar(car, throttle, steer, handbrake, dt, city) {
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  let fSpeed = car.vx * fx + car.vy * fy;
  let lSpeed = -car.vx * fy + car.vy * fx;
  if (throttle > 0) fSpeed += CAR.accel * throttle * dt;
  else if (throttle < 0) fSpeed += (fSpeed > 5 ? -CAR.brake : CAR.reverseAccel * throttle) * dt;
  else fSpeed -= fSpeed * 0.6 * dt;
  if (handbrake) {
    fSpeed -= fSpeed * 1.4 * dt;
    lSpeed *= Math.exp(-1.6 * dt);
  } else {
    lSpeed *= Math.exp(-CAR.grip * dt);
  }
  fSpeed = clamp(fSpeed, -CAR.maxReverse, CAR.maxSpeed);
  // Steering answers even at low speed (an arcade floor of 0.3), so a car
  // creeping through a turn can still turn.
  const steerFactor = clamp(Math.abs(fSpeed) / 200, 0.3, 1);
  car.angle += steer * CAR.turnRate * dt * steerFactor * (fSpeed >= 0 ? 1 : -1);
  const nfx = Math.cos(car.angle), nfy = Math.sin(car.angle);
  car.vx = nfx * fSpeed - nfy * lSpeed;
  car.vy = nfy * fSpeed + nfx * lSpeed;
  car.speed = fSpeed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  const w = collideCircle(car.x, car.y, CAR.radius);
  car.x = w.x; car.y = w.y;
  const hit = collideCarWithBuildings(car, city);
  if (hit) {
    const impact = Math.abs(fSpeed);
    car.vx *= 0.45; car.vy *= 0.45;
    car.speed *= 0.45;
    return impact;
  }
  return 0;
}

// Resolve a car against buildings at its nose and tail; returns true on hit.
export function collideCarWithBuildings(car, city) {
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  let hit = false;
  for (const s of [16, -16]) {
    const px = car.x + fx * s, py = car.y + fy * s;
    const r = collideBuildings(city, px, py, 13);
    if (r.hit) {
      hit = true;
      car.x += r.x - px;
      car.y += r.y - py;
    }
  }
  return hit;
}

// Push two cars apart when they overlap; returns the closing speed.
export function collideCars(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  const min = 30;
  if (d2 >= min * min || d2 === 0) return 0;
  const d = Math.sqrt(d2);
  const push = (min - d) / 2;
  const nx = dx / d, ny = dy / d;
  a.x -= nx * push; a.y -= ny * push;
  b.x += nx * push; b.y += ny * push;
  const closing = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
  // A shove along the impact normal, shared between the two.
  const shove = closing * 0.25;
  a.vx -= nx * shove; a.vy -= ny * shove;
  b.vx += nx * shove; b.vy += ny * shove;
  return closing;
}

// Traffic: follow the road grid, turning at intersections. `rng` is the
// game's seeded generator, so the same seed drives the same traffic.
export function stepTrafficCar(car, dt, rng) {
  if (car.horizontal) {
    car.y = ROADS[car.road] + laneOffset(true, car.dir);
    car.x += car.dir * car.speed * dt;
    car.angle = lerp(car.angle, car.dir > 0 ? 0 : Math.PI, 0.2);
    // At an intersection, pick the next road.
    for (let k = 0; k < ROADS.length; k += 1) {
      const ix = ROADS[k];
      if (Math.abs(car.x - ix) < car.speed * dt + 6 && car.decidedAt !== k * 100 + car.road) {
        car.decidedAt = k * 100 + car.road;
        if (rng.chance(0.45)) {
          // Turn onto the vertical road at this intersection; y stays where it is.
          car.horizontal = false;
          car.road = k;
          car.dir = rng.chance(0.5) ? 1 : -1;
          car.x = ROADS[k] + laneOffset(false, car.dir);
        }
        break;
      }
    }
  } else {
    car.x = ROADS[car.road] + laneOffset(false, car.dir);
    car.y += car.dir * car.speed * dt;
    car.angle = lerp(car.angle, car.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0.2);
    for (let k = 0; k < ROADS.length; k += 1) {
      const iy = ROADS[k];
      if (Math.abs(car.y - iy) < car.speed * dt + 6 && car.decidedAt !== k * 100 + car.road) {
        car.decidedAt = k * 100 + car.road;
        if (rng.chance(0.45)) {
          car.horizontal = true;
          car.road = k;
          car.dir = rng.chance(0.5) ? 1 : -1;
          car.y = ROADS[k] + laneOffset(true, car.dir);
        }
        break;
      }
    }
  }
  // Knock from a crash decays away.
  car.x += car.knockX * dt;
  car.y += car.knockY * dt;
  car.knockX *= Math.exp(-3 * dt);
  car.knockY *= Math.exp(-3 * dt);
  // Wrap around the world edge instead of piling up in a corner.
  if (car.x < 40) car.x = WORLD.w - 60;
  if (car.x > WORLD.w - 40) car.x = 60;
  if (car.y < 40) car.y = WORLD.h - 60;
  if (car.y > WORLD.h - 40) car.y = 60;
}
