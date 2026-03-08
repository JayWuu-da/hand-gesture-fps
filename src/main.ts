import './style.css';

import { loadGameAssets } from './assets';
import { RetroShooterGame } from './game';
import { GestureController } from './gesture-controller';
import type { CommandState } from './types';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="shell">
    <header class="masthead">
      <div class="brand-lockup">
        <p class="eyebrow">Gesture FPS Prototype</p>
        <h1>Play the arena with your hands.</h1>
        <p class="summary">
          A stripped-down retro shooter where the camera reads your hands and the arena
          answers instantly.
        </p>
      </div>

      <div class="top-actions">
        <button id="start-button" type="button">Enable Camera</button>
        <button id="restart-button" type="button" class="ghost">Reset Run</button>
        <button id="debug-toggle" type="button" class="ghost">Debug View</button>
      </div>
    </header>

    <div class="command-ribbon">
      <span>Both index fingers up to move</span>
      <span>Left fist / Right fist to steer</span>
      <span>Both open palms to fire</span>
    </div>

    <main class="experience">
      <section class="viewport-panel">
        <div class="viewport-head">
          <div class="viewport-copy">
            <span id="stage-name" class="stage-pill">Sector 01</span>
            <h2 id="objective-title">Clear the opening lane.</h2>
            <p id="status-message" class="status-line">
              Camera off. Turn it on, raise both hands, and enter the arena.
            </p>
          </div>

          <div class="utility-row">
            <button id="face-mask-button" type="button" class="tiny ghost">Face Mask Off</button>
          </div>
        </div>

        <canvas id="game-canvas" aria-label="Retro shooter viewport"></canvas>

        <div class="telemetry-strip">
          <div>
            <span class="telemetry-label">Health</span>
            <strong id="hud-health">100</strong>
          </div>
          <div>
            <span class="telemetry-label">Score</span>
            <strong id="hud-score">0</strong>
          </div>
          <div>
            <span class="telemetry-label">Sector</span>
            <strong id="hud-wave">1</strong>
          </div>
          <div>
            <span class="telemetry-label">Objective</span>
            <strong id="objective-progress">0 / 4</strong>
          </div>
        </div>
      </section>

      <aside class="support-rail">
        <section class="guide-card">
          <p class="guide-kicker">How It Feels</p>
          <h3>Gesture first. Debug second.</h3>
          <p>
            The arena should feel immediate: move, steer, and fire without decoding a control
            panel.
          </p>
          <ul class="guide-list">
            <li><strong>Move</strong> with both index fingers pointed up.</li>
            <li><strong>Turn</strong> with a left or right fist.</li>
            <li><strong>Spray fire</strong> with both hands open.</li>
            <li><strong>Fallback</strong> to <code>W</code>, <code>A</code>, <code>D</code>, <code>Space</code>.</li>
          </ul>
        </section>

        <details id="debug-panel" class="debug-panel">
          <summary>Debug View</summary>
          <div class="debug-grid">
            <section class="panel">
              <h3>Live Input</h3>
              <dl class="status-list">
                <div><dt>Camera</dt><dd id="camera-status">Idle</dd></div>
                <div><dt>Gesture</dt><dd id="gesture-name">No hands</dd></div>
                <div><dt>Confidence</dt><dd id="gesture-confidence">0%</dd></div>
                <div><dt>Turn</dt><dd id="turn-status">0.00</dd></div>
              </dl>
            </section>

            <section class="panel">
              <h3>Gesture Feed</h3>
              <div class="video-stack">
                <video id="gesture-video" autoplay playsinline muted></video>
                <canvas id="gesture-overlay"></canvas>
              </div>
            </section>
          </div>
        </details>
      </aside>
    </main>
  </div>
