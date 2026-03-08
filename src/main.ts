import './style.css';

import { AudioEngine } from './audio';
import { loadGameAssets } from './assets';
import { RetroShooterGame } from './game';
import { GestureController } from './gesture-controller';
import { SecretTechniqueController } from './secret-technique';
import type { CommandState, GestureFrame, HudSnapshot, SecretTechniqueState } from './types';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <div class="brand-lockup">
        <p class="eyebrow">Hand Gesture FPS</p>
        <div>
          <h1>Retro arena control, no keyboard required.</h1>
          <p class="summary">Raise both hands. Enter the lane. Keep the pressure on.</p>
        </div>
      </div>

      <div class="top-actions">
        <button id="start-button" type="button">Enable Camera</button>
        <button id="restart-button" type="button" class="ghost">Reset Run</button>
        <button id="sound-button" type="button" class="ghost">Sound On</button>
        <button id="debug-toggle" type="button" class="ghost">Debug</button>
      </div>
    </header>

    <main class="experience">
      <section class="stage-column">
        <div class="viewport-stage">
          <div class="viewport-chrome">
            <div>
              <span id="stage-name" class="stage-pill">Sector 01</span>
              <h2 id="objective-title">Break into the hangar lane.</h2>
            </div>
            <p id="status-message" class="status-line">
              Camera off. Turn it on, raise both hands, and enter the arena.
            </p>
          </div>

          <div class="canvas-frame">
            <canvas id="game-canvas" aria-label="Retro shooter viewport"></canvas>

            <div id="launch-overlay" class="launch-overlay active">
              <div class="overlay-panel">
                <p class="overlay-kicker">Camera-ready retro shooter</p>
                <h3 id="overlay-title">Play first. Read later.</h3>
                <p id="overlay-copy">
                  Bring both hands into frame to steer, move, and fire through the arena.
                </p>

                <div class="gesture-ribbon">
                  <span><strong>Move</strong> both index fingers up</span>
                  <span><strong>Turn</strong> left fist / right fist</span>
                  <span><strong>Fire</strong> both open palms</span>
                </div>

                <div class="overlay-actions">
                  <button id="hero-start-button" type="button">Enable Camera</button>
                  <button id="hero-restart-button" type="button" class="ghost">Reset Run</button>
                </div>

                <p class="overlay-note">Keyboard fallback: W / A / D / Space</p>
              </div>
            </div>
          </div>
        </div>

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
          <div>
            <span class="telemetry-label">Hostiles</span>
            <strong id="threat-status">3</strong>
          </div>
        </div>
      </section>

      <aside class="support-rail">
        <section class="control-card">
          <p class="card-kicker">Control Map</p>
          <div class="control-grid">
            <article><span>Move</span><strong>Both index up</strong></article>
            <article><span>Turn left</span><strong>Left fist</strong></article>
            <article><span>Turn right</span><strong>Right fist</strong></article>
            <article><span>Fire</span><strong>Both palms open</strong></article>
          </div>
        </section>

        <section class="status-card">
          <p class="card-kicker">Live Session</p>
          <dl class="status-list">
            <div><dt>Camera</dt><dd id="camera-status">Idle</dd></div>
            <div><dt>Gesture</dt><dd id="gesture-name">No hands</dd></div>
            <div><dt>Confidence</dt><dd id="gesture-confidence">0%</dd></div>
            <div><dt>Turn</dt><dd id="turn-status">0.00</dd></div>
            <div><dt>Sound</dt><dd id="audio-status">On</dd></div>
          </dl>
        </section>

        <section class="camera-card">
          <div class="camera-card-head">
            <p class="card-kicker">Camera Feed</p>
            <button id="face-mask-button" type="button" class="tiny ghost">Face Mask Off</button>
          </div>
          <div class="video-stack">
            <div id="camera-placeholder" class="camera-placeholder">
              Enable the camera to preview tracking and face masking.
            </div>
            <video id="gesture-video" autoplay playsinline muted></video>
            <canvas id="gesture-overlay"></canvas>
          </div>
        </section>

        <details id="debug-panel" class="debug-panel">
          <summary>Debug Surface</summary>
          <p class="debug-copy">Raw diagnostics stay out of the main view until you need them.</p>
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
const soundButton = document.querySelector<HTMLButtonElement>('#sound-button')!;
const faceMaskButton = document.querySelector<HTMLButtonElement>('#face-mask-button')!;
const debugToggle = document.querySelector<HTMLButtonElement>('#debug-toggle')!;
const heroStartButton = document.querySelector<HTMLButtonElement>('#hero-start-button')!;
const heroRestartButton = document.querySelector<HTMLButtonElement>('#hero-restart-button')!;
const debugPanel = document.querySelector<HTMLDetailsElement>('#debug-panel')!;

