// Entry: turn flow idle -> pending -> idle (FLOW-001, FLOW-002). Data comes only from companion-client.js.
import { respond, transcribe } from './companion-client.js';
import { copy } from './copy.js';
import { createLog } from './log.js';
import { createCompanion } from './companion.js';
import { createHint, createTalkButton } from './talk-button.js';

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

const talk = createTalkButton({
  button: $('.talk-button'),
  hint: createHint($('.hint')),
  isPaused: () => pending,
  // Q-014 passes the held WAV and handles failures; until then the real transcribe has no audio to send.
  onUtterance: async (audio) => {
    try {
      const { text } = await transcribe(audio);
      send(text, { voice: true });
    } catch { /* Q-014 / Q-018 words these */ }
  },
});

function setPending(on) {
  pending = on;
  talk.setPaused(on);
  field.classList.toggle('is-paused', on && input.value.trim() !== '');
}

// Q-011: words per 01-ux.md Codes, send column. Q-015 moves these into copy.js (hints.warming,
// sendUnavailable, sendTimeout, sendFailed, sendDefect); copy.hints wins as soon as it has them.
const SEND_HINT_KEY = {
  not_ready: 'warming', unavailable: 'sendUnavailable', timeout: 'sendTimeout',
  failed: 'sendFailed', bad_request: 'sendDefect', too_large: 'sendDefect',
};
const SEND_HINT_ZH = {
  warming: '小伙伴还在醒来，通常一两分钟。可以先打字，醒了再发。',
  sendUnavailable: '没连上小伙伴，这句没发出去。文字放回输入框了，稍等再按 Enter。',
  sendTimeout: '小伙伴想得太久，这次没回上。文字放回输入框了，按 Enter 再发。',
  sendFailed: '这次没回上来。文字放回输入框了，按 Enter 再发。',
  sendDefect: '这句没发出去。文字放回输入框了，再试一次；还不行就刷新页面（聊天会清空）。',
};
const hintEl = $('.hint');
const hintText = hintEl.querySelector('.hint__text');
function showSendHint(code) {
  const key = SEND_HINT_KEY[code] ?? 'sendFailed'; // an unknown code is a failed reply, never shown raw
  hintEl.querySelector('use').setAttribute('href', '#i-info');
  hintEl.classList.add('is-shown');
  hintText.textContent = '';
  // later task so the same message twice is announced again (same as createHint)
  setTimeout(() => { hintText.textContent = copy.hints[key] ?? SEND_HINT_ZH[key]; }, 30);
}
function clearSendHint() {
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
  input.setSelectionRange(input.value.length, input.value.length);
  showSendHint(err.code);
}

async function send(raw, { voice = false } = {}) {
  const line = raw.trim();
  if (!line || pending) return false;
  clearSendHint();
  const turn = log.addYou(line, { voice });
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
  input.value = '';
  send(text);
});
input.addEventListener('input', () => { if (pending) setPending(true); });

document.addEventListener('visibilitychange', () => {
  document.documentElement.classList.toggle('tab-hidden', document.hidden);
});

input.focus();
