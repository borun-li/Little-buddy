// Preload (NODE_OPTIONS=--require) for the gateway child in tests: every spawn of llama-server, companion-stt or companion-tts is
// redirected to the test doubles, so a real gateway (server/main.js, real routes and store) runs with no models. The repo's real binary
// path is fixed by server/config.js, so this is the only way to put a scripted Bonsai behind an unchanged gateway.
const cp = require('node:child_process');
const path = require('node:path');
const real = cp.spawn;
const here = __dirname;
const map = [['llama-server', 'fake-llama-memory.cjs'], ['companion-stt', 'fake-stt.cjs'], ['companion-tts', 'fake-tts.cjs']];
cp.spawn = function spawn(cmd, args, opts) {
  const hit = map.find(([bin]) => path.basename(String(cmd)) === bin);
  if (!hit) return real.call(this, cmd, args, opts);
  return real.call(this, process.execPath, [path.join(here, hit[1]), ...(args || [])], opts);
};
require('node:module').syncBuiltinESMExports();
