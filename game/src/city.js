// Solmar Bay itself: a seeded grid city with roads, blocks, buildings, parks,
// trees, water and the named places the story uses. Everything is placed from
// one seed, so the same seed always builds the same city.
import { BLOCK, ROAD_COUNT, ROAD_W, WATER_EAST, BEACH_SOUTH, WORLD, clamp } from './config.js';

export const ROADS = [];
for (let i = 0; i < ROAD_COUNT; i += 1) ROADS.push(170 + i * BLOCK);

// The named places the missions and the free-roam jobs use. Each sits on or
// beside a road intersection, so a car can always reach it.
export const LANDMARKS = {
  hideout: { x: 510, y: 510, name: 'Hideout' },
  docks: { x: 2890, y: 1190, name: 'Docks' },
  garage: { x: 1530, y: 1530, name: "Marlow's Garage" },
  sportsCar: { x: 1190, y: 2550, name: 'Sports car' },
  packagePickup: { x: 510, y: 2890, name: 'Package pickup' },
  packageDrop: { x: 2890, y: 510, name: 'Package drop' },
  warehouse: { x: 2550, y: 510, name: 'Warehouse' },
  bank: { x: 2550, y: 1530, name: 'Marina Bank' },
  boat: { x: 2980, y: 2550, name: 'Escape boat' },
  repairShop: { x: 850, y: 1870, name: "Rico's Auto" },
  hospital: { x: 1870, y: 850, name: 'St. Anselm Hospital' },
  policeStation: { x: 1870, y: 1870, name: 'Central Precinct' },
};

const ROOFS = ['roofA', 'roofB', 'roofC', 'roofD', 'roofE'];
const PARK_BLOCKS = ['2,5', '5,2', '6,6'];

export function buildCity(rng) {
  const buildings = [];
  const trees = [];
  const parks = [];

  for (let i = 0; i < ROAD_COUNT - 1; i += 1) {
    for (let j = 0; j < ROAD_COUNT - 1; j += 1) {
      const x0 = ROADS[i] + ROAD_W / 2 + 10;
      const x1 = ROADS[i + 1] - ROAD_W / 2 - 10;
      const y0 = ROADS[j] + ROAD_W / 2 + 10;
      const y1 = ROADS[j + 1] - ROAD_W / 2 - 10;
      const key = `${i},${j}`;
      if (PARK_BLOCKS.includes(key)) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        const count = rng.int(6, 10);
        for (let t = 0; t < count; t += 1) {
          trees.push({ x: rng.range(x0 + 14, x1 - 14), y: rng.range(y0 + 14, y1 - 14), s: rng.range(9, 15) });
        }
        continue;
      }
      const downtown = i >= 3 && i <= 5 && j >= 3 && j <= 5;
      const marina = i >= 6;
      const count = downtown ? rng.int(1, 2) : rng.int(2, 4);
      // Split the block into parcels and put one building in each.
      const cols = count <= 2 ? 1 : 2;
      const rows = Math.ceil(count / cols);
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          if (buildings.length >= 400) break;
          const px0 = x0 + (c * (x1 - x0)) / cols;
          const px1 = x0 + ((c + 1) * (x1 - x0)) / cols;
          const py0 = y0 + (r * (y1 - y0)) / rows;
          const py1 = y0 + ((r + 1) * (y1 - y0)) / rows;
          const w = rng.range((px1 - px0) * 0.45, (px1 - px0) * 0.8);
          const h = rng.range((py1 - py0) * 0.45, (py1 - py0) * 0.8);
          const x = px0 + (px1 - px0 - w) / 2;
          const y = py0 + (py1 - py0 - h) / 2;
          buildings.push({
            x, y, w, h,
            hgt: downtown ? rng.range(34, 96) : marina ? rng.range(10, 20) : rng.range(12, 30),
            roof: rng.pick(ROOFS),
            downtown,
          });
        }
      }
      // A few sidewalk trees around the block.
      const treeCount = rng.int(1, 3);
      for (let t = 0; t < treeCount; t += 1) {
        const side = rng.int(0, 3);
        if (side === 0) trees.push({ x: rng.range(x0, x1), y: y0 - 6, s: rng.range(8, 12) });
        else if (side === 1) trees.push({ x: rng.range(x0, x1), y: y1 + 6, s: rng.range(8, 12) });
        else if (side === 2) trees.push({ x: x0 - 6, y: rng.range(y0, y1), s: rng.range(8, 12) });
        else trees.push({ x: x1 + 6, y: rng.range(y0, y1), s: rng.range(8, 12) });
      }
    }
  }

  return { buildings, trees, parks };
}

// Is this point on a road (asphalt, not kerb)?
export function onRoad(x, y) {
  for (const r of ROADS) {
    if (Math.abs(x - r) <= ROAD_W / 2) return true;
    if (Math.abs(y - r) <= ROAD_W / 2) return true;
  }
  return false;
}

export function inWater(x, y) {
  return x >= WATER_EAST || y >= BEACH_SOUTH;
}

// Push a circle out of every building, the water and the world edge.
// Returns the corrected position and whether anything was hit.
export function collideCircle(x, y, r) {
  let hit = false;
  x = clamp(x, r, WORLD.w - r);
  y = clamp(y, r, WORLD.h - r);
  if (x + r > WATER_EAST && y < BEACH_SOUTH - 40) { x = WATER_EAST - r; hit = true; }
  if (y + r > BEACH_SOUTH && x < WATER_EAST - 40) { y = BEACH_SOUTH - r; hit = true; }
  return { x, y, hit };
}

export function collideBuildings(city, x, y, r) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * r;
      y = cy + (dy / d) * r;
    } else {
      // Centre inside the rectangle: push out along the smallest overlap.
      const left = x - b.x, right = b.x + b.w - x, top = y - b.y, bottom = b.y + b.h - y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = b.x - r;
      else if (m === right) x = b.x + b.w + r;
      else if (m === top) y = b.y - r;
      else y = b.y + b.h + r;
    }
  }
  return { x, y, hit };
}

// The nearest point on a road centreline, and the road's direction there.
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const r of ROADS) {
    const d = Math.abs(x - r);
    if (d < bestD) { bestD = d; best = { x: r, y: clamp(y, 0, WORLD.h), angle: Math.PI / 2, horizontal: false }; }
  }
  for (const r of ROADS) {
    const d = Math.abs(y - r);
    if (d < bestD) { bestD = d; best = { x: clamp(x, 0, WORLD.w), y: r, angle: 0, horizontal: true }; }
  }
  return best;
}

// The nearest intersection to a point.
export function nearestIntersection(x, y) {
  let bi = 0, bj = 0, best = Infinity;
  for (let i = 0; i < ROADS.length; i += 1) {
    for (let j = 0; j < ROADS.length; j += 1) {
      const d = (ROADS[i] - x) ** 2 + (ROADS[j] - y) ** 2;
      if (d < best) { best = d; bi = i; bj = j; }
    }
  }
  return { i: bi, j: bj, x: ROADS[bi], y: ROADS[bj] };
}
