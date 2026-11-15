// Q-014: the voice path with an injected client and fake log: transcribing turn, words, send, failures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleUtterance } from '../web/js/voice-turn.js';
import { createClient } from '../web/js/companion-client.js';

function rig({ transcribe, sendResult = true } = {}) {
  const events = [];
  const deps = {
    transcribe,
    log: {
      addTranscribing: () => { events.push('transcribing'); return { id: 1 }; },
      setWords: (t, w) => events.push(`words:${w}`),
      dropFailed: () => events.push('drop'),
    },
    setPending: (on) => events.push(`pending:${on}`),
    sendWords: async (w, turn) => { events.push(`send:${w}:${turn.id}`); return sendResult; },
    watch: { failed: (c) => events.push(`watch:${c}`) },
    onVoiceProblem: (k) => events.push(`problem:${k}`),
  };
  return { deps, events };
}

test('Q-014 words replace the transcribing turn, then follow the send path with the same turn', async () => {
  const blob = new Blob(['x']);
  let got;
  const { deps, events } = rig({ transcribe: async (a) => { got = a; return { text: ' I just got the internship ' }; } });
  assert.equal(await handleUtterance(blob, deps), true);
  assert.equal(got, blob);
  assert.deepEqual(events, ['pending:true', 'transcribing', 'words:I just got the internship', 'send:I just got the internship:1']);
});

test('Q-014 empty transcript: the turn leaves, no send, hook gets "empty"', async () => {
  const { deps, events } = rig({ transcribe: async () => ({ text: '   ' }) });
  assert.equal(await handleUtterance(new Blob(['x']), deps), false);
  assert.deepEqual(events, ['pending:true', 'transcribing', 'drop', 'pending:false', 'problem:empty']);
});

test('Q-014 not_ready and unavailable reach watch.failed; the turn leaves; no send', async () => {
  for (const code of ['not_ready', 'unavailable', 'timeout']) {
    const { deps, events } = rig({ transcribe: async () => { throw Object.assign(new Error(code), { code }); } });
    assert.equal(await handleUtterance(new Blob(['x']), deps), false);
    assert.deepEqual(events, ['pending:true', 'transcribing', 'drop', 'pending:false', `watch:${code}`, `problem:${code}`]);
  }
});

test('Q-014 no audio (null) adds no turn and sends nothing', async () => {
  const { deps, events } = rig({ transcribe: async () => { throw new Error('must not be called'); } });
  assert.equal(await handleUtterance(null, deps), false);
  assert.deepEqual(events, ['problem:no_audio']);
});

test('Q-014 the real client posts the Blob as audio/wav to /api/transcribe and returns the text', async () => {
  const seen = [];
  const client = createClient({ fetch: async (path, init) => { seen.push([path, init.method, init.headers['Content-Type'], init.body]); return { ok: true, json: async () => ({ text: 'hi' }) }; } });
  const blob = new Blob(['wav']);
  const { deps, events } = rig({ transcribe: (a) => client.transcribe(a) });
  await handleUtterance(blob, deps);
  assert.deepEqual(seen[0].slice(0, 3), ['/api/transcribe', 'POST', 'audio/wav']);
  assert.equal(seen[0][3], blob);
  assert.ok(events.includes('send:hi:1'));
});
