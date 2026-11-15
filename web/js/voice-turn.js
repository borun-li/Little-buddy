// Q-014: one held utterance -> transcribing turn -> words -> the send path. No DOM here: the log, the
// transcribe call and the send path are injected, so node tests drive it with fakes.
//   deps: { transcribe(audio) -> {text}, log: {addTranscribing, setWords, dropFailed}, setPending(bool),
//           sendWords(text, turn) -> Promise, watch: {failed(code)}, onVoiceProblem(kind) }
// Q-018 hook: onVoiceProblem(kind) with kind 'no_audio' | 'empty' | an error code. Q-014 passes a no-op.
export async function handleUtterance(audio, deps) {
  const { transcribe, log, setPending, sendWords, watch, onVoiceProblem } = deps;
  if (!audio) { onVoiceProblem('no_audio'); return false; } // recording gave nothing: no turn, no request
  setPending(true);
  const turn = log.addTranscribing();
  let text;
  try {
    ({ text } = await transcribe(audio));
  } catch (err) {
    log.dropFailed(turn);
    setPending(false);
    watch.failed(err.code); // not_ready / unavailable resume the health checks
    onVoiceProblem(err.code);
    return false;
  }
  const words = (text ?? '').trim();
  if (!words) { // REQ-003: nothing heard -> the placeholder leaves, no respond request
    log.dropFailed(turn);
    setPending(false);
    onVoiceProblem('empty');
    return false;
  }
  log.setWords(turn, words);
  return sendWords(words, turn);
}
