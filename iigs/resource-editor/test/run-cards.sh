#!/usr/bin/env bash
# run-cards.sh WORK [--no-build] -- the Cursors, Version, Sounds, Fonts and Patterns cards end to end:
#   build Rsrc.Editor on the IIGS (unless --no-build and WORK/built.hdv exists), install the XFCN,
#   add the test files (cards-make.js), drive the cards (cards.hts), check (cards-verify.js).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
NODE=C:/Users/jsnap/AppData/Local/claude-tools/node-v24.22.1-win-x64/node.exe
CP2=/d/cp2_1.2.0_win-x64_sc/cp2.exe
W="$1"; mkdir -p "$W"
winpath() { cygpath -w "$1" 2>/dev/null || echo "$1"; }

if [ "${2:-}" != "--no-build" ] || [ ! -f "$W/built.hdv" ]; then
  bash "$HERE/rig.sh" setup "$W" >/dev/null
  cp "$W/base.hdv" "$W/built.hdv"
  rm -rf "$W/shots"; bash "$HERE/rig.sh" run "$W" "$W/built.hdv" "$ROOT/stack/build.hts" 900 "$ROOT/stack" | tail -1
  bash "$ROOT/tools/make-disk.sh" install "$W/built.hdv"
  bash "$HERE/rig.sh" freshhome "$W" "$W/built.hdv"
fi
cp "$W/built.hdv" "$W/cards.hdv"
T="$W/tc"; rm -rf "$T"; mkdir -p "$T"
"$NODE" "$HERE/cards-make.js" "$(winpath "$T")"
( cd "$T" && "$CP2" add --from-naps "$(winpath "$W/cards.hdv")" Test.Cursors#060000 Test.Cursors#060000r \
    Test.Version#060000 Test.Version#060000r Test.Sounds#060000 Test.Sounds#060000r Test.Snd2#060000 Test.Snd2#060000r \
    "TestFont.12#C80000" >/dev/null )
rm -rf "$W/shots"; bash "$HERE/rig.sh" run "$W" "$W/cards.hdv" "$HERE/cards.hts" 500 | tail -1
rm -rf "$T"; mkdir -p "$T"
( cd "$T" && "$CP2" extract --preserve=naps "$(winpath "$W/cards.hdv")" Test.Cursors Test.Version Test.Sounds TestFont.12 Test.Stack Out >/dev/null )
tr '\r' '\n' < "$T/Out#040000" > "$W/cards-out.txt"; cat "$W/cards-out.txt"; echo
for p in "$W"/shots/s*.png; do
  powershell -NoProfile -ExecutionPolicy Bypass -File "$(winpath "$HERE/png2rgb.ps1")" "$(winpath "$p")" "$(winpath "${p%.png}.rgb")" >/dev/null 2>&1 || true
done
"$NODE" "$HERE/cards-verify.js" "$(winpath "$T")" "$(winpath "$W/cards-out.txt")" $(for f in "$W"/shots/s*.rgb; do winpath "$f"; done)
