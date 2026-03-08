import type { GameEvent } from './types';

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;

  async prime() {
    if (!window.AudioContext) {
      this.enabled = false;
      return;
    }

    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.15;
      this.master.connect(this.context.destination);
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;

    if (this.master) {
      this.master.gain.setTargetAtTime(enabled ? 0.15 : 0.0001, this.context!.currentTime, 0.02);
    }
  }

  isEnabled() {
    return this.enabled;
  }

  play(events: GameEvent[]) {
    if (!this.enabled || !this.context || !this.master) {
      return;
    }

    const startAt = this.context.currentTime;

    events.forEach((event, index) => {
      const offset = startAt + index * 0.015;

      switch (event.type) {
        case 'shot':
          this.pulse(offset, {
            waveform: 'square',
            fromHz: 180,
            toHz: 82,
            duration: 0.08,
            gain: 0.11,
          });
          break;
        case 'hit':
          this.pulse(offset, {
            waveform: 'triangle',
            fromHz: 660,
            toHz: 320,
            duration: 0.06,
            gain: 0.06,
          });
          break;
        case 'miss':
          this.pulse(offset, {
            waveform: 'sine',
            fromHz: 420,
            toHz: 280,
            duration: 0.04,
            gain: 0.03,
          });
          break;
        case 'hurt':
          this.pulse(offset, {
            waveform: 'sawtooth',
            fromHz: 130,
            toHz: 74,
            duration: 0.12,
            gain: 0.07,
          });
          break;
        case 'level-start':
          this.sequence(offset, [330, 440], 0.09, 0.045, 'triangle');
          break;
        case 'level-clear':
          this.sequence(offset, [262, 330, 494], 0.12, 0.05, 'triangle');
          break;
        case 'run-complete':
          this.sequence(offset, [392, 523, 659, 784], 0.16, 0.05, 'triangle');
          break;
        case 'player-down':
          this.sequence(offset, [190, 150, 110], 0.2, 0.06, 'sawtooth');
          break;
      }
    });
  }

  private sequence(
    startAt: number,
    notes: number[],
    duration: number,
    gain: number,
    waveform: OscillatorType,
  ) {
    notes.forEach((note, index) => {
      this.pulse(startAt + index * 0.07, {
        waveform,
        fromHz: note,
        toHz: note * 0.98,
        duration,
        gain,
      });
    });
  }

  private pulse(
    startAt: number,
    options: {
      waveform: OscillatorType;
      fromHz: number;
      toHz: number;
      duration: number;
      gain: number;
    },
  ) {
    if (!this.context || !this.master) {
      return;
    }

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();

    oscillator.type = options.waveform;
    oscillator.frequency.setValueAtTime(options.fromHz, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(40, options.toHz),
      startAt + options.duration,
    );

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, startAt);
    filter.frequency.exponentialRampToValueAtTime(240, startAt + options.duration);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(options.gain, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + options.duration);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    oscillator.start(startAt);
    oscillator.stop(startAt + options.duration + 0.02);
  }
}
