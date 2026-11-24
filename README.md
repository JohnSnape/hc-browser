# HC Browser

A web made of HyperCard stacks. A site serves **`main.hc`** instead of `index.html`. The HC Browser downloads it and shows its cards exactly as HyperCard IIGS would: full-screen cards on the Apple IIGS Super Hi-Res screen, 16-color color sets, and no page scrolling.

There are clients for three machines:

| Machine | Client |
|---|---|
| **Apple IIGS** | HyperCard IIGS itself, running a *Browser stack* that fetches `.hc` files over Marinetti TCP/IP |
| **Windows / Mac** | A HyperTalk player that emulates the 640 × 200 Super Hi-Res screen and scales it to the window |

> **Status: design stage.** Only the file-format spec exists so far.

## Documents

- [`MAIN-HC-SPEC.md`](MAIN-HC-SPEC.md): the `main.hc` file format, display rules, resources, navigation, saving files, and serving.

## License

MIT. See [LICENSE](LICENSE).

HyperCard, HyperTalk, Apple IIGS and Macintosh are trademarks of Apple Inc. This project is not affiliated with or endorsed by Apple.
