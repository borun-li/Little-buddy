// Entry: turn flow idle -> pending -> idle (FLOW-001, FLOW-002). Data comes only from companion-client.js.
import { respond, transcribe, health } from './companion-client.js';
import { copy, voiceHintKey, MAX_VOICE_CHARS, setLang, getLang, resolveLang, setName } from './copy.js';
import { loadName, saveName, createRename } from './name.js';
import { createLog } from './log.js';
import { createCompanion } from './companion.js';
import { createHealthWatch } from './health-watch.js';
import { createHint, createTalkButton } from './talk-button.js';
import { handleUtterance } from './voice-turn.js';

const $ = (sel) => document.querySelector(sel);

// A12: the browser decides the language at open; it is not remembered and never sent to the backend.
setLang(resolveLang(navigator.languages?.[0] ?? navigator.language));

// Q-023 / DES-027: the saved, cleaned name (null = the default of the interface language). It rides every
// respond request, never history, transcribe or speak. A reload and a clear leave it alone.
const storage = (() => { try { return window.localStorage; } catch { return null; } })();
let savedName = loadName(storage);
setName(savedName);

const input = $('[data-testid="fake-input"]');
const field = $('.field');
const note = $('.field__note');

const log = createLog($('.log'), $('.log__turns'), $('.log__empty'));
const companion = createCompanion($('[data-testid="companion"]'), $('.companion__caption'));
const history = []; // page memory only (A5)
let pending = false;
// Q-022: bumped by every clear; a reply or transcript that belongs to an earlier generation is dropped.
let generation = 0;
const clearCallbacks = []; // later rows (reading, breathing, chip, card) register what a clear must stop
export function onClear(fn) { clearCallbacks.push(fn); }

const rename = createRename({
  row: $('.companion__caption'),
  button: $('.caption__name'),
  onSave(cleaned) {
    savedName = cleaned;
    saveName(storage, cleaned);
    setName(cleaned);
    applyCopy(); // every name updates; turns already in the log are not rewritten
  },
});

const hint = createHint($('.hint'));

// Hint rules (01-ux.md): a health check replaces only a health hint (or nothing); over an action hint
// only stillDown; never over a hold hint. awake shows only over a health hint and clears only itself.
const HEALTH_HINTS = new Set(['warming', 'voiceNotReady', 'unreachable', 'stillDown']);
const HOLD_HINTS = new Set(['micOpening', 'listeningNow']);
function healthHint(key) {
  const cur = hint.key;
  if (key === 'awake') { if (HEALTH_HINTS.has(cur)) showHint('awake'); return; }
  if (!key) { if (cur === 'awake') hint.clear(); return; } // awake's own 4 s end
  if (cur == null || cur === 'awake' || HEALTH_HINTS.has(cur) || (key === 'stillDown' && !HOLD_HINTS.has(cur))) showHint(key);
}

// FLOW-006: the watch decides what Enter and hold may do and which hint and caption show.
const watch = createHealthWatch({
  health,
  onChange(st) {
    companion.setWaking(st.waking);
    healthHint(st.hint);
  },
});

const talk = createTalkButton({
  button: $('.talk-button'),
  hint,
  // A hold while voice is not ready records nothing and repeats the current hint (talk-button only asks here).
  isPaused: () => {
    if (pending) return true;
    const st = watch.state;
    if (!st.canVoice) { showHint(st.hint ?? 'unreachable'); return true; }
    return false;
  },
  // Q-014: the held WAV goes to transcribe, then the words follow the send path (voice-turn.js).
  // FND-002: a hold that ends while a reply is pending is dropped (no turn, no request); setPaused cancels it earlier.
  onUtterance: (audio) => {
    if (pending) return false;
    // Q-022: a clear while this utterance is in flight drops its transcript: nothing touches the log,
    // the pending state or the hint afterwards.
    const gen = generation;
    const stale = () => gen !== generation;
    return handleUtterance(audio, {
      transcribe,
      log: {
        addTranscribing: () => log.addTranscribing(),
        setWords: (t, w) => { if (!stale()) log.setWords(t, w); },
        dropFailed: (t) => { if (!stale()) log.dropFailed(t); },
      },
      setPending: (on) => { if (!stale()) setPending(on); },
      watch,
      sendWords: (words, turn) => (stale() ? false : send(words.slice(0, MAX_VOICE_CHARS), { voice: true, turn })),
      onVoiceProblem: (kind) => { if (!stale()) onVoiceProblem(kind); },
    });
  },
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
function showHint(key) { // the one hint line is shared with the talk button; hint.key says what is on it
  hint.show(key, 'i-info');
}
function showSendHint(code) {
  showHint(SEND_HINT_KEY[code] ?? 'sendFailed'); // an unknown code is a failed reply, never shown raw
}
function clearSendHint() {
  hint.clear();
}

// A failed send gives the words back: the turn leaves, the text returns in front of anything typed
// meanwhile, focus and caret at the end. History, mood and older turns are untouched.
function onSendFailed(err, line, turn) {
  log.dropFailed(turn);
  const typed = input.value;
  input.value = typed.trim() ? `${line} ${typed}` : line;
  setPending(false);
  input.focus();
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
  const gen = generation;
  setPending(true);
  log.showTyping();
  let result;
  try {
    result = await respond(line, history.slice(), savedName);
  } catch (err) {
    if (gen !== generation) return false; // cleared meanwhile: no words returned, no hint (A24)
    onSendFailed(err, line, turn);
    return false;
  }
  if (gen !== generation) return false; // late reply after a clear: dropped
  const { reply, mood } = result;
  history.push({ role: 'user', text: line }, { role: 'companion', text: reply });
  log.addReply(reply);
  companion.setMood(mood); // the mood changes with the reply, never at send
  setPending(false);
  return true;
}

// Q-022 / FLOW-011: one click, no confirm. The input text and the name stay.
function clearChat() {
  generation += 1;
  history.length = 0;
  log.clear();
  setPending(false);
  companion.setMood('neutral');
  clearCallbacks.forEach((fn) => fn());
  showHint('cleared');
  input.focus();
}
$('.stage-clear').addEventListener('click', clearChat);

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

// Q-015: every word outside the chat, in the current language (FLOW-007). Turns are never rewritten.
function applyCopy() {
  document.documentElement.lang = getLang() === 'zh' ? 'zh-CN' : 'en';
  document.title = copy.title;
  document.querySelectorAll('[data-copy]').forEach((el) => { el.textContent = copy[el.dataset.copy]; });
  input.placeholder = copy.placeholder;
  input.setAttribute('aria-label', copy.inputLabel);
  note.textContent = copy.pausedNote;
  $('.log__turns').setAttribute('aria-label', copy.logLabel);
  langGroup.setAttribute('aria-label', copy.langLabel);
  $('.stage-clear').setAttribute('aria-label', copy.clearName);
  langButtons.forEach((b) => {
    b.setAttribute('aria-label', copy[b.dataset.lang === 'zh' ? 'langZh' : 'langEn']);
    b.setAttribute('aria-pressed', String(b.dataset.lang === getLang()));
  });
  hint.refresh();
  talk.refresh();
  log.refresh();
  companion.refresh();
  rename.refresh();
}

const langGroup = $('.lang-switch');
const langButtons = [...langGroup.querySelectorAll('button')];
langButtons.forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.lang === getLang()) return; // the current option does nothing
  setLang(b.dataset.lang);
  applyCopy(); // the clicked button stays in the DOM, so it keeps focus
}));

applyCopy();
input.focus();
watch.start();
