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
}

interface RayHit {
  distance: number;
  side: 'x' | 'y';
  textureX: number;
}

const MAP_ROWS = [
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
];

const ENEMY_SPAWNS = [
  { x: 9.5, y: 2.5 },
  { x: 8.5, y: 7.5 },
  { x: 3.5, y: 9.5 },
];

const MAX_VIEW_DISTANCE = 20;
const FOV = Math.PI / 3;
const TURN_SPEED = 2.2;
const MOVE_SPEED = 1.8;
const FIRE_COOLDOWN = 0.35;
const PLAYER_RADIUS = 0.18;
const HUD_HEIGHT = 32;

export class RetroShooterGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly assets: GameAssets;
  private readonly width = 320;
  private readonly viewportHeight = 200;
  private readonly height = this.viewportHeight + HUD_HEIGHT;
  private readonly zBuffer = new Float32Array(this.width);
  private player: PlayerState = this.createPlayer();
  private enemies: EnemyState[] = [];
  private fireCooldown = 0;
  private lastShotPressed = false;
  private readonly floorGradient: CanvasGradient;
  private readonly ceilingGradient: CanvasGradient;
  private readonly floorPattern: CanvasPattern | null;
  private readonly wallPattern: CanvasPattern | null;

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

    this.floorGradient = this.ctx.createLinearGradient(
      0,
      this.viewportHeight / 2,
      0,
      this.viewportHeight,
    );
    this.floorGradient.addColorStop(0, '#5d2e10');
    this.floorGradient.addColorStop(1, '#140704');

    this.ceilingGradient = this.ctx.createLinearGradient(0, 0, 0, this.viewportHeight / 2);
    this.ceilingGradient.addColorStop(0, '#24162c');
    this.ceilingGradient.addColorStop(1, '#09060e');

    this.floorPattern = this.ctx.createPattern(this.assets.floorTexture, 'repeat');
    this.wallPattern = this.ctx.createPattern(this.assets.wallTexture, 'repeat');

    this.reset();
  }

  reset() {
    this.player = this.createPlayer();
    this.enemies = ENEMY_SPAWNS.map((spawn, index) => ({
      x: spawn.x,
      y: spawn.y,
      alive: true,
      respawnAt: 0,
      attackCooldown: index * 0.35,
    }));
    this.fireCooldown = 0;
    this.lastShotPressed = false;
    this.render();
  }

  update(deltaSeconds: number, commands: CommandState) {
    if (this.player.health <= 0) {
      this.lastShotPressed = commands.fire;
      this.render('You are down. Press restart to try again.');
      return;
    }

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
    const wantsShot = commands.fire && !this.lastShotPressed;

    if (wantsShot && this.fireCooldown === 0) {
      this.fireOnce();
      this.fireCooldown = FIRE_COOLDOWN;
    }

    this.lastShotPressed = commands.fire;
    this.updateEnemies(deltaSeconds);

    const message = commands.hasHand
      ? `${commands.gesture || 'Tracking'} ${Math.round(commands.confidence * 100)}%`
      : 'Show one hand to the webcam.';

    this.render(message);
  }

  getHudSnapshot(message = 'Ready for gesture control.'): HudSnapshot {
    return {
      health: Math.max(0, Math.round(this.player.health)),
      score: this.player.score,
      wave: 1,
      gameOver: this.player.health <= 0,
      message,
    };
  }

  private createPlayer(): PlayerState {
    return {
      x: 1.5,
      y: 1.5,
      angle: 0.2,
      health: 100,
      score: 0,
    };
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

      if (Math.abs(relativeAngle) > 0.12 || distance > 10 || wallDistance + 0.1 < distance) {
        continue;
      }

      if (!bestTarget || distance < bestTarget.distance) {
        bestTarget = { enemy, distance };
      }
    }

    if (!bestTarget) {
      return;
    }

    bestTarget.enemy.alive = false;
    bestTarget.enemy.respawnAt = performance.now() + 2500;
    this.player.score += 100;
  }

  private updateEnemies(deltaSeconds: number) {
    const now = performance.now();

    this.enemies.forEach((enemy, index) => {
      if (!enemy.alive) {
        if (now >= enemy.respawnAt) {
          const spawn = ENEMY_SPAWNS[index % ENEMY_SPAWNS.length];
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

      if (distance > 0.8) {
        const step = deltaSeconds * 0.85;
        const nextX = enemy.x + (dx / distance) * step;
        const nextY = enemy.y + (dy / distance) * step;

        if (!this.isWall(nextX, enemy.y)) {
          enemy.x = nextX;
        }

        if (!this.isWall(enemy.x, nextY)) {
          enemy.y = nextY;
        }
      } else if (enemy.attackCooldown === 0) {
        this.player.health -= 9;
        enemy.attackCooldown = 0.65;
      }
    });
  }

  private isWall(x: number, y: number) {
    const column = Math.floor(x);
    const row = Math.floor(y);

    if (row < 0 || row >= MAP_ROWS.length || column < 0 || column >= MAP_ROWS[0].length) {
      return true;
    }

    return MAP_ROWS[row][column] === '1';
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

      if (mapY < 0 || mapY >= MAP_ROWS.length || mapX < 0 || mapX >= MAP_ROWS[0].length) {
        break;
      }

      if (MAP_ROWS[mapY][mapX] === '1') {
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
    const weaponWidth = this.assets.weaponSprite.width * scale;
    const weaponHeight = this.assets.weaponSprite.height * scale;
    const left = Math.floor(this.width / 2 - weaponWidth / 2);
    const top = Math.floor(this.viewportHeight - weaponHeight + 6);

    this.ctx.drawImage(this.assets.weaponSprite, left, top, weaponWidth, weaponHeight);
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
  }

  private renderMessage(message: string) {
    this.ctx.fillStyle = 'rgba(7, 5, 9, 0.66)';
    this.ctx.fillRect(8, 8, 212, 18);
    this.ctx.fillStyle = '#f6df4a';
    this.ctx.font = '10px "Lucida Console", monospace';
    this.ctx.fillText(message, 12, 20);
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
