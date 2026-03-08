import type { GameAssets } from './assets';
import type { CommandState, GameEvent, HudSnapshot, SecretTechniqueState, TechniqueAnchor } from './types';

interface PlayerState {
  x: number;
  y: number;
  angle: number;
  health: number;
  score: number;
}

interface EnemyState {
  x: number;
  y: number;
  alive: boolean;
  respawnAt: number;
  attackCooldown: number;
  spawnIndex: number;
}

interface RayHit {
  distance: number;
  side: 'x' | 'y';
  textureX: number;
}

interface LevelDefinition {
  name: string;
  mission: string;
  mapRows: string[];
  start: { x: number; y: number; angle: number };
  enemySpawns: Array<{ x: number; y: number }>;
  targetKills: number;
  enemySpeed: number;
  enemyDamage: number;
  respawnDelayMs: number;
  ceilingTop: string;
  ceilingBottom: string;
  floorTop: string;
  floorBottom: string;
  accent: string;
}

interface ShellParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  rotation: number;
  spin: number;
}

interface FlashParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
}

interface TracerParticle {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  width: number;
  color: string;
}

const LEVELS: LevelDefinition[] = [
  {
    name: 'Sector 01',
    mission: 'Break into the hangar lane and erase the first patrol.',
    mapRows: [
      '11111111111111',
      '10000000000001',
      '10111101111101',
      '10000000000001',
      '10110111101101',
      '10000000000001',
      '10111101111101',
      '10000000000001',
      '10110100001101',
      '10000000000001',
      '10111111111101',
      '11111111111111',
    ],
    start: { x: 2.1, y: 5.5, angle: 0 },
    enemySpawns: [{ x: 7.6, y: 5.5 }, { x: 10.4, y: 3.4 }, { x: 10.5, y: 7.5 }],
    targetKills: 4,
    enemySpeed: 0.92,
    enemyDamage: 8,
    respawnDelayMs: 2200,
    ceilingTop: '#24152d',
    ceilingBottom: '#08060c',
    floorTop: '#6f3515',
    floorBottom: '#170803',
    accent: '#ffb55f',
  },
  {
    name: 'Sector 02',
    mission: 'Circle the furnace loop before the corridor closes around you.',
    mapRows: [
      '11111111111111',
      '10000010000001',
      '10111010111101',
      '10001010000101',
      '11101011110101',
      '10001000010101',
      '10111111010101',
      '10000001000101',
      '10111101110101',
      '10000000000101',
      '10111111111101',
      '11111111111111',
    ],
    start: { x: 2.0, y: 1.8, angle: 0.35 },
    enemySpawns: [{ x: 6.6, y: 1.8 }, { x: 10.5, y: 3.5 }, { x: 10.5, y: 8.6 }, { x: 4.5, y: 9.2 }],
    targetKills: 6,
    enemySpeed: 1.06,
    enemyDamage: 10,
    respawnDelayMs: 1800,
    ceilingTop: '#351725',
    ceilingBottom: '#0f070b',
    floorTop: '#7a330f',
    floorBottom: '#1c0903',
    accent: '#ff8d59',
  },
  {
    name: 'Sector 03',
    mission: 'Enter the core floor, hold the center, and survive the surge.',
    mapRows: [
      '11111111111111',
      '10000000000001',
      '10111101111101',
      '10000100001001',
      '10100101101001',
      '10000000000001',
      '10100101101001',
      '10000100001001',
      '10111101111101',
      '10000000000001',
      '10111111111101',
      '11111111111111',
    ],
    start: { x: 2.1, y: 5.5, angle: 0 },
    enemySpawns: [
      { x: 8.2, y: 5.5 },
      { x: 11.2, y: 2.2 },
      { x: 11.2, y: 8.8 },
      { x: 6.2, y: 1.8 },
      { x: 6.2, y: 9.2 },
    ],
    targetKills: 9,
    enemySpeed: 1.2,
    enemyDamage: 12,
    respawnDelayMs: 1400,
    ceilingTop: '#320f19',
    ceilingBottom: '#10050a',
    floorTop: '#8d330c',
    floorBottom: '#210903',
    accent: '#ff6447',
  },
];

const MAX_VIEW_DISTANCE = 20;
const FOV = Math.PI / 3;
const TURN_SPEED = 2.2;
const MOVE_SPEED = 1.95;
const FIRE_COOLDOWN = 0.11;
const PLAYER_RADIUS = 0.18;
const HUD_HEIGHT = 32;
const TRANSITION_DELAY_MS = 2200;
const SHELL_LIFE = 0.65;
const FLASH_LIFE = 0.18;
const TRACER_LIFE = 0.08;
const EMPTY_TECHNIQUE: SecretTechniqueState = {
  phase: 'idle',
  label: 'Idle',
  akaCharge: 0,
  aoCharge: 0,
  fusionCharge: 0,
  purpleCharge: 0,
  fired: false,
  leftAnchor: null,
  rightAnchor: null,
};

