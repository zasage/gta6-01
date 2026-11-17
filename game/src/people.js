// Pedestrians: the people of Solmar Bay. They stroll the sidewalks between
// intersections, scatter when a car screams past or a shot rings out, and a
// few of them flag taxis. A pedestrian is never scenery with a health bar —
// hitting one is a crime the police notice.
import { WORLD, clamp } from './config.js';
import { ROADS, nearestRoadPoint } from './city.js';

const SHIRTS = ['#e8e8e8', '#d86a9e', '#5a9e6a', '#c9a23c', '#7d8ac9', '#c94f3d', '#3d7dc9', '#e8b13c'];

export function makePed(rng, x, y) {
  const near = nearestRoadPoint(x ?? rng.range(200, WORLD.w - 200), y ?? rng.range(200, WORLD.h - 200));
  return {
    x: near.x + (near.horizontal ? 0 : (rng.chance(0.5) ? 52 : -52)),
    y: near.y + (near.horizontal ? (rng.chance(0.5) ? 52 : -52) : 0),
    angle: rng.range(0, Math.PI * 2),
    speed: rng.range(28, 52),
    shirt: rng.pick(SHIRTS),
    walkPhase: rng.range(0, Math.PI * 2),
    target: null,
    scared: 0,
    down: false,
    downTimer: 0,
    taxi: false,
    taxiDest: null,
  };
}

export function spawnPeds(rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) peds.push(makePed(rng));
  return peds;
}

function pickTarget(ped, rng) {
  const inter = { x: ROADS[rng.int(0, ROADS.length - 1)], y: ROADS[rng.int(0, ROADS.length - 1)] };
  ped.target = inter;
}

// One step: stroll toward the target, or run away while scared.
export function stepPed(ped, dt, rng, threats) {
  if (ped.down) {
    ped.downTimer -= dt;
    if (ped.downTimer <= 0) { ped.down = false; ped.scared = 2; }
    return;
  }
  if (!ped.target) pickTarget(ped, rng);
  let tx = ped.target.x, ty = ped.target.y;
  let speed = ped.speed;
  if (ped.scared > 0) {
    ped.scared -= dt;
    // Run away from the nearest threat.
    let threat = null, best = Infinity;
    for (const t of threats) {
      const d = (t.x - ped.x) ** 2 + (t.y - ped.y) ** 2;
      if (d < best) { best = d; threat = t; }
    }
    if (threat) {
      const dx = ped.x - threat.x, dy = ped.y - threat.y;
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      tx = ped.x + (dx / d) * 200;
      ty = ped.y + (dy / d) * 200;
      speed = ped.speed * 2.6;
    }
  }
  const dx = tx - ped.x, dy = ty - ped.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 12) {
    ped.target = null;
    return;
  }
  ped.angle = Math.atan2(dy, dx);
  ped.x += (dx / d) * speed * dt;
  ped.y += (dy / d) * speed * dt;
  ped.walkPhase += dt * speed * 0.08;
  ped.x = clamp(ped.x, 30, WORLD.w - 30);
  ped.y = clamp(ped.y, 30, WORLD.h - 30);
}

export function scarePeds(peds, x, y, radius) {
  for (const ped of peds) {
    const d2 = (ped.x - x) ** 2 + (ped.y - y) ** 2;
    if (d2 < radius * radius) ped.scared = Math.max(ped.scared, 3);
  }
}
