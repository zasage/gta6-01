// Drawing only: the city, the cars and people in it, the minimap, the HUD and
// the screens. The 1280x720 logical view is scaled to fit the window; the
// camera follows the player with a soft lag.
import { VIEW_W, VIEW_H, WORLD, ROAD_W, WATER_EAST, BEACH_SOUTH, PALETTE, districtAt } from './config.js';
import { ROADS } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_FINALE = 'finale';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export function titleButtons(hasSave) {
  const buttons = [{ id: 'new', label: 'NEW GAME', x: VIEW_W / 2 - 130, y: 470, w: 260, h: 52 }];
  if (hasSave) buttons.push({ id: 'continue', label: 'CONTINUE', x: VIEW_W / 2 - 130, y: 534, w: 260, h: 52 });
  return buttons;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW_W, height / VIEW_H);
    view.x = (width - VIEW_W * view.scale) / 2;
    view.y = (height - VIEW_H * view.scale) / 2;
  }

  // Client (CSS pixel) coordinates to logical view coordinates.
  function toLogical(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const dx = (clientX - r.left) * (canvas.width / r.width);
    const dy = (clientY - r.top) * (canvas.height / r.height);
    return { x: (dx - view.x) / view.scale, y: (dy - view.y) / view.scale };
  }

  function text(value, x, y, size, color, align, bold) {
    const key = size + (bold ? 'b' : '');
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawWorld(state) {
    const time = state.time;
    // Ground.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    // Dry patches for variety.
    ctx.fillStyle = PALETTE.grassDry;
    for (let i = 0; i < 24; i += 1) {
      const gx = ((i * 977) % WORLD.w), gy = ((i * 613) % WORLD.h);
      ctx.fillRect(gx, gy, 260, 130);
    }
    // Beach and water.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, BEACH_SOUTH, WORLD.w, WORLD.h - BEACH_SOUTH);
    ctx.fillRect(WATER_EAST, 0, WORLD.w - WATER_EAST, WORLD.h);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(WATER_EAST + 26, 0, WORLD.w - WATER_EAST - 26, WORLD.h);
    ctx.fillRect(0, BEACH_SOUTH + 26, WORLD.w, WORLD.h - BEACH_SOUTH - 26);
    ctx.fillStyle = PALETTE.waterDeep;
    for (let i = 0; i < 40; i += 1) {
      const wx = WATER_EAST + 40 + ((i * 211 + time * 12) % (WORLD.w - WATER_EAST - 80));
      const wy = (i * 307) % WORLD.h;
      ctx.fillRect(wx, wy, 60, 3);
    }
    // Parks.
    for (const p of state.city.parks) {
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }
    // Sidewalks, then asphalt, then lane dashes.
    for (const r of ROADS) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(0, r - ROAD_W / 2 - 12, WORLD.w, ROAD_W + 24);
      ctx.fillRect(r - ROAD_W / 2 - 12, 0, ROAD_W + 24, WORLD.h);
      ctx.fillStyle = PALETTE.asphalt;
      ctx.fillRect(0, r - ROAD_W / 2, WORLD.w, ROAD_W);
      ctx.fillRect(r - ROAD_W / 2, 0, ROAD_W, WORLD.h);
    }
    ctx.fillStyle = PALETTE.lane;
    for (const r of ROADS) {
      for (let d = 40; d < WORLD.w; d += 90) {
        ctx.fillRect(d, r - 2, 42, 4);
        ctx.fillRect(r - 2, d, 4, 42);
      }
    }
    // Buildings: long golden-hour shadows, then roofs with rooftop clutter.
    for (const b of state.city.buildings) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(b.x + 10, b.y + 12, b.w, b.h);
      ctx.fillStyle = PALETTE[b.roof];
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(b.x + 8, b.y + 8, Math.min(26, b.w - 16), Math.min(18, b.h - 16));
      if (b.downtown && b.hgt > 60) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE[b.roof];
        ctx.beginPath();
        ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Trees.
    for (const t of state.city.trees) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.arc(t.x + 3, t.y + 4, t.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.tree;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.treeLight;
      ctx.beginPath();
      ctx.arc(t.x - 3, t.y - 3, t.s * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    // Landmark signs.
    drawSign(state, 'repairShop', "Rico's", '#ffb02e');
    drawSign(state, 'hospital', 'H', '#e8e8e8');
    drawSign(state, 'policeStation', 'P', '#7fb3e8');
    // Mission marker: a pulsing beam and diamond.
    const obj = state.objective;
    if (obj) {
      const pulse = 0.6 + 0.4 * Math.sin(time * 4);
      ctx.fillStyle = `rgba(255,176,46,${0.25 * pulse})`;
      ctx.fillRect(obj.x - 26, obj.y - 220, 52, 220);
      ctx.save();
      ctx.translate(obj.x, obj.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffb02e';
      ctx.fillRect(-13, -13, 26, 26);
      ctx.strokeStyle = '#7a4d00';
      ctx.lineWidth = 3;
      ctx.strokeRect(-13, -13, 26, 26);
      ctx.restore();
    }
    // Taxi flag.
    if (state.missions.taxi && !state.missions.taxi.boarded) {
      const ped = state.missions.taxi.ped;
      text('TAXI', ped.x, ped.y - 26, 15, '#7ee787', 'center', true);
    }
    // Cars, people, bullets, particles.
    for (const car of state.cars) drawCar(state, car);
    for (const car of state.wanted.policeCars) drawCar(state, car);
    for (const cop of state.wanted.footCops) drawPerson(state, cop.x, cop.y, cop.angle, '#1c2f6e', true);
    for (const g of state.enemies) drawPerson(state, g.x, g.y, g.angle, '#c92f3d', true);
    for (const ped of state.peds) {
      if (ped.down) drawDownPed(state, ped);
      else drawPerson(state, ped.x, ped.y, ped.angle, ped.shirt, false, ped.walkPhase);
    }
    if (!state.player.inCar) drawPlayer(state);
    for (const b of state.bullets) {
      ctx.strokeStyle = '#ffe27a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const p of state.particles) {
      const a = p.life / p.maxLife;
      ctx.fillStyle = p.color.replace('A', a.toFixed(2));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 + (1 - a) * 1.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSign(state, key, label, color) {
    const lm = state.landmarks[key];
    if (!lm) return;
    ctx.fillStyle = 'rgba(12,16,24,0.8)';
    roundRect(lm.x - 34, lm.y - 44, 68, 24, 6);
    ctx.fill();
    text(label, lm.x, lm.y - 27, 13, color, 'center', true);
  }

  function drawCar(state, car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const len = car.model === 'van' ? 52 : 44;
    const wid = car.model === 'van' ? 24 : 22;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(-len / 2 + 3, -wid / 2 + 4, len, wid, 8);
    ctx.fill();
    ctx.fillStyle = car.color;
    roundRect(-len / 2, -wid / 2, len, wid, 8);
    ctx.fill();
    // Windshield and roof.
    ctx.fillStyle = 'rgba(20,30,44,0.85)';
    ctx.fillRect(len / 2 - 14, -wid / 2 + 3, 9, wid - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-6, -wid / 2 + 3, 12, wid - 6);
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(len / 2 - 2, -wid / 2 + 2, 3, 5);
    ctx.fillRect(len / 2 - 2, wid / 2 - 7, 3, 5);
    if (car.kind === 'police') {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(-4, -wid / 2 + 2, 10, wid - 4);
      const flash = Math.floor(state.time * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2e3e' : '#2e6bff';
      ctx.fillRect(-2, -wid / 2 - 2, 8, 5);
      ctx.fillStyle = flash ? '#2e6bff' : '#ff2e3e';
      ctx.fillRect(-2, wid / 2 - 3, 8, 5);
    }
    if (car.health < 40) {
      ctx.fillStyle = 'rgba(60,60,60,0.5)';
      ctx.beginPath();
      ctx.arc(-len / 4, 0, 6 + Math.sin(state.time * 9) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPerson(state, x, y, angle, shirt, armed, walkPhase) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const bob = walkPhase ? Math.sin(walkPhase) * 2 : 0;
    ctx.fillStyle = shirt;
    roundRect(-7, -7 + bob * 0.4, 14, 14, 5);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(8, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    if (armed) {
      ctx.fillStyle = '#22242c';
      ctx.fillRect(8, -2, 12, 4);
    }
    ctx.restore();
  }

  function drawDownPed(state, ped) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 6, ped.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer(state) {
    const p = state.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aimAngle);
    ctx.fillStyle = '#20242e';
    roundRect(-8, -8, 16, 16, 6);
    ctx.fill();
    ctx.fillStyle = '#ffb02e';
    ctx.fillRect(6, -2, 10, 4); // the pistol
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(9, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20242e';
    ctx.fillRect(4, -5.5, 8, 4); // cap
    ctx.restore();
  }

  function drawMinimap(state) {
    const size = 208, scale = size / WORLD.w;
    const x0 = VIEW_W - size - 16, y0 = 16;
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(x0 - 6, y0 - 6, size + 12, size + 12, 10);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, size, size);
    ctx.clip();
    ctx.fillStyle = '#5d7a44';
    ctx.fillRect(x0, y0, size, size);
    ctx.fillStyle = '#2f7fa8';
    ctx.fillRect(x0 + WATER_EAST * scale, y0, size - WATER_EAST * scale, size);
    ctx.fillRect(x0, y0 + BEACH_SOUTH * scale, size, size - BEACH_SOUTH * scale);
    ctx.strokeStyle = '#9aa0a8';
    ctx.lineWidth = 1.5;
    for (const r of ROADS) {
      ctx.beginPath();
      ctx.moveTo(x0, y0 + r * scale);
      ctx.lineTo(x0 + size, y0 + r * scale);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0 + r * scale, y0);
      ctx.lineTo(x0 + r * scale, y0 + size);
      ctx.stroke();
    }
    ctx.fillStyle = '#3a3f4a';
    for (const b of state.city.buildings) {
      ctx.fillRect(x0 + b.x * scale, y0 + b.y * scale, Math.max(1.5, b.w * scale), Math.max(1.5, b.h * scale));
    }
    const dot = (x, y, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x0 + x * scale, y0 + y * scale, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const car of state.cars) dot(car.x, car.y, '#d8d8d8', 1.6);
    for (const car of state.wanted.policeCars) dot(car.x, car.y, '#ff2e3e', 2.6);
    if (state.objective) {
      const pulse = 3 + Math.sin(state.time * 5) * 1.5;
      dot(state.objective.x, state.objective.y, '#ffb02e', pulse);
    }
    const px = state.player.x, py = state.player.y;
    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.translate(x0 + px * scale, y0 + py * scale);
    ctx.rotate(state.player.aimAngle);
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    text(districtAt(px, py).name, x0 + size / 2, y0 + size + 22, 14, '#e8e8e8', 'center', true);
  }

  function drawHud(state) {
    drawMinimap(state);
    // Wanted stars under the minimap.
    const stars = state.wanted.stars;
    let starText = '';
    for (let i = 0; i < 5; i += 1) starText += i < stars ? '★' : '☆';
    text(starText, VIEW_W - 16, 268, 26, stars > 0 ? '#ffb02e' : 'rgba(232,232,232,0.5)', 'right', true);
    // Objective.
    if (state.objective) {
      ctx.fillStyle = PALETTE.hudPanel;
      roundRect(16, 16, Math.min(560, 24 + state.objective.text.length * 8.4), 40, 8);
      ctx.fill();
      text(state.objective.text, 30, 43, 18, '#ffb02e', 'left', true);
    }
    // Cash and health.
    text(`$${state.cash.toLocaleString('en-US')}`, 16, 96, 26, PALETTE.money, 'left', true);
    const hp = state.player.health;
    ctx.fillStyle = 'rgba(12,16,24,0.78)';
    roundRect(16, 108, 180, 16, 8);
    ctx.fill();
    ctx.fillStyle = hp > 50 ? '#7ee787' : hp > 25 ? '#ffb02e' : '#e8384f';
    roundRect(16, 108, Math.max(4, 180 * (hp / 100)), 16, 8);
    ctx.fill();
    text(`HP ${Math.ceil(hp)}`, 204, 121, 15, '#e8e8e8', 'left', true);
    // Ammo on foot, speed in a car.
    if (state.player.inCar) {
      const speed = Math.abs(state.player.car.speed) * 0.12;
      text(`${Math.round(speed)} mph`, VIEW_W - 16, VIEW_H - 24, 30, '#ffffff', 'right', true);
      text(state.player.car.health < 40 ? 'CAR SMOKING — FIND RICO\'S AUTO' : '', VIEW_W - 16, VIEW_H - 56, 16, '#ffb02e', 'right', true);
    } else {
      text(`AMMO ${state.pistol.ammo}${state.pistol.reloading > 0 ? ' — RELOADING' : ''}`, 16, VIEW_H - 24, 18, '#e8e8e8', 'left', true);
    }
    // Message feed.
    let my = VIEW_H - 60;
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
      const m = state.messages[i];
      const a = Math.min(1, m.life / 2);
      ctx.globalAlpha = a;
      text(m.text, 16, my, 16, m.color || '#e8e8e8', 'left');
      ctx.globalAlpha = 1;
      my -= 22;
    }
    // Controls hint, first seconds of play.
    if (state.time < 8 && state.screen === SCREEN_PLAY) {
      text('WASD move / drive   •   E enter or steal a car   •   Click shoot   •   P pause   •   M mute', VIEW_W / 2, VIEW_H - 24, 15, 'rgba(232,232,232,0.75)', 'center');
    }
  }

  function drawPanel(title, lines, prompt) {
    ctx.fillStyle = 'rgba(8,10,16,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const w = 640;
    const h = 150 + lines.length * 34;
    const x = (VIEW_W - w) / 2, y = (VIEW_H - h) / 2;
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,176,46,0.6)';
    ctx.lineWidth = 2;
    roundRect(x, y, w, h, 14);
    ctx.stroke();
    text(title, VIEW_W / 2, y + 66, 44, '#ffb02e', 'center', true);
    lines.forEach((line, i) => text(line, VIEW_W / 2, y + 112 + i * 34, 20, '#e8e8e8', 'center'));
    if (prompt) text(prompt, VIEW_W / 2, y + h - 26, 18, '#7ee787', 'center', true);
  }

  function drawTitle(state, hasSave) {
    // The city pans behind the title.
    text('SOLMAR BAY', VIEW_W / 2, 190, 84, '#ffffff', 'center', true);
    text('STREETS OF THE SUN', VIEW_W / 2, 232, 26, '#ffb02e', 'center', true);
    text('Rae Calloway owes Marlow Vane one last debt. Six jobs stand between her and freedom.', VIEW_W / 2, 300, 19, '#e8e8e8', 'center');
    text('Steal cars. Outrun the law. Finish the story.', VIEW_W / 2, 330, 19, '#e8e8e8', 'center');
    for (const b of titleButtons(hasSave)) {
      ctx.fillStyle = 'rgba(12,16,24,0.85)';
      roundRect(b.x, b.y, b.w, b.h, 10);
      ctx.fill();
      ctx.strokeStyle = '#ffb02e';
      ctx.lineWidth = 2;
      roundRect(b.x, b.y, b.w, b.h, 10);
      ctx.stroke();
      text(b.label, b.x + b.w / 2, b.y + 35, 22, '#ffb02e', 'center', true);
    }
    text('WASD move & drive  •  E steal a car  •  Mouse aim, click to shoot  •  P pause  •  M mute', VIEW_W / 2, 640, 16, 'rgba(232,232,232,0.8)', 'center');
    text('An original game — no Rockstar names, art or music. Built for the make.fun gta6-01 bounty.', VIEW_W / 2, 668, 14, 'rgba(232,232,232,0.55)', 'center');
  }

  /** Paint one frame for the screen the game is on. */
  function draw(state, screen, hasSave) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#10141c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const cam = state.camera;
    ctx.save();
    ctx.translate(-cam.x + VIEW_W / 2, -cam.y + VIEW_H / 2);
    drawWorld(state);
    ctx.restore();
    if (screen === SCREEN_TITLE) {
      ctx.fillStyle = 'rgba(10,12,20,0.45)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      drawTitle(state, hasSave);
      return;
    }
    if (screen === SCREEN_PLAY) drawHud(state);
    else if (screen === SCREEN_PAUSED) {
      drawHud(state);
      drawPanel('PAUSED', ['The city waits for you.'], 'Press P to resume');
    } else if (screen === SCREEN_BUSTED) {
      drawHud(state);
      drawPanel('BUSTED', ['The precinct has you. The fine stings,', 'but Marlow still owns your debt.'], 'Press Enter to get back out there');
    } else if (screen === SCREEN_WASTED) {
      drawHud(state);
      drawPanel('WASTED', ['Solmar Bay is not done with you yet.'], 'Press Enter to wake up at St. Anselm');
    } else if (screen === SCREEN_FINALE) {
      drawHud(state);
      drawPanel('SOLMAR BAY IS YOURS', ['Six jobs. One boat. Zero debts.', 'Marlow is gone — the city is yours now.', 'Free roam: taxi fares, the beach, the whole map.'], 'Press Enter to keep driving');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toLogical };
}
