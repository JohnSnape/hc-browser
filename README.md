# HC Browser

A web made of HyperCard stacks. A site serves **`main.hc`** instead of `index.html`. The HC Browser downloads it and shows its cards exactly as HyperCard IIGS would: full-screen cards on the Apple IIGS Super Hi-Res screen, 16-color color sets, and no page scrolling.

There are clients for three machines:

| Machine | Client |
|---|---|
| **Apple IIGS** | HyperCard IIGS itself, running a *Browser stack* that fetches `.hc` files over Marinetti TCP/IP |
| **Windows / Mac** | A HyperTalk player that emulates the 640 × 200 Super Hi-Res screen and scales it to the window |

> **Status: early.** The file-format spec, the picture/sound converter, editors for icons, fonts, cursors, patterns, sounds and version resources, a **stack importer** and a **first Windows/Mac browser** exist. The browser draws cards exactly as HyperCard IIGS does: on five reference cards it matches the real screen pixel for pixel, except under the mouse pointer. It does not run HyperTalk yet.

> **New documentation:** [**HyperCard IIGS and Apple IIGS formats: what we measured**](docs/HYPERCARD-IIGS-FORMATS.md). This covers how the Menu Manager draws menus, where the system font lives, the HyperCard IIGS stack format (blocks, cards, buttons, fields, compressed pictures), what `DrawIcon` really does in 640 mode, QuickDraw's actual default palette, HyperCard's coordinate units, and the resource-fork rules HyperCard depends on. Apple never documented most of it. Each fact is marked as verified in an emulator, observed, or still open.

## What's here

| Path | What it is |
|---|---|
| [`MAIN-HC-SPEC.md`](MAIN-HC-SPEC.md) | The `main.hc` file format: display rules, resources, navigation, saving files, serving |
| [`tools/converter/`](tools/converter/index.html) | **HC Converter**: turns pictures into IIGS Super Hi-Res `.shr` files (with `.msk` transparency masks) and sounds into 26.32 kHz `.snd` files. Open `index.html` in any browser on Windows or a Mac. Nothing to install, nothing uploaded. |
| [`tools/icon-editor/`](tools/icon-editor/index.html) | **HC Icon Editor**: draw icons in the IIGS's own icon format, or import them from Paint/PNG, and save `.ico` files. It also opens a HyperCard IIGS stack's resource fork, so you can edit, add, name and delete the stack's icons. **Save image** gives PNGs at drawn size and double size. Same deal: open `index.html` in any browser. |
| [`tools/font-editor/`](tools/font-editor/index.html) | **HC Font Editor**: make and edit bitmap fonts in the IIGS's own font format (QuickDraw II, file type `$C8`). It has a character picker, a pixel editor with pen, advance and baseline guides, a sample drawn as the IIGS draws it, and "make a font from one on this computer" for your own lookalikes. It also imports Macintosh bitmap fonts (FONT/NFNT from suitcases, System files, MacBinary, AppleSingle/AppleDouble or raw resource forks) exactly, pixel for pixel. **Save glyph grid** gives a PNG of every character with its code, at 1× and 2×. |
| [`tools/cursor-editor/`](tools/cursor-editor/index.html) | **HC Cursor Editor**: mouse cursors in the IIGS's own cursor format. Paint pixels in color, as invert, or see-through; set the hot spot; preview over different backgrounds. It also edits the cursors (`$8027`) in a stack's resource fork. Save image at 1× and 2×. |
| [`tools/pattern-editor/`](tools/pattern-editor/index.html) | **HC Pattern Editor**: the 16 paint patterns of a HyperCard IIGS stack, in color. It opens a stack, edits its patterns 16 × 8 pixels at a time with a tiled preview, and saves the stack (fixing the header checksum HyperCard checks). Save image at 1× and 2×. |
| `lib/shr.js` | Super Hi-Res 640-mode encode/decode and icon records, shared with the future HC Browser |
| [`tools/sound-editor/`](tools/sound-editor/index.html) | **HC Sound Editor**: sampled sounds in the IIGS's own format. Import any audio, trim, normalize, fade and set the gain on a waveform, and give the sound its pitch so `play "name" "c e g"` plays the right notes (preview included). It also edits the sounds (`$8024`) in a stack's or HyperCard's resource fork. |
| [`tools/version-editor/`](tools/version-editor/index.html) | **HC Version Editor**: the version resource (`$8029`) a IIGS program or stack carries: version number, stage, country, name and copyright line, with a live preview. |
| `tools/export-art/export.js` | Exports the artwork on IIGS disk images: icons, cursors, sounds, paint patterns, menu bars, menus and menu items (drawn as the Menu Manager draws them, plus text listings), control lists, dialog windows and alerts (drawn as the Control and Window Managers draw them) and fonts, at double size, with an index page and a CSV (`node tools/export-art/export.js <out> [Rom.03::rom] <disk images…>`). Given a ROM 03 image it also exports the built-in system font, Shaston 8. Keep its output out of the repo: it is the disks' own artwork. |
| `tools/export-art/archive.js` | Runs the same export over CD images and everything inside them (partitions, disk images, ShrinkIt and .SEA archives, ZIPs), recursively, de-duplicating identical resources across all of them (`node tools/export-art/archive.js <out> <Rom.03> <images…>`). Local reference only: the output is other people's work. |
| `lib/version.js` | IIGS version resources |
| `lib/dialog.js` | IIGS alert strings and window templates: read them, and draw alerts and window frames as the Window Manager does |
| `lib/control.js` | IIGS control templates and lists: read them, and draw buttons, check boxes, radio buttons, pop-ups, LineEdits and static text as the Control Manager does |
| `lib/menu.js` | IIGS menu bars, menus and items: read them, and draw them pixel for pixel as System 6.0.4's Menu Manager does |
| `lib/cursor.js`, `lib/pattern.js`, `lib/sound.js` | IIGS cursor records; HyperCard IIGS stack patterns and the STAK checksum; IIGS sampled sounds and relative pitch |
| `lib/font.js` | Read, write and draw IIGS fonts; Apple's fonts round-trip byte for byte |
| `lib/macfont.js` | Convert Macintosh bitmap fonts to IIGS fonts (Mac resource forks and their Windows-side containers) |
| `lib/rsrc.js` | Read and write IIGS resource forks (keeps the index sorted, as HyperCard requires) |
| `lib/snd.js` | Sound conversion |
| `tests/iigs/` | Emulator tests that measured the icon format, the palette, HyperCard's rules, the ROM system font and the Menu Manager's drawing, plus a resource-fork command-line tool |
| [`iigs/resource-editor/`](iigs/resource-editor/README.md) | **Rsrc.Editor**, a resource editor that runs on the IIGS itself: a HyperCard IIGS stack with a card per kind of resource, built on the IIGS by script, and `rsrc`, an XFCN in 65816 assembly that gives HyperTalk the Resource Manager. Cards for icons, cursors, sounds, version resources, fonts and a stack's paint patterns, each verified in emulation. |
| [`docs/HYPERCARD-IIGS-FORMATS.md`](docs/HYPERCARD-IIGS-FORMATS.md) | The reverse-engineered formats, with how each fact was checked |
| [`browser/`](browser/index.html) | **HC Browser** for Windows and Mac: open a site folder, or a `main.hc` address, and page through its cards on an emulated 640 × 200 Super Hi-Res screen (true 4:3 aspect or sharp whole-number scaling). Text needs IIGS font files: load them with **Fonts…** or `?fonts=`. HyperTalk is not run yet. |
| `tools/stack-import/import.js` | **Stack importer**: turns a HyperCard IIGS stack (data fork + resource fork, as CiderPress II extracts them) into a site folder: `main.hc` with every background, card, button, field, script and field text, plus `pict/*.shr` + `.msk` pictures and `icons/*.ico`. `--icons <fork>` also copies icons the stack borrows from Home or HyperCard. Reads every card of the stacks tried, from 1 to 99 cards. |
| `tools/stack-import/hcgs-stack.js` | Reads HyperCard IIGS stacks: blocks, card order, parts, field text, scripts, compressed pictures (`explore.js` dumps blocks) |
| `lib/hcfile.js`, `lib/card.js` | Read `.hc` files; draw a card the way HyperCard IIGS 1.1 does (pictures, buttons in every style, icons, fields, text, lines, scroll bars, part colors) |
| `tests/hcgs-render/` | Headless HyperCard captures (`capture.sh`), a script-built test stack (`probe.hts`), and the pixel comparison (`render.js`, `compare.js`) that checks `lib/card.js` |