const launchOverlay = document.querySelector<HTMLDivElement>('#launch-overlay')!;
const overlayTitle = document.querySelector<HTMLElement>('#overlay-title')!;
const overlayCopy = document.querySelector<HTMLElement>('#overlay-copy')!;
const cameraPlaceholder = document.querySelector<HTMLDivElement>('#camera-placeholder')!;
const stageName = document.querySelector<HTMLElement>('#stage-name')!;
const objectiveTitle = document.querySelector<HTMLElement>('#objective-title')!;
const objectiveProgress = document.querySelector<HTMLElement>('#objective-progress')!;
const threatStatus = document.querySelector<HTMLElement>('#threat-status')!;
const statusMessage = document.querySelector<HTMLElement>('#status-message')!;
const cameraStatus = document.querySelector<HTMLElement>('#camera-status')!;
const gestureName = document.querySelector<HTMLElement>('#gesture-name')!;
const gestureConfidence = document.querySelector<HTMLElement>('#gesture-confidence')!;
const turnStatus = document.querySelector<HTMLElement>('#turn-status')!;
const audioStatus = document.querySelector<HTMLElement>('#audio-status')!;
const hudHealth = document.querySelector<HTMLElement>('#hud-health')!;
const hudScore = document.querySelector<HTMLElement>('#hud-score')!;
const hudWave = document.querySelector<HTMLElement>('#hud-wave')!;

const gestures = new GestureController(video, overlay);
const audio = new AudioEngine();
const secretTechnique = new SecretTechniqueController();
const keyboard = { forward: false, turnLeft: false, turnRight: false, fire: false };

let game: RetroShooterGame | null = null;
let webcamStarted = false;
let animationFrame = 0;
let lastTime = performance.now();
let faceMaskEnabled = false;
let soundEnabled = true;

async function bootstrap() {
  try {
    const assets = await loadGameAssets();
    game = new RetroShooterGame(gameCanvas, assets);
    updateUi('Camera off. Turn it on, raise both hands, and enter the arena.', false);
    animationFrame = requestAnimationFrame(frameLoop);
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : 'Failed to load local game assets.';
    cameraStatus.textContent = 'Blocked';
    startButton.disabled = true;
    heroStartButton.disabled = true;
    restartButton.disabled = true;
    heroRestartButton.disabled = true;
  }
}

function mapInput(frame: GestureFrame | null, special: SecretTechniqueState): CommandState {
  const leftHand = frame?.hands.find((hand) => hand.handedness === 'Left');
  const rightHand = frame?.hands.find((hand) => hand.handedness === 'Right');
  const unknownHands = frame?.hands.filter((hand) => hand.handedness === 'Unknown') ?? [];
  const fallbackLeft = leftHand ?? unknownHands[0];
  const fallbackRight = rightHand ?? unknownHands[1];
  const keyboardTurn = (keyboard.turnRight ? 1 : 0) - (keyboard.turnLeft ? 1 : 0);
  const bothPointUp = fallbackLeft?.gesture === 'Point Up' && fallbackRight?.gesture === 'Point Up';
  const bothOpen = fallbackLeft?.gesture === 'Open Palm' && fallbackRight?.gesture === 'Open Palm';
  const leftTurn = fallbackLeft?.gesture === 'Closed Fist';
  const rightTurn = fallbackRight?.gesture === 'Closed Fist';
  const turnFromGesture = leftTurn ? -0.85 : rightTurn ? 0.85 : 0;

  const commands: CommandState = {
    hasHand: Boolean(frame?.hasHand),
    forward: keyboard.forward || bothPointUp,
    fire: keyboard.fire || bothOpen,
    turn: clamp(turnFromGesture + keyboardTurn * 0.8, -1, 1),
    gesture: frame?.gesture ?? 'No hands',
    confidence: frame?.confidence ?? 0,
    special,
  };

  gestureName.textContent = commands.gesture;
  gestureConfidence.textContent = `${Math.round(commands.confidence * 100)}%`;
  turnStatus.textContent = commands.turn.toFixed(2);

  return commands;
}

function updateUi(message: string, hasKeyboardInput: boolean) {
  if (!game) return;

  const hud = game.getHudSnapshot(message);
  hudHealth.textContent = `${hud.health}`;
  hudScore.textContent = `${hud.score}`;
  hudWave.textContent = `${hud.wave}`;
  stageName.textContent = hud.levelName;
  objectiveTitle.textContent = hud.mission;
  objectiveProgress.textContent = `${hud.kills} / ${hud.targetKills}`;
  threatStatus.textContent = `${hud.liveEnemies}`;
  statusMessage.textContent = hud.message;
  audioStatus.textContent = soundEnabled ? 'On' : 'Muted';
  cameraPlaceholder.classList.toggle('hidden', webcamStarted);
  syncOverlay(hud, hasKeyboardInput);
}