`;

const gameCanvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const video = document.querySelector<HTMLVideoElement>('#gesture-video')!;
const overlay = document.querySelector<HTMLCanvasElement>('#gesture-overlay')!;
const startButton = document.querySelector<HTMLButtonElement>('#start-button')!;
const restartButton = document.querySelector<HTMLButtonElement>('#restart-button')!;
const faceMaskButton = document.querySelector<HTMLButtonElement>('#face-mask-button')!;
const debugToggle = document.querySelector<HTMLButtonElement>('#debug-toggle')!;
const debugPanel = document.querySelector<HTMLDetailsElement>('#debug-panel')!;

const stageName = document.querySelector<HTMLElement>('#stage-name')!;
const objectiveTitle = document.querySelector<HTMLElement>('#objective-title')!;
const objectiveProgress = document.querySelector<HTMLElement>('#objective-progress')!;
const statusMessage = document.querySelector<HTMLElement>('#status-message')!;
const cameraStatus = document.querySelector<HTMLElement>('#camera-status')!;
const gestureName = document.querySelector<HTMLElement>('#gesture-name')!;
const gestureConfidence = document.querySelector<HTMLElement>('#gesture-confidence')!;
const turnStatus = document.querySelector<HTMLElement>('#turn-status')!;
const hudHealth = document.querySelector<HTMLElement>('#hud-health')!;
const hudScore = document.querySelector<HTMLElement>('#hud-score')!;
const hudWave = document.querySelector<HTMLElement>('#hud-wave')!;

const gestures = new GestureController(video, overlay);
const keyboard = {
  forward: false,
  turnLeft: false,
  turnRight: false,
  fire: false,
};

let game: RetroShooterGame | null = null;
let webcamStarted = false;
let animationFrame = 0;
let lastTime = performance.now();
let faceMaskEnabled = false;

async function bootstrap() {
  try {
    const assets = await loadGameAssets();
    game = new RetroShooterGame(gameCanvas, assets);
    updateHud('Camera off. Turn it on, raise both hands, and enter the arena.');
    animationFrame = requestAnimationFrame(frameLoop);
  } catch (error) {
    statusMessage.textContent =
      error instanceof Error ? error.message : 'Failed to load local game assets.';
    cameraStatus.textContent = 'Blocked';
    startButton.disabled = true;
    restartButton.disabled = true;
  }
}

function mapInput(): CommandState {
  const frame = webcamStarted ? gestures.sample() : null;
  const leftHand = frame?.hands.find((hand) => hand.handedness === 'Left');
  const rightHand = frame?.hands.find((hand) => hand.handedness === 'Right');
  const unknownHands = frame?.hands.filter((hand) => hand.handedness === 'Unknown') ?? [];
  const fallbackLeft = leftHand ?? unknownHands[0];
  const fallbackRight = rightHand ?? unknownHands[1];
  const keyboardTurn = (keyboard.turnRight ? 1 : 0) - (keyboard.turnLeft ? 1 : 0);
  const activeGesture = frame?.gesture ?? 'No hands';
  const bothPointUp =
    fallbackLeft?.gesture === 'Point Up' && fallbackRight?.gesture === 'Point Up';
  const bothOpen =
    fallbackLeft?.gesture === 'Open Palm' && fallbackRight?.gesture === 'Open Palm';
  const leftTurn = fallbackLeft?.gesture === 'Closed Fist';
  const rightTurn = fallbackRight?.gesture === 'Closed Fist';
  const turnFromGesture = leftTurn ? -0.85 : rightTurn ? 0.85 : 0;
  const commands: CommandState = {
    hasHand: Boolean(frame?.hasHand),
    forward: keyboard.forward || bothPointUp,
    fire: keyboard.fire || bothOpen,
    turn: clamp(turnFromGesture + keyboardTurn * 0.8, -1, 1),
    gesture: activeGesture,
    confidence: frame?.confidence ?? 0,
  };

  gestureName.textContent = commands.gesture;
  gestureConfidence.textContent = `${Math.round(commands.confidence * 100)}%`;
  turnStatus.textContent = commands.turn.toFixed(2);

  return commands;
}

function updateHud(message?: string) {
  if (!game) {
    return;
  }

  const hud = game.getHudSnapshot(message);
  hudHealth.textContent = `${hud.health}`;
  hudScore.textContent = `${hud.score}`;
  hudWave.textContent = `${hud.wave}`;
  stageName.textContent = hud.levelName;
  objectiveTitle.textContent = hud.mission;
  objectiveProgress.textContent = `${hud.kills} / ${hud.targetKills}`;
  statusMessage.textContent = hud.message;
}

function frameLoop(now: number) {
  if (!game) {
    return;
  }

  const rawDeltaSeconds = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  const commands = mapInput();
  const hasKeyboardInput =
    keyboard.forward || keyboard.turnLeft || keyboard.turnRight || keyboard.fire;
  const isGameplayActive = commands.hasHand || hasKeyboardInput;

  game.update(isGameplayActive ? rawDeltaSeconds : 0, commands);
  updateHud(
    !webcamStarted
      ? hasKeyboardInput
        ? 'Keyboard fallback active. Camera can stay off.'
        : 'Camera off. Turn it on, raise both hands, and enter the arena.'
      : commands.hasHand
        ? `Live input: ${commands.gesture}`
        : 'No hands detected. Raise both hands into frame.',
  );

  animationFrame = requestAnimationFrame(frameLoop);
}

async function startWebcamSession() {
  cameraStatus.textContent = 'Loading';
  statusMessage.textContent = 'Requesting camera permission...';

  try {
    await gestures.start();
    webcamStarted = true;
    cameraStatus.textContent = 'Live';
    statusMessage.textContent = 'Camera live. Raise both hands and play.';
  } catch (error) {
    cameraStatus.textContent = 'Failed';
    statusMessage.textContent =
      error instanceof Error ? error.message : 'Could not start webcam session.';
  }
}

function restartArena() {
  if (!game) {
    return;
  }

  game.reset();
  updateHud(webcamStarted ? 'Run reset. Sector one is live.' : 'Run reset. Camera is still off.');
}

startButton.addEventListener('click', async () => {
  if (webcamStarted) {
    gestures.stop();
    webcamStarted = false;
    cameraStatus.textContent = 'Idle';
    startButton.textContent = 'Enable Camera';
    updateHud('Camera off. Keyboard fallback is still available.');
    return;
  }

  await startWebcamSession();

  if (webcamStarted) {
    startButton.textContent = 'Disable Camera';
  }
});

restartButton.addEventListener('click', () => {
  restartArena();
});

debugToggle.addEventListener('click', () => {
  debugPanel.open = !debugPanel.open;
  debugToggle.textContent = debugPanel.open ? 'Hide Debug' : 'Debug View';
});

faceMaskButton.addEventListener('click', async () => {
  const nextState = !faceMaskEnabled;
  faceMaskButton.disabled = true;

  try {
    await gestures.setFaceMaskEnabled(nextState);
    faceMaskEnabled = nextState;
    faceMaskButton.textContent = `Face Mask ${faceMaskEnabled ? 'On' : 'Off'}`;

    if (webcamStarted) {
      statusMessage.textContent = faceMaskEnabled
        ? 'Camera live. Face mask is on.'
        : 'Camera live. Face mask is off.';
    }
  } catch (error) {
    statusMessage.textContent =
      error instanceof Error ? error.message : 'Could not change face mask mode.';
  } finally {
    faceMaskButton.disabled = false;
  }
});

window.addEventListener('keydown', (event) => {
  if (event.repeat) {
    return;
  }

  if (event.code === 'KeyW') keyboard.forward = true;
  if (event.code === 'KeyA') keyboard.turnLeft = true;
  if (event.code === 'KeyD') keyboard.turnRight = true;
  if (event.code === 'Space') keyboard.fire = true;
  if (event.code === 'KeyR') restartArena();
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'KeyW') keyboard.forward = false;
  if (event.code === 'KeyA') keyboard.turnLeft = false;
  if (event.code === 'KeyD') keyboard.turnRight = false;
  if (event.code === 'Space') keyboard.fire = false;
});

window.addEventListener('beforeunload', () => {
  cancelAnimationFrame(animationFrame);
  gestures.stop();
});

bootstrap();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
