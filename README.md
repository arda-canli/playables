# Playables

HTML5 playable ads built with Three.js and PixiJS. Each one compiles to a single self-contained
HTML file with no external requests, which is what ad networks require.

| Playable | Engine | Genre | Status |
| --- | --- | --- | --- |
| **Triple Park** | Three.js | Lane-based car match (tap, 7-slot holder, sets of three leave on a truck) | playable |
| **Pour Decisions** | PixiJS | Water sort (tap a bottle, tap another, pour; mystery layers; "+1 bottle" rescue) | playable |
| **Puzzle Game** | Three.js + cannon-es | Physics cannon smash in the style of Royal Smash (tap or drag to aim, jam jars on a royal pedestal, "+3 balls" rescue) | playable |
| **Match-3 Game** | PixiJS | Match-3 that pays out dice, then a pick-a-safe bank heist, in the style of Match Squad | playable |

Live: https://arda-canli.github.io/playables/

## Run

```bash
npm install
npm run dev:park       # Triple Park on http://localhost:5173 (also on your LAN, so you can open it on a phone)
npm run dev:pour       # Pour Decisions, same address
npm run dev:puzzle      # Puzzle Game
npm run dev:match3      # Match-3 Game
npm run build          # dist/<game>/index.html, fails if a playable exceeds the 2 MB budget
npm test               # everything below, in order
npm run test:logic     # brute-forces every possible order of moves against each level's rig (Puzzle Game: runs its physics headless)
npm run test:smoke     # plays the built files in real Chrome and screenshots them into shots/
npm run test:touch     # plays them with real touch events, including wrong, blocked and rapid taps
```

## Deploy

Every push to `main` runs the type check and the rig tests, builds each playable to its single HTML file,
assembles `site-dist/` (`scripts/site.mjs`: the portfolio page plus one folder per game) and publishes it to
GitHub Pages. Each game keeps its own URL; the portfolio's phone frame is only a window onto one of them.
`/cypher/` is the same page for the Cypher Games application, showing Puzzle Game and Match-3 Game.

## Variants

One build, many ads. Everything a UA team would want to test is a setting (`games/triple-park/src/config.ts`)
and can be picked from the URL:

| Param | Values | What it changes |
| --- | --- | --- |
| `ending` | `win` (default), `lose` | `lose` swaps the mystery cars for decoys, so the holder fills and the fail card shows |
| `headline` | `calm`, `challenge`, `dare` | The framing line at the top |
| `ghost` | `1` (default), `0` | The botched opening move played by the ad itself |
| `replay` | `1` (default), `0` | Replay link on the end card. Ad builds use `0` |
| `store` | `https://...` | Where the install button goes on the open web. Without it (the portfolio) the button opens the ad full screen from the phone frame, or plays it again when it is already full screen. Inside an ad network the network's own call is used either way |
| `mute` | `0`, `1` | Sound |
| `autoplay` | `0`, `1` | The ad plays itself. Used by the tests |
| `debug` | `0`, `1` | Prints the director's event log to the console |

Example: `index.html?ending=lose&headline=dare`

Pour Decisions and Puzzle Game take the same params, with `ending=stuck` (default) or `ending=win`.
Match-3 Game takes `ending=lose` (default: the third safe is empty and the jackpot turns out to be one safe away) or
`ending=win` (jackpot), and headlines `calm` "Match & roll the dice!", `challenge` "Can you rob the bank?",
`dare` "Only pros hit the jackpot".
Puzzle Game's headlines are the ones the real game's store page already uses: `calm` "Smash every jar!",
`challenge` "One shot, max damage!", `dare` "Too hard for you?" (default).

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
games/puzzle-game/src/
  level.ts          the level as data: every piece, the keystone, the ghost shot, ball counts
  sim.ts            cannon-es world + rules + the rubber-band rig, in fixed ticks; no rendering, so it tests headless
  pieces.ts         instanced jars, lids, columns, planks and crown blocks that copy their bodies: 6 draw calls
  cannon.ts camera.ts world.ts fx.ts sfx.ts hud.ts   the royal cannon, framing, scenery, jam and glass, sounds, pig king
games/match-3-game/src/
  logic.ts          match-3 rules (matches, L/T shapes, TNT, gravity), the authored refill and the heist; no rendering
  board.ts heist.ts the board's swap/pop/fall animations; the dice roll and the vault truck
  art.ts            every tile, booster, pig, die, safe and banknote painted on canvas at start-up
  game.ts scene.ts hud.ts fx.ts sfx.ts   flow, staging for three stages, the two-goal HUD, particles, sounds
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

