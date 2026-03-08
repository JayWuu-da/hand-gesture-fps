import {
  FilesetResolver,
  GestureRecognizer,
  type GestureRecognizerResult,
} from '@mediapipe/tasks-vision';

import type { GestureFrame } from './types';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task';

const DEFAULT_FRAME: GestureFrame = {
  hasHand: false,
  x: 0.5,
  y: 0.5,
  gesture: 'No hand',
  confidence: 0,
};

type Landmark = GestureRecognizerResult['landmarks'][number][number];

export class GestureController {
  private readonly video: HTMLVideoElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly overlayContext: CanvasRenderingContext2D;
  private recognizer: GestureRecognizer | null = null;
  private stream: MediaStream | null = null;
  private lastVideoTime = -1;
  private frame: GestureFrame = DEFAULT_FRAME;

  constructor(video: HTMLVideoElement, overlay: HTMLCanvasElement) {
    this.video = video;
    this.overlay = overlay;

    const context = this.overlay.getContext('2d');

    if (!context) {
      throw new Error('Could not create gesture overlay context.');
    }

    this.overlayContext = context;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support webcam access.');
    }

    if (!this.recognizer) {
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
      this.recognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
        },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
    }

    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });
    }

    this.video.srcObject = this.stream;
    await this.video.play();

    const width = this.video.videoWidth || 640;
    const height = this.video.videoHeight || 480;
    this.overlay.width = width;
    this.overlay.height = height;
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }

    this.video.pause();
    this.video.srcObject = null;
    this.stream = null;
    this.lastVideoTime = -1;
    this.frame = DEFAULT_FRAME;
    this.overlayContext.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  sample() {
    if (
      !this.recognizer ||
      !this.stream ||
      this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      return this.frame;
    }

    if (this.video.currentTime === this.lastVideoTime) {
      return this.frame;
    }

    this.lastVideoTime = this.video.currentTime;

    const result = this.recognizer.recognizeForVideo(this.video, performance.now());
    this.frame = this.extractFrame(result);
    this.drawOverlay(result, this.frame);

    return this.frame;
  }

  private extractFrame(result: GestureRecognizerResult): GestureFrame {
    const hand = result.landmarks[0];
    const topGesture = result.gestures[0]?.[0];

    if (!hand) {
      return DEFAULT_FRAME;
    }

    const wrist = hand[0];
    const indexKnuckle = hand[5];
    const x = clamp((wrist.x + indexKnuckle.x) / 2, 0, 1);
    const y = clamp((wrist.y + indexKnuckle.y) / 2, 0, 1);
    const interpretation = this.interpretHandPose(hand, topGesture?.categoryName, topGesture?.score);

    return {
      hasHand: true,
      x,
      y,
      gesture: interpretation.gesture,
      confidence: interpretation.confidence,
    };
  }

  private interpretHandPose(
    hand: GestureRecognizerResult['landmarks'][number],
    modelGesture?: string,
    modelConfidence?: number,
  ) {
    const wrist = hand[0];
    const indexMcp = hand[5];
    const indexPip = hand[6];
    const indexTip = hand[8];
    const middleMcp = hand[9];
    const middleTip = hand[12];
    const ringMcp = hand[13];
    const ringTip = hand[16];
    const pinkyMcp = hand[17];
    const pinkyTip = hand[20];

    const handScale = Math.max(0.08, distance(wrist, middleMcp));
    const indexExtended = this.isFingerExtended(wrist, indexMcp, indexPip, indexTip, handScale);
    const middleCurled = this.isFingerCurled(wrist, middleMcp, middleTip, handScale);
    const ringCurled = this.isFingerCurled(wrist, ringMcp, ringTip, handScale);
    const pinkyCurled = this.isFingerCurled(wrist, pinkyMcp, pinkyTip, handScale);
    const isolatedIndex = indexExtended && middleCurled && ringCurled && pinkyCurled;

    if (modelGesture === 'Closed_Fist') {
      return {
        gesture: 'Closed Fist',
        confidence: modelConfidence ?? 0.9,
      };
    }

    if (isolatedIndex) {
      const directionX = indexTip.x - indexMcp.x;
      const directionY = indexTip.y - indexMcp.y;
      const horizontal = Math.abs(directionX);
      const vertical = Math.abs(directionY);

      if (directionY < -handScale * 0.45 && vertical > horizontal * 0.8) {
        return {
          gesture: 'Point Up',
          confidence: clamp(0.72 + vertical / (handScale * 2.2), 0, 0.99),
        };
      }

      if (directionX > handScale * 0.35 && horizontal > vertical * 0.9) {
        return {
          gesture: 'Point Right',
          confidence: clamp(0.72 + horizontal / (handScale * 2.2), 0, 0.99),
        };
      }

      if (directionX < -handScale * 0.35 && horizontal > vertical * 0.9) {
        return {
          gesture: 'Point Left',
          confidence: clamp(0.72 + horizontal / (handScale * 2.2), 0, 0.99),
        };
      }
    }

    if (modelGesture === 'Open_Palm') {
      return {
        gesture: 'Open Palm',
        confidence: modelConfidence ?? 0.75,
      };
    }

    return {
      gesture: 'Hold',
      confidence: modelConfidence ?? 0.55,
    };
  }

  private isFingerExtended(
    wrist: Landmark,
    mcp: Landmark,
    pip: Landmark,
    tip: Landmark,
    handScale: number,
  ) {
    const wristToTip = distance(wrist, tip);
    const wristToPip = distance(wrist, pip);
    const fingerLength = distance(mcp, tip);
    const lower = vector(mcp, pip);
    const upper = vector(pip, tip);
    const alignment = normalizedDot(lower.x, lower.y, upper.x, upper.y);

    return (
      wristToTip > wristToPip + handScale * 0.18 &&
      fingerLength > handScale * 0.55 &&
      alignment > 0.75
    );
  }

  private isFingerCurled(wrist: Landmark, mcp: Landmark, tip: Landmark, handScale: number) {
    return distance(wrist, tip) < distance(wrist, mcp) + handScale * 0.15;
  }

  private drawOverlay(result: GestureRecognizerResult, frame: GestureFrame) {
    this.overlayContext.clearRect(0, 0, this.overlay.width, this.overlay.height);

    this.overlayContext.strokeStyle = 'rgba(255, 219, 77, 0.92)';
    this.overlayContext.fillStyle = 'rgba(255, 120, 74, 0.95)';
    this.overlayContext.lineWidth = 2;

    const hand = result.landmarks[0];

    if (!hand) {
      return;
    }

    for (const point of hand) {
      const x = point.x * this.overlay.width;
      const y = point.y * this.overlay.height;
      this.overlayContext.beginPath();
      this.overlayContext.arc(x, y, 4, 0, Math.PI * 2);
      this.overlayContext.fill();
    }

    this.overlayContext.beginPath();
    hand.forEach((point, index) => {
      const x = point.x * this.overlay.width;
      const y = point.y * this.overlay.height;

      if (index === 0) {
        this.overlayContext.moveTo(x, y);
      } else {
        this.overlayContext.lineTo(x, y);
      }
    });
    this.overlayContext.stroke();

    this.overlayContext.fillStyle = 'rgba(7, 5, 9, 0.72)';
    this.overlayContext.fillRect(10, 10, 170, 28);
    this.overlayContext.fillStyle = '#ffd94d';
    this.overlayContext.font = '16px "Lucida Console", monospace';
    this.overlayContext.fillText(frame.gesture, 18, 29);
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distance(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function vector(from: Landmark, to: Landmark) {
  return {
    x: to.x - from.x,
    y: to.y - from.y,
  };
}

function normalizedDot(ax: number, ay: number, bx: number, by: number) {
  const aLength = Math.hypot(ax, ay);
  const bLength = Math.hypot(bx, by);

  if (aLength === 0 || bLength === 0) {
    return -1;
  }

  return (ax * bx + ay * by) / (aLength * bLength);
}
