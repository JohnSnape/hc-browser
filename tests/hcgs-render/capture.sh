#!/usr/bin/env bash
# capture.sh WORK OUTDIR "Stack:Path#card" ...  -- screenshots of real HyperCard IIGS cards, headless.
#
# Uses the resource editor's rig (iigs/resource-editor/test/rig.sh setup WORK makes WORK/base.hdv:
# HyperCard IIGS 1.1 + System 6.0.4, Home running /HyperCard/Boot, the rsrc XFCN in Home's fork).
# For each "Stacks:Notes#2" argument the boot script hides the menu bar and message box, goes to that
# card of that stack and writes /HyperCard/Sn; this script sees Sn appear, waits, and takes a passive
# PrintWindow capture (no keystrokes or clicks reach the desktop) as OUTDIR/<n>.png.
# Or: capture.sh WORK OUTDIR --boot FILE.hts N  -- run your own boot handler, which writes :HyperCard:S1..SN
# itself when each screen is ready (and :HyperCard:Done at the end). OUTDIR/disk.hdv keeps the disk after.
# Apple's software comes from the user's own copies and never enters the repo; neither do the shots.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
RIG="$HERE/../../iigs/resource-editor/test"
CP2=/d/cp2_1.2.0_win-x64_sc/cp2.exe
winpath() { cygpath -w "$1" 2>/dev/null || echo "$1"; }
W="$1" OUT="$2"; shift 2; mkdir -p "$OUT"
BOOTFILE=""; NSHOTS=0
if [ "${1:-}" = "--boot" ]; then BOOTFILE="$2"; NSHOTS="$3"; shift 3; fi
D="$W/cap.hdv"; cp "$W/base.hdv" "$D"
T="$W/ctmp"; rm -rf "$T"; mkdir -p "$T"
if [ -n "$BOOTFILE" ]; then
  tr '\n' '\r' < "$BOOTFILE" > "$T/Boot#040000"
  total=$NSHOTS
else
  total=$#
  {
    echo "on boot"
    echo "  hide message box"
    echo "  hide menubar"
    n=0
    for a in "$@"; do
      n=$((n+1)); st="${a%#*}"; cd="${a##*#}"
      echo "  go to card $cd of stack \":HyperCard:$st\""
      echo "  hide menubar"
      echo "  hide message box"
      echo "  get rsrc(\"writetext\", \":HyperCard:S$n\", \"ok\")"
      echo "  wait 12 seconds"
    done
    echo "  get rsrc(\"writetext\", \":HyperCard:Done\", \"ok\")"
    echo "end boot"
  } | tr '\n' '\r' > "$T/Boot#040000"
fi
( cd "$T" && "$CP2" add --from-naps "$(winpath "$D")" "Boot#040000" >/dev/null )
sed -i "s|^s7d1 =.*|s7d1 = $(winpath "$D" | sed 's/\\/\\\\/g')|" "$W/gsport/config.txt"
PID=$(powershell -NoProfile -Command "\$p = Start-Process -FilePath '$(winpath "$W/gsport/GSport.exe")' -WorkingDirectory '$(winpath "$W/gsport")' -PassThru; \$p.Id" | tr -d '\r')
echo "GSport pid $PID"
k=1 t=0
while [ $t -lt $((150 + 25 * total)) ]; do
  sleep 2; t=$((t+2))
  cat=$("$CP2" catalog "$D" 2>/dev/null || true)
  if [ $k -le $total ] && echo "$cat" | grep -q " S$k *\$"; then
    sleep 5
    powershell -NoProfile -ExecutionPolicy Bypass -File "$(winpath "$RIG/snap.ps1")" "$PID" "$(winpath "$OUT/$k.png")" >/dev/null 2>&1 || true
    echo "screen $k captured after ${t}s"; k=$((k+1))
  fi
  if [ $k -gt $total ] && { [ -z "$BOOTFILE" ] || echo "$cat" | grep -q " Done *\$"; }; then sleep 3; break; fi
done
powershell -NoProfile -ExecutionPolicy Bypass -File "$(winpath "$RIG/snap.ps1")" "$PID" "$(winpath "$OUT/last.png")" >/dev/null 2>&1 || true
powershell -NoProfile -Command "Stop-Process -Id $PID -Force" || true
sleep 1
cp "$D" "$OUT/disk.hdv"
rm -rf "$T"
