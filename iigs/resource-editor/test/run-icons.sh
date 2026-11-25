#!/usr/bin/env bash
# run-icons.sh WORK -- stage 1 end to end, headless:
#   1. rig setup (HyperCard boot disk, Home runs /HyperCard/Boot, Home's XFCN says "RSRC H.0")
#   2. build Rsrc.Editor on the IIGS from stack/*.hts (build.hts)
#   3. put the XFCN into the stack's own fork (tools/make-disk.sh install)
#   4. add the test file Test.Icons (icons-make.js)
#   5. drive the Icons card (icons.hts), hold the edited icon for captures
#   6. check the file and the captures (icons-verify.js)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
NODE=C:/Users/jsnap/AppData/Local/claude-tools/node-v24.22.1-win-x64/node.exe
CP2=/d/cp2_1.2.0_win-x64_sc/cp2.exe
W="$1"; mkdir -p "$W"
winpath() { cygpath -w "$1" 2>/dev/null || echo "$1"; }

bash "$HERE/rig.sh" setup "$W" >/dev/null
cp "$W/base.hdv" "$W/built.hdv"
rm -rf "$W/shots"; bash "$HERE/rig.sh" run "$W" "$W/built.hdv" "$ROOT/stack/build.hts" 300 "$ROOT/stack" | tail -1
bash "$ROOT/tools/make-disk.sh" install "$W/built.hdv"
bash "$HERE/rig.sh" freshhome "$W" "$W/built.hdv"
cp "$W/built.hdv" "$W/icons.hdv"
T="$W/ti"; rm -rf "$T"; mkdir -p "$T"
"$NODE" "$HERE/icons-make.js" "$(winpath "$T")"
( cd "$T" && "$CP2" add --from-naps "$(winpath "$W/icons.hdv")" "Test.Icons#060000" "Test.Icons#060000r" >/dev/null )
rm -rf "$W/shots"; bash "$HERE/rig.sh" run "$W" "$W/icons.hdv" "$HERE/icons.hts" 300 | tail -1
rm -rf "$T"; mkdir -p "$T"
( cd "$T" && "$CP2" extract --preserve=naps "$(winpath "$W/icons.hdv")" Test.Icons Out >/dev/null )
tr '\r' '\n' < "$T/Out#040000"; echo
for p in "$W"/shots/s*.png; do
  powershell -NoProfile -ExecutionPolicy Bypass -File "$(winpath "$HERE/png2rgb.ps1")" "$(winpath "$p")" "$(winpath "${p%.png}.rgb")" >/dev/null
done
"$NODE" "$HERE/icons-verify.js" "$(winpath "$T/Test.Icons#060000r")" $(for f in "$W"/shots/s*.rgb; do winpath "$f"; done)
