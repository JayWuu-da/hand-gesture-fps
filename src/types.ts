export interface HandPose {
  handedness: 'Left' | 'Right' | 'Unknown';
  gesture: string;
  confidence: number;
  x: number;
  y: number;
  depth: number;
  openPalm: boolean;
  secretSeal: boolean;
}

export interface GestureFrame {
  hasHand: boolean;
  x: number;
  y: number;
  gesture: string;
  confidence: number;
  hands: HandPose[];
}

export interface CommandState {
  hasHand: boolean;
  forward: boolean;
  fire: boolean;
  turn: number;
  gesture: string;
  confidence: number;
  special: SecretTechniqueState;
}

export type GamePhase = 'live' | 'transition' | 'won' | 'lost';

export type SecretTechniquePhase =
  | 'idle'
  | 'aka'
  | 'ao'
  | 'dual'
  | 'fusion'
  | 'purple'
  | 'cooldown';

export interface TechniqueAnchor {
  x: number;
  y: number;
}

export interface SecretTechniqueState {
  phase: SecretTechniquePhase;
  label: string;
  akaCharge: number;
  aoCharge: number;
  fusionCharge: number;
  purpleCharge: number;
  fired: boolean;
  leftAnchor: TechniqueAnchor | null;
  rightAnchor: TechniqueAnchor | null;
}

export type GameEventType =
  | 'shot'
  | 'hit'
  | 'miss'
  | 'hurt'
  | 'level-start'
  | 'level-clear'
  | 'run-complete'
  | 'player-down'
  | 'special-fire';

export interface GameEvent {
  type: GameEventType;
  intensity?: number;
}

export interface HudSnapshot {
  health: number;
  score: number;
  wave: number;
  gameOver: boolean;
  gameWon: boolean;
  phase: GamePhase;
  message: string;
  levelName: string;
  mission: string;
  kills: number;
  targetKills: number;
  liveEnemies: number;
}
