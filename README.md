# HC Browser

A web made of HyperCard stacks. A site serves **`main.hc`** instead of `index.html`. The HC Browser downloads it and shows its cards exactly as HyperCard IIGS would: full-screen cards on the Apple IIGS Super Hi-Res screen, 16-color color sets, and no page scrolling.

There are clients for three machines:

| Machine | Client |
|---|---|
| **Apple IIGS** | HyperCard IIGS itself, running a *Browser stack* that fetches `.hc` files over Marinetti TCP/IP |
| **Windows / Mac** | A HyperTalk player that emulates the 640 × 200 Super Hi-Res screen and scales it to the window |

> **Status: early.** The file-format spec, the picture/sound converter and editors for icons, fonts, cursors, patterns, sounds and version resources exist. The browsers do not yet.

> **New documentation:** [**HyperCard IIGS and Apple IIGS formats: what we measured**](docs/HYPERCARD-IIGS-FORMATS.md). This covers how the Menu Manager draws menus, where the system font lives, the HyperCard IIGS stack format (blocks, cards, buttons, fields, compressed pictures), what `DrawIcon` really does in 640 mode, QuickDraw's actual default palette, HyperCard's coordinate units, and the resource-fork rules HyperCard depends on. Apple never documented most of it. Each fact is marked as verified in an emulator, observed, or still open.

## What's here

| Path | What it is |
|---|---|
| [`MAIN-HC-SPEC.md`](MAIN-HC-SPEC.md) | The `main.hc` file format: display rules, resources, navigation, saving files, serving |
| [`tools/converter/`](tools/converter/index.html) | **HC Converter**: turns pictures into IIGS Super Hi-Res `.shr` files (with `.msk` transparency masks) and sounds into 26.32 kHz `.snd` files. Open `index.html` in any browser on Windows or a Mac. Nothing to install, nothing uploaded. |
| [`tools/icon-editor/`](tools/icon-editor/index.html) | **HC Icon Editor**: draw icons in the IIGS's own icon format, or import them from Paint/PNG, and save `.ico` files. It also opens a HyperCard IIGS stack's resource fork, so you can edit, add, name and delete the stack's icons. **Save image** gives PNGs at drawn size and double size. Same deal: open `index.html` in any browser. |
| [`tools/font-editor/`](tools/font-editor/index.html) | **HC Font Editor**: make and edit bitmap fonts in the IIGS's own font format (QuickDraw II, file type `$C8`). It has a character picker, a pixel editor with pen, advance and baseline guides, a sample drawn as the IIGS draws it, and "make a font from one on this computer" for your own lookalikes. **Save glyph grid** gives a PNG of every character with its code, at 1× and 2×. |
| [`tools/cursor-editor/`](tools/cursor-editor/index.html) | **HC Cursor Editor**: mouse cursors in the IIGS's own cursor format. Paint pixels in color, as invert, or see-through; set the hot spot; preview over different backgrounds. It also edits the cursors (`$8027`) in a stack's resource fork. Save image at 1× and 2×. |
| [`tools/pattern-editor/`](tools/pattern-editor/index.html) | **HC Pattern Editor**: the 16 paint patterns of a HyperCard IIGS stack, in color. It opens a stack, edits its patterns 16 × 8 pixels at a time with a tiled preview, and saves the stack (fixing the header checksum HyperCard checks). Save image at 1× and 2×. |
| `lib/shr.js` | Super Hi-Res 640-mode encode/decode and icon records, shared with the future HC Browser |
| [`tools/sound-editor/`](tools/sound-editor/index.html) | **HC Sound Editor**: sampled sounds in the IIGS's own format. Import any audio, trim, normalize, fade and set the gain on a waveform, and give the sound its pitch so `play "name" "c e g"` plays the right notes (preview included). It also edits the sounds (`$8024`) in a stack's or HyperCard's resource fork. |
| [`tools/version-editor/`](tools/version-editor/index.html) | **HC Version Editor**: the version resource (`$8029`) a IIGS program or stack carries: version number, stage, country, name and copyright line, with a live preview. |
| `tools/export-art/export.js` | Exports the artwork on IIGS disk images: icons, cursors, sounds, paint patterns, menu bars and menus (drawn as the Menu Manager draws them, plus text listings) and fonts, at double size, with an index page and a CSV (`node tools/export-art/export.js <out> [Rom.03::rom] <disk images…>`). Given a ROM 03 image it also exports the built-in system font, Shaston 8. Keep its output out of the repo: it is the disks' own artwork. |
| `lib/version.js` | IIGS version resources |
| `lib/menu.js` | IIGS menu bars, menus and items: read them, and draw them pixel for pixel as System 6.0.4's Menu Manager does |
| `lib/cursor.js`, `lib/pattern.js`, `lib/sound.js` | IIGS cursor records; HyperCard IIGS stack patterns and the STAK checksum; IIGS sampled sounds and relative pitch |
| `lib/font.js` | Read, write and draw IIGS fonts; Apple's fonts round-trip byte for byte |
| `lib/rsrc.js` | Read and write IIGS resource forks (keeps the index sorted, as HyperCard requires) |
| `lib/snd.js` | Sound conversion |
| `tests/iigs/` | Emulator tests that measured the icon format, the palette, HyperCard's rules, the ROM system font and the Menu Manager's drawing, plus a resource-fork command-line tool |
| [`docs/HYPERCARD-IIGS-FORMATS.md`](docs/HYPERCARD-IIGS-FORMATS.md) | The reverse-engineered formats, with how each fact was checked |
| `tools/stack-import/` | Work in progress: reads HyperCard IIGS stacks (`hcgs-stack.js`) and lists or dumps their blocks (`explore.js`) |

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

## License

MIT. See [LICENSE](LICENSE).

HyperCard, HyperTalk, Apple IIGS and Macintosh are trademarks of Apple Inc. This project is not affiliated with or endorsed by Apple.
