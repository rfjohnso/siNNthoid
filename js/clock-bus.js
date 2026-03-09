export class ClockBus {
  constructor(state) {
    this.state = state;
    this.subscribers = [];
    this.running = false;
    this.scheduler = null;
    this.step = 0;
    this.nextTime = 0;
    this.ctx = null;
  }

  setAudioContext(ctx) {
    this.ctx = ctx;
  }

  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== callback);
    };
  }

  start() {
    if (!this.ctx || this.running) {
      return;
    }
    this.running = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.scheduler = window.setInterval(() => this.tick(), 20);
  }

  stop() {
    this.running = false;
    if (this.scheduler) {
      clearInterval(this.scheduler);
      this.scheduler = null;
    }
    this.step = 0;
  }

  getBpm() {
    return Math.max(30, this.state.knobs.global.bpm || 112);
  }

  getSwing() {
    return this.state.knobs.global.swing || 0;
  }

  getStepDuration() {
    return 60 / this.getBpm() / 2;
  }

  tick() {
    if (!this.running || !this.ctx) {
      return;
    }

    const now = this.ctx.currentTime;
    const lookAhead = 0.16;
    const baseStep = this.getStepDuration();

    while (this.nextTime <= now + lookAhead) {
      const swingOffset = this.step % 2 === 1 ? baseStep * this.getSwing() : 0;

      const event = {
        step: this.step,
        step16: this.step % 16,
        time: this.nextTime,
        baseStep,
        swing: swingOffset,
        bpm: this.getBpm()
      };

      for (const cb of this.subscribers) {
        try {
          cb(event);
        } catch (e) {
          console.error('ClockBus subscriber error:', e);
        }
      }

      this.nextTime += baseStep + swingOffset;
      this.step += 1;
    }
  }
}
