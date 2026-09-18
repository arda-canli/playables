# Playables

HTML5 playable ads built with Three.js and PixiJS. Each one compiles to a single self-contained
HTML file with no external requests, which is what ad networks require.

| Playable | Engine | Genre | Status |
| --- | --- | --- | --- |
| **Triple Park** | Three.js | Lane-based car match (tap, 7-slot holder, sets of three leave on a truck) | playable |
| **Pour Decisions** | PixiJS | Water sort (tap a bottle, tap another, pour; mystery layers; "+1 bottle" rescue) | playable |

Live: https://arda-canli.github.io/playables/

## Run

```bash
npm install
npm run dev:park       # Triple Park on http://localhost:5173 (also on your LAN, so you can open it on a phone)
npm run dev:pour       # Pour Decisions, same address
npm run build          # dist/<game>/index.html, fails if a playable exceeds the 2 MB budget
npm test               # everything below, in order
npm run test:logic     # brute-forces every possible order of moves against each level's rig
npm run test:smoke     # plays the built files in real Chrome and screenshots them into shots/
npm run test:touch     # plays them with real touch events, including wrong, blocked and rapid taps
```

## Deploy

Every push to `main` runs the type check and the rig tests, builds each playable to its single HTML file,
assembles `site-dist/` (`scripts/site.mjs`: the portfolio page plus one folder per game) and publishes it to
GitHub Pages. Each game keeps its own URL; the portfolio's phone frame is only a window onto one of them.

## Variants

One build, many ads. Everything a UA team would want to test is a setting (`games/triple-park/src/config.ts`)
and can be picked from the URL:

| Param | Values | What it changes |
| --- | --- | --- |
| `ending` | `win` (default), `lose` | `lose` swaps the mystery cars for decoys, so the holder fills and the fail card shows |
| `headline` | `calm`, `challenge`, `dare` | The framing line at the top |
| `ghost` | `1` (default), `0` | The botched opening move played by the ad itself |
| `replay` | `1` (default), `0` | Replay link on the end card. Ad builds use `0` |
| `mute` | `0`, `1` | Sound |
| `autoplay` | `0`, `1` | The ad plays itself. Used by the tests |
| `debug` | `0`, `1` | Prints the director's event log to the console |

Example: `index.html?ending=lose&headline=dare`

Pour Decisions takes the same params, with `ending=stuck` (default) or `ending=win`.

## How a playable is put together

```
kit/src/            shared by every playable
  director.ts       phases, idle timers (hint -> auto move -> give up), tension value, event log
  network.ts        one openStore() for MRAID, Meta, Google, Mintegral, TikTok and the open web
  audio.ts          WebAudio synth and a generative music loop: no audio files
  tween.ts          promise-based tweens on game time, so everything pauses together
  ui.ts ui.css      HUD, hint hand, tension banner, toasts and the end card, shared by every game
games/pour-decisions/src/
  logic.ts          water-sort rules + the rig (hidden layers get their colour when they surface)
  bottle.ts         glass bottle whose liquid stays level while it tilts, sloshes and pours
  game.ts scene.ts fx.ts sfx.ts   flow, backdrop, particles and the synthesised glass/liquid/cork sounds
games/triple-park/src/
  logic.ts          pure rules + the rig (mystery cars get their colour when they reach the front)
  game.ts           orchestration: taps, driving, trucks, the scripted opening, endings
  car.ts truck.ts world.ts fx.ts   everything is built from primitives in code: no model or texture files
  camera.ts         fits the play area into any aspect ratio, portrait or landscape
```

### The ad script (Triple Park)

| Time | Beat | Hook |
| --- | --- | --- |
| 0-3 s | Two greens already wait in the holder. A ghost hand sends a blue car that matches nothing. "Oops!" | head start, botched opening |
| 3-5 s | "YOUR TURN!" The hand points at the third green. First truck leaves with confetti | free first win |
| 5-9 s | Two blues are sitting at the front. Second truck | momentum |
| 9-17 s | Three colours, two visible cars each. The third of each is a mystery car. The holder climbs to 5 or 6 of 7, banner and heartbeat kick in | the squeeze |
| end | Win: the hedge drops and a lot ten times the size rolls out. Lose: "You needed just 1 more slot" | curiosity gap / near miss |

### The ad script (Pour Decisions)

| Time | Beat | Hook |
| --- | --- | --- |
| 0-4 s | Two potions are already corked, a third is one pour short. A ghost hand tries to pour purple onto green: refused, "Colors must match!" | head start, botched opening that also teaches the rule |
| 4-6 s | "YOUR TURN!" The hand shows pick-up, then target. Green completes: cork pop, bells, confetti | free first win |
| 6-13 s | Free play. Mystery "?" layers get their colour as they surface. Each one looks welcome: orange under orange | escalating feedback, curiosity gap |
| 13-15 s | The last mystery surfaces and there is no way out: no empty bottle, no pour that leads anywhere new. The shelf shivers, the music closes in | the squeeze |
| 15 s + | A glowing "+1" bottle appears on the shelf and the button turns into "GET +1 BOTTLE". This is the moment the real genre sells its rescue | near miss, the rescue is the install |

The rig is honest. No colour is invented: all six sets are real, so a dead end is a genuine water-sort dead end.
In `ending=stuck` the director looks ahead with an exact minimax solver (`solver.ts`) and, among the colours after
which the player can no longer force a win, reveals the one that looks most helpful. The test suite plays every
legal order of pours and checks that every dead end really is solvable with one extra bottle, that no order can
win in `stuck`, and that hints never walk in circles. `ending=win` reveals the friendliest colour that keeps the
level finishable, corks all six potions and then drops in a ten-bottle level full of mysteries behind the end card.

The director posts every event (`first_touch`, `tap`, `reveal`, `tension`, `truck`, `end`, `cta`) to
`window.parent`, which is what the portfolio page will use for its live "show the hooks" captions.
