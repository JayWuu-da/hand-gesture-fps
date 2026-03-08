import type { GameAssets } from './assets';
import type { CommandState, HudSnapshot } from './types';

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

const LEVELS: LevelDefinition[] = [
  {
    name: 'Sector 01',
    mission: 'Clear the dock ring and wake up the controls.',
    mapRows: [
      '111111111111',
      '100000000001',
      '101111011101',
      '100001000001',
      '101101110101',
      '100100000101',
      '110101011101',
      '100001000001',
      '101111011101',
      '100000000001',
      '101101111101',
      '111111111111',
    ],
    start: { x: 1.5, y: 1.5, angle: 0.2 },
    enemySpawns: [
      { x: 9.5, y: 2.5 },
      { x: 8.5, y: 7.5 },
      { x: 3.5, y: 9.5 },
    ],
    targetKills: 4,
    enemySpeed: 0.85,
    enemyDamage: 8,
    respawnDelayMs: 2400,
    ceilingTop: '#201431',
    ceilingBottom: '#0b0811',
    floorTop: '#643214',
    floorBottom: '#190904',
  },
  {
    name: 'Sector 02',
    mission: 'Push through the crucible hall before they regroup.',
    mapRows: [
      '111111111111',
      '100010000001',
      '101010111101',
      '101000100001',
      '101110101101',
      '100000101001',
      '111010101101',
      '100010001001',
      '101111101101',
      '100000001001',
      '101111111101',
      '111111111111',
    ],
    start: { x: 1.5, y: 1.5, angle: 0.35 },
    enemySpawns: [
      { x: 9.5, y: 1.8 },
      { x: 7.5, y: 4.5 },
      { x: 3.5, y: 7.5 },
      { x: 9.5, y: 9.2 },
    ],
    targetKills: 6,
    enemySpeed: 1.02,
    enemyDamage: 10,
    respawnDelayMs: 2100,
    ceilingTop: '#2c1224',
    ceilingBottom: '#0d070d',
    floorTop: '#713214',
    floorBottom: '#1d0a04',
  },
  {
    name: 'Sector 03',
    mission: 'Hold the core lane and survive the final surge.',
    mapRows: [
      '111111111111',
      '100000100001',
      '101110101101',
      '100010101001',
      '111010101101',
      '100010001001',
      '101111101101',
      '101000001001',
      '101011111101',
      '100000000001',
      '111101111101',
      '111111111111',
    ],
    start: { x: 1.5, y: 9.5, angle: -0.65 },
    enemySpawns: [
      { x: 8.8, y: 1.6 },
      { x: 9.4, y: 4.5 },
      { x: 6.5, y: 6.5 },
      { x: 3.5, y: 2.5 },
      { x: 9.2, y: 9.1 },
    ],
    targetKills: 9,
    enemySpeed: 1.18,
    enemyDamage: 12,
    respawnDelayMs: 1700,
    ceilingTop: '#2d1017',
    ceilingBottom: '#11060b',
    floorTop: '#833510',
    floorBottom: '#220a03',
  },
];

