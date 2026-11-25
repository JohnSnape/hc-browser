# Rsrc.Editor: a resource editor that runs on the Apple IIGS

A HyperCard IIGS stack with **one card for each kind of resource**, so a IIGS owner can edit icons and the rest directly on the machine, in the same formats the [browser editors](../../tools/) use. An XFCN written in 65816 assembly, `rsrc`, gives HyperTalk the IIGS Resource Manager.

| Card | Edits | Status |
|---|---|---|
| **Index** | choose the file whose resource fork you edit (folder list, a pathname, or this stack), see how many resources of each kind it has | ✅ built and checked on the IIGS (emulated) |
| **Icons** | `$8001` rIcon: new, open, paint (four values or clear), color or black-and-white, save, save as, name, delete; live grid and a `DrawIcon` preview | ✅ verified end to end (below) |
| Cursors | `$8027` rCursor | planned |
| Sounds | `$8024` rSoundSample | planned |
| Version | `$8029` rVersion | planned |
| Fonts | `$C8` font files in `System:Fonts` | planned |
| Patterns | the stack's 16 paint patterns (STAK +`$200`, with the STAK checksum) | planned |

## How it is put together

| Path | What it is |
|---|---|
| `xfcn/RSRC.S`, `xfcn/RSRC.LNK.S` | The XFCN, Merlin32 source (`Merlin32 -V . RSRC.LNK.S`). One OMF segment, entry at its first byte. `xfcn/RSRC` is the built file. |
| `stack/build.hts` | HyperTalk that **builds the stack on the IIGS**: `create stack`, cards, fields, buttons and their scripts. |
| `stack/stack.hts`, `stack/index.hts`, `stack/icons.hts` | The stack script and the card scripts (plain text, LF line ends here, CR on the IIGS). |
| `tools/forktool.js` | Adds a resource to a fork (sorted index, rResName names), lists and extracts; rewrites Home's `startUp` for headless runs. |
| `tools/make-disk.sh` | Puts the XFCN into the built stack's resource fork, and makes the 800K ProDOS disk. |
| `test/rig.sh` | The headless HyperCard IIGS rig (GSport, no keystrokes or clicks: passive window captures and files on disk). |
| `test/run-icons.sh` | Stage 1, end to end: build, install, test the Icons card, verify. |

The stack is built by script rather than written as bytes because the HyperCard IIGS stack format is only partly known ([formats doc](../../docs/HYPERCARD-IIGS-FORMATS.md), §4). HyperCard makes its own stack, so it is a valid one.

**Why the grids are drawn by the XFCN.** An icon can be 100 screen pixels wide; a button per pixel would be thousands of buttons, and painting by script with HyperCard's paint tools is slow and changes the card picture. Instead the card's script keeps the pixels as text (one character per screen pixel: `0`–`3`, `.` clear), and `rsrc("draw", …)` paints the grid straight into the card window with QuickDraw II in a few tenths of a second. Clicks come back to the card script as `mouseDown`, which works out the cell and repaints just that cell. The preview is drawn by QuickDraw II Auxiliary's own `DrawIcon`, so it shows exactly what HyperCard shows.

**The XFCN.** `rsrc(op, …)` answers text; anything starting with `ERR ` is an error. Binary data travels as hex. Resource ops take a FILE argument: a full pathname (`:Vol:Folder:File`), or empty for the current stack.

| Op | What it does |
|---|---|
| `list,FILE,TYPE` | `id,size,name` lines |
| `get,FILE,TYPE,ID` / `put,FILE,TYPE,ID,HEX[,ATTR]` / `delete,FILE,TYPE,ID` | read, add or replace (keeping its attributes), remove (with its name) |
| `name,FILE,TYPE,ID[,NEW]` | read or set the name in rResName |
| `create,FILE` | give a file a resource fork |
| `readfile`, `writefile`, `readtext`, `writetext`, `dir` | data forks and folders |
| `patchstak,PATH,OFFSET,HEX` | change bytes in a stack's STAK header and fix its checksum |
| `peek`, `poke`, `zeros`, `hex2text`, `text2hex` | hex helpers |
| `bits`, `setbits`, `merge`, `split` | pixel grids packed 1, 2, 4 or 8 bits a pixel; image + mask to a grid and back (icon and cursor rules) |
| `draw`, `drawicon`, `wave` | draw a grid, an icon record (`DrawIcon`) or a waveform in the card window |

## Verified (stage 1: XFCN, Index and Icons)

`test/run-icons.sh` does it all headlessly in GSport 0.31 (ROM 03, System 6.0.4, HyperCard IIGS 1.1):

1. Builds the stack on the IIGS from `stack/*.hts`.
2. Puts the XFCN into the stack's own fork. (Home's copy answers `version` with `RSRC H.0`; the test sees `RSRC 1.0`, so the editor used its own.)
3. Adds `Test.Icons`, a file whose two icons were made by `lib/shr.js`.
4. Drives the Icons card as a user would: picks icon 200 from the list, paints cells through the same `editAt h,v` that the mouse uses, saves as 210 "Edited", paints again and saves over it, draws a new 3 × 2 black-and-white icon and saves it as 211 "Tiny", saves 212 and deletes it.
5. `test/icons-verify.js` reads the file back with `lib/rsrc.js` and `lib/shr.js`, and compares a screen capture.

Results: icon IDs and names exactly as expected, index sorted, 212 gone with its name, icon 200 untouched; **icon 210 = 160 of 160 pixels as edited and byte for byte equal to `SHR.iconFromPixels`** of the same pixels; icon 211 the same. On screen, the IIGS **preview matched `lib/shr.js`'s drawing on 5,593 of 5,593 pixels**, and the editing grid showed the predicted colors on **11,016 of 11,016 pixels**.

Not covered headlessly: real mouse clicks and drags (no input is sent to the emulator; the test calls the handlers the mouse calls), and the dialogs (`ask`, `answer`) a user sees for New, Save As, Name and Delete.

## Installing it on a real IIGS

You need HyperCard IIGS 1.1 and System 6 (the XFCN uses System 6 calls). The disk image `RsrcEditor.po` (800K ProDOS) holds `Rsrc.Editor`, with the XFCN inside it, and a ReadMe. To build the image yourself, run `test/run-icons.sh WORK` and then `tools/make-disk.sh image WORK/built.hdv RsrcEditor.po`.

With [CiderPress II](https://ciderpress2.com/), copy the stack, **with its resource fork**, from the image to the disk or image you boot from:

```
cp2 extract --preserve=naps RsrcEditor.po Rsrc.Editor
cp2 add --from-naps yourdisk.po "Rsrc.Editor#550001" "Rsrc.Editor#550001r"
```

Or write `RsrcEditor.po` to a real 3.5" disk (or put it on a CFFA3000, BOOTI or similar) and copy the stack with the Finder. Keep the resource fork: the XFCN lives there, and without it the cards cannot read or write anything.

Open the stack in HyperCard. On the Index card, click a folder to open it and a file to choose it (or **Pathname…**, or **This Stack**), then go to the card for the kind of resource. On the Icons card, pick an icon in the list, choose a value or Clear, and click or drag in the grid; **Save** writes it back. Editing changes the chosen file's resource fork at once, so work on a copy of anything precious.

To put the XFCN into a stack of your own, copy resource `$801F` ID 1 and its rResName entry ("rsrc") from `Rsrc.Editor`, for example with `tools/forktool.js add` on the host.
