// Entry: turn flow idle -> pending -> idle (FLOW-001, FLOW-002). Data comes only from companion-client.js.
import { respond, transcribe, health } from './companion-client.js';
import { copy, voiceHintKey, MAX_VOICE_CHARS } from './copy.js';
import { createLog } from './log.js';
import { createCompanion } from './companion.js';
import { createHealthWatch } from './health-watch.js';
import { createHint, createTalkButton } from './talk-button.js';
import { handleUtterance } from './voice-turn.js';

const $ = (sel) => document.querySelector(sel);

document.title = copy.title;
document.querySelectorAll('[data-copy]').forEach((el) => { el.textContent = copy[el.dataset.copy]; });

const input = $('[data-testid="fake-input"]');
const field = $('.field');
const note = $('.field__note');
input.placeholder = copy.placeholder;
input.setAttribute('aria-label', copy.inputLabel);
note.textContent = copy.pausedNote;
$('.log__turns').setAttribute('aria-label', copy.logLabel);

const log = createLog($('.log'), $('.log__turns'), $('.log__empty'));
const companion = createCompanion($('[data-testid="companion"]'), $('.companion__caption'));
const history = []; // page memory only (A5)
let pending = false;

// FLOW-006: the watch decides what Enter and hold may do and which hint and caption show.
const watch = createHealthWatch({
  health,
  onChange(st) {
    companion.setWaking(st.waking);
    if (st.hint) showHint(st.hint);
    else if (shownKey === 'awake') clearSendHint(); // the awake hint leaves by itself after 4 s
  },
});

const talk = createTalkButton({
  button: $('.talk-button'),
  hint: createHint($('.hint')),
  // A hold while voice is not ready records nothing and repeats the current hint (talk-button only asks here).
  isPaused: () => {
    if (pending) return true;
    const st = watch.state;
    if (!st.canVoice) { showHint(st.hint ?? 'unreachable'); return true; }
    return false;
  },
  // Q-014: the held WAV goes to transcribe, then the words follow the send path (voice-turn.js).
  onUtterance: (audio) => handleUtterance(audio, {
    transcribe,
    log,
    setPending,
    watch,
    sendWords: (words, turn) => send(words.slice(0, MAX_VOICE_CHARS), { voice: true, turn }),
    onVoiceProblem,
  }),
});

// Q-018: kind is 'no_audio', 'empty' (nothing heard) or an error code from transcribe. The transcribing
// turn has already left (voice-turn.js); no turn is added and no respond call is made. Typing still works.
function onVoiceProblem(kind) { showHint(voiceHintKey(kind)); }

function setPending(on) {
  pending = on;
  talk.setPaused(on);
  field.classList.toggle('is-paused', on && input.value.trim() !== '');
}

// Q-011: words per 01-ux.md Codes, send column; every string lives in copy.hints.
const SEND_HINT_KEY = {
  not_ready: 'warming', unavailable: 'sendUnavailable', timeout: 'sendTimeout',
  failed: 'sendFailed', bad_request: 'sendDefect', too_large: 'sendDefect',
};
const hintEl = $('.hint');
const hintText = hintEl.querySelector('.hint__text');
let shownKey = null;
function showHint(key) {
  shownKey = key;
  hintEl.querySelector('use').setAttribute('href', '#i-info');
  hintEl.classList.add('is-shown');
  hintText.textContent = '';
  // later task so the same message twice is announced again (same as createHint)
  setTimeout(() => { hintText.textContent = copy.hints[key]; }, 30);
}
function showSendHint(code) {
  showHint(SEND_HINT_KEY[code] ?? 'sendFailed'); // an unknown code is a failed reply, never shown raw
}
function clearSendHint() {
  shownKey = null;
  hintEl.classList.remove('is-shown');
  hintText.textContent = '';
}

// A failed send gives the words back: the turn leaves, the text returns in front of anything typed
// meanwhile, focus and caret at the end. History, mood and older turns are untouched.
function onSendFailed(err, line, turn) {
  log.dropFailed(turn);
  const typed = input.value;
  input.value = typed.trim() ? `${line} ${typed}` : line;
  setPending(false);
  input.focus();
watch.start();
  input.setSelectionRange(input.value.length, input.value.length);
  showSendHint(err.code);
  watch.failed(err.code); // not_ready / unavailable: the checks resume
}

// turn: a voice turn that already stands in the log (it showed "transcribing"); pending is already on.
async function send(raw, { voice = false, turn: standing = null } = {}) {
  const line = raw.trim();
  if (!line || (pending && !standing)) return false;
  clearSendHint();
  const turn = standing ?? log.addYou(line, { voice });
  setPending(true);
  log.showTyping();
  let result;
  try {
    result = await respond(line, history.slice());
  } catch (err) {
    onSendFailed(err, line, turn);
    return false;
  }
  const { reply, mood } = result;
  history.push({ role: 'user', text: line }, { role: 'companion', text: reply });
  log.addReply(reply);
  companion.setMood(mood); // the mood changes with the reply, never at send
  setPending(false);
  return true;
}

input.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return; // 229: IME still composing
  e.preventDefault();
  if (pending) { setPending(true); return; } // ignored; text kept
  const text = input.value;
  if (!text.trim()) return;
  const st = watch.state;
  if (!st.canSend) { showHint(st.hint ?? 'unreachable'); return; } // text kept, hint repeated, nothing sent
  input.value = '';
  send(text);
});
input.addEventListener('input', () => { if (pending) setPending(true); });

document.addEventListener('visibilitychange', () => {
  document.documentElement.classList.toggle('tab-hidden', document.hidden);
});

input.focus();
watch.start();
