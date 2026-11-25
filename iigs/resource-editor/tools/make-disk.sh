#!/usr/bin/env bash
# make-disk.sh -- package the Rsrc.Editor stack built on the IIGS (test/rig.sh + stack/build.hts).
#
#   make-disk.sh install DISK       put the RSRC XFCN into the resource fork of :HyperCard:Rsrc.Editor
#                                   on DISK (the stack HyperCard made has an empty fork)
#   make-disk.sh image DISK OUT.po  make an 800K ProDOS disk "RsrcEditor" holding the stack (with the
#                                   XFCN) and a ReadMe, from the stack on DISK
#
# The image holds only this project's files: the stack HyperCard built from our scripts, and our XFCN.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
NODE=C:/Users/jsnap/AppData/Local/claude-tools/node-v24.22.1-win-x64/node.exe
CP2=/d/cp2_1.2.0_win-x64_sc/cp2.exe
winpath() { cygpath -w "$1" 2>/dev/null || echo "$1"; }

# extract the stack into $1 and give its fork the XFCN; prints the data-fork file name
prepare() {
  local DISK="$1" T="$2"
  mkdir -p "$T"
  ( cd "$T" && "$CP2" extract --preserve=naps "$(winpath "$DISK")" Rsrc.Editor >/dev/null )
  local D; D=$(ls "$T"/Rsrc.Editor#* | grep -v "r$")
  local R="${D}r"
  if [ -s "$R" ]; then "$NODE" "$HERE/forktool.js" add "$R" "$R" '$801F' 1 rsrc "$ROOT/xfcn/RSRC" '$0800' >/dev/null
  else "$NODE" "$HERE/forktool.js" add - "$R" '$801F' 1 rsrc "$ROOT/xfcn/RSRC" '$0800' >/dev/null; fi
  basename "$D"
}

case "${1:-}" in
  install)
    DISK="$2"; T="$(mktemp -d)"
    N=$(prepare "$DISK" "$T")
    "$CP2" rm "$DISK" Rsrc.Editor >/dev/null
    ( cd "$T" && "$CP2" add --from-naps "$(winpath "$DISK")" "$N" "${N}r" >/dev/null )
    rm -rf "$T"
    "$CP2" catalog "$DISK" | grep "Rsrc.Editor"
    ;;
  image)
    DISK="$2"; OUT="$(cd "$(dirname "$3")" && pwd)/$(basename "$3")"; T="$(mktemp -d)"
    N=$(prepare "$DISK" "$T")
    "$NODE" -e "const fs=require('fs');fs.writeFileSync(process.argv[2],fs.readFileSync(process.argv[1],'latin1').replace(/\r?\n/g,String.fromCharCode(13)),'latin1')" \
      "$(winpath "$ROOT/disk/ReadMe.txt")" "$(winpath "$T/ReadMe#040000")"
    rm -f "$OUT"
    "$CP2" cdi "$(winpath "$OUT")" 800k prodos >/dev/null
    "$CP2" mv "$(winpath "$OUT")" : RsrcEditor >/dev/null 2>&1 || true
    ( cd "$T" && "$CP2" add --from-naps "$(winpath "$OUT")" "$N" "${N}r" "ReadMe#040000" >/dev/null )
    rm -rf "$T"
    "$CP2" catalog "$OUT"
    ;;
  *) echo "usage: make-disk.sh install DISK | image DISK OUT.po"; exit 2 ;;
esac
