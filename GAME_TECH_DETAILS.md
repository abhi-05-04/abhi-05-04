# Neon Salvager

## 1. Game Summary

Neon Salvager is a small browser-based arena survival game. The player controls a salvage ship inside a hostile orbital station, destroys incoming enemies, collects salvage shards, survives five sectors, chooses lightweight upgrades, and tries to improve the local high score.

The MVP focuses on one repeatable loop:

**Select a level -> survive enemy pressure -> shoot enemies -> collect salvage -> choose an upgrade -> survive the next sector -> win or restart**

## 2. Platform and Runtime

- **Platform:** PC/Web browser
- **Runtime:** Client-side JavaScript
- **Rendering:** HTML Canvas 2D
- **Input:** Keyboard, mouse, touch, and browser pointer events
- **Audio:** Web Audio API oscillator-based sound effects
- **Persistence:** Browser `localStorage`
- **Backend:** None
- **Build system:** None required
- **External dependency:** Google Fonts loaded by CSS (`Space Grotesk` and `DM Mono`)

The game can be launched by opening `index.html` in a modern browser.

## 3. Project Files

### `index.html`

Defines the game screens and UI:

- Main menu
- Direct level-selection controls
- Start Run button
- Gameplay HUD
- Sector upgrade screen
- Pause screen
- Game-over and victory screen

### `styles.css`

Defines the visual system:

- Dark neon sci-fi theme
- Responsive layout
- Typography
- Main menu and overlay panels
- Level cards
- HUD meters and hull pips
- Upgrade cards
- Buttons and hover states
- Mobile layout adjustments

### `game.js`

Contains the complete game runtime:

- Game state management
- Canvas setup and rendering
- Keyboard and mouse input
- Player movement and dash
- Shooting and level-specific weapon rules
- Enemy spawning and AI
- Collision detection
- Damage and invulnerability
- Salvage collection
- Score and high-score handling
- Sector progression
- Upgrade selection
- Pause, restart, victory, and game-over flow
- Procedural audio feedback

## 4. Rendering Architecture

The game uses one canvas:

```text
HTML canvas
  -> clear background
  -> draw grid
  -> draw salvage shards
  -> draw bullets
  -> draw enemies
  -> draw particles
  -> draw player ship
```

The canvas is resized to the game shell dimensions. Device pixel ratio is capped at `2` to improve rendering quality without creating excessive canvas sizes.

The main animation loop uses `requestAnimationFrame`:

1. Calculate frame delta time.
2. Update the simulation.
3. Draw the current world.
4. Schedule the next frame.

Delta time is capped at `0.04` seconds to reduce large simulation jumps after a stalled frame.

## 5. Game States

The runtime uses the following states:

- `menu`
- `play`
- `pause`
- `upgrade`
- `over`

The game simulation only updates while the state is `play`. This means pausing or displaying the upgrade screen stops movement, enemy updates, timers, and combat processing.

## 6. Main Gameplay Loop

### Starting a run

When the player selects **Start Run**:

- Score resets to `0`.
- The player starts at the center of the arena.
- The player starts with `3` hull points.
- Sector starts at `1`.
- Active bullets, enemies, shards, and particles are cleared.
- The selected level is stored on the player for the current run.

### Sector timing

- Each sector lasts approximately `22` seconds.
- After a sector ends, the next sector begins after the player selects an upgrade.
- Sector 5 completion triggers victory.
- There are no qualification requirements; all three levels are available directly from the main menu.

## 7. Level Rules

The level rules are configured in `game.js`:

```js
{
  1: { spawnMultiplier: 2, fireAngles: [-15, 0, 15] },
  2: { spawnMultiplier: 2, fireAngles: [0] },
  3: { spawnMultiplier: 1, fireAngles: [0] }
}
```

### Level 1 — Triple Arc

- Fires three player bullets per shot.
- Bullet offsets are `-15°`, `0°`, and `15°` relative to the mouse aim direction.
- Uses continuous enemy spawning.
- Enemy frequency is reduced to approximately half the Level 3 frequency.

