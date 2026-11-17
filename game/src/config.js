// Solmar Bay — shared tuning, palette and world constants.
// Everything the other modules agree on lives here, so a number only ever
// changes in one place.
export const WORLD = { w: 3400, h: 3400 };
export const BLOCK = 340; // distance between road centrelines
export const ROAD_W = 76; // road width, kerb to kerb
export const ROAD_COUNT = 9; // roads each way, at 170 + i * BLOCK
export const WATER_EAST = 3060; // the marina water starts here
export const BEACH_SOUTH = 3060; // the sand starts here
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const STEP = 1 / 60; // fixed simulation step

// Golden-hour palette: warm sun, dusty asphalt, painted stucco.
export const PALETTE = {
  grass: '#7fae5a',
  grassDry: '#a8b060',
  sand: '#e8d194',
  water: '#2f7fa8',
  waterDeep: '#256b92',
  asphalt: '#4a4a52',
  asphaltDark: '#3d3d45',
  lane: '#e8d97a',
  kerb: '#c9c2b4',
  sidewalk: '#b8ad9c',
  roofA: '#b5543c',
  roofB: '#c07a45',
  roofC: '#7d8a99',
  roofD: '#5f7d5a',
  roofE: '#8a6f8f',
  wall: '#d8cbb2',
  park: '#6da34e',
  tree: '#3f7d3a',
  treeLight: '#5da24a',
  hud: '#10141c',
  hudPanel: 'rgba(12,16,24,0.78)',
  accent: '#ffb02e',
  accent2: '#37c8e8',
  danger: '#e8384f',
  money: '#7ee787',
};

// The player, Rae Calloway — a getaway driver in debt to the fixer Marlow Vane.
export const PLAYER = {
  walkSpeed: 165,
  runSpeed: 265,
  radius: 13,
  maxHealth: 100,
  pistolDamage: 34,
  pistolRange: 420,
  pistolRate: 0.22, // seconds between shots
  magazine: 12,
  reloadTime: 1.1,
};

// Car handling. A stolen sedan is not a race car: it leans, it slides a little.
export const CAR = {
  accel: 380,
  brake: 620,
  reverseAccel: 260,
  maxSpeed: 430,
  maxReverse: 180,
  turnRate: 4.0, // radians per second at full lock; a city block is 340 wide
  grip: 8.0, // how fast sideways velocity bleeds off
  radius: 16,
  length: 44,
  width: 22,
};

export const WANTED = {
  maxStars: 5,
  heatPerStar: 20, // heat 0..100, stars = floor(heat / 20)
  stealCar: 22,
  hitPed: 30,
  shoot: 18,
  killCop: 40,
  decayDelay: 14, // seconds quiet before heat starts falling
  decayRate: 3.5, // heat per second while hidden
  sightRange: 560, // police spot the player inside this
  bustRange: 34, // a cop this close on foot busts the player
};

// Money. Mission payouts grow; taxi fares pay by distance.
export const MONEY = {
  start: 120,
  repairCost: 150,
  taxiBase: 25,
  taxiPerUnit: 0.045,
};

export const DISTRICTS = [
  { name: 'Downtown', x0: 1020, y0: 1020, x1: 2040, y1: 2040, tall: true },
  { name: 'Old Town', x0: 0, y0: 0, x1: 1020, y1: 2040, tall: false },
  { name: 'The Hills', x0: 0, y0: 0, x1: 3400, y1: 1020, tall: false },
  { name: 'Marina', x0: 2040, y0: 0, x1: 3400, y1: 3400, tall: false },
  { name: 'Beachfront', x0: 0, y0: 2040, x1: 3400, y1: 3400, tall: false },
];

export function districtAt(x, y) {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  return DISTRICTS[0];
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
