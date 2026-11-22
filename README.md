# Hoosier Jam

Two-on-two arcade basketball at the Muncie Sectional, live from the Fieldhouse. Inspired by the original arcade NBA Jam and Indiana's Hoosier Hysteria.

Built for phones, played in landscape with touch buttons.

**Play:** https://andyshearsphd.github.io/Hoosier-Jam/

## Full screen on iPhone

Safari won't hide its address bar on a regular web page, so use the home screen version:

1. Open the game in Safari.
2. Tap **Share**, then **Add to Home Screen**.
3. Launch **Hoosier Jam** from your home screen. It opens full screen with no browser bar.

## Controls

| Touch | Keyboard | On offense | On defense |
|---|---|---|---|
| Left thumb joystick | Arrows or WASD | Move | Move |
| SHOOT | Space or J | Shoot (hold, release at the top of the jump) | Jump to block or rebound |
| PASS | K | Pass to your teammate | Steal |
| TURBO | Shift or L | Run faster, dunk | Turbo + Steal = shove |

- Hold **TURBO** and press **SHOOT** near the rim to dunk. You can slide your thumb from TURBO onto SHOOT.
- When your CPU teammate has the ball, PASS calls for it and SHOOT tells him to shoot.
- Hit three in a row and you're **red hot**.

## The game

- Two-on-two, four 3-minute quarters, 24-second shot clock, overtime if tied.
- Pick 2 of your team's 3 players before tip-off, and sub at halftime.
- Every game is played in the Muncie Fieldhouse.

## Status

Early build. The Red Bulldogs and Blue Eagles are placeholder teams for testing the feel of the game. Delaware County schools and their all-time players are coming next.

## Files

- `index.html`: page, touch buttons, full-screen setup
- `js/teams.js`: rosters and ratings (edit this for new teams)
- `js/game.js`: gameplay, CPU players, screens
- `js/art.js`: pixel art for players, the floor and the Fieldhouse
- `js/font.js`, `js/audio.js`: arcade font and sound effects

No libraries, no build step. All art and sound is generated in code.
