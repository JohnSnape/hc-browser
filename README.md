# HC Browser

A web made of HyperCard stacks. A site serves **`main.hc`** instead of `index.html`. The HC Browser downloads it and shows its cards exactly as HyperCard IIGS would: full-screen cards on the Apple IIGS Super Hi-Res screen, 16-color color sets, and no page scrolling.

There are clients for three machines:

| Machine | Client |
|---|---|
| **Apple IIGS** | HyperCard IIGS itself, running a *Browser stack* that fetches `.hc` files over Marinetti TCP/IP |
| **Windows / Mac** | A HyperTalk player that emulates the 640 × 200 Super Hi-Res screen and scales it to the window |

> **Status: early.** The file-format spec, the picture/sound converter and the icon editor exist. The browsers do not yet.

## What's here

| Path | What it is |
|---|---|
| [`MAIN-HC-SPEC.md`](MAIN-HC-SPEC.md) | The `main.hc` file format: display rules, resources, navigation, saving files, serving |
| [`tools/converter/`](tools/converter/index.html) | **HC Converter**: turns pictures into IIGS Super Hi-Res `.shr` files (with `.msk` transparency masks) and sounds into 26.32 kHz `.snd` files. Open `index.html` in any browser on Windows or a Mac. Nothing to install, nothing uploaded. |
| [`tools/icon-editor/`](tools/icon-editor/index.html) | **HC Icon Editor**: draw icons in the IIGS's own icon format, or import them from Paint/PNG, and save `.ico` files. It also opens a HyperCard IIGS stack's resource fork, so you can edit, add, name and delete the stack's icons. Same deal: open `index.html` in any browser. |
| `lib/shr.js` | Super Hi-Res 640-mode encode/decode and icon records, shared with the future HC Browser |
| `lib/rsrc.js` | Read and write IIGS resource forks (keeps the index sorted, as HyperCard requires) |
| `lib/snd.js` | Sound conversion |
| `tests/iigs/` | Emulator tests that measured the icon format, the palette and HyperCard's rules, plus a resource-fork command-line tool |

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
