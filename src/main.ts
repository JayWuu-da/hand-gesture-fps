import './style.css';

import { loadGameAssets } from './assets';
import { RetroShooterGame } from './game';
import { GestureController } from './gesture-controller';
import type { CommandState } from './types';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="shell">
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">Hand Gesture FPS Prototype</p>
        <h1>Gesture Doom-Like</h1>
        <p class="summary">
          Webcam one-hand gestures drive forward movement, turning, and single-shot attacks
          inside a retro survival corridor with Freedoom art assets.
        </p>
      </div>
      <div class="hero-actions">
        <button id="start-button" type="button">Start Webcam Run</button>
        <button id="restart-button" type="button" class="ghost">Restart Arena</button>
      </div>
    </section>

    <main class="layout">
      <section class="viewport-panel">
        <canvas id="game-canvas" aria-label="Retro shooter viewport"></canvas>
        <div class="hud-bar">
          <div><span class="hud-label">Health</span><strong id="hud-health">100</strong></div>
          <div><span class="hud-label">Score</span><strong id="hud-score">0</strong></div>
          <div><span class="hud-label">Wave</span><strong id="hud-wave">1</strong></div>
        </div>
      </section>

      <aside class="side-panel">
        <section class="panel">
          <h2>Input Status</h2>
          <dl class="status-list">
            <div><dt>Camera</dt><dd id="camera-status">Idle</dd></div>
            <div><dt>Gesture</dt><dd id="gesture-name">No hand</dd></div>
            <div><dt>Confidence</dt><dd id="gesture-confidence">0%</dd></div>
            <div><dt>Turn</dt><dd id="turn-status">0.00</dd></div>
          </dl>
          <p id="status-message" class="status-message">
            Loading retro assets, then allow webcam access.
          </p>
        </section>

        <section class="panel">
          <h2>Gesture Feed</h2>
          <div class="video-stack">
            <video id="gesture-video" autoplay playsinline muted></video>
            <canvas id="gesture-overlay"></canvas>
          </div>
        </section>

        <section class="panel">
          <h2>Mappings</h2>
          <ul class="mapping-list">
            <li><strong>Point Up</strong> moves forward.</li>
            <li><strong>Point Left</strong> turns left.</li>
            <li><strong>Point Right</strong> turns right.</li>
            <li><strong>Closed Fist</strong> fires.</li>
            <li><strong>Open Palm</strong> holds position.</li>
          </ul>
          <p class="dev-note">
            Dev fallback: <code>W</code>/<code>A</code>/<code>D</code> and <code>Space</code>.
          </p>
          <p class="credit-note">
            Visual assets: Freedoom subset, noted in <code>THIRD_PARTY_NOTICES.md</code>.
          </p>
        </section>
      </aside>
    </main>
  </div>
`;

const gameCanvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const video = document.querySelector<HTMLVideoElement>('#gesture-video')!;
const overlay = document.querySelector<HTMLCanvasElement>('#gesture-overlay')!;
const startButton = document.querySelector<HTMLButtonElement>('#start-button')!;
const restartButton = document.querySelector<HTMLButtonElement>('#restart-button')!;

if (!gameCanvas || !video || !overlay || !startButton || !restartButton) {
  throw new Error('The application shell did not render correctly.');
}

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

async function bootstrap() {
  try {
    const assets = await loadGameAssets();
    game = new RetroShooterGame(gameCanvas, assets);
    updateHud('Allow webcam access, then show one hand in frame.');
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
  const keyboardTurn = (keyboard.turnRight ? 1 : 0) - (keyboard.turnLeft ? 1 : 0);
  const activeGesture = frame?.gesture ?? 'No hand';
  const forwardFromGesture = activeGesture === 'Point Up';
  const turnFromGesture =
    activeGesture === 'Point Left' ? -0.85 : activeGesture === 'Point Right' ? 0.85 : 0;
  const fireFromGesture = activeGesture === 'Closed Fist';
  const commands: CommandState = {
    hasHand: Boolean(frame?.hasHand),
    forward: keyboard.forward || forwardFromGesture,
    fire: keyboard.fire || fireFromGesture,
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
      ? 'Webcam is idle. Start camera or use dev fallback keys.'
      : commands.hasHand
        ? `Tracking ${commands.gesture}`
        : 'No hand detected. Show one hand to continue.',
  );

  animationFrame = requestAnimationFrame(frameLoop);
}

async function startWebcamSession() {
  cameraStatus.textContent = 'Loading';
  statusMessage.textContent = 'Requesting webcam permission...';

  try {
    await gestures.start();
    webcamStarted = true;
    cameraStatus.textContent = 'Live';
    statusMessage.textContent = 'Gesture tracking is live.';
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
  updateHud(webcamStarted ? 'Arena restarted.' : 'Arena restarted. Webcam is still idle.');
}

startButton.addEventListener('click', async () => {
  if (webcamStarted) {
    gestures.stop();
    webcamStarted = false;
    cameraStatus.textContent = 'Idle';
    startButton.textContent = 'Start Webcam Run';
    updateHud('Webcam stopped. Dev fallback keys remain active.');
    return;
  }

  await startWebcamSession();

  if (webcamStarted) {
    startButton.textContent = 'Stop Webcam';
  }
});

restartButton.addEventListener('click', () => {
  restartArena();
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
