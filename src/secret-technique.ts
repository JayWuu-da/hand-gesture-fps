import type { GestureFrame, HandPose, SecretTechniqueState, TechniqueAnchor } from './types';

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

export class SecretTechniqueController {
  private akaCharge = 0;
  private aoCharge = 0;
  private fusionCharge = 0;
  private fusionBaseline: number | null = null;
  private purpleCharge = 0;
  private purpleLatched = false;
  private cooldown = 0;
  private lastRightDepth: number | null = null;

  reset() {
    this.akaCharge = 0;
    this.aoCharge = 0;
    this.fusionCharge = 0;
    this.fusionBaseline = null;
    this.purpleCharge = 0;
    this.purpleLatched = false;
    this.cooldown = 0;
    this.lastRightDepth = null;
  }

  update(frame: GestureFrame | null, deltaSeconds: number): SecretTechniqueState {
    const leftHand = pickHand(frame?.hands, 'Left');
    const rightHand = pickHand(frame?.hands, 'Right');
    const leftSeal = Boolean(leftHand?.secretSeal);
    const rightSeal = Boolean(rightHand?.secretSeal);
    const rightOpen = Boolean(rightHand?.openPalm);
    const forwardThrust =
      rightHand && this.lastRightDepth !== null
        ? this.lastRightDepth - rightHand.depth > 0.035
        : false;

    this.lastRightDepth = rightHand?.depth ?? null;
    this.cooldown = Math.max(0, this.cooldown - deltaSeconds);

    if (this.cooldown > 0) {
      this.akaCharge = Math.max(0, this.akaCharge - deltaSeconds * 2.4);
      this.aoCharge = Math.max(0, this.aoCharge - deltaSeconds * 2.4);
      this.fusionCharge = Math.max(0, this.fusionCharge - deltaSeconds * 2.8);
      this.purpleCharge = Math.max(0, this.purpleCharge - deltaSeconds * 2.6);

      return this.buildState('cooldown', 'Technique spent', false, leftHand, rightHand);
    }

    if (this.purpleLatched) {
      this.akaCharge = 0;
      this.aoCharge = 0;
      this.fusionCharge = 0;
      this.fusionBaseline = null;

      if (rightSeal) {
        this.purpleCharge = Math.min(1, this.purpleCharge + deltaSeconds * 1.7);
      } else {
        this.purpleCharge = Math.max(0, this.purpleCharge - deltaSeconds * 1.9);
      }

      const fired = this.purpleCharge > 0.2 && (rightOpen || forwardThrust);

      if (fired) {
        this.purpleLatched = false;
        this.purpleCharge = 0;
        this.cooldown = 1.2;
        return this.buildState('purple', 'Secret violet discharge', true, leftHand, rightHand);
      }

      if (this.purpleCharge <= 0.02) {
        this.purpleLatched = false;
        return { ...EMPTY_TECHNIQUE };
      }

      return this.buildState('purple', 'Purple pressure building', false, leftHand, rightHand);
    }

    if (leftSeal) {
      this.akaCharge = Math.min(1, this.akaCharge + deltaSeconds * 1.85);
    } else {
      this.akaCharge = Math.max(0, this.akaCharge - deltaSeconds * 1.1);
    }

    if (rightSeal) {
      this.aoCharge = Math.min(1, this.aoCharge + deltaSeconds * 1.85);
    } else {
      this.aoCharge = Math.max(0, this.aoCharge - deltaSeconds * 1.1);
    }

    const handDistance =
      leftHand && rightHand ? Math.hypot(leftHand.x - rightHand.x, leftHand.y - rightHand.y) : 1;
    const canTrackFusion = leftSeal && rightSeal && this.akaCharge > 0.22 && this.aoCharge > 0.22;

    if (canTrackFusion) {
      if (this.fusionBaseline === null) {
        this.fusionBaseline = handDistance;
      } else if (handDistance > this.fusionBaseline) {
        this.fusionBaseline = handDistance;
      }
    } else if (!leftSeal && !rightSeal) {
      this.fusionBaseline = null;
    }

    const reducedEnough =
      this.fusionBaseline !== null &&
      (handDistance < this.fusionBaseline * 0.76 || this.fusionBaseline - handDistance > 0.06);
    const canFuse = canTrackFusion && reducedEnough;

    if (canFuse) {
      this.purpleLatched = true;
      this.akaCharge = 0;
      this.aoCharge = 0;
      this.fusionCharge = 0;
      this.fusionBaseline = null;
      this.purpleCharge = Math.max(this.purpleCharge, 0.38);
      return this.buildState('purple', 'Purple pressure building', false, leftHand, rightHand);
    } else {
      this.fusionCharge = Math.max(0, this.fusionCharge - deltaSeconds * 0.95);
    }

    if (this.fusionCharge > 0.08) {
      return this.buildState('fusion', 'Red and blue are collapsing', false, leftHand, rightHand);
    }

    if (this.akaCharge > 0.05 && this.aoCharge > 0.05) {
      return this.buildState('dual', 'Two masses are forming', false, leftHand, rightHand);
    }

    if (this.akaCharge > 0.05) {
      return this.buildState('aka', 'Red mass is forming', false, leftHand, rightHand);
    }

    if (this.aoCharge > 0.05) {
      return this.buildState('ao', 'Blue mass is forming', false, leftHand, rightHand);
    }

    return { ...EMPTY_TECHNIQUE };
  }

  private buildState(
    phase: SecretTechniqueState['phase'],
    label: string,
    fired: boolean,
    leftHand: HandPose | undefined,
    rightHand: HandPose | undefined,
  ): SecretTechniqueState {
    return {
      phase,
      label,
      akaCharge: this.akaCharge,
      aoCharge: this.aoCharge,
      fusionCharge: this.fusionCharge,
      purpleCharge: this.purpleCharge,
      fired,
      leftAnchor: leftHand ? toAnchor(leftHand, 'Left') : null,
      rightAnchor: rightHand ? toAnchor(rightHand, 'Right') : null,
    };
  }
}

function pickHand(hands: HandPose[] | undefined, handedness: 'Left' | 'Right') {
  return hands?.find((hand) => hand.handedness === handedness);
}

function toAnchor(hand: HandPose, handedness: 'Left' | 'Right'): TechniqueAnchor {
  const baseX = handedness === 'Left' ? 0.24 : 0.76;
  const x = clamp(
    baseX + (0.5 - hand.x) * 0.16,
    handedness === 'Left' ? 0.12 : 0.62,
    handedness === 'Left' ? 0.38 : 0.88,
  );
  const y = clamp(0.58 + (hand.y - 0.5) * 0.22, 0.32, 0.8);

  return { x, y };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
