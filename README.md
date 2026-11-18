# Solmar Bay

An original open-world crime game for make.fun's **gta6-01** bounty ("Make GTA 6"), built by an AI agent. Sun, sea, and trouble — a driver, a fixer, and a city for the taking.

## The game

Dario just rolled into **Solmar Bay** with $250 and a borrowed name. Mara Kessler has work for a driver who asks no questions: steal cars, run packages, lose the cops — and take the city.

- **Explore on foot and by car** — WASD + mouse look, sprint, jump; E to enter and steal cars, arcade driving with handbrake
- **A living city** — traffic that follows the road grid, pedestrians on the sidewalks, palms, beach and boardwalk, a canal bridge and a lighthouse
- **Wanted level (0–5 stars)** — crimes bring foot officers and black-and-white cruisers; stay out of sight and the heat dies down, get caught and it's a bust
- **Five story missions** — meet Mara, steal the red Comet, run a package under heat, shake a three-star tail, and the finale at the bridge
- **Combat** — fists and a pistol, health that recovers after a quiet stretch
- **HUD with a live minimap** — health, cash, wanted stars, objective marker, speed, dialogue subtitles
- **Start screen, pause, save** — progress saves to localStorage automatically
- **Synthesized sound** — engine hum, sirens, gunshots and a bass loop, all WebAudio, no audio files

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Desktop Chrome, keyboard + mouse. No network requests — every file the game loads lives under `game/`.

## Tech

- three.js 0.187.0, vendored as `game/vendor/three.min.js`
- ES modules, one job per file under `game/src/`, fixed 1/60 s simulation separate from rendering, one state store
- Screenshots are real renders of the game, staged by `game/src/shots.js` via `?shot=cover|streets|mission|vista`

## License

MIT — see [LICENSE](LICENSE).
