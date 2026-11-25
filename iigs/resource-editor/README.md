# Rsrc.Editor: a resource editor that runs on the Apple IIGS

A HyperCard IIGS stack with **one card for each kind of resource**, so a IIGS owner can edit icons and the rest directly on the machine, in the same formats the [browser editors](../../tools/) use. An XFCN written in 65816 assembly, `rsrc`, gives HyperTalk the IIGS Resource Manager.

| Card | Edits | Verified |
|---|---|---|
| **Home** (the first card) | choose the file whose resource fork you edit (folder list, a pathname, or this stack); how many icons, cursors, sounds and versions it has | ✅ |
| **Icons** | `$8001` rIcon: new, open, paint (four values or clear), color or black-and-white, save, save as, name, delete; grid plus a `DrawIcon` preview | ✅ |
| **Cursors** | `$8027` rCursor: paint values, see-through and invert pixels, move the hot spot, new (8 to 32 wide), save, name, delete, try (`set cursor`) | ✅ |
| **Sounds** | `$8024` rSoundSample: waveform, sample rate, relative pitch ("Pitch for Note" works it out), channel, import a sound from another file, name, delete, play | ✅ |
| **Version** | `$8029` rVersion: major, minor, bug, stage, release, region, name and info line; save, save as, new, delete | ✅ |
| **Fonts** | `$C8` font files (`System:Fonts`, or any folder): a glyph's pixels within its image width, and its advance width | ✅ |
| **Patterns** | another stack's 16 paint patterns (STAK +`$200`), with the STAK checksum fixed | ✅ |

