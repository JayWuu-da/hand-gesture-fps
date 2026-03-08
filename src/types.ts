export interface HandPose {
  handedness: 'Left' | 'Right' | 'Unknown';
  gesture: string;
  confidence: number;
  x: number;
  y: number;
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
}

export type GamePhase = 'live' | 'transition' | 'won' | 'lost';

export type GameEventType =
  | 'shot'
  | 'hit'
  | 'miss'
  | 'hurt'
  | 'level-start'
  | 'level-clear'
  | 'run-complete'
  | 'player-down';

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
