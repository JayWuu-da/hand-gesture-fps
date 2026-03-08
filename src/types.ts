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

export interface HudSnapshot {
  health: number;
  score: number;
  wave: number;
  gameOver: boolean;
  message: string;
}
