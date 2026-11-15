// Q-018: kind -> hint key mapping (01-ux.md Codes, voice column) and the zh strings behind it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copy, voiceHintKey, MAX_VOICE_CHARS } from '../web/js/copy.js';

test('Q-018 each voice problem maps to its hint key', () => {
  const want = {
    no_audio: 'nothingHeard', empty: 'nothingHeard', not_ready: 'voiceNotReady', unavailable: 'voiceUnavailable',
    timeout: 'voiceTimeout', failed: 'voiceFailed', bad_request: 'voiceFailed', too_large: 'voiceFailed',
  };
  for (const [kind, key] of Object.entries(want)) assert.equal(voiceHintKey(kind), key, kind);
});

test('Q-018 an unknown or missing code is a failed transcription', () => {
  assert.equal(voiceHintKey('boom'), 'voiceFailed');
  assert.equal(voiceHintKey(undefined), 'voiceFailed');
});

test('Q-018 every mapped key has a non-empty zh string', () => {
  for (const kind of ['no_audio', 'empty', 'not_ready', 'unavailable', 'timeout', 'failed', 'x']) {
    assert.ok(copy.hints[voiceHintKey(kind)]?.length > 0, kind);
  }
  assert.equal(MAX_VOICE_CHARS, 1500);
});