### Level 2 — Straight Shot

- Fires one player bullet per shot.
- Bullet offset is `0°` relative to the mouse aim direction.
- Uses continuous enemy spawning.
- Enemy frequency is reduced to approximately half the Level 3 frequency.

### Level 3 — The Swarm

- Fires one player bullet per shot.
- Uses the current full continuous-spawn behavior.
- Uses the base enemy spawn interval without the Level 1/2 reduction.

### Spawn interval

The base interval becomes more aggressive as the sector increases:

```text
base interval =
max(0.28, 0.9 - sector * 0.1)
* random factor between 0.7 and 1.2
```

The result is multiplied by the level spawn multiplier:

- Level 1: `2`
- Level 2: `2`
- Level 3: `1`

This preserves the same continuous enemy behavior across levels while making Levels 1 and 2 less frequent.

## 8. Player and Controls

### Movement

The player can move with:

- `W`, `A`, `S`, `D`
- Arrow keys: `Up`, `Down`, `Left`, `Right`

Both control schemes are always active and can be combined. Movement is normalized, so diagonal movement does not become faster than horizontal or vertical movement.

Arrow-key browser scrolling is prevented during active gameplay.

### Mouse aiming and firing

- The player ship rotates visually toward the mouse.
- Holding the left mouse button fires automatically.
- The base firing delay is `0.16` seconds.
- The selected level controls the number and angle of bullets.

The default bullet direction is `0°`, meaning the direction from the player to the mouse cursor.

### Dash

- Activated with `Space`.
- Uses the current movement direction.
- Supports both WASD and arrow keys.
- Moves the player by approximately `100` pixels.
- Clamps the player inside the arena bounds.
- Has a `1.3` second cooldown.
- Gives approximately `0.22` seconds of invulnerability.
- Produces particle and audio feedback.

### Mobile touch controls

On small screens, a touch-control layer is displayed during active gameplay:

- **Left virtual joystick:** drag to move in any direction.
- **Right aim/fire pad:** press and hold to fire toward the pad; drag within the pad to change aim direction.
- **Dash button:** tap to dash using the current joystick direction.

Touch input feeds the same movement, aiming, shooting, and dash systems used by desktop controls. The controls are hidden on the menu, pause screen, upgrade screen, and result screen.

## 9. Player Systems

The player starts with:

- Position: arena center
- Radius: `14`
- Speed: `260`
- Hull: `3`
- Maximum hull: `3`
- Fire delay: `0.16`
- Dash cooldown: `0`
- Salvage magnet range: `80`
- Invulnerability timer: `0`

When damaged:

- Hull decreases by one.
- Invulnerability is applied for one second.
- Screen shake and pink particles are shown.
- A damage sound is played.

The run ends when hull reaches zero.

## 10. Enemy Systems

Enemies spawn from one of the four arena edges:

- Top
- Right
- Bottom
- Left

### Chaser enemy

- Standard enemy type.
- Purple circular visual.
- Moves directly toward the player.
- Speed is `72 + sector * 8`.
- Health is `1`.
- Awards `30` points when destroyed.

### Shooter enemy

- Available from Sector 2 onward.
- Pink square visual.
- Has a `25%` chance to be selected when spawning.
- Health is `3`.
- Speed is `48 + sector * 4`.
- Keeps distance when within approximately `330` pixels.
- Fires hostile projectiles approximately every `2` seconds.
- Awards `80` points when destroyed.

Enemy contact with the player causes damage.

## 11. Bullets and Collision

### Player bullets

- Travel at approximately `650` pixels per second.
- Live for approximately `1` second.
- Are removed when expired or outside the arena.
- Damage enemies on contact.

### Enemy bullets

- Travel at approximately `190` pixels per second.
- Live for approximately `3` seconds.
- Are pink and visually distinct from player bullets.
- Damage the player on contact.

