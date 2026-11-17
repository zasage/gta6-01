// Combat: bullets, muzzle flash and the damage they do. The player shoots
// with the mouse; rival gang members and foot police shoot back, badly, on
// purpose — a fair fight is a short one at close range.
import { PLAYER, clamp } from './config.js';
import { collideBuildings } from './city.js';

export function makeBullets() {
  return [];
}

export function fireBullet(bullets, x, y, angle, speed, damage, fromPlayer) {
  bullets.push({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage, fromPlayer,
    life: 0.9,
  });
}

// Step all bullets: move, stop at walls, hit cars and people. Returns hits:
// [{target, damage, x, y}] for the caller to apply.
export function stepBullets(bullets, dt, city, targets) {
  const hits = [];
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead) {
      const wall = collideBuildings(city, b.x, b.y, 2);
      if (wall.hit) { dead = true; hits.push({ target: null, damage: 0, x: b.x, y: b.y, spark: true }); }
    }
    if (!dead) {
      for (const t of targets) {
        if (t.dead || t.down) continue;
        const dx = t.x - b.x, dy = t.y - b.y;
        const r = t.radius || 14;
        if (dx * dx + dy * dy < r * r) {
          dead = true;
          hits.push({ target: t, damage: b.damage, x: b.x, y: b.y, spark: false, fromPlayer: b.fromPlayer });
          break;
        }
      }
    }
    if (dead) bullets.splice(i, 1);
  }
  return hits;
}

// The player's pistol: rate-limited, magazine-fed, reloaded with R.
export function createPistol() {
  return { cooldown: 0, ammo: PLAYER.magazine, reloading: 0 };
}

export function stepPistol(pistol, dt, wantFire, canFire) {
  if (pistol.cooldown > 0) pistol.cooldown -= dt;
  if (pistol.reloading > 0) {
    pistol.reloading -= dt;
    if (pistol.reloading <= 0) { pistol.ammo = PLAYER.magazine; pistol.reloading = 0; }
    return false;
  }
  if (wantFire && pistol.cooldown <= 0 && pistol.ammo > 0 && canFire) {
    pistol.cooldown = PLAYER.pistolRate;
    pistol.ammo -= 1;
    return true;
  }
  return false;
}

export function startReload(pistol) {
  if (pistol.reloading <= 0 && pistol.ammo < PLAYER.magazine) pistol.reloading = PLAYER.reloadTime;
}

export function clampHealth(h) { return clamp(h, 0, PLAYER.maxHealth); }