const MAX_VIEW_DISTANCE = 20;
const FOV = Math.PI / 3;
const TURN_SPEED = 2.2;
const MOVE_SPEED = 1.85;
const FIRE_COOLDOWN = 0.12;
const PLAYER_RADIUS = 0.18;
const HUD_HEIGHT = 32;
const TRANSITION_DELAY_MS = 2200;
const SHELL_LIFE = 0.65;
const FLASH_LIFE = 0.18;

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
  private totalTime = 0;
  private muzzleFlash = 0;
  private recoilKick = 0;
  private shells: ShellParticle[] = [];
  private flashes: FlashParticle[] = [];

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
    this.floorGradient = this.ctx.createLinearGradient(
      0,
      this.viewportHeight / 2,
      0,
      this.viewportHeight,
    );

    this.reset();
  }

  reset() {
    this.player = this.createFreshPlayer();
    this.currentLevelIndex = 0;
    this.currentLevel = LEVELS[0];
    this.player.score = 0;
    this.totalTime = 0;
    this.gameWon = false;
    this.transitionEndsAt = 0;
    this.transitionMessage = '';
    this.fireCooldown = 0;
    this.muzzleFlash = 0;
    this.recoilKick = 0;
    this.shells = [];
    this.flashes = [];
    this.loadLevel(0, false);
    this.render(this.currentLevel.mission);
  }

  update(deltaSeconds: number, commands: CommandState) {
    this.updateEffects(deltaSeconds);

    if (this.gameWon) {
      this.render('Run complete. Gesture FPS online.');
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
    this.player.angle = normalizeAngle(
      this.player.angle + commands.turn * TURN_SPEED * deltaSeconds,
    );

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
      message,
      levelName: this.currentLevel.name,
      mission: this.currentLevel.mission,
      kills: this.killsThisLevel,
      targetKills: this.currentLevel.targetKills,
    };
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
  }

  private configureGradients() {
    this.ceilingGradient = this.ctx.createLinearGradient(0, 0, 0, this.viewportHeight / 2);
    this.ceilingGradient.addColorStop(0, this.currentLevel.ceilingTop);
    this.ceilingGradient.addColorStop(1, this.currentLevel.ceilingBottom);

    this.floorGradient = this.ctx.createLinearGradient(
      0,
      this.viewportHeight / 2,
      0,
      this.viewportHeight,
    );
    this.floorGradient.addColorStop(0, this.currentLevel.floorTop);
    this.floorGradient.addColorStop(1, this.currentLevel.floorBottom);
  }

  private advanceLevel() {
    if (this.currentLevelIndex >= LEVELS.length - 1) {
      this.gameWon = true;
      this.transitionEndsAt = 0;
      this.transitionMessage = 'All sectors clear.';
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
    this.muzzleFlash = FLASH_LIFE;
    this.recoilKick = 1;
    this.spawnShell();

    let bestTarget: { enemy: EnemyState; distance: number } | null = null;

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
        bestTarget = { enemy, distance };
      }
    }

    if (!bestTarget) {
      this.spawnHitFlashes('#ffcf67', 5, 0.65);
      return;
    }

    bestTarget.enemy.alive = false;
    bestTarget.enemy.respawnAt = performance.now() + this.currentLevel.respawnDelayMs;
    this.player.score += 125;
    this.killsThisLevel += 1;
    this.spawnHitFlashes('#ff7d52', 8, 1);

    if (this.killsThisLevel >= this.currentLevel.targetKills) {
      this.transitionEndsAt = performance.now() + TRANSITION_DELAY_MS;
      this.transitionMessage =
        this.currentLevelIndex === LEVELS.length - 1
          ? 'Core stable. Final sector complete.'
          : `${this.currentLevel.name} clear. Redirecting to ${LEVELS[this.currentLevelIndex + 1].name}.`;
    }
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

  private spawnHitFlashes(color: string, count: number, spread: number) {
    for (let index = 0; index < count; index += 1) {
      this.flashes.push({
        x: this.width / 2 + (Math.random() - 0.5) * 12,
        y: this.viewportHeight / 2 + (Math.random() - 0.5) * 12,
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
  }

  private updateEnemies(deltaSeconds: number) {
    const now = performance.now();

    this.enemies.forEach((enemy) => {
      if (!enemy.alive) {
        if (
          this.killsThisLevel < this.currentLevel.targetKills &&
          now >= enemy.respawnAt
        ) {
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

      if (distance > 0.85) {
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
        this.spawnHitFlashes('#ff4e3b', 4, 0.5);
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

  private getTextureX(
    hitSide: 'x' | 'y',
    distance: number,
    directionX: number,
    directionY: number,
  ) {
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
    this.renderBackdrop();

    for (let column = 0; column < this.width; column += 1) {
      const cameraX = (column / this.width) * 2 - 1;
      const rayAngle = this.player.angle + cameraX * (FOV / 2);
      const hit = this.castRay(rayAngle);
      const correctedDistance = Math.max(
        0.0001,
        hit.distance * Math.cos(rayAngle - this.player.angle),
      );
      const wallHeight = Math.min(
        this.viewportHeight,
        Math.floor(this.viewportHeight / correctedDistance),
      );
      const wallTop = Math.floor(this.viewportHeight / 2 - wallHeight / 2);
      const shade = Math.max(0.18, 1 - correctedDistance / MAX_VIEW_DISTANCE);

      this.zBuffer[column] = correctedDistance;
      this.drawWallColumn(column, wallTop, wallHeight, hit.textureX, shade);
    }

    this.renderEnemies();
    this.renderWeapon();
    this.renderCrosshair();
    this.renderImpactFlashes();
    this.renderShells();
    this.renderHud();
    this.renderMessage(message);
  }

  private renderBackdrop() {
    this.ctx.fillStyle = this.ceilingGradient;
    this.ctx.fillRect(0, 0, this.width, this.viewportHeight / 2);
    this.ctx.fillStyle = this.floorGradient;
    this.ctx.fillRect(0, this.viewportHeight / 2, this.width, this.viewportHeight / 2);

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
      this.ctx.globalAlpha = 0.3;
      this.ctx.fillStyle = this.floorPattern;
      this.ctx.fillRect(0, this.viewportHeight / 2, this.width, this.viewportHeight / 2);
      this.ctx.restore();
    }
  }

  private drawWallColumn(
    column: number,
    wallTop: number,
    wallHeight: number,
    textureX: number,
    shade: number,
  ) {
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

    this.ctx.fillStyle = `rgba(22, 5, 2, ${Math.max(0.1, 0.85 - shade)})`;
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
      const spriteHeight = Math.min(
        this.viewportHeight * 1.1,
        (this.viewportHeight / distance) * 0.78,
      );
      const spriteWidth =
        spriteHeight * (this.assets.enemySprite.width / this.assets.enemySprite.height);
      const screenX = ((angle + FOV / 2) / FOV) * this.width;
      const left = Math.floor(screenX - spriteWidth / 2);
      const top = Math.floor(this.viewportHeight / 2 - spriteHeight / 2);
      const centerColumn = Math.max(0, Math.min(this.width - 1, Math.round(screenX)));

      if (distance >= this.zBuffer[centerColumn]) {
        return;
      }

      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0.55, 1 - distance / 15);
      this.ctx.drawImage(this.assets.enemySprite, left, top, spriteWidth, spriteHeight);
      this.ctx.restore();
    });
  }

  private renderWeapon() {
    const scale = 2.1;
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
      this.ctx.fillStyle = '#ffd86f';
      this.ctx.beginPath();
      this.ctx.moveTo(this.width / 2 + 10, this.viewportHeight - 100 + recoil);
      this.ctx.lineTo(this.width / 2 + 42, this.viewportHeight - 126 + recoil);
      this.ctx.lineTo(this.width / 2 + 58, this.viewportHeight - 92 + recoil);
      this.ctx.lineTo(this.width / 2 + 26, this.viewportHeight - 86 + recoil);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.fillStyle = '#ff7f3d';
      this.ctx.fillRect(this.width / 2 + 18, this.viewportHeight - 105 + recoil, 20, 8);
      this.ctx.restore();
    }
  }

  private renderCrosshair() {
    this.ctx.strokeStyle = '#f6df4a';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(this.width / 2 - 6, this.viewportHeight / 2);
    this.ctx.lineTo(this.width / 2 + 6, this.viewportHeight / 2);
    this.ctx.moveTo(this.width / 2, this.viewportHeight / 2 - 6);
    this.ctx.lineTo(this.width / 2, this.viewportHeight / 2 + 6);
    this.ctx.stroke();
  }

  private renderImpactFlashes() {
    this.flashes.forEach((flash) => {
      this.ctx.fillStyle = flash.color;
      this.ctx.globalAlpha = flash.life / (FLASH_LIFE + 0.08);
      this.ctx.fillRect(flash.x, flash.y, flash.size, flash.size);
    });
    this.ctx.globalAlpha = 1;
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
    this.ctx.globalAlpha = 1;
  }

  private renderHud() {
    this.ctx.drawImage(this.assets.hudBar, 0, this.viewportHeight, this.width, HUD_HEIGHT);

    const face = this.player.health <= 0 ? this.assets.faceDead : this.assets.face;
    this.ctx.drawImage(face, 148, this.viewportHeight + 1, 24, 30);

    this.ctx.fillStyle = '#f5c25b';
    this.ctx.font = 'bold 14px "Lucida Console", monospace';
    this.ctx.fillText(
      `${Math.max(0, Math.round(this.player.health)).toString().padStart(3, '0')}%`,
      20,
      this.viewportHeight + 21,
    );
    this.ctx.fillText(
      `${this.player.score.toString().padStart(5, '0')}`,
      226,
      this.viewportHeight + 21,
    );
    this.ctx.font = '10px "Lucida Console", monospace';
    this.ctx.fillStyle = '#f8e3b8';
    this.ctx.fillText('HEALTH', 20, this.viewportHeight + 30);
    this.ctx.fillText('SCORE', 226, this.viewportHeight + 30);
    this.ctx.fillText(`${this.currentLevel.name}`, 96, this.viewportHeight + 12);
    this.ctx.fillText(
      `${this.killsThisLevel.toString().padStart(2, '0')}/${this.currentLevel.targetKills
        .toString()
        .padStart(2, '0')} CLEARED`,
      82,
      this.viewportHeight + 27,
    );
  }

  private renderMessage(message: string) {
    this.ctx.fillStyle = 'rgba(7, 5, 9, 0.66)';
    this.ctx.fillRect(8, 8, 238, 20);
    this.ctx.fillStyle = '#f6df4a';
    this.ctx.font = '10px "Lucida Console", monospace';
    this.ctx.fillText(message, 12, 21);
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
