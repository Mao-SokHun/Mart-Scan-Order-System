// Web Audio API Synthesizer for Scanners
class SoundEffects {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  playSuccessBeep() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Crisp pleasant scanner beep: quick ramp from 1200Hz to 1600Hz
      osc.frequency.setValueAtTime(1300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1750, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.09);

      // Trigger phone vibration if available
      if ('vibrate' in navigator) {
        navigator.vibrate(80);
      }
    } catch (e) {
      console.warn('Audio feedback failed:', e);
    }
  }

  playErrorBuzz() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, ctx.currentTime);
      osc.frequency.setValueAtTime(200, ctx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);

      // Trigger double vibration for error
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }
    } catch (e) {
      console.warn('Audio feedback failed:', e);
    }
  }
}

export const sound = new SoundEffects();
