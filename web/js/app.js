// Entry: turn flow idle -> pending -> idle (FLOW-001, FLOW-002). Data comes only from companion-client.js.
import { respond, transcribe, health, speak } from './companion-client.js';
import { memory } from './memory-client.js';
import { createMemoryUi } from './memory-ui.js';
import { look as lookClient } from './look-client.js';
import { createLookUi } from './look-ui.js';
import { lt } from './look-copy.js';
import { copy, voiceHintKey, MAX_VOICE_CHARS, setLang, getLang, resolveLang, setName } from './copy.js';
import { loadName, saveName, createRename } from './name.js';
import { createLog } from './log.js';
import { createCompanion } from './companion.js';
import { createPoker } from './poke.js';
import { createBreath } from './breath.js';
import { createSpeaker } from './speaker.js';
import { createHealthWatch } from './health-watch.js';
import { createHint, createTalkButton } from './talk-button.js';
import { handleUtterance } from './voice-turn.js';

// Q-028: the one rule for the chip (exported for the tests).
export const shouldOfferBreath = (mood, crisis) => mood === 'unpleasant-high' && crisis !== true;

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
const companionEl = $('[data-testid="companion"]');
const history = []; // page memory only (A5)
let pending = false;
// Q-022: bumped by every clear; a reply or transcript that belongs to an earlier generation is dropped.
let generation = 0;
let inflight = null; // the AbortController of the reply on its way (FND-043)
const clearCallbacks = []; // later rows (reading, breathing, chip, card) register what a clear must stop
export function onClear(fn) { clearCallbacks.push(fn); }
// Q-028 -> Q-029 hook: the offer chip calls this when tapped; Q-029 registers the guide's start here.
// No guide registered yet: the tap does nothing. The turn's mood and crisis flag ride along.
let breathStart = null;
export function onBreathStart(fn) { breathStart = fn; }
onClear(() => log.removeOffer()); // a clear removes the chip (the log's own clear drops the node too)
onClear(() => log.removeCard()); // Q-030: and the help card

// Q-025 / DES-025: the reply's voice. Never waits for text or mood; any failure is silence. Q-026 adds the
// toggle and the tts gate through isEnabled. A clear, a send and a press to talk stop it (see below).
// Q-026 / DES-025: the toggle is on at every open (not remembered); a reading needs it on AND tts ready. A
// speak that fails with not_ready / unavailable tells the watch (checks resume); the failure itself stays silent.
let speakerOn = true;
let voiceId = 'serena'; // R2 Q-060: the chosen voice id rides on every /api/speak (the sound stays serena until C-013)
lookClient.getVoice().then((v) => { voiceId = v; }).catch(() => {});
const speakerBtn = $('.speaker-toggle');
const speakerTip = $('.speaker-tip');
function renderSpeaker() {
  const ready = watch.ttsReady;
  const key = !ready ? 'speakerNotReady' : speakerOn ? 'speakerOn' : 'speakerOff';
  const icon = !ready ? 'i-volume' : speakerOn ? 'i-volume-2' : 'i-volume-x';
  speakerBtn.setAttribute('aria-pressed', String(speakerOn)); // keeps the user's choice, also when not ready
  speakerBtn.setAttribute('aria-label', copy.speaker);
  speakerBtn.classList.toggle('is-muted', ready && !speakerOn);
  speakerBtn.classList.toggle('is-notready', !ready);
  speakerBtn.classList.toggle('is-speaking', ready && speakerOn && speaker.active);
  speakerBtn.querySelector('use').setAttribute('href', `#${icon}`);
  speakerTip.textContent = copy[key];
}
const speaker = createSpeaker({
  speak: (text, lang, signal) => speak(text, lang, signal, voiceId).catch((err) => { watch.ttsFailed(err?.code); throw err; }),
  isEnabled: () => speakerOn && watch.ttsReady,
  onActive: () => renderSpeaker(),
});
speakerBtn.addEventListener('click', () => {
  speakerOn = !speakerOn;
  if (!speakerOn) speaker.stop(); // muting silences a reading at once; unmuting never replays
  renderSpeaker();
});
onClear(() => speaker.stop());
// The first click or key unlocks the audio element for browsers that want a gesture (one silent clip).
['pointerdown', 'keydown'].forEach((t) => document.addEventListener(t, () => speaker.unlock(), { capture: true, once: true }));

// Q-024: click or Enter/Space on the companion plays a reaction; a clear ends one at once.
const poker = createPoker({ showFace: companion.showFace, setMotion: companion.setMotion, isBlocked: () => breath.active });
onClear(() => poker.reset());
companionEl.addEventListener('click', () => poker.poke(() => copy.pokes));
companionEl.addEventListener('keydown', (e) => {
  if ((e.key !== 'Enter' && e.key !== ' ') || e.repeat || e.isComposing) return;
  e.preventDefault();
  poker.poke(() => copy.pokes);
});

