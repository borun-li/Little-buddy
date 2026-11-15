// Tests only (Q-010): the old fake data layer, kept so presets and mood rules stay under test.
// Nothing in web/ imports this file; the page uses web/js/companion-client.js (real, DES-013).

import { PRESETS } from './presets.js';
import { moodOf } from './mood-keywords.js';

export const REPLY_DELAY_MS = 600;

export function createFakeCompanion({ delayMs = REPLY_DELAY_MS, presets = PRESETS.zh } = {}) {
  const nextReply = {}; // mood -> index of the next reply; rotation never repeats within a mood
  let lastReply = null;
  let nextVoice = 0;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  return {
    async respond(line, history = []) {
      void history; // the fake keeps no context; the real layer will (C-004)
      const mood = moodOf(line);
      const list = presets.replies[mood];
      let i = nextReply[mood] ?? 0;
      if (list[i % list.length] === lastReply) i += 1;
      const reply = list[i % list.length];
      nextReply[mood] = (i + 1) % list.length;
      lastReply = reply;
      await wait(delayMs);
      return { reply, mood };
    },
    async transcribe() {
      const text = presets.voiceLines[nextVoice % presets.voiceLines.length];
      nextVoice += 1;
      return { text };
    },
  };
}
