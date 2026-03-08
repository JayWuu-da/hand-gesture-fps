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
    this.drawOverlay(result);

    return this.frame;
  }

  private extractFrame(result: GestureRecognizerResult): GestureFrame {
    const hand = result.landmarks[0];
    const topGesture = result.gestures[0]?.[0];

    if (!hand || !topGesture) {
      return DEFAULT_FRAME;
    }

    const wrist = hand[0];
    const indexKnuckle = hand[5];
    const x = clamp((wrist.x + indexKnuckle.x) / 2, 0, 1);
    const y = clamp((wrist.y + indexKnuckle.y) / 2, 0, 1);

    return {
      hasHand: true,
      x,
      y,
      gesture: topGesture.categoryName,
      confidence: topGesture.score,
    };
  }

  private drawOverlay(result: GestureRecognizerResult) {
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
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
