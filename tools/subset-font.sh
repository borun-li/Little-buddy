#!/usr/bin/env bash
# One-off, build-time: LXGW WenKai Regular TTF -> web/fonts/lxgw-wenkai-subset.woff2.
# Keeps ASCII, Latin-1 punctuation, general and CJK punctuation, full-width forms, the GB2312 hanzi,
# and every character in the preset replies and UI copy. Never runs at page time.
# Needs: python3 with fonttools + brotli (pyftsubset). The TTF is not committed.
# Usage: tools/subset-font.sh path/to/LXGWWenKai-Regular.ttf
set -euo pipefail

ttf="${1:?usage: tools/subset-font.sh path/to/LXGWWenKai-Regular.ttf}"
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/web/fonts/lxgw-wenkai-subset.woff2"
chars="$(mktemp)"
trap 'rm -f "$chars"' EXIT

python3 -I - "$root" > "$chars" <<'PY'
import pathlib, sys
root = pathlib.Path(sys.argv[1])
cs = set()
# GB2312 level 1 and 2 hanzi: rows 0xB0-0xF7, cells 0xA1-0xFE
for hi in range(0xB0, 0xF8):
    for lo in range(0xA1, 0xFF):
        try:
            cs.add(bytes([hi, lo]).decode('gb2312'))
        except UnicodeDecodeError:
            pass
for f in ('web/js/fake/presets.js', 'web/js/copy.js'):
    cs.update((root / f).read_text(encoding='utf-8'))
sys.stdout.write(''.join(sorted(c for c in cs if ord(c) > 0x7E)))
PY

pyftsubset "$ttf" \
  --text-file="$chars" \
  --unicodes="U+0020-007E,U+00A0-00BF,U+00D7,U+00F7,U+2000-206F,U+3000-303F,U+FF00-FFEF" \
  --layout-features='*' \
  --flavor=woff2 \
  --output-file="$out"

ls -l "$out"
