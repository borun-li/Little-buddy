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

// Hook for Q-011: it gives the words back and shows the hint for err.code. Until then the page only
// stops waiting, so a failed send never leaves send and hold paused for good.
function onSendFailed(err, line) {
  void line;
  document.querySelector('.turn--typing')?.remove();
  setPending(false);
  console.warn('respond failed:', err.code);
}

async function send(raw, { voice = false } = {}) {
  const line = raw.trim();
  if (!line || pending) return false;
  log.addYou(line, { voice });
  setPending(true);
  log.showTyping();
  let result;
  try {
    result = await respond(line, history.slice());
  } catch (err) {
    onSendFailed(err, line);
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