## Using the converter

1. Download or clone this repository.
2. Open `tools/converter/index.html` in Chrome, Edge, Firefox or Safari.
3. Drop a picture or a sound on the page, adjust the options, and download the result.
4. Paste the `colors:` and `#resource` lines it shows into your `.hc` stack.

## Using the icon editor

1. Open `tools/icon-editor/index.html` in any browser.
2. Draw with the four values. Each value shows two colors, because in 640 mode a pixel's column picks its palette group. Or use **Import image…** for a drawing from Paint: a solid background color becomes see-through, and each Paint pixel becomes two IIGS pixels.
3. **Save .ico** for an HC Browser site.
4. For a real HyperCard IIGS stack, use [CiderPress II](https://ciderpress2.com/) to copy the stack out of its disk image with its resource fork:

   ```
   cp2 extract --preserve=naps disk.po "Stack"
   ```

   Open `Stack#550001r` in the editor, add or edit icons, and download the fork. Put it back with:

   ```
   cp2 rm disk.po "Stack"
   cp2 add --from-naps disk.po "Stack#550001" "Stack#550001r"
   ```

   In HyperTalk, `set icon of button "Name" to 30001` uses the icon.

## Editing resources on the IIGS itself

[`iigs/resource-editor`](iigs/resource-editor/README.md) is a HyperCard IIGS stack, **Rsrc.Editor**, for editing resources on a real IIGS (HyperCard IIGS 1.1, System 6). Copy it to your IIGS disk **with its resource fork**, where its XFCN lives:

```
cp2 extract --preserve=naps RsrcEditor.po Rsrc.Editor
cp2 add --from-naps yourdisk.po "Rsrc.Editor#550001" "Rsrc.Editor#550001r"
```

Open it in HyperCard, choose a file on the Home card, and edit its icons, cursors, sounds, version, fonts or paint patterns on their cards. Its README says how the stack is built and tested, and how to make the disk image.

## License

MIT. See [LICENSE](LICENSE).

HyperCard, HyperTalk, Apple IIGS and Macintosh are trademarks of Apple Inc. This project is not affiliated with or endorsed by Apple.
