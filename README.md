# Gesture Doom-Like

Webcam hand-gesture FPS prototype built with `Vite`, `TypeScript`, canvas-based
raycasting, and MediaPipe gesture recognition.

This project is a non-commercial prototype. The current intent is research,
playtesting, and personal/demo use only.

## What this project does

- Uses a webcam to read gesture input from one or two hands
- Lets the player move and attack in a retro FPS scene
- Uses a small subset of Freedoom art assets for the current visual style
- Can optionally cover the face area in the webcam preview with a toggleable face mask
- Includes a play-first product UI with a launch overlay instead of a debug-first layout
- Adds lightweight Web Audio combat cues for shooting, hits, damage, and level transitions
- Runs through multiple sectors with escalating enemy pressure and mission goals

## Current gesture controls

- `Left hand closed fist`: turn left
- `Right hand closed fist`: turn right
- `Both hands point up`: move forward
- `Both hands open palm`: continuous fire
- Any other mixed pose: stop gesture-driven movement and turning

Development fallback controls:

- `W`: move forward
- `A`: turn left
- `D`: turn right
- `Space`: fire
- `R`: restart arena

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Asset and license note

This repository does **not** bundle original commercial Doom assets.

Instead, it includes a small subset of assets from the Freedoom project, which
is officially described as BSD-licensed / BSD 3-Clause licensed free content.

- Freedoom site: [https://freedoom.github.io/](https://freedoom.github.io/)
- Freedoom about page: [https://freedoom.github.io/about.html](https://freedoom.github.io/about.html)
- Freedoom source repository: [https://github.com/freedoom/freedoom](https://github.com/freedoom/freedoom)

The Freedoom project states that its content is free to use, modify, and
redistribute under its license terms. See the bundled notice file for the exact
attribution used in this project:

- [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)

Bundled Freedoom-derived files are currently located under:

- `public/assets/freedoom/`

## Commercial-use note

This prototype is currently intended to be **non-commercial**.

That statement is a project usage intention, not a claim that the Freedoom
license itself is limited to non-commercial use. If this project is ever moved
toward public distribution, monetization, or commercial use, the asset list and
license notices should be reviewed again before release.
