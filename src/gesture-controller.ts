import {
  FaceDetector,
  FilesetResolver,
  GestureRecognizer,
  type Category,
  type FaceDetectorResult,
  type GestureRecognizerResult,
} from '@mediapipe/tasks-vision';

import type { GestureFrame, HandPose } from './types';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task';
const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

const DEFAULT_FRAME: GestureFrame = {
  hasHand: false,
  x: 0.5,
  y: 0.5,
  gesture: 'No hands',
  confidence: 0,
  hands: [],
};

type Landmark = GestureRecognizerResult['landmarks'][number][number];

export class GestureController {
  private readonly video: HTMLVideoElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly overlayContext: CanvasRenderingContext2D;
  private visionResolver: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
  private recognizer: GestureRecognizer | null = null;
  private faceDetector: FaceDetector | null = null;
  private stream: MediaStream | null = null;
  private lastVideoTime = -1;
  private frame: GestureFrame = DEFAULT_FRAME;
  private faceMaskEnabled = false;

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
      const vision = await this.getVisionResolver();
      this.recognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
        },
        runningMode: 'VIDEO',
        numHands: 2,
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

  async setFaceMaskEnabled(enabled: boolean) {
    if (enabled && !this.faceDetector) {
      const vision = await this.getVisionResolver();
      this.faceDetector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_MODEL_URL,
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.55,
      });
    }

    this.faceMaskEnabled = enabled;
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
    const faceResult =
      this.faceMaskEnabled && this.faceDetector
        ? this.faceDetector.detectForVideo(this.video, performance.now())
        : null;
    this.frame = this.extractFrame(result);
    this.drawOverlay(result, faceResult, this.frame);

    return this.frame;
  }

  private extractFrame(result: GestureRecognizerResult): GestureFrame {
    const hands = result.landmarks
      .map((hand, index) => this.buildHandPose(hand, result.handedness[index]?.[0], result.gestures[index]?.[0]))
      .filter((hand): hand is HandPose => Boolean(hand))
      .sort(sortHands);

    if (hands.length === 0) {
      return DEFAULT_FRAME;
    }

    const averageX = hands.reduce((sum, hand) => sum + hand.x, 0) / hands.length;
    const averageY = hands.reduce((sum, hand) => sum + hand.y, 0) / hands.length;
    const summary = hands
      .map((hand) => `${hand.handedness[0]}:${hand.gesture}`)
      .join(' | ');
    const averageConfidence =
      hands.reduce((sum, hand) => sum + hand.confidence, 0) / hands.length;

    return {
      hasHand: true,
      x: averageX,
      y: averageY,
      gesture: summary,
      confidence: averageConfidence,
      hands,
    };
  }

  private buildHandPose(
    hand: GestureRecognizerResult['landmarks'][number] | undefined,
    handedness?: Category,
    modelGesture?: Category,
  ): HandPose | null {
    if (!hand) {
      return null;
    }

    const wrist = hand[0];
    const middleMcp = hand[9];
    const x = clamp((wrist.x + middleMcp.x) / 2, 0, 1);
    const y = clamp((wrist.y + middleMcp.y) / 2, 0, 1);
    const depth = (wrist.z + middleMcp.z) / 2;
    const interpretation = this.interpretHandPose(hand, modelGesture?.categoryName, modelGesture?.score);
    const handLabel = normalizeHandedness(handedness?.categoryName);

    return {
      handedness: handLabel,
      gesture: interpretation.gesture,
      confidence: interpretation.confidence,
      x,
      y,
      depth,
      openPalm: interpretation.openPalm,
      secretSeal: interpretation.secretSeal,
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
    const thumbTip = hand[4];
    const middleMcp = hand[9];
    const middlePip = hand[10];
    const middleTip = hand[12];
    const ringMcp = hand[13];
    const ringTip = hand[16];
    const pinkyMcp = hand[17];
    const pinkyTip = hand[20];

    const handScale = Math.max(0.08, distance(wrist, middleMcp));
    const indexExtended = this.isFingerExtended(wrist, indexMcp, indexPip, indexTip, handScale);
    const middleExtended = this.isFingerExtended(wrist, middleMcp, middlePip, middleTip, handScale);
    const middleCurled = this.isFingerCurled(wrist, middleMcp, middleTip, handScale);
    const ringCurled = this.isFingerCurled(wrist, ringMcp, ringTip, handScale);
    const pinkyCurled = this.isFingerCurled(wrist, pinkyMcp, pinkyTip, handScale);
    const isolatedIndex = indexExtended && middleCurled && ringCurled && pinkyCurled;
    const thumbIndexPinch = distance(thumbTip, indexTip) < handScale * 0.52;
    const secretSeal = thumbIndexPinch && middleExtended && ringCurled && pinkyCurled;

    if (modelGesture === 'Closed_Fist') {
      return {
        gesture: 'Closed Fist',
        confidence: modelConfidence ?? 0.9,
        openPalm: false,
        secretSeal: false,
      };
    }

    if (modelGesture === 'Open_Palm') {
      return {
        gesture: 'Open Palm',
        confidence: modelConfidence ?? 0.8,
        openPalm: true,
        secretSeal: false,
      };
    }

    if (secretSeal) {
      return {
        gesture: 'Secret Seal',
        confidence: clamp(0.74 + (thumbIndexPinch ? 0.12 : 0) + (middleExtended ? 0.08 : 0), 0, 0.99),
        openPalm: false,
        secretSeal: true,
      };
    }

    if (isolatedIndex) {
      const directionY = indexTip.y - indexMcp.y;

      if (directionY < -handScale * 0.45) {
        return {
          gesture: 'Point Up',
          confidence: clamp(0.72 + Math.abs(directionY) / (handScale * 2.2), 0, 0.99),
          openPalm: false,
          secretSeal: false,
        };
      }
    }

    return {
      gesture: 'Hold',
      confidence: modelConfidence ?? 0.55,
      openPalm: false,
      secretSeal: false,
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

  private drawOverlay(
    result: GestureRecognizerResult,
    faceResult: FaceDetectorResult | null,
    frame: GestureFrame,
  ) {
    this.overlayContext.clearRect(0, 0, this.overlay.width, this.overlay.height);

    if (this.faceMaskEnabled && faceResult) {
      faceResult.detections.forEach((detection) => {
        const box = detection.boundingBox;

        if (!box) {
          return;
        }

        this.drawFaceMask(box.originX, box.originY, box.width, box.height);
      });
    }

    this.overlayContext.strokeStyle = 'rgba(255, 219, 77, 0.92)';
    this.overlayContext.fillStyle = 'rgba(255, 120, 74, 0.95)';
    this.overlayContext.lineWidth = 2;

    result.landmarks.forEach((hand, handIndex) => {
      hand.forEach((point) => {
        const x = point.x * this.overlay.width;
        const y = point.y * this.overlay.height;
        this.overlayContext.beginPath();
        this.overlayContext.arc(x, y, 4, 0, Math.PI * 2);
        this.overlayContext.fill();
      });

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

      const pose = frame.hands[handIndex];

      if (pose) {
        this.overlayContext.fillStyle = 'rgba(7, 5, 9, 0.72)';
        this.overlayContext.fillRect(10, 10 + handIndex * 32, 190, 24);
        this.overlayContext.fillStyle = '#ffd94d';
        this.overlayContext.font = '14px "Lucida Console", monospace';
        this.overlayContext.fillText(
          `${pose.handedness}: ${pose.gesture}`,
          18,
          27 + handIndex * 32,
        );
      }
    });
  }

  private drawFaceMask(originX: number, originY: number, width: number, height: number) {
    const blockSize = 10;
    const startX = Math.max(0, originX - width * 0.1);
    const startY = Math.max(0, originY - height * 0.18);
    const maskWidth = Math.min(this.overlay.width - startX, width * 1.2);
    const maskHeight = Math.min(this.overlay.height - startY, height * 1.35);

    this.overlayContext.save();
    this.overlayContext.fillStyle = 'rgba(8, 6, 14, 0.9)';
    this.overlayContext.fillRect(startX, startY, maskWidth, maskHeight);

    for (let y = startY; y < startY + maskHeight; y += blockSize) {
      for (let x = startX; x < startX + maskWidth; x += blockSize) {
        const shade = ((Math.floor(x / blockSize) + Math.floor(y / blockSize)) % 2) === 0;
        this.overlayContext.fillStyle = shade
          ? 'rgba(255, 215, 120, 0.22)'
          : 'rgba(255, 110, 70, 0.22)';
        this.overlayContext.fillRect(x, y, blockSize - 1, blockSize - 1);
      }
    }

    this.overlayContext.strokeStyle = 'rgba(255, 217, 110, 0.9)';
    this.overlayContext.lineWidth = 2;
    this.overlayContext.strokeRect(startX, startY, maskWidth, maskHeight);
    this.overlayContext.restore();
  }

  private async getVisionResolver() {
    if (!this.visionResolver) {
      this.visionResolver = await FilesetResolver.forVisionTasks(WASM_ROOT);
    }

    return this.visionResolver;
  }
}

function normalizeHandedness(label?: string): HandPose['handedness'] {
  if (label === 'Left' || label === 'Right') {
    return label;
  }

  return 'Unknown';
}

function sortHands(left: HandPose, right: HandPose) {
  const priority = {
    Left: 0,
    Right: 1,
    Unknown: 2,
  };

  return priority[left.handedness] - priority[right.handedness];
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
