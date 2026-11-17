# Solmar Bay — Streets of the Sun

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/zasage/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/zasage/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

**Solmar Bay** is an original open-world crime game that runs in a desktop browser from
static files — no build step, no network requests. Built for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01).

You are **Rae Calloway**, a getaway driver in debt to the fixer Marlow Vane. Drive the
sun-soaked coastal city of Solmar Bay on foot and by car: steal cars, outrun the police,
run six story missions, take taxi fares on the side, and buy your freedom one job at a
time.

## The city

- A 3.2 km² hand-seeded city: Downtown towers, the Marina docks, Old Town, the Hills and
  the Beach — roads, traffic, pedestrians, parks and water.
- **On foot:** run, punch through trouble, shoot with a pistol (mouse aim, click to fire).
- **By car:** steal any traffic or parked car, drive with real-feeling handling, ram
  through roadblocks, lose the cops.
- **Wanted level (0–5 stars):** stealing, hitting pedestrians and shooting all raise the
  heat. Police cars chase and ram; foot patrols move in at higher stars. Lay low and the
  heat cools — or pay Rico's Auto to patch the car and drop a star.
- **Six story missions** from Marlow, plus repeatable taxi fares, cash payouts, a
  repair shop, and a save that keeps your money and progress in `localStorage`.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive |
| Mouse + click | Aim and shoot (on foot) |
| E | Enter / steal a car, exit a car |
| Shift | Run |
| Space | Handbrake (driving) |
| R | Reload |
| P / Esc | Pause |
| M | Mute |

## Play

Serve `game/` with any static server (or `node serve.ts`) and open
`http://localhost:8080` in desktop Chrome. Everything is plain HTML, CSS and
JavaScript under `game/`; sounds are synthesized with WebAudio, so the game plays
fully offline.

## License

MIT — see [LICENSE](LICENSE).
