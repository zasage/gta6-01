// The story: six jobs from the fixer Marlow Vane, plus taxi fares on the
// side. A mission is a list of steps; each step is a place to reach, a thing
// to pick up, or people to deal with. Finishing the last job ends the story
// and opens free roam.
import { LANDMARKS } from './city.js';
import { MONEY } from './config.js';
import { commitCrime } from './police.js';

export const MISSIONS = [
  {
    name: 'The Pickup',
    payout: 400,
    briefing: 'Marlow: "My courier is waiting at the Docks. Bring them to the Hideout, and mind the cargo."',
    steps: [
      { kind: 'goto', x: LANDMARKS.docks.x, y: LANDMARKS.docks.y, text: 'Drive to the Docks' },
      { kind: 'pickup', x: LANDMARKS.docks.x + 60, y: LANDMARKS.docks.y, text: 'Pick up the courier (on foot)' },
      { kind: 'deliver', x: LANDMARKS.hideout.x, y: LANDMARKS.hideout.y, text: 'Take the courier to the Hideout' },
    ],
  },
  {
    name: 'Hot Wheels',
    payout: 600,
    briefing: 'Marlow: "A gold sports car is parked on Beachfront. I want it in my Garage. Don\'t scratch it."',
    steps: [
      { kind: 'goto', x: LANDMARKS.sportsCar.x, y: LANDMARKS.sportsCar.y, text: 'Find the gold sports car' },
      { kind: 'steal', x: LANDMARKS.sportsCar.x, y: LANDMARKS.sportsCar.y, text: 'Steal the sports car (press E)' },
      { kind: 'deliver', x: LANDMARKS.garage.x, y: LANDMARKS.garage.y, text: 'Deliver it to the Garage', needCar: true },
    ],
  },
  {
    name: 'The Package',
    payout: 800,
    briefing: 'Marlow: "A package is waiting down south. Grab it, take it to the Marina — and expect company."',
    steps: [
      { kind: 'collect', x: LANDMARKS.packagePickup.x, y: LANDMARKS.packagePickup.y, text: 'Collect the package (on foot)' },
      { kind: 'deliver', x: LANDMARKS.packageDrop.x, y: LANDMARKS.packageDrop.y, text: 'Deliver the package to the Marina' },
    ],
  },
  {
    name: 'Loud and Clear',
    payout: 1000,
    briefing: 'Marlow: "The Vipers took my warehouse. Three of them, last I heard. Make it loud, make it clear."',
    steps: [
      { kind: 'goto', x: LANDMARKS.warehouse.x, y: LANDMARKS.warehouse.y, text: 'Reach the Warehouse' },
      { kind: 'kill', count: 3, x: LANDMARKS.warehouse.x, y: LANDMARKS.warehouse.y, text: 'Deal with the Vipers (0/3)' },
      { kind: 'deliver', x: LANDMARKS.hideout.x, y: LANDMARKS.hideout.y, text: 'Get back to the Hideout' },
    ],
  },
  {
    name: 'The Getaway',
    payout: 1500,
    briefing: 'Marlow: "The precinct knows my name now. Pick me up at the Garage — and drive like the city is on fire."',
    steps: [
      { kind: 'goto', x: LANDMARKS.garage.x, y: LANDMARKS.garage.y, text: 'Pick up Marlow at the Garage' },
      { kind: 'escape', x: LANDMARKS.boat.x, y: LANDMARKS.boat.y, text: 'Lose the heat — reach the escape boat', wanted: 4 },
    ],
  },
  {
    name: 'The Last Job',
    payout: 2500,
    briefing: 'Marlow: "One last job, Rae. Marina Bank. In, out, boat waiting. Then we\'re both free."',
    steps: [
      { kind: 'goto', x: LANDMARKS.bank.x, y: LANDMARKS.bank.y, text: 'Reach Marina Bank' },
      { kind: 'collect', x: LANDMARKS.bank.x + 40, y: LANDMARKS.bank.y, text: 'Grab the cash (on foot)' },
      { kind: 'escape', x: LANDMARKS.boat.x, y: LANDMARKS.boat.y, text: 'Escape to the boat — the whole city is coming', wanted: 5 },
    ],
  },
];

export function createMissions() {
  return {
    index: 0, // which mission is current
    step: 0,
    active: false,
    done: false, // the whole story is finished
    kills: 0,
    hasPackage: false,
    hasPassenger: false,
    taxi: null, // {ped, destX, destY, fare, boarded}
    taxiTimer: 18,
  };
}

export function currentMission(missions) {
  return MISSIONS[missions.index] || null;
}

export function currentStep(missions) {
  const m = currentMission(missions);
  return m ? m.steps[missions.step] : null;
}

export function currentObjective(missions) {
  const step = currentStep(missions);
  if (!step) return null;
  const m = currentMission(missions);
  return {
    text: `${m.name}: ${step.text}`,
    x: step.x, y: step.y,
    kind: step.kind,
  };
}

export function startMissions(missions, ctx) {
  missions.active = true;
  missions.index = 0;
  missions.step = 0;
  ctx.addMessage(MISSIONS[0].briefing, 'mission');
  ctx.audio.missionStart();
}

