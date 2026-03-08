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
  private purpleCharge = 0;
  private cooldown = 0;
  private lastRightDepth: number | null = null;

  reset() {
    this.akaCharge = 0;
    this.aoCharge = 0;
    this.fusionCharge = 0;
    this.purpleCharge = 0;
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
    const canFuse =
      leftSeal &&
      rightSeal &&
      this.akaCharge > 0.36 &&
      this.aoCharge > 0.36 &&
      handDistance < 0.12;

    if (canFuse) {
      this.fusionCharge = Math.min(1, this.fusionCharge + deltaSeconds * 2.4);
    } else {
      this.fusionCharge = Math.max(0, this.fusionCharge - deltaSeconds * 1.3);
    }

    const canChargePurple = this.fusionCharge > 0.45 && !leftSeal && rightSeal;

    if (canChargePurple) {
      this.purpleCharge = Math.min(1, this.purpleCharge + deltaSeconds * 1.55);
      this.akaCharge = Math.max(this.akaCharge, 0.42);
      this.aoCharge = Math.max(this.aoCharge, 0.42);
    } else {
      this.purpleCharge = Math.max(0, this.purpleCharge - deltaSeconds * 1.45);
    }

    const fired = this.purpleCharge > 0.56 && (rightOpen || forwardThrust);

    if (fired) {
      this.akaCharge = 0;
      this.aoCharge = 0;
      this.fusionCharge = 0;
      this.purpleCharge = 0;
      this.cooldown = 1.2;
      return this.buildState('purple', 'Secret violet discharge', true, leftHand, rightHand);
    }

    if (this.purpleCharge > 0.05) {
      return this.buildState('purple', 'Purple pressure building', false, leftHand, rightHand);
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
  const baseX = handedness === 'Left' ? 0.76 : 0.24;
  const x = clamp(
    baseX + (0.5 - hand.x) * 0.16,
    handedness === 'Left' ? 0.62 : 0.12,
    handedness === 'Left' ? 0.88 : 0.38,
  );
  const y = clamp(0.58 + (hand.y - 0.5) * 0.22, 0.32, 0.8);

  return { x, y };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
