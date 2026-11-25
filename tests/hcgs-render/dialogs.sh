#!/usr/bin/env bash
# dialogs.sh WORK OUTDIR [name ...] -- capture HyperCard IIGS 1.1's answer/ask dialogs for each case in dialogs.json
# (all of them, or the names given): a boot script makes an empty stack, writes S1 and runs the case's script; the
# dialog waits for a click that never comes, so NODONE ends the run after the shot. Then OUTDIR/<name>/1.rgb is made
# for dialogs.js. WORK is the rig from capture.sh. The captures are Apple's screens and stay out of the repo.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
W="$1" OUT="$2"; shift 2
NODE="${NODE:-node}"
names=$("$NODE" -e "const c=require('$HERE/dialogs.json'), o=process.argv.slice(1); console.log(c.filter(x=>!o.length||o.includes(x.name)).map(x=>x.name).join(' '))" "$@")
for n in $names; do
  mkdir -p "$OUT/$n"
  script=$("$NODE" -e "console.log(require('$HERE/dialogs.json').find(x=>x.name==='$n').script)")
  cat > "$OUT/$n.hts" <<HTS
on boot
  set userLevel to 5
  hide message box
  do "create stack " & quote & ":HyperCard:Dlg" & quote
  hide menubar
  hide message box
  choose browse tool
  wait 2 seconds
  get rsrc("writetext", ":HyperCard:S1", "ok")
  $script
end boot
HTS
  NODONE=1 bash "$HERE/capture.sh" "$W" "$OUT/$n" --boot "$OUT/$n.hts" 1 | tail -1
  # the first and the final shot of the same dialog: either can catch GSport mid-redraw (dialogs.js takes the best)
  for k in 1 last; do
    powershell -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$HERE/../../iigs/resource-editor/test/png2rgb.ps1")" "$(cygpath -w "$OUT/$n/$k.png")" "$(cygpath -w "$OUT/$n/$k.rgb")" >/dev/null 2>&1 || rm -f "${OUT:?}/${n:?}/$k.rgb"
  done
done