function completeMission(missions, ctx) {
  const m = currentMission(missions);
  ctx.cash += m.payout;
  ctx.addMessage(`Job done: ${m.name} — $${m.payout} paid.`, 'good');
  ctx.audio.missionDone();
  missions.index += 1;
  missions.step = 0;
  missions.kills = 0;
  missions.hasPackage = false;
  missions.hasPassenger = false;
  if (missions.index >= MISSIONS.length) {
    missions.done = true;
    missions.active = false;
    ctx.onFinale();
    return;
  }
  ctx.addMessage(MISSIONS[missions.index].briefing, 'mission');
  ctx.audio.missionStart();
}

// Step the mission runner. ctx: {px, py, inCar, car, wanted, rng, city,
// cash (get/set via ctx.addCash), enemies, addMessage, audio, onFinale,
// spawnGang, commitCrime}.
export function stepMissions(missions, dt, ctx) {
  if (!missions.active) {
    stepTaxi(missions, dt, ctx);
    return;
  }
  const step = currentStep(missions);
  if (!step) return;
  const dx = ctx.px - step.x, dy = ctx.py - step.y;
  const d = Math.hypot(dx, dy);

  if (step.kind === 'goto' || step.kind === 'deliver') {
    const needCar = step.needCar;
    if (d < 70 && (!needCar || ctx.inCar)) {
      missions.step += 1;
      if (missions.step >= currentMission(missions).steps.length) completeMission(missions, ctx);
      else ctx.addMessage(currentStep(missions).text, 'objective');
    }
  } else if (step.kind === 'pickup' || step.kind === 'collect') {
    if (d < 46 && !ctx.inCar) {
      if (step.kind === 'pickup') missions.hasPassenger = true;
      else missions.hasPackage = true;
      if (missions.index === 2 && step.kind === 'collect') {
        // The Package: the pickup itself draws the heat.
        commitCrime(ctx.wanted, 45);
        ctx.addMessage('The package is hot — the police are coming!', 'danger');
      }
      ctx.audio.pickup();
      missions.step += 1;
      if (missions.step >= currentMission(missions).steps.length) completeMission(missions, ctx);
      else ctx.addMessage(currentStep(missions).text, 'objective');
    }
  } else if (step.kind === 'steal') {
    if (ctx.inCar && ctx.car && ctx.car.isMissionCar) {
      ctx.addMessage('The gold sports car is yours. Now drive it to the Garage.', 'objective');
      missions.step += 1;
    }
  } else if (step.kind === 'kill') {
    if (!step.spawned) {
      step.spawned = true;
      ctx.spawnGang(step.x, step.y, step.count);
      ctx.addMessage(`${step.count} Vipers at the warehouse.`, 'danger');
    }
    if (missions.kills >= step.count) {
      missions.step += 1;
      if (missions.step >= currentMission(missions).steps.length) completeMission(missions, ctx);
      else ctx.addMessage(currentStep(missions).text, 'objective');
    }
  } else if (step.kind === 'escape') {
    if (!step.heatSet) {
      step.heatSet = true;
      ctx.wanted.heat = Math.max(ctx.wanted.heat, step.wanted * 20);
      ctx.wanted.stars = Math.max(ctx.wanted.stars, step.wanted);
      ctx.addMessage(`Wanted level ${step.wanted} — run!`, 'danger');
    }
    if (d < 80) {
      missions.step += 1;
      if (missions.step >= currentMission(missions).steps.length) completeMission(missions, ctx);
      else ctx.addMessage(currentStep(missions).text, 'objective');
    }
  }
}

// Taxi fares between jobs: a pedestrian flags the player down, rides along,
// pays by distance. Only runs when no mission is active.
function stepTaxi(missions, dt, ctx) {
  const taxi = missions.taxi;
  if (!taxi) {
    missions.taxiTimer -= dt;
    if (missions.taxiTimer <= 0) {
      missions.taxiTimer = 24;
      const ped = ctx.spawnTaxiPed();
      if (ped) {
        const dest = ctx.rng.pick(Object.values(LANDMARKS));
        missions.taxi = {
          ped, destX: dest.x, destY: dest.y, boarded: false,
          fare: 0, name: dest.name,
        };
        ctx.addMessage('A fare is flagging you down — stop near them in a car.', 'info');
      }
    }
    return;
  }
  if (!taxi.boarded) {
    const d = Math.hypot(ctx.px - taxi.ped.x, ctx.py - taxi.ped.y);
    if (ctx.inCar && d < 46) {
      taxi.boarded = true;
      taxi.fare = Math.round(MONEY.taxiBase + Math.hypot(taxi.destX - taxi.ped.x, taxi.destY - taxi.ped.y) * MONEY.taxiPerUnit);
      ctx.addMessage(`Fare aboard — take them to ${taxi.name} ($${taxi.fare}).`, 'objective');
    }
    if (taxi.ped.down) { missions.taxi = null; }
    return;
  }
  const d = Math.hypot(ctx.px - taxi.destX, ctx.py - taxi.destY);
  if (d < 70 && ctx.inCar) {
    ctx.cash += taxi.fare;
    ctx.addMessage(`Fare delivered — $${taxi.fare}.`, 'good');
    ctx.audio.coin();
    missions.taxi = null;
    missions.taxiTimer = 20;
  }
  if (!ctx.inCar) {
    // The fare waits in the car; stepping out abandons them.
    missions.taxi = null;
    missions.taxiTimer = 20;
    ctx.addMessage('The fare walked off.', 'info');
  }
}
