// Moves Date.now() and new Date() of THIS process by one constant offset so the clock reads FAKE_CLOCK_NOW (an ISO string with offset)
// at the moment this file is loaded, and then runs on. Used with NODE_OPTIONS=--require for the gateway child only (plan 04 §1 "Clock").
const target = Date.parse(process.env.FAKE_CLOCK_NOW || '');
if (Number.isFinite(target)) {
  const Real = Date;
  const offset = target - Real.now();
  class FakeDate extends Real {
    constructor(...a) { if (a.length === 0) super(Real.now() + offset); else super(...a); }
    static now() { return Real.now() + offset; }
  }
  globalThis.Date = FakeDate;
}