// Q-029 / DES-028 / FLOW-009: the guide. Start stops the reading and any poke, wears the neutral face (the turn's
// data-mood stays), and the chip reads 停下. Every end (done, chip, Esc, send, talk, clear, new reply) puts the turn's
// face back and offers the chip again. Reduced motion: companion.css drops the swell; the caption still counts.
const phaseWord = (phase) => copy[phase === 'in' ? 'breathIn' : 'breathOut']('').replace(/[…\s]+$/, '');
const breath = createBreath({
  onStart() {
    poker.reset();
    speaker.stop();
    companion.setBreathing(true);
    log.setOfferStop(true);
  },
  onTick({ phase, n, changed }) {
    companion.showFace('neutral', () => copy[phase === 'in' ? 'breathIn' : 'breathOut'](n));
    if (changed) companion.announce(phaseWord(phase));
  },
  onEnd() {
    companion.setBreathing(false);
    companion.showFace(null, null);
    log.setOfferStop(false);
    if (waitingUp) { const to = waitingUp; waitingUp = null; stageUp(to, { captionOnly: true }); } // Q-062: the caption waited
  },
});
onBreathStart(() => { if (breath.active) breath.stop('chip'); else breath.start(); });
onClear(() => breath.stop('clear'));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.isComposing) breath.stop('esc'); });

const rename = createRename({
  row: $('.companion__caption'),
  button: $('.caption__name'),
  // FND-042: save first, like the drawer's field (memory-ui.js): the name shows and is sent only once the profile kept it;
  // a failed save leaves the old name (the default while the files are unreadable, DES-039) and says so on the hint line.
  async onSave(cleaned) {
    if (cleaned === savedName) return;
    try { await memory.setName(cleaned); } catch { showHint('nameSaveFailed'); return; }
    if (hint.key === 'nameSaveFailed') hint.clear();
    applyName(cleaned);
  },
});
// The one place a new name lands (caption rename, the drawer's field, the profile read): the profile keeps it (DES-039);
// localStorage is only read once for the migration below and never written again.
function applyName(cleaned) {
  savedName = cleaned;
  setName(cleaned);
  applyCopy(); // every name updates; turns already in the log are not rewritten
}

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
  onTts: () => renderSpeaker(), // tts is its own part: no hint, no caption (Q-026)
});