### The ad script (Puzzle Game)

| Time | Beat | Hook |
| --- | --- | --- |
| 0-3 s | The table already carries jam stains from 8 jars "smashed earlier": the goal pill opens at 8/33. The ad fires one feeble shot of its own that clips a single jar off the top. "Weak shot..." and the pig king frowns | head start, botched opening |
| 3-5 s | "YOUR TURN!" The hand points at the base of the left tower. Wherever the finger lands, aim assist puts the first ball on that keystone: the tower comes down, the chain reaction runs in slow motion, ×2 ×3 ... ×8 pops over each jar | free first win, escalating feedback |
| 5-12 s | Free play. Tap to fire, or hold to see the dotted arc and release. Each shattered jar plays the next note of a rising scale; jam lands on the table as stains | escalating feedback, competence |
| 2 balls left | The ball counter turns red, "2 BALLS LEFT", then "LAST BALL!", heartbeat, music thins. No timer: the only pressure is ammo, as in the real game | the squeeze, loss aversion |
| end | `stuck`: "OUT OF BALLS!", the jars still standing pulse under a spotlight, and the real game's level-end offer slides up: "+3 balls, only 2 jars left!". The button becomes GET +3 BALLS. `win`: the table clears, then a wall of gold with a heart of jam drops in as level 2 | near miss, rescue = install / curiosity gap |

The level is real physics (cannon-es), so the rig cannot script outcomes. It shapes them with a rubber band
(`Sim.rig()`): in `stuck` the blast is strong while the table is full and weakens as it empties, so a typical
run ends a few jars short and a perfect run can still clear it (that counts as a win). In `win` it works the other way,
and if the balls still run out, the game hands over its free giant-ball booster, which always clears the table.
Everything runs on fixed 60 Hz ticks, so the same shots always produce the same level:
`test/sim.test.ts` plays the ad headless and checks that untouched stacks never drift, that the botched opening
takes exactly one jar and no ball, that the guided shot brings a tower down, that the giant ball always finishes the job,
and how many jars 24 sloppy runs leave behind (mostly 1-4). Autoplay in the browser plays the exact game the test predicts.

### The ad script (Match-3 Game)

| Time | Beat | Hook |
| --- | --- | --- |
| 0-3 s | The board drops in with 9 moves left and the dice meter already 2/3 full. A ghost hand swipes two tiles that make nothing: they bounce back with a buzz, "No match!" | head start, botched opening that teaches the swipe |
| 3-6 s | "YOUR TURN!" A swipe lines up five leaves, which forms a TNT. The hand taps the TNT: shockwave, smoke, screen shake, all four crates break, cascade | free first win, escalating feedback |
| 6-14 s | Free play on a rigged refill. Cleared leaves fly into the goal counter, praise words escalate, the pop pitch climbs with each cascade. At 3 moves or fewer the Moves box throbs red and the pig looks worried | escalating feedback, light squeeze |
| goals done | "LEVEL COMPLETE!", "+1 ROLL": a die flies into the meter and the board's tiles fly away | reward anticipation |
| roll | ROLL with an x2 badge. Two dice tumble, faces flickering, and both land on the heist mask: siren, "HEIST TIME!" | variable reward |
| heist | A truck with nine safes. First pick: 2,500. Second: ×3, the counter jumps to 7,500. Third: drumroll and heartbeat while the safe trembles | numbers going up, anticipation |
| end | `win`: jackpot, 157,500, coin fountain, "YOU ROBBED THE BANK!" → PLAY FREE. `lose`: "NO LUCK", then the other safes open by themselves and two jackpots appear, one next to the last pick. "The JACKPOT was right there!" → ROLL AGAIN | near miss, regret |
| out of moves | Only if the viewer wastes moves: a glowing "+5 MOVES" and GET +5 MOVES on the button | rescue = install |

Safe contents are decided when a safe is tapped, the same way Pour Decisions picks a mystery colour when it surfaces,
so any three safes give the scripted sequence. The board's refill is authored: `test/logic.test.ts` plays 1,500
simulated viewers and checks that none ever meets a dead board or a reshuffle, that hints can finish from random
mid-level states, and how many viewers fall short (about 7%, who get the "+5 moves" rescue).

The director posts every event (`first_touch`, `tap`, `reveal`, `tension`, `truck`, `end`, `cta`) to
`window.parent`, which is what the portfolio page will use for its live "show the hooks" captions.
