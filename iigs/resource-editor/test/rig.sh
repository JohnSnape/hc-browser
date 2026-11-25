#!/usr/bin/env bash
# rig.sh -- headless HyperCard IIGS runs for the resource editor (no keystrokes, no clicks).
#
#   rig.sh setup WORK            copy GSport + ROM into WORK, build WORK/base.hdv:
#                                HyperCard.hdv + System 6.0.4, HyperCard as System:Start,
#                                Home with a startUp that runs /HyperCard/Boot, and the
#                                RSRC XFCN in Home's resource fork
#   rig.sh run WORK DISK BOOT SECS [SRCDIR]
#                                put text file BOOT on DISK as /HyperCard/Boot (and the .hts
#                                files of SRCDIR as /HyperCard/RE.Src/<name>), boot GSport on
#                                DISK, wait until /HyperCard/Done appears (or SECS pass), take
#                                passive PrintWindow captures every 10 s into WORK/shots, stop.
#
# Apple's software comes from the user's own copies (paths below) and never enters the repo.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
NODE=C:/Users/jsnap/AppData/Local/claude-tools/node-v24.22.1-win-x64/node.exe
CP2=/d/cp2_1.2.0_win-x64_sc/cp2.exe
GSPORT_SRC=/h/gsport_0.31
ROM03="/p/ASIMOV/Emulators/Apple II In Apple II GS Emulation/Rom.03"
HC_HDV="/p/ASIMOV/GS/HyperCard (Hard Disk Image)/HyperCard.hdv"
SYS_PO="/p/ASIMOV/GS/Apple IIGS System 6.0.4/PO Disk Images/System.Disk.po"

winpath() { cygpath -w "$1" 2>/dev/null || echo "$1"; }
# LF -> CR (HyperTalk's line ends)
tocr() { "$NODE" -e "const fs=require('fs');fs.writeFileSync(process.argv[2],fs.readFileSync(process.argv[1],'latin1').replace(/\r?\n/g,String.fromCharCode(13)).replace(/\r$/,''),'latin1')" "$(winpath "$1")" "$(winpath "$2")"; }

setup() {
  local W="$1"; mkdir -p "$W"
  [ -f "$W/gsport/GSport.exe" ] || { cp -r "$GSPORT_SRC" "$W/gsport"; cp "$ROM03" "$W/gsport/ROM"; }
  local B="$W/base.hdv" T="$W/tmp"; rm -rf "$T"; mkdir -p "$T"
  cp "$HC_HDV" "$B"
  "$CP2" copy --overwrite "$SYS_PO" ProDOS System "$B" >/dev/null
  "$CP2" rm "$B" System:Start >/dev/null
  "$CP2" mv "$B" HyperCardIIGS System:Start >/dev/null
  "$CP2" mv "$B" Home System:Home >/dev/null
  ( cd "$T" && "$CP2" extract --preserve=naps "$(winpath "$B")" System:Home >/dev/null )
  local HD HR; HD=$(ls "$T"/System/Home#* | grep -v "r$"); HR=$(ls "$T"/System/Home#*r)
  # MSYS would rewrite /HyperCard/Boot into a Windows path
  MSYS2_ARG_CONV_EXCL="*" "$NODE" "$(winpath "$ROOT/tools/forktool.js")" boot "$(winpath "$HD")" "$(winpath "$HD")" /HyperCard/Boot
  # Home's copy answers "version" with "RSRC H.0", so a test can tell it from the editor's own
  "$NODE" -e "const fs=require('fs');const b=fs.readFileSync(process.argv[1]);const i=b.indexOf('RSRC 1.0');if(i<0)throw 'no version';b.write('RSRC H.0',i,'latin1');fs.writeFileSync(process.argv[2],b)" \
    "$(winpath "$ROOT/xfcn/RSRC")" "$(winpath "$T/RSRC.home")"
  "$NODE" "$ROOT/tools/forktool.js" add "$HR" "$HR" '$801F' 1 rsrc "$T/RSRC.home" '$0800'
  "$CP2" rm "$B" System:Home >/dev/null
  ( cd "$T/System" && "$CP2" add --from-naps "$(winpath "$B")" "$(basename "$HD")" "$(basename "$HR")" >/dev/null )
  "$CP2" mv "$B" Home System:Home >/dev/null
  rm -rf "$T"
  "$CP2" catalog "$B" | grep -E "System:(Start|Home)$" || true
}

run() {
  local W="$1" D="$2" BOOT="$3" SECS="$4" SRC="${5:-}"
  local T="$W/tmp"; rm -rf "$T"; mkdir -p "$T" "$W/shots"
  "$CP2" rm "$D" Boot >/dev/null 2>&1 || true
  "$CP2" rm "$D" Done >/dev/null 2>&1 || true
  tocr "$BOOT" "$T/Boot#040000"
  ( cd "$T" && "$CP2" add --from-naps "$(winpath "$D")" "Boot#040000" >/dev/null )
  if [ -n "$SRC" ]; then
    "$CP2" rm "$D" RE.Src >/dev/null 2>&1 || true
    mkdir -p "$T/RE.Src"
    for f in "$SRC"/*.hts; do tocr "$f" "$T/RE.Src/$(basename "$f" .hts)#040000"; done
    ( cd "$T" && "$CP2" add --from-naps "$(winpath "$D")" RE.Src >/dev/null )
  fi
  sed -i "s|^s7d1 = .*|s7d1 = $(winpath "$D" | sed 's/\\/\\\\/g')|" "$W/gsport/config.txt"
  local PID
  PID=$(powershell -NoProfile -Command "\$p = Start-Process -FilePath '$(winpath "$W/gsport/GSport.exe")' -WorkingDirectory '$(winpath "$W/gsport")' -PassThru; \$p.Id")
  PID=$(echo "$PID" | tr -d '\r')
  echo "GSport pid $PID"
  local t=0 n=0
  while [ $t -lt "$SECS" ]; do
    sleep 10; t=$((t+10)); n=$((n+1))
    powershell -NoProfile -ExecutionPolicy Bypass -File "$(winpath "$HERE/snap.ps1")" "$PID" "$(winpath "$W/shots/s$(printf %03d $n).png")" >/dev/null 2>&1 || true
    if "$CP2" catalog "$D" 2>/dev/null | grep -q " Done *$"; then echo "Done after ${t}s"; sleep 3; break; fi
  done
  powershell -NoProfile -ExecutionPolicy Bypass -File "$(winpath "$HERE/snap.ps1")" "$PID" "$(winpath "$W/shots/last.png")" >/dev/null 2>&1 || true
  powershell -NoProfile -Command "Stop-Process -Id $PID -Force" || true
  sleep 1
  rm -rf "$T"
}

case "${1:-}" in
  setup) setup "$2" ;;
  run) run "$2" "$3" "$4" "$5" "${6:-}" ;;
  *) echo "usage: rig.sh setup WORK | run WORK DISK BOOT SECS [SRCDIR]"; exit 2 ;;
esac
