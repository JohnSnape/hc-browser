# HC Browser

A web made of HyperCard stacks. A site serves **`main.hc`** instead of `index.html`. The HC Browser downloads it and shows its cards exactly as HyperCard IIGS would: full-screen cards on the Apple IIGS Super Hi-Res screen, 16-color color sets, and no page scrolling.

There are clients for three machines:

| Machine | Client |
|---|---|
| **Apple IIGS** | HyperCard IIGS itself, running a *Browser stack* that fetches `.hc` files over Marinetti TCP/IP |
| **Windows / Mac** | A HyperTalk player that emulates the 640 × 200 Super Hi-Res screen and scales it to the window |

> **Status: early.** The file-format spec and the picture/sound converter exist. The browsers do not yet.

## What's here

| Path | What it is |
|---|---|
| [`MAIN-HC-SPEC.md`](MAIN-HC-SPEC.md) | The `main.hc` file format: display rules, resources, navigation, saving files, serving |
| [`tools/converter/`](tools/converter/index.html) | **HC Converter**: turns pictures into IIGS Super Hi-Res `.shr` files (with `.msk` transparency masks) and sounds into 26.32 kHz `.snd` files. Open `index.html` in any browser on Windows or a Mac. Nothing to install, nothing uploaded. |
| `lib/shr.js` | Super Hi-Res 640-mode encode/decode, shared with the future HC Browser |
| `lib/snd.js` | Sound conversion |

## Using the converter

1. Download or clone this repository.
2. Open `tools/converter/index.html` in Chrome, Edge, Firefox or Safari.
3. Drop a picture or a sound on the page, adjust the options, and download the result.
4. Paste the `colors:` and `#resource` lines it shows into your `.hc` stack.

## License

MIT. See [LICENSE](LICENSE).

HyperCard, HyperTalk, Apple IIGS and Macintosh are trademarks of Apple Inc. This project is not affiliated with or endorsed by Apple.