export class RetroShooterGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly assets: GameAssets;
  private readonly width = 320;
  private readonly viewportHeight = 200;
  private readonly height = this.viewportHeight + HUD_HEIGHT;
  private readonly zBuffer = new Float32Array(this.width);
  private player: PlayerState = this.createFreshPlayer();
  private enemies: EnemyState[] = [];
  private currentLevelIndex = 0;
  private currentLevel = LEVELS[0];
  private killsThisLevel = 0;
  private fireCooldown = 0;
  private readonly floorPattern: CanvasPattern | null;
  private readonly wallPattern: CanvasPattern | null;
  private ceilingGradient: CanvasGradient;
  private floorGradient: CanvasGradient;
  private transitionEndsAt = 0;
  private transitionMessage = '';
  private gameWon = false;
  private deathAnnounced = false;
  private totalTime = 0;
  private muzzleFlash = 0;
  private recoilKick = 0;
  private screenShake = 0;
  private damageFlash = 0;
  private violetFlash = 0;
  private hitMarker = 0;
  private levelBanner = 0;
  private violetBeamLife = 0;
  private shells: ShellParticle[] = [];
  private flashes: FlashParticle[] = [];
  private tracers: TracerParticle[] = [];
  private pendingEvents: GameEvent[] = [];
  private activeTechnique: SecretTechniqueState = { ...EMPTY_TECHNIQUE };

  constructor(canvas: HTMLCanvasElement, assets: GameAssets) {
    this.canvas = canvas;
    this.assets = assets;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    const context = this.canvas.getContext('2d');

    if (!context) {
      throw new Error('2D canvas context could not be created.');
    }

    this.ctx = context;
    this.ctx.imageSmoothingEnabled = false;
    this.floorPattern = this.ctx.createPattern(this.assets.floorTexture, 'repeat');
    this.wallPattern = this.ctx.createPattern(this.assets.wallTexture, 'repeat');
    this.ceilingGradient = this.ctx.createLinearGradient(0, 0, 0, this.viewportHeight / 2);
    this.floorGradient = this.ctx.createLinearGradient(0, this.viewportHeight / 2, 0, this.viewportHeight);

    this.reset();
  }

  reset() {
    this.player = this.createFreshPlayer();
    this.currentLevelIndex = 0;
    this.currentLevel = LEVELS[0];
    this.player.score = 0;
    this.totalTime = 0;
    this.gameWon = false;
    this.deathAnnounced = false;
    this.transitionEndsAt = 0;
    this.transitionMessage = '';
    this.fireCooldown = 0;
    this.muzzleFlash = 0;
    this.recoilKick = 0;
    this.screenShake = 0;
    this.damageFlash = 0;
    this.violetFlash = 0;
    this.hitMarker = 0;
    this.levelBanner = 0;
    this.violetBeamLife = 0;
    this.shells = [];
    this.flashes = [];
    this.tracers = [];
    this.pendingEvents = [];
    this.activeTechnique = { ...EMPTY_TECHNIQUE };
    this.loadLevel(0, false);
    this.render(this.currentLevel.mission);
  }

  update(deltaSeconds: number, commands: CommandState) {
    this.activeTechnique = commands.special;
    this.updateEffects(deltaSeconds);

    if (this.gameWon) {
      this.render('Run complete. The arena is clear.');
      return;
    }

    if (this.player.health <= 0) {
      this.render('You are down. Reset run to re-enter.');
      return;
    }

    if (this.transitionEndsAt > 0) {
      if (performance.now() >= this.transitionEndsAt) {
        this.advanceLevel();
      }

      this.render(this.transitionMessage);
      return;
    }

    this.totalTime += deltaSeconds;
    this.player.angle = normalizeAngle(this.player.angle + commands.turn * TURN_SPEED * deltaSeconds);

    if (commands.forward) {
      const targetX = this.player.x + Math.cos(this.player.angle) * MOVE_SPEED * deltaSeconds;
      const targetY = this.player.y + Math.sin(this.player.angle) * MOVE_SPEED * deltaSeconds;

      if (!this.collides(targetX, this.player.y)) {
        this.player.x = targetX;
      }

      if (!this.collides(this.player.x, targetY)) {
        this.player.y = targetY;
      }
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - deltaSeconds);

    if (commands.fire && this.fireCooldown === 0) {
      this.fireOnce();
      this.fireCooldown = FIRE_COOLDOWN;
    }

    if (commands.special.fired) {
      this.fireVioletBeam();
    }

    this.updateEnemies(deltaSeconds);

    const message = commands.hasHand
      ? `${commands.gesture || 'Tracking'} ${Math.round(commands.confidence * 100)}%`
      : 'Raise both hands into frame.';

    this.render(message);
  }

  getHudSnapshot(message = 'Ready for gesture control.'): HudSnapshot {
    return {
      health: Math.max(0, Math.round(this.player.health)),
      score: this.player.score,
      wave: this.currentLevelIndex + 1,
      gameOver: this.player.health <= 0,
      gameWon: this.gameWon,
      phase: this.gameWon ? 'won' : this.player.health <= 0 ? 'lost' : this.transitionEndsAt > 0 ? 'transition' : 'live',
      message,
      levelName: this.currentLevel.name,
      mission: this.currentLevel.mission,
      kills: this.killsThisLevel,
      targetKills: this.currentLevel.targetKills,
      liveEnemies: this.enemies.filter((enemy) => enemy.alive).length,
    };
  }

  drainEvents() {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  private createFreshPlayer(): PlayerState {
    return {
      x: 1.5,
      y: 1.5,
      angle: 0,
      health: 100,
      score: 0,
    };
  }

  private loadLevel(levelIndex: number, preserveHealth: boolean) {
    this.currentLevelIndex = levelIndex;
    this.currentLevel = LEVELS[levelIndex];
    this.killsThisLevel = 0;
    this.transitionEndsAt = 0;
    this.transitionMessage = '';
    this.levelBanner = 1.85;
    this.damageFlash = 0;
    this.screenShake = 0;
    this.player.x = this.currentLevel.start.x;
    this.player.y = this.currentLevel.start.y;
    this.player.angle = this.currentLevel.start.angle;
    this.player.health = preserveHealth ? Math.min(100, this.player.health + 18) : 100;
    this.configureGradients();
    this.enemies = this.currentLevel.enemySpawns.map((spawn, spawnIndex) => ({
      x: spawn.x,
      y: spawn.y,
      alive: true,
      respawnAt: 0,
      attackCooldown: spawnIndex * 0.25,
      spawnIndex,
    }));
    this.pendingEvents.push({ type: 'level-start' });
  }

  private configureGradients() {
    this.ceilingGradient = this.ctx.createLinearGradient(0, 0, 0, this.viewportHeight / 2);
    this.ceilingGradient.addColorStop(0, this.currentLevel.ceilingTop);
    this.ceilingGradient.addColorStop(1, this.currentLevel.ceilingBottom);

    this.floorGradient = this.ctx.createLinearGradient(0, this.viewportHeight / 2, 0, this.viewportHeight);
    this.floorGradient.addColorStop(0, this.currentLevel.floorTop);
    this.floorGradient.addColorStop(1, this.currentLevel.floorBottom);
  }

  private advanceLevel() {
    if (this.currentLevelIndex >= LEVELS.length - 1) {
      this.gameWon = true;
      this.transitionEndsAt = 0;
      this.transitionMessage = 'All sectors clear.';
      this.pendingEvents.push({ type: 'run-complete' });
      this.render('All sectors clear. Gesture FPS complete.');
      return;
    }

    this.loadLevel(this.currentLevelIndex + 1, true);
    this.render(this.currentLevel.mission);
  }

  private collides(x: number, y: number) {
    if (this.isWall(x, y)) {
      return true;
    }

    return this.enemies.some((enemy) => {
      if (!enemy.alive) {
        return false;
      }

      return Math.hypot(enemy.x - x, enemy.y - y) < PLAYER_RADIUS * 2;
    });
  }

  private fireOnce() {
    this.pendingEvents.push({ type: 'shot' });
    this.muzzleFlash = FLASH_LIFE;
    this.recoilKick = 1;
    this.screenShake = Math.max(this.screenShake, 3.2);
    this.spawnShell();

    let bestTarget: { enemy: EnemyState; distance: number; relativeAngle: number } | null = null;

    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        continue;
      }

      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const distance = Math.hypot(dx, dy);
      const angleToEnemy = Math.atan2(dy, dx);
      const relativeAngle = normalizeAngle(angleToEnemy - this.player.angle);
      const wallDistance = this.castRay(angleToEnemy).distance;

      if (Math.abs(relativeAngle) > 0.14 || distance > 10 || wallDistance + 0.1 < distance) {
        continue;
      }

      if (!bestTarget || distance < bestTarget.distance) {
        bestTarget = { enemy, distance, relativeAngle };
      }
    }

    if (!bestTarget) {
      this.pendingEvents.push({ type: 'miss' });
      this.spawnTracer(this.width / 2 + (Math.random() - 0.5) * 28, this.viewportHeight / 2 - 4);
      this.spawnScreenFlashes(this.width / 2 + (Math.random() - 0.5) * 16, this.viewportHeight / 2 + (Math.random() - 0.5) * 10, '#ffd76b', 4, 0.45);
      return;
    }

    bestTarget.enemy.alive = false;
    bestTarget.enemy.respawnAt = performance.now() + this.currentLevel.respawnDelayMs;
    this.player.score += 125;
    this.killsThisLevel += 1;
    this.hitMarker = 0.14;
    this.screenShake = Math.max(this.screenShake, 4.2);
    this.pendingEvents.push({ type: 'hit' });

    const impactX = ((bestTarget.relativeAngle + FOV / 2) / FOV) * this.width;
    const impactY = this.viewportHeight / 2 - Math.min(this.viewportHeight * 0.18, (this.viewportHeight / bestTarget.distance) * 0.08);

    this.spawnTracer(impactX, impactY);
    this.spawnScreenFlashes(impactX, impactY, '#ff7d52', 10, 1);

    this.checkLevelClear();
  }

  private fireVioletBeam() {
    this.pendingEvents.push({ type: 'special-fire' });
    this.violetBeamLife = 0.42;
    this.violetFlash = 0.8;
    this.screenShake = Math.max(this.screenShake, 9.5);
    this.hitMarker = 0.22;
    this.spawnScreenFlashes(this.width / 2, this.viewportHeight / 2, '#cc84ff', 28, 1.45);

    let kills = 0;

    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        continue;
      }

      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const distance = Math.hypot(dx, dy);
      const angleToEnemy = Math.atan2(dy, dx);
      const relativeAngle = normalizeAngle(angleToEnemy - this.player.angle);
      const wallDistance = this.castRay(angleToEnemy).distance;

      if (Math.abs(relativeAngle) > 0.28 || distance > 15.5 || wallDistance + 0.2 < distance) {
        continue;
      }

      enemy.alive = false;
      enemy.respawnAt = performance.now() + this.currentLevel.respawnDelayMs;
      this.player.score += 250;
      this.killsThisLevel += 1;
      kills += 1;

      const impactX = ((relativeAngle + FOV / 2) / FOV) * this.width;
      const impactY =
        this.viewportHeight / 2 -
        Math.min(this.viewportHeight * 0.2, (this.viewportHeight / distance) * 0.1);
      this.spawnScreenFlashes(impactX, impactY, '#c86fff', 14, 1.2);
    }

    if (kills === 0) {
      this.spawnScreenFlashes(this.width / 2, this.viewportHeight / 2, '#8e5bff', 10, 0.85);
    }

    this.checkLevelClear();
  }

  private checkLevelClear() {
    if (this.killsThisLevel < this.currentLevel.targetKills || this.transitionEndsAt > 0) {
      return;
    }

    this.transitionEndsAt = performance.now() + TRANSITION_DELAY_MS;
    this.transitionMessage =
      this.currentLevelIndex === LEVELS.length - 1
        ? 'Core stable. Final sector complete.'
        : `${this.currentLevel.name} clear. Redirecting to ${LEVELS[this.currentLevelIndex + 1].name}.`;
    this.pendingEvents.push({ type: 'level-clear' });
  }

  private spawnShell() {
    this.shells.push({
      x: this.width / 2 + 46,
      y: this.viewportHeight - 52,
      vx: 42 + Math.random() * 24,
      vy: -65 - Math.random() * 20,
      life: SHELL_LIFE,
      rotation: Math.random() * Math.PI,
      spin: 7 + Math.random() * 6,
    });
  }

  private spawnTracer(targetX: number, targetY: number) {
    this.tracers.push({
      x1: this.width / 2 + 12,
      y1: this.viewportHeight - 86,
      x2: targetX,
      y2: targetY,
      life: TRACER_LIFE,
      width: 1.8 + Math.random() * 1.2,
      color: '#ffd76b',
    });
  }

  private spawnScreenFlashes(x: number, y: number, color: string, count: number, spread: number) {
    for (let index = 0; index < count; index += 1) {
      this.flashes.push({
        x: x + (Math.random() - 0.5) * 18,
        y: y + (Math.random() - 0.5) * 18,
        vx: (Math.random() - 0.5) * 120 * spread,
        vy: (Math.random() - 0.5) * 120 * spread,
        life: FLASH_LIFE + Math.random() * 0.08,
        size: 2 + Math.random() * 4,
        color,
      });
    }
  }

  private updateEffects(deltaSeconds: number) {
    this.muzzleFlash = Math.max(0, this.muzzleFlash - deltaSeconds);
    this.recoilKick = Math.max(0, this.recoilKick - deltaSeconds * 8);
    this.screenShake = Math.max(0, this.screenShake - deltaSeconds * 10);
    this.damageFlash = Math.max(0, this.damageFlash - deltaSeconds * 1.8);
    this.violetFlash = Math.max(0, this.violetFlash - deltaSeconds * 2.6);
    this.hitMarker = Math.max(0, this.hitMarker - deltaSeconds * 2.6);
    this.levelBanner = Math.max(0, this.levelBanner - deltaSeconds);
    this.violetBeamLife = Math.max(0, this.violetBeamLife - deltaSeconds);

    this.shells = this.shells
      .map((shell) => ({
        ...shell,
        x: shell.x + shell.vx * deltaSeconds,
        y: shell.y + shell.vy * deltaSeconds,
        vx: shell.vx * 0.98,
        vy: shell.vy + 180 * deltaSeconds,
        life: shell.life - deltaSeconds,
        rotation: shell.rotation + shell.spin * deltaSeconds,
      }))
      .filter((shell) => shell.life > 0 && shell.y < this.viewportHeight + 20);

    this.flashes = this.flashes
      .map((flash) => ({
        ...flash,
        x: flash.x + flash.vx * deltaSeconds,
        y: flash.y + flash.vy * deltaSeconds,
        vx: flash.vx * 0.88,
        vy: flash.vy * 0.88,
        life: flash.life - deltaSeconds,
      }))
      .filter((flash) => flash.life > 0);

    this.tracers = this.tracers
      .map((tracer) => ({
        ...tracer,
        life: tracer.life - deltaSeconds,
      }))
      .filter((tracer) => tracer.life > 0);
  }

  private updateEnemies(deltaSeconds: number) {
    const now = performance.now();

    this.enemies.forEach((enemy) => {
      if (!enemy.alive) {
        if (this.killsThisLevel < this.currentLevel.targetKills && now >= enemy.respawnAt) {
          const spawn = this.currentLevel.enemySpawns[enemy.spawnIndex];
          enemy.x = spawn.x;
          enemy.y = spawn.y;
          enemy.alive = true;
          enemy.attackCooldown = 0.5;
        }

        return;
      }

      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - deltaSeconds);

      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const distance = Math.hypot(dx, dy);

      if (distance > 0.9) {
        const step = deltaSeconds * this.currentLevel.enemySpeed;
        const nextX = enemy.x + (dx / distance) * step;
        const nextY = enemy.y + (dy / distance) * step;

        if (!this.isWall(nextX, enemy.y)) {
          enemy.x = nextX;
        }

        if (!this.isWall(enemy.x, nextY)) {
          enemy.y = nextY;
        }
      } else if (enemy.attackCooldown === 0) {
        this.player.health -= this.currentLevel.enemyDamage;
        enemy.attackCooldown = 0.72;
        this.damageFlash = Math.min(0.88, this.damageFlash + 0.42);
        this.screenShake = Math.max(this.screenShake, 5.2);
        this.spawnScreenFlashes(this.width / 2 + (Math.random() - 0.5) * 40, this.viewportHeight / 2 + (Math.random() - 0.5) * 28, '#ff4e3b', 6, 0.6);
        this.pendingEvents.push({ type: 'hurt' });

        if (this.player.health <= 0 && !this.deathAnnounced) {
          this.deathAnnounced = true;
          this.pendingEvents.push({ type: 'player-down' });
        }
      }
    });
  }

  private isWall(x: number, y: number) {
    const column = Math.floor(x);
    const row = Math.floor(y);

    if (
      row < 0 ||
      row >= this.currentLevel.mapRows.length ||
      column < 0 ||
      column >= this.currentLevel.mapRows[0].length
    ) {
      return true;
    }

    return this.currentLevel.mapRows[row][column] === '1';
  }

  private castRay(angle: number): RayHit {
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);

    let mapX = Math.floor(this.player.x);
    let mapY = Math.floor(this.player.y);

    const deltaDistX = directionX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / directionX);
    const deltaDistY = directionY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / directionY);

    let stepX = 0;
    let stepY = 0;
    let sideDistX = 0;
    let sideDistY = 0;

    if (directionX < 0) {
      stepX = -1;
      sideDistX = (this.player.x - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1 - this.player.x) * deltaDistX;
    }

    if (directionY < 0) {
      stepY = -1;
      sideDistY = (this.player.y - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1 - this.player.y) * deltaDistY;
    }

    let hitSide: 'x' | 'y' = 'x';

    while (true) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        hitSide = 'x';
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        hitSide = 'y';
      }

      if (
        mapY < 0 ||
        mapY >= this.currentLevel.mapRows.length ||
        mapX < 0 ||
        mapX >= this.currentLevel.mapRows[0].length
      ) {
        break;
      }

      if (this.currentLevel.mapRows[mapY][mapX] === '1') {
        break;
      }
    }

    const rawDistance =
      hitSide === 'x'
        ? (mapX - this.player.x + (1 - stepX) / 2) / directionX
        : (mapY - this.player.y + (1 - stepY) / 2) / directionY;

    return {
      distance: Math.min(Math.abs(rawDistance), MAX_VIEW_DISTANCE),
      side: hitSide,
      textureX: this.getTextureX(hitSide, Math.abs(rawDistance), directionX, directionY),
    };
  }

  private getTextureX(hitSide: 'x' | 'y', distance: number, directionX: number, directionY: number) {
    const wallX =
      hitSide === 'x'
        ? this.player.y + distance * directionY
        : this.player.x + distance * directionX;
    const fractionalX = wallX - Math.floor(wallX);
    let textureX = Math.floor(fractionalX * this.assets.wallTexture.width);

    if ((hitSide === 'x' && directionX > 0) || (hitSide === 'y' && directionY < 0)) {
      textureX = this.assets.wallTexture.width - textureX - 1;
    }

    return Math.max(0, Math.min(this.assets.wallTexture.width - 1, textureX));
  }

  private render(message = 'Ready for gesture control.') {
    const shakeX = this.screenShake > 0 ? (Math.random() - 0.5) * this.screenShake : 0;
    const shakeY = this.screenShake > 0 ? (Math.random() - 0.5) * this.screenShake : 0;

    this.ctx.save();
    this.ctx.translate(shakeX, shakeY);
    this.renderBackdrop();

    for (let column = 0; column < this.width; column += 1) {
      const cameraX = (column / this.width) * 2 - 1;
      const rayAngle = this.player.angle + cameraX * (FOV / 2);
      const hit = this.castRay(rayAngle);
      const correctedDistance = Math.max(0.0001, hit.distance * Math.cos(rayAngle - this.player.angle));
      const wallHeight = Math.min(this.viewportHeight, Math.floor(this.viewportHeight / correctedDistance));
      const wallTop = Math.floor(this.viewportHeight / 2 - wallHeight / 2);
      const shade = Math.max(0.18, 1 - correctedDistance / MAX_VIEW_DISTANCE);

      this.zBuffer[column] = correctedDistance;
      this.drawWallColumn(column, wallTop, wallHeight, hit.textureX, shade);
    }

    this.renderEnemies();
    this.renderTechniqueCharge();
    this.renderVioletBeam();
    this.renderTracers();
    this.renderWeapon();
    this.renderCrosshair();
    this.renderImpactFlashes();
    this.renderShells();
    this.ctx.restore();

    this.renderHud();
    this.renderMessage(message);
    this.renderCenterCards();
    this.renderPostFx();
  }

  private renderBackdrop() {
    this.ctx.fillStyle = this.ceilingGradient;
    this.ctx.fillRect(0, 0, this.width, this.viewportHeight / 2);
    this.ctx.fillStyle = this.floorGradient;
    this.ctx.fillRect(0, this.viewportHeight / 2, this.width, this.viewportHeight / 2);

    this.ctx.fillStyle = 'rgba(255, 156, 87, 0.06)';
    this.ctx.fillRect(0, this.viewportHeight / 2 - 12, this.width, 18);

    if (this.wallPattern) {
      this.ctx.save();
      this.ctx.translate(-this.player.angle * 42, 0);
      this.ctx.globalAlpha = 0.14;
      this.ctx.fillStyle = this.wallPattern;
      this.ctx.fillRect(-64, 0, this.width + 128, this.viewportHeight / 2);
      this.ctx.restore();
    }

    if (this.floorPattern) {
      this.ctx.save();
      this.ctx.translate(-this.player.x * 16, this.player.y * 8);
      this.ctx.globalAlpha = 0.32;
      this.ctx.fillStyle = this.floorPattern;
      this.ctx.fillRect(0, this.viewportHeight / 2, this.width, this.viewportHeight / 2);
      this.ctx.restore();
    }
  }

  private drawWallColumn(column: number, wallTop: number, wallHeight: number, textureX: number, shade: number) {
    this.ctx.drawImage(
      this.assets.wallTexture,
      textureX,
      0,
      1,
      this.assets.wallTexture.height,
      column,
      wallTop,
      1,
      wallHeight,
    );

    this.ctx.fillStyle = `rgba(22, 5, 2, ${Math.max(0.08, 0.84 - shade)})`;
    this.ctx.fillRect(column, wallTop, 1, wallHeight);
  }

  private renderEnemies() {
    const visibleEnemies = this.enemies
      .filter((enemy) => enemy.alive)
      .map((enemy) => {
        const dx = enemy.x - this.player.x;
        const dy = enemy.y - this.player.y;
        const distance = Math.hypot(dx, dy);
        const angle = normalizeAngle(Math.atan2(dy, dx) - this.player.angle);
        return { distance, angle };
      })
      .filter((entry) => {
        if (Math.abs(entry.angle) > FOV / 2 + 0.12) {
          return false;
        }

        const wallDistance = this.castRay(this.player.angle + entry.angle).distance;
        return wallDistance + 0.1 >= entry.distance;
      })
      .sort((left, right) => right.distance - left.distance);

    visibleEnemies.forEach(({ distance, angle }) => {
      const spriteHeight = Math.min(this.viewportHeight * 1.15, (this.viewportHeight / distance) * 0.82);
      const spriteWidth = spriteHeight * (this.assets.enemySprite.width / this.assets.enemySprite.height);
      const screenX = ((angle + FOV / 2) / FOV) * this.width;
      const left = Math.floor(screenX - spriteWidth / 2);
      const top = Math.floor(this.viewportHeight / 2 - spriteHeight / 2);
      const centerColumn = Math.max(0, Math.min(this.width - 1, Math.round(screenX)));

      if (distance >= this.zBuffer[centerColumn]) {
        return;
      }

      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0.62, 1 - distance / 17);
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
      this.ctx.beginPath();
      this.ctx.ellipse(screenX, top + spriteHeight - 4, spriteWidth * 0.28, 6, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.drawImage(this.assets.enemySprite, left, top, spriteWidth, spriteHeight);
      this.ctx.restore();
    });
  }

  private renderTechniqueCharge() {
    if (this.activeTechnique.phase === 'idle' && this.violetBeamLife <= 0) {
      return;
    }

    if (this.activeTechnique.akaCharge > 0.04 && this.activeTechnique.leftAnchor) {
      this.renderTechniqueOrb(
        this.activeTechnique.leftAnchor,
        this.activeTechnique.akaCharge,
        '#ff4c4c',
        '#ff9a63',
        1.2,
      );
    }

    if (this.activeTechnique.aoCharge > 0.04 && this.activeTechnique.rightAnchor) {
      this.renderTechniqueOrb(
        this.activeTechnique.rightAnchor,
        this.activeTechnique.aoCharge,
        '#529dff',
        '#80d2ff',
        -1.15,
      );
    }

    if (
      (this.activeTechnique.fusionCharge > 0.05 || this.activeTechnique.purpleCharge > 0.04) &&
      this.activeTechnique.leftAnchor &&
      this.activeTechnique.rightAnchor
    ) {
      this.renderFusionBridge();
    }

    if (this.activeTechnique.purpleCharge > 0.04) {
      const anchor = this.getPurpleAnchor();
      this.renderTechniqueOrb(
        anchor,
        this.activeTechnique.purpleCharge,
        '#a756ff',
        '#f19bff',
        1.8,
      );
    }
  }

  private renderTechniqueOrb(
    anchor: TechniqueAnchor,
    charge: number,
    innerColor: string,
    outerColor: string,
    drift: number,
  ) {
    const x = anchor.x * this.width;
    const y = anchor.y * this.viewportHeight;
    const radius = 10 + charge * 18;
    const glow = this.ctx.createRadialGradient(x, y, 0, x, y, radius * 1.9);
    glow.addColorStop(0, `${outerColor}f0`);
    glow.addColorStop(0.32, `${innerColor}cc`);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';
    this.ctx.fillStyle = glow;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius * 1.9, 0, Math.PI * 2);
    this.ctx.fill();

    for (let index = 0; index < 18; index += 1) {
      const angle = this.totalTime * (2.8 + charge * 2.2) * drift + (index / 18) * Math.PI * 2;
      const orbit = radius * (1.1 + ((index % 3) * 0.16)) * (1 - charge * 0.2);
      const px = x + Math.cos(angle) * orbit;
      const py = y + Math.sin(angle * 1.15) * orbit;
      const size = 1.5 + charge * 2.8;

      this.ctx.globalAlpha = 0.42 + charge * 0.48;
      this.ctx.fillStyle = index % 2 === 0 ? innerColor : outerColor;
      this.ctx.fillRect(px, py, size, size);
    }

    this.ctx.globalAlpha = 0.88;
    this.ctx.fillStyle = '#fff7ff';
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius * 0.36, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  private renderFusionBridge() {
    const left = this.activeTechnique.leftAnchor!;
    const right = this.activeTechnique.rightAnchor!;
    const startX = left.x * this.width;
    const startY = left.y * this.viewportHeight;
    const endX = right.x * this.width;
    const endY = right.y * this.viewportHeight;
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const pulse = this.activeTechnique.fusionCharge + this.activeTechnique.purpleCharge * 0.45;

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';
    this.ctx.strokeStyle = `rgba(184, 114, 255, ${0.24 + pulse * 0.36})`;
    this.ctx.lineWidth = 4 + pulse * 6;
    this.ctx.beginPath();
    this.ctx.moveTo(startX, startY);
    this.ctx.quadraticCurveTo(
      midX,
      midY - 20 - Math.sin(this.totalTime * 5) * 8,
      endX,
      endY,
    );
    this.ctx.stroke();
    this.ctx.restore();
  }

  private renderVioletBeam() {
    if (this.violetBeamLife <= 0) {
      return;
    }

    const alpha = this.violetBeamLife / 0.42;
    const startX = this.width / 2;
    const startY = this.viewportHeight - 70;
    const endX = this.width / 2 + Math.sin(this.totalTime * 22) * 4;
    const endY = -24;
    const nearWidth = 56 + alpha * 24;
    const farWidth = 12 + alpha * 9;

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';

    const beam = this.ctx.createLinearGradient(startX, startY, endX, endY);
    beam.addColorStop(0, `rgba(250, 202, 255, ${0.72 * alpha})`);
    beam.addColorStop(0.3, `rgba(181, 104, 255, ${0.86 * alpha})`);
    beam.addColorStop(1, `rgba(89, 33, 255, ${0.58 * alpha})`);

    this.ctx.fillStyle = beam;
    this.ctx.beginPath();
    this.ctx.moveTo(startX - nearWidth, startY);
    this.ctx.lineTo(startX + nearWidth, startY);
    this.ctx.lineTo(endX + farWidth, endY);
    this.ctx.lineTo(endX - farWidth, endY);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.fillStyle = `rgba(255, 241, 255, ${0.68 * alpha})`;
    this.ctx.beginPath();
    this.ctx.moveTo(startX - nearWidth * 0.28, startY);
    this.ctx.lineTo(startX + nearWidth * 0.28, startY);
    this.ctx.lineTo(endX + farWidth * 0.32, endY);
    this.ctx.lineTo(endX - farWidth * 0.32, endY);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore();
  }

  private getPurpleAnchor() {
    if (this.activeTechnique.rightAnchor) {
      return {
        x: this.activeTechnique.rightAnchor.x * 0.72 + 0.14,
        y: this.activeTechnique.rightAnchor.y * 0.8 + 0.04,
      };
    }

    return { x: 0.62, y: 0.48 };
  }

  private renderTracers() {
    this.tracers.forEach((tracer) => {
      this.ctx.save();
      this.ctx.strokeStyle = tracer.color;
      this.ctx.globalAlpha = tracer.life / TRACER_LIFE;
      this.ctx.lineWidth = tracer.width;
      this.ctx.beginPath();
      this.ctx.moveTo(tracer.x1, tracer.y1);
      this.ctx.lineTo(tracer.x2, tracer.y2);
      this.ctx.stroke();
      this.ctx.restore();
    });
  }

  private renderWeapon() {
    const scale = 2.15;
    const recoil = this.recoilKick * 6;
    const weaponWidth = this.assets.weaponSprite.width * scale;
    const weaponHeight = this.assets.weaponSprite.height * scale;
    const left = Math.floor(this.width / 2 - weaponWidth / 2 + recoil * 0.3);
    const top = Math.floor(this.viewportHeight - weaponHeight + 6 + recoil);

    this.ctx.drawImage(this.assets.weaponSprite, left, top, weaponWidth, weaponHeight);

    if (this.muzzleFlash > 0) {
      const flashAlpha = this.muzzleFlash / FLASH_LIFE;
      this.ctx.save();
      this.ctx.globalCompositeOperation = 'screen';
      this.ctx.globalAlpha = flashAlpha;
      this.ctx.fillStyle = '#ffe485';
      this.ctx.beginPath();
      this.ctx.moveTo(this.width / 2 + 8, this.viewportHeight - 98 + recoil);
      this.ctx.lineTo(this.width / 2 + 40, this.viewportHeight - 132 + recoil);
      this.ctx.lineTo(this.width / 2 + 64, this.viewportHeight - 92 + recoil);
      this.ctx.lineTo(this.width / 2 + 28, this.viewportHeight - 82 + recoil);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.fillStyle = '#ff8f42';
      this.ctx.fillRect(this.width / 2 + 18, this.viewportHeight - 105 + recoil, 24, 9);
      this.ctx.fillStyle = '#fff3c3';
      this.ctx.beginPath();
      this.ctx.arc(this.width / 2 + 35, this.viewportHeight - 98 + recoil, 10, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }
  }

  private renderCrosshair() {
    this.ctx.strokeStyle = this.hitMarker > 0 ? '#fff6bc' : '#f6df4a';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(this.width / 2 - 6, this.viewportHeight / 2);
    this.ctx.lineTo(this.width / 2 + 6, this.viewportHeight / 2);
    this.ctx.moveTo(this.width / 2, this.viewportHeight / 2 - 6);
    this.ctx.lineTo(this.width / 2, this.viewportHeight / 2 + 6);
    this.ctx.stroke();

    if (this.hitMarker > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = this.hitMarker / 0.14;
      this.ctx.strokeStyle = '#ffe9aa';
      this.ctx.beginPath();
      this.ctx.moveTo(this.width / 2 - 12, this.viewportHeight / 2 - 12);
      this.ctx.lineTo(this.width / 2 - 5, this.viewportHeight / 2 - 5);
      this.ctx.moveTo(this.width / 2 + 12, this.viewportHeight / 2 - 12);
      this.ctx.lineTo(this.width / 2 + 5, this.viewportHeight / 2 - 5);
      this.ctx.moveTo(this.width / 2 - 12, this.viewportHeight / 2 + 12);
      this.ctx.lineTo(this.width / 2 - 5, this.viewportHeight / 2 + 5);
      this.ctx.moveTo(this.width / 2 + 12, this.viewportHeight / 2 + 12);
      this.ctx.lineTo(this.width / 2 + 5, this.viewportHeight / 2 + 5);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  private renderImpactFlashes() {
    this.flashes.forEach((flash) => {
      this.ctx.save();
      this.ctx.fillStyle = flash.color;
      this.ctx.globalAlpha = flash.life / (FLASH_LIFE + 0.08);
      this.ctx.fillRect(flash.x, flash.y, flash.size, flash.size);
      this.ctx.restore();
    });
  }

  private renderShells() {
    this.shells.forEach((shell) => {
      this.ctx.save();
      this.ctx.translate(shell.x, shell.y);
      this.ctx.rotate(shell.rotation);
      this.ctx.globalAlpha = shell.life / SHELL_LIFE;
      this.ctx.fillStyle = '#d8b56c';
      this.ctx.fillRect(-3, -1, 6, 2);
      this.ctx.restore();
    });
  }

  private renderHud() {
    this.ctx.drawImage(this.assets.hudBar, 0, this.viewportHeight, this.width, HUD_HEIGHT);

    const face = this.player.health <= 0 ? this.assets.faceDead : this.assets.face;
    this.ctx.drawImage(face, 148, this.viewportHeight + 1, 24, 30);

    this.ctx.fillStyle = '#f5c25b';
    this.ctx.font = 'bold 14px "Lucida Console", monospace';
    this.ctx.fillText(`${Math.max(0, Math.round(this.player.health)).toString().padStart(3, '0')}%`, 20, this.viewportHeight + 21);
    this.ctx.fillText(`${this.player.score.toString().padStart(5, '0')}`, 226, this.viewportHeight + 21);
    this.ctx.font = '10px "Lucida Console", monospace';
    this.ctx.fillStyle = '#f8e3b8';
    this.ctx.fillText('HEALTH', 20, this.viewportHeight + 30);
    this.ctx.fillText('SCORE', 226, this.viewportHeight + 30);
    this.ctx.fillText(this.currentLevel.name, 94, this.viewportHeight + 12);
    this.ctx.fillText(
      `${this.killsThisLevel.toString().padStart(2, '0')}/${this.currentLevel.targetKills.toString().padStart(2, '0')} CLEARED`,
      82,
      this.viewportHeight + 27,
    );
  }

  private renderMessage(message: string) {
    this.ctx.fillStyle = 'rgba(7, 5, 9, 0.7)';
    this.ctx.fillRect(8, 8, 236, 20);
    this.ctx.fillStyle = this.currentLevel.accent;
    this.ctx.font = '10px "Lucida Console", monospace';
    this.ctx.fillText(message, 12, 21);
  }

  private renderCenterCards() {
    if (this.levelBanner > 0 && this.transitionEndsAt === 0 && this.player.health > 0 && !this.gameWon) {
      const alpha = Math.min(1, this.levelBanner / 0.8);
      this.renderCenterCard(this.currentLevel.name, this.currentLevel.mission, alpha, 94);
      return;
    }

    if (this.transitionEndsAt > 0) {
      this.renderCenterCard(this.currentLevel.name, this.transitionMessage, 0.95, 88);
      return;
    }

    if (this.player.health <= 0) {
      this.renderCenterCard('Run Lost', 'Reset the arena and go again.', 0.96, 86);
      return;
    }

    if (this.gameWon) {
      this.renderCenterCard('Arena Clear', 'All sectors stable. Gesture run complete.', 0.96, 92);
    }
  }

  private renderCenterCard(title: string, subtitle: string, alpha: number, y: number) {
    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = 'rgba(7, 5, 9, 0.78)';
    this.ctx.fillRect(42, y - 22, 236, 44);
    this.ctx.strokeStyle = `${this.currentLevel.accent}88`;
    this.ctx.strokeRect(42.5, y - 21.5, 235, 43);
    this.ctx.fillStyle = '#ffeac0';
    this.ctx.font = 'bold 14px "Lucida Console", monospace';
    this.ctx.fillText(title, 58, y - 2);
    this.ctx.font = '10px "Lucida Console", monospace';
    this.ctx.fillStyle = '#f6d693';
    this.ctx.fillText(subtitle, 58, y + 14);
    this.ctx.restore();
  }

  private renderPostFx() {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    this.ctx.fillRect(0, 0, this.width, this.viewportHeight);

    const vignette = this.ctx.createRadialGradient(
      this.width / 2,
      this.viewportHeight / 2,
      this.viewportHeight * 0.18,
      this.width / 2,
      this.viewportHeight / 2,
      this.viewportHeight * 0.72,
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.58)');
    this.ctx.fillStyle = vignette;
    this.ctx.fillRect(0, 0, this.width, this.viewportHeight);

    this.ctx.globalAlpha = 0.08;
    this.ctx.fillStyle = '#ffffff';
    for (let y = 0; y < this.viewportHeight; y += 4) {
      this.ctx.fillRect(0, y, this.width, 1);
    }

    if (this.damageFlash > 0) {
      this.ctx.globalAlpha = this.damageFlash * 0.5;
      this.ctx.fillStyle = '#ff5137';
      this.ctx.fillRect(0, 0, this.width, this.viewportHeight);
    }

    if (this.violetFlash > 0) {
      this.ctx.globalAlpha = this.violetFlash * 0.45;
      this.ctx.fillStyle = '#b56cff';
      this.ctx.fillRect(0, 0, this.width, this.viewportHeight);
    }

    this.ctx.restore();
  }
}

function normalizeAngle(angle: number) {
  let normalized = angle;

  while (normalized <= -Math.PI) {
    normalized += Math.PI * 2;
  }

  while (normalized > Math.PI) {
    normalized -= Math.PI * 2;
  }

  return normalized;
}