Collision checks use distance-based circle approximations for the player, bullets, and enemies.

## 12. Salvage and Scoring

Destroyed enemies drop a salvage shard:

- Yellow glowing collectible
- Lifetime of approximately `8` seconds
- Pulled toward the player inside the magnet range
- Collected within approximately `20` pixels
- Awards `10` points

Score values:

- Chaser destroyed: `30`
- Shooter destroyed: `80`
- Salvage shard collected: `10`

## 13. Upgrades

After each completed sector, three upgrade cards are shown in randomized order. The player selects one before continuing.

### Overclocked coil

Description: `Fire rate +25%`

Implementation: Multiplies player fire delay by `0.75`.

### Reactive plating

Description: `Maximum hull +1`

Implementation:

- Maximum hull increases by `1`.
- Current hull increases by `1`.

### Salvage magnet

Description: `Pull shards from farther away`

Implementation: Increases magnet range by `45`.

Upgrades apply only to the current run and reset when a new run starts.

## 14. User Interface

### Main menu

Includes:

- Game title and setting
- Level selection
- Start Run button
- Movement and control hints
- Best score

### Gameplay HUD

Displays:

- Current score
- Current sector out of five
- Dash charge meter
- Hull pips
- Pause button

### Upgrade screen

Displays:

- Sector-cleared message
- Three randomized upgrade cards
- Upgrade names and descriptions

### Pause screen

Displays:

- Paused state
- Resume button
- Escape-key hint

### Result screen

Displays either:

- `HULL BREACH` after defeat
- `SALVAGE COMPLETE` after clearing Sector 5

It also displays:

- Final score
- Best score
- Sector reached
- Restart button
- Return to menu button

## 15. Audio

Audio is generated at runtime using the Web Audio API. No audio files are required.

Feedback sounds exist for:

- Player shooting
- Dash
- Enemy destruction
- Salvage collection
- Player damage
- Victory
- Game over
- Upgrade selection

Audio initialization begins after user interaction to comply with browser autoplay restrictions.

## 16. Visual Feedback

The game uses simple shapes and effects:

- Cyan triangular player ship
- Purple circular chasers
- Pink square shooters
- White player bullets
- Pink hostile bullets
- Yellow salvage shards
- Cyan/pink/purple glow effects
- Particle bursts
- Screen shake on damage
- Player flashing while invulnerable
- Dark grid arena

The visual approach favors clarity and fast implementation over detailed assets.

## 17. Persistence

Only the best score is persisted:

```text
localStorage key: neon-salvager-best
```

The score is loaded when the page starts and updated when a run ends with a new high score.

Level selection and upgrades are not persisted.

## 18. Responsive Behavior

The game shell scales to the browser viewport up to a maximum size of `1440 x 900`.

On smaller screens:

- Level cards stack vertically.
- HUD spacing is reduced.
- HUD text becomes smaller.
- Upgrade cards stack vertically.
- Control hints use smaller typography.

The game remains designed primarily for PC/Web play because aiming uses the mouse.

## 19. Architecture Characteristics

### Current strengths

- No build pipeline or dependency installation required.
- Small code footprint.
- All core gameplay is in one runtime module.
- Level behavior is data-driven through `levelRules`.
- UI screens are separated in HTML and shown/hidden through a shared helper.
- New upgrades and enemy variations can be added without changing the overall game structure.
- Local persistence avoids backend infrastructure.

### Current intentional limitations

- No server-side leaderboard.
- No multiplayer.
- No account system.
- No inventory or complex progression tree.
- No external asset pipeline.
- No level qualification or unlock requirements.
- No formal automated test suite.

## 20. Possible Extension Points

The current MVP can be extended through:

- Additional entries in `levelRules`
- New enemy flags and movement behaviors
- More upgrade definitions in the `upgrades` array
- New collectible types
- Additional arena layouts or hazards
- More persistent statistics
- Separate audio assets if synthesized audio becomes insufficient
- A dedicated scene/state manager if the number of screens grows