const talk = createTalkButton({
  button: $('.talk-button'),
  hint,
  onPress: () => { speaker.stop(); breath.stop('talk'); }, // Q-027: pressing to talk silences the voice at once, also when the hold is refused
  // A hold while voice is not ready records nothing and repeats the current hint (talk-button only asks here).
  isPaused: () => {
    speaker.stop(); // second guard (Q-025 wiring test pins it); onPress already stopped it
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
  speaker.stop(); // a send stops the voice at once
  log.removeOffer(); // Q-028: the next send takes the chip away
  breath.stop('send'); // Q-029: a send ends the guide
  const turn = standing ?? log.addYou(line, { voice });
  const gen = generation;
  setPending(true);
  log.showTyping();
  let result;
  const controller = new AbortController(); // FND-043: 清空 aborts this reply, so the service records nothing for it
  inflight = controller;
  try {
    result = await respond(line, history.slice(), savedName, controller.signal);
  } catch (err) {
    if (gen !== generation) return false; // cleared meanwhile: no words returned, no hint (A24)
    onSendFailed(err, line, turn);
    return false;
  } finally {
    if (inflight === controller) inflight = null;
  }
  if (gen !== generation) return false; // late reply after a clear: dropped
  const { reply, mood, lang, speech, crisis, region } = result;
  history.push({ role: 'user', text: line }, { role: 'companion', text: reply });
  breath.stop('reply'); // Q-029: a new reply ends the guide first, so its mood applies at once
  log.addReply(reply);
  memoryUi.noteTurn(); // R1: the turn is recorded now, so a later 清空 says what stays
  companion.setMood(mood); // the mood changes with the reply, never at send
  // Q-028 / DES-028: the offer only after an unpleasant-high reply that is not a crisis turn (A21).
  if (shouldOfferBreath(mood, crisis)) log.showOffer((chip) => breathStart?.({ chip, mood }));
  if (crisis === true) log.showCrisisCard(() => input.focus(), region); // Q-030: the page only reads the flag (DES-026); R0: numbers by region
  setPending(false);
  speaker.say(speech, lang); // after the text and the mood; a new reply stops the old voice
  return true;
}

// Q-022 / FLOW-011: one click, no confirm. The input text and the name stay.
function clearChat() {
  generation += 1;
  inflight?.abort(); // FND-043: the reply on its way is dropped, no hint (the aborted call lands in send's gen check)
  inflight = null;
  history.length = 0;
  log.clear();
  setPending(false);
  companion.setMood('neutral');
  clearCallbacks.forEach((fn) => fn());
  showHint(memoryUi.kept ? 'clearedKept' : 'cleared'); // R1: something is kept -> say where to delete it
  input.focus();
}
$('.stage-clear').addEventListener('click', clearChat);

// R1: the notice in the empty log, the privacy line and the drawer (日记 / 关于你). Data: memory-client.js only.
// DES-039: the profile is where the name lives. Unreadable -> the default name, no write, no migration. Readable and
// brand new, with an old name in localStorage -> setName once; the key goes only after the service says saved, and a
// failed try shows and sends the old name until the next open. Otherwise the profile's name is the name.
async function onProfile(p) {
  if (!p) return; // no answer: the name the page shows stays (the stored one), nothing is written
  if (!p.readable) { if (savedName !== null) applyName(null); return; }
  const old = p.newProfile ? loadName(storage) : null;
  if (old === null) { if (p.name !== savedName) applyName(p.name); return; }
  if (old !== savedName) applyName(old);
  try { await memory.setName(old); } catch { return; }
  saveName(storage, null); // saved: the key goes (removeItem)
}
// R2: the saved look and stage are painted on the companion (companion.setLook / setStage, which also keep the data attributes
// data-character, data-head ... data-stage; data-mood stays the 5 ids). Applied at open before anything is typed: no flash of the default.
let shownStage = null;
let stageSeq = 0;
let waitingUp = null; // Q-062: a stage-up reached while breathing; its caption plays when the guide ends
const stageHooks = [];
// fn({ from, to, growth }) runs when the stage on screen rises or falls after open (Q-062 plays its moment in applyStage itself).
export function onStageChange(fn) { stageHooks.push(fn); }
function applyLook(l, { animate = true } = {}) { companion.setLook(l, { animate }); }
// Q-062 / FLOW-027: the first time days reach 3 or 7 the stage-up plays once (look-client remembers the stage; DFB-004: a lower
// demo value forgets it). At open it plays only when the remembered stage is lower than today's (days grew while closed), never
// on a refresh. Several stages at once: one moment. While breathing the look changes at once and the caption waits.
async function applyStage(g) {
  const from = shownStage;
  shownStage = g.stage;
  const seq = ++stageSeq;
  let seen = null;
  if (from === null || g.stage > from) seen = await lookClient.claimStageUp(g.stage).catch(() => null);
  if (seq !== stageSeq) return; // a newer value won meanwhile
  const play = seen !== null && g.stage > seen;
  if (!play) { companion.setStage(g.stage); waitingUp = null; } else {
    if (from === null) companion.setStage(seen); // at open: start from the remembered look
    if (breath.active) { companion.setStage(g.stage); waitingUp = g.stage; } else stageUp(g.stage);
  }
  if (from !== null && from !== g.stage) stageHooks.forEach((fn) => fn({ from, to: g.stage, growth: g }));
}
function stageUp(to, { captionOnly = false } = {}) {
  companion.stageUp(to, { thanks: () => lt('thanks'), band: to, captionOnly });
  // growth.upSaid once: the drawer makes the page inert, so then the drawer's own status says it (lookUi.say)
  const said = lt('upSaid')(lt('stage')[to]);
  if ($('main.page').inert) lookUi.say(said); else companion.announce(said);
}
Promise.all([lookClient.getLook(), lookClient.getGrowth()]).then(([l, g]) => { applyLook(l, { animate: false }); applyStage(g); }).catch(() => { /* unreadable: the default look stays (A14) */ });
// Q-064: the phone sheet's preview is a second companion that mirrors the stage one (no caption, ids prefixed pv-).
function createPreview(host) {
  const el = document.createElement('div');
  el.className = 'companion companion--preview';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="companion__layers"></div>';
  host.append(el);
  const mirror = createCompanion(el, null, { preview: true, idPrefix: 'pv-' });
  companion.addMirror(mirror);
  return { destroy() { companion.removeMirror(mirror); el.remove(); } };
}
const lookUi = createLookUi({ client: lookClient, onLook: (l) => applyLook(l), onGrowth: applyStage, onVoice: (v) => { voiceId = v; }, createPreview });
const memoryUi = createMemoryUi({
  client: memory,
  look: lookUi,
  drawer: $('.drawer'),
  main: $('main.page'),
  openers: { diary: $('.stage-diary'), about: $('.stage-about'), look: $('.stage-look') },
  noticeHost: $('.log__empty'),
  privacyEl: $('.log__privacy-text'),
  showHint,
  clearHint: (...keys) => { if (keys.includes(hint.key)) hint.clear(); }, // only the named failure hints; any other line stays
  onNameSaved: applyName,
  onForgotten: () => { clearChat(); },
  onStartChat: () => input.focus(),
  onProfile,
});

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
  document.querySelectorAll('.lang-switch, .drawer__lang').forEach((g) => g.setAttribute('aria-label', copy.langLabel));
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
  memoryUi.refresh();
  renderSpeaker();
}

const langButtons = [...document.querySelectorAll('[data-lang]')]; // the stage group and (R2, REQ-065) the drawer bar's
langButtons.forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.lang === getLang()) return; // the current option does nothing
  setLang(b.dataset.lang);
  applyCopy(); // the clicked button stays in the DOM, so it keeps focus
}));

applyCopy();
input.focus();
watch.start();
memoryUi.start();
