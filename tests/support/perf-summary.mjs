// Prints the headline numbers of perf cell JSON files: node tests/support/perf-summary.mjs <file.json>...   (be-tester #8)
import { readFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  const s = JSON.parse(readFileSync(f, 'utf8')).summary;
  const sec = (o) => (o && o.n ? `n=${o.n} p50 ${(o.p50 / 1000).toFixed(2)} p95 ${(o.p95 / 1000).toFixed(2)} max ${(o.max / 1000).toFixed(2)}` : 'n=0');
  console.log(`${f.split('/').pop()}: ${s.cell} switchP=${s.switchP} switch-share=${s.switchShare}% turns=${s.turns} ok=${s.turnsOk} failures=${s.respondFailures.length}`);
  console.log(`   respond ${sec(s.respond)} | >10s: ${s.respondOver10s} | switch-turn ${sec(s.respondSwitch)} | same-language ${sec(s.respondSameLang)}`);
  console.log(`   speak calls ${s.speakCalls} timeouts ${s.speakTimeouts} aborted ${s.speakAborted} 504s ${s.http504} | updates queued ${s.updates.queuedTurns} ok ${s.updates.ok} wrote ${s.updates.wrote} queue_full ${s.updates.queue_full} timeouts ${s.updates.timeouts} busy ${s.updates.busyLines} still waiting ${s.updates.stillWaiting} | leftover pids ${JSON.stringify(s.leftoverPids)}`);
}