**Fonts as resources** are not offered: no IIGS font resource type is documented in the notes we have (Technical Note #76 lists none), HyperCard IIGS keeps no fonts in stacks, and none turned up in any fork we read. The Fonts card edits the `$C8` files HyperCard actually uses.

The Fonts card does not change a glyph's image width (that means moving every later glyph in the strike); use the browser [HC Font Editor](../../tools/font-editor/) for that. The Patterns card edits a stack other than this one: HyperCard keeps an open stack's header in memory and would write its own copy back.

## How it is put together

| Path | What it is |
|---|---|
| `xfcn/RSRC.S`, `xfcn/RSRC.LNK.S` | The XFCN, Merlin32 source (`Merlin32 -V . RSRC.LNK.S`). One OMF segment, entry at its first byte. `xfcn/RSRC` is the built file. |
| `stack/build.hts` | HyperTalk that **builds the stack on the IIGS**: `create stack`, cards, fields, buttons and their scripts. |
| `stack/stack.hts`, `stack/home.hts`, `stack/icons.hts`, `cursors.hts`, `sounds.hts`, `version.hts`, `fonts.hts`, `patterns.hts` | The stack script and the card scripts (plain text, LF line ends here, CR on the IIGS). |
| `tools/forktool.js` | Adds a resource to a fork (sorted index, rResName names), lists and extracts; rewrites Home's `startUp` for headless runs. |
| `tools/make-disk.sh` | Puts the XFCN into the built stack's resource fork, and makes the 800K ProDOS disk. |
| `test/rig.sh` | The headless HyperCard IIGS rig (GSport, no keystrokes or clicks: passive window captures and files on disk). |
| `test/run-icons.sh`, `test/run-cards.sh` | End-to-end tests: build on the IIGS, install, drive the cards, verify. |

The stack is built by script rather than written as bytes because the HyperCard IIGS stack format is only partly known ([formats doc](../../docs/HYPERCARD-IIGS-FORMATS.md), §4). HyperCard makes its own stack, so it is a valid one.

**Why the grids are drawn by the XFCN.** An icon can be 100 screen pixels wide; a button per pixel would be thousands of buttons, and painting by script with HyperCard's paint tools is slow and changes the card picture. Instead the card's script keeps the pixels as text (one character per pixel: `0`–`3`, `.` clear, `x` invert), and `rsrc("draw", …)` paints the grid straight into the card window with QuickDraw II in a few tenths of a second. Clicks come back to the card script as `mouseDown`, which works out the cell and repaints just that cell. The icon preview is drawn by QuickDraw II Auxiliary's own `DrawIcon`, so it shows exactly what HyperCard shows.

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

## Verified

Both tests run headlessly in GSport 0.31 (ROM 03, System 6.0.4, HyperCard IIGS 1.1). Each builds the stack on the IIGS from `stack/*.hts`, puts the XFCN into the stack's own fork, adds test files made by the project's libraries, drives the cards as a user would (clicks go through the same `editAt h,v` the mouse uses), and checks the files with `lib/*.js` and the screen with captures. Home's copy of the XFCN answers `version` with `RSRC H.0`; the editor's own scripts get `RSRC 1.0`, so the editor uses the copy in its own fork.

`test/run-icons.sh`: icon 200 picked from the list, painted, saved as 210 "Edited", painted again and saved over; a new 3 × 2 black-and-white icon saved as 211 "Tiny"; 212 saved and deleted. **Icon 210: 160 of 160 pixels as edited and byte for byte equal to `SHR.iconFromPixels`**; 211 too; 200 untouched; names right, 212 gone with its name, index sorted. On screen, the **`DrawIcon` preview matched `lib/shr.js` on 5,593 of 5,593 pixels** and the editing grid showed the predicted colors on 11,016 of 11,016.

`test/run-cards.sh`:

- **Cursors:** four pixels and the hot spot edited and saved as 310, a new 8 × 4 cursor as 311: both **byte for byte what `lib/cursor.js` writes** for the same pixels.
- **Version:** major, bug, stage, region and name changed: **byte for byte `lib/version.js`** (reads 2.2.7a4); Save As gives the same record.
- **Sounds:** rate and pitch changed ("Pitch for Note" gave −785 for a 22,050 Hz sound at middle C, as TN #3's formula does): byte for byte the original with that header; a sound imported from another file is byte for byte the original, with its name.
- **Fonts:** three pixels of glyph A and its advance width changed: every other glyph unchanged, and the file round-trips through `lib/font.js` byte for byte.
- **Patterns:** four pixels of pattern 4 changed in a new stack: `lib/pattern.js` reads them, the other 15 are unchanged, the STAK checksum sums to 0, HyperCard opens the stack, and **paints with the edited pattern exactly as `lib/pattern.js` predicts on 10,976 of 10,976 pixels**.

Not covered headlessly: real mouse clicks and drags (no input is sent to the emulator; the test calls the handlers the mouse calls), the dialogs (`ask`, `answer`) a user sees for New, Save As, Name, Delete and Import, playing a sound, and Try for cursors.

## Installing it on a real IIGS

You need HyperCard IIGS 1.1 and System 6 (the XFCN uses System 6 calls). The disk image `RsrcEditor.po` (800K ProDOS) holds `Rsrc.Editor`, with the XFCN inside it, and a ReadMe. To make the image yourself, run `test/run-cards.sh WORK` (it builds the stack on an emulated IIGS from your own copies of HyperCard IIGS and System 6.0.4) and then `tools/make-disk.sh image WORK/built.hdv RsrcEditor.po`. The image holds only this project's files: a stack HyperCard built from our scripts (with HyperCard's default color set and pattern table in its header, as every new stack has), our XFCN and the ReadMe.

With [CiderPress II](https://ciderpress2.com/), copy the stack, **with its resource fork**, from the image to the disk or image you boot from:

```
cp2 extract --preserve=naps RsrcEditor.po Rsrc.Editor
cp2 add --from-naps yourdisk.po "Rsrc.Editor#550001" "Rsrc.Editor#550001r"
```

Or write `RsrcEditor.po` to a real 3.5" disk (or put it on a CFFA3000, BOOTI or similar) and copy the stack with the Finder. Keep the resource fork: the XFCN lives there, and without it the cards cannot read or write anything.

Open the stack in HyperCard. On the Home card, click a folder to open it and a file to choose it (or **Pathname…**, or **This Stack**), then go to the card for the kind of resource. On the Icons and Cursors cards, pick a resource in the list, choose a value (or Clear, Invert, Hot), and click or drag in the grid; **Save** writes it back. Editing changes the chosen file at once, so work on a copy of anything precious.

To put the XFCN into a stack of your own, copy resource `$801F` ID 1 and its rResName entry ("rsrc") from `Rsrc.Editor`, for example with `tools/forktool.js add` on the host.