function syncOverlay(hud: HudSnapshot, hasKeyboardInput: boolean) {
  const showAttract = hud.phase === 'live' && !webcamStarted && !hasKeyboardInput;
  const showEndcap = hud.phase === 'won' || hud.phase === 'lost';
  launchOverlay.classList.toggle('active', showAttract || showEndcap);

  if (hud.phase === 'won') {
    overlayTitle.textContent = 'Arena clear.';
    overlayCopy.textContent = 'All sectors are stable. Reset the run and push for a cleaner finish.';
    heroStartButton.textContent = 'Run Again';
    return;
  }

  if (hud.phase === 'lost') {
    overlayTitle.textContent = 'You went down.';
    overlayCopy.textContent = 'Reset the run, re-center your hands, and hit the lane again.';
    heroStartButton.textContent = 'Try Again';
    return;
  }

  overlayTitle.textContent = 'Play first. Read later.';
  overlayCopy.textContent = 'Bring both hands into frame to steer, move, and fire through the arena.';
  heroStartButton.textContent = webcamStarted ? 'Disable Camera' : 'Enable Camera';
}

async function toggleCamera() {
  await audio.prime();

  if (webcamStarted) {
    gestures.stop();
    secretTechnique.reset();
    webcamStarted = false;
    cameraStatus.textContent = 'Idle';
    startButton.textContent = 'Enable Camera';
    updateUi('Camera off. Keyboard fallback is still available.', hasKeyboardInput());
    return;
  }

  cameraStatus.textContent = 'Loading';
  statusMessage.textContent = 'Requesting camera permission...';

  try {
    await gestures.start();
    webcamStarted = true;
    cameraStatus.textContent = 'Live';
    startButton.textContent = 'Disable Camera';
    updateUi('Camera live. Raise both hands and play.', hasKeyboardInput());
  } catch (error) {
    cameraStatus.textContent = 'Failed';
    statusMessage.textContent = error instanceof Error ? error.message : 'Could not start webcam session.';
  }
}

async function restartArena() {
  if (!game) return;
  await audio.prime();
  secretTechnique.reset();
  game.reset();
  updateUi(webcamStarted ? 'Run reset. Sector one is live.' : 'Run reset. Camera is still off.', hasKeyboardInput());
}

function frameLoop(now: number) {
  if (!game) return;

  const rawDeltaSeconds = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  const frame = webcamStarted ? gestures.sample() : null;
  const special = secretTechnique.update(frame, rawDeltaSeconds);
  const commands = mapInput(frame, special);
  const keyboardActive = hasKeyboardInput();
  const isGameplayActive = commands.hasHand || keyboardActive;
  const status = special.phase !== 'idle' && special.phase !== 'cooldown'
    ? special.label
    : !webcamStarted
      ? keyboardActive
        ? 'Keyboard fallback active. Camera can stay off.'
        : 'Camera off. Turn it on, raise both hands, and enter the arena.'
      : commands.hasHand
        ? `Live input: ${commands.gesture}`
        : 'No hands detected. Raise both hands into frame.';

  game.update(isGameplayActive ? rawDeltaSeconds : 0, commands);
  audio.play(game.drainEvents());
  updateUi(status, keyboardActive);
  animationFrame = requestAnimationFrame(frameLoop);
}

function hasKeyboardInput() {
  return keyboard.forward || keyboard.turnLeft || keyboard.turnRight || keyboard.fire;
}

startButton.addEventListener('click', () => void toggleCamera());
heroStartButton.addEventListener('click', () => {
  if (!game) return;
  const hud = game.getHudSnapshot();
  if (hud.phase === 'won' || hud.phase === 'lost') {
    void restartArena();
    return;
  }
  void toggleCamera();
});
restartButton.addEventListener('click', () => void restartArena());
heroRestartButton.addEventListener('click', () => void restartArena());

soundButton.addEventListener('click', async () => {
  await audio.prime();
  soundEnabled = !soundEnabled;
  audio.setEnabled(soundEnabled);
  soundButton.textContent = `Sound ${soundEnabled ? 'On' : 'Off'}`;
  updateUi(webcamStarted ? 'Sound setting updated.' : 'Camera off. Sound setting updated.', hasKeyboardInput());
});

debugToggle.addEventListener('click', () => {
  debugPanel.open = !debugPanel.open;
  debugToggle.textContent = debugPanel.open ? 'Hide Debug' : 'Debug';
});

faceMaskButton.addEventListener('click', async () => {
  const nextState = !faceMaskEnabled;
  faceMaskButton.disabled = true;

  try {
    await gestures.setFaceMaskEnabled(nextState);
    faceMaskEnabled = nextState;
    faceMaskButton.textContent = `Face Mask ${faceMaskEnabled ? 'On' : 'Off'}`;
    updateUi(faceMaskEnabled ? 'Face mask is on.' : 'Face mask is off.', hasKeyboardInput());
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : 'Could not change face mask mode.';
  } finally {
    faceMaskButton.disabled = false;
  }
});

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.code === 'KeyW') keyboard.forward = true;
  if (event.code === 'KeyA') keyboard.turnLeft = true;
  if (event.code === 'KeyD') keyboard.turnRight = true;
  if (event.code === 'Space') keyboard.fire = true;
  if (event.code === 'KeyR') void restartArena();
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
  secretTechnique.reset();
});

bootstrap();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
