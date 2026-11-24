# HyperCard IIGS and Apple IIGS formats: what we measured

Apple never published the file formats of **HyperCard IIGS** (1990–1992). The Macintosh HyperCard stack format has been reverse-engineered by others, most fully in Rebecca Bettencourt's [*HyperCard stack file format*](https://www.kreativekorp.com/swdownload/wildfire/HC%20FILE%20FORMAT%202010.TXT). As far as we know, the IIGS version has not been documented anywhere until now.

This page records what this project worked out, **and how each fact was checked**. Everything here was measured on real Apple software running in an emulator (GSport 0.31, ROM 03, System 6.0.4, HyperCard IIGS 1.1). Each fact is marked:

- ✅ **Verified:** checked byte for byte or pixel for pixel against the real thing.
- 🔶 **Observed:** seen consistently in Apple's own files, not yet tested by changing it.
- ❓ **Open:** not yet known.

The test programs and tools are in [`tests/iigs/`](../tests/iigs) and [`tools/stack-import/`](../tools/stack-import). Apple's software, ROMs and stacks are never stored in this repository.

---

## 1. The Super Hi-Res screen in 640 mode

| Fact | Status | How it was checked |
|---|---|---|
| 4 pixels per byte, 2 bits each, leftmost pixel in bits 7–6. Pixel *n* of a byte uses palette entries $8–$B, $C–$F, $0–$3, $4–$7 for *n* = 0, 1, 2, 3. | ✅ | *Hardware Reference* Table 4-19; encoder round-trip on emulator screen dumps |
| **QuickDraw II's real default 640-mode palette is `000 F00 0F0 FFF / 000 00F FF0 FFF`** (black, red, green, white / black, blue, yellow, white), repeated. The *Toolbox Reference* vol. 2, Table 16-5, prints a different order and values (`000 00F FF0 FFF / 000 D00 0E0 FFF`). The machine wins. | ✅ | `tests/iigs/drawicon`: a program read the palette QuickDraw set up |
| HyperCard IIGS's **"System" color set is this same palette**. It is stored in the stack header (§4.2). | 🔶 | Home stack's STAK block |

## 2. Icons: QuickDraw II Auxiliary `DrawIcon`

The record layout is in *Toolbox Reference* vol. 2, Fig. 17-1: `iconType` (bit 15 = color), `iconSize`, `iconHeight`, `iconWidth`, then the image, then the mask. Each row is `1 + (iconWidth − 1) / 2` bytes. What the book does not say:

| Fact | Status | How it was checked |
|---|---|---|
| In 640 mode, **the image bytes are screen bytes**: each 4-bit "icon pixel" is two 2-bit screen pixels. An icon `iconWidth` wide covers `2 × iconWidth` screen pixels. No colors are remapped. | ✅ | Test icons drawn by `DrawIcon`, screen saved to disk and decoded |
| The mask works per **screen** pixel (`11` = opaque, `00` = see-through). | ✅ | Same, with checkerboard masks |
| Color (`$8000`) and black-and-white (`$0000`) icons draw identically in display mode 0. "Selected" mode turns black into white and every other color into black. | ✅ | Same |
| `DrawIcon` copies pixel **values** at any x, so an icon shows its intended colors only at an even x. At an odd x the palette groups swap. | ✅ | Same icon drawn at x = 100…103 |
| HyperCard IIGS icons have **no standard size**. Home's 15 icons run from 24 × 21 to 54 × 26 icon pixels, and HyperCard's own 33 from 10 × 11 up. Apple's are black-and-white records. | 🔶 | Resource forks of Home and HyperCard IIGS |
| Converter-made icons display pixel for pixel in HyperCard, both swapped into existing buttons and in new buttons made by script. HyperCard clips an icon to its button rectangle and centers it in HyperCard units (rounding down). | ✅ | `tests/iigs/find-icons.js` on emulator captures |

## 3. IIGS resource forks (as HyperCard needs them)

Header: `rFileVersion`(4) `rFileToMap`(4) `rFileMapSize`(4) memo(128). Map, little-endian, at the measured offsets:

| Offset | Field |
|---|---|
| +0 | mapNext (4) |
| +4 | mapFlag (2) |
| +6 | mapOffset (4) |
| +10 | mapSize (4) |
| **+14** | **mapToIndex** (2) |
| +16 | mapFileNum (2) |
| +18 | mapID (2) |
| +20 | mapIndexSize (4) |
| **+24** | **mapIndexUsed** (4) |
| +28 | mapFreeListSize (2) |
| +30 | mapFreeListUsed (2) |
| +32 | free list: offset(4) size(4) each; the last entry is an open-ended block starting at end of file |

Index entries are 20 bytes: type(2) ID(4) offset(4) attr(2) size(4) handle(4).

| Fact | Status | How it was checked |
|---|---|---|
| **The index must stay sorted by type, then ID.** An icon entry appended after the `$8014` entry was never found. Inserted in order, it worked. | ✅ | New buttons using new icon IDs 30001/30002 |
| `rResName` (`$8014`, ID `$0001xxxx` for type `$xxxx`) is a version word, a count long, then ID (4) + Pascal string per name. Apple's table is **not** sorted. Names are **optional** for using a resource by ID. | ✅ | Unnamed icon 30002 displayed |
| Icon resources are type `$8001` with the record of §2. HyperCard IIGS also keeps `$8024` (sound samples), `$8027`, `$801E` (XCMD) and others. | 🔶 | HyperCard IIGS's own fork |

`lib/rsrc.js` implements all of this.

## 4. HyperCard IIGS stacks (data fork)

The stack is the **Macintosh block chain stored little-endian**, with IIGS changes. Each block is size(4) type(4 ASCII) ID(4) …, and the chain runs from `STAK` to `TAIL`, with `FREE` blocks in between. Seen in Home: `STAK MAST LIST PAGE BKGD CARD BMAP FREE MPRT PRNT TAIL`.

### 4.1 Coordinates

| Fact | Status | How it was checked |
|---|---|---|
| **HyperTalk/HyperCard coordinates count 2 screen pixels per unit across, 1 per unit down.** A button with rect `200,100,280,160` drew at screen x 400–560, rows 100–160. A full-width card is 320 units across. | ✅ | Script-made buttons in the emulator |
| Every HyperCard x is therefore an even screen pixel, which is why icons always show their intended colors in HyperCard. | ✅ | Follows from the above; every icon on Home sat at an even x |

### 4.2 Blocks

| Block | Offset | Meaning | Status |
|---|---|---|---|
| STAK | +$60 | 16 color words: the stack's color set | 🔶 |
| LIST | +$28 | first PAGE ID; +$14 card count | 🔶 |
| PAGE | +$18 | card entries, **20 bytes each**: card ID (4) + 16 bytes of flags and search hash. Stack order. | ✅ (order matches HyperCard) |
| CARD | +$0C | picture (BMAP) ID; +$10 flags; +$1C page ID; +$20 background ID | ✅ |
| BKGD | +$0C | picture ID; +$10 flags; +$14 card count; +$18 next background; +$1C previous background | 🔶 |
| CARD, BKGD | +$24 | part count; +$26 next part ID; +$28 part list size; +$2C contents count; +$2E contents size; **parts start at +$32**; then contents, name and script | ✅ (parts) |

### 4.3 Parts (buttons and fields)

| Offset | Meaning | Status |
|---|---|---|
| +0 | size (2) | ✅ |
| +2 | part ID (2) | ✅ |
| +4 | low nibble: 1 = button, 2 = field; **high nibble: button family** (Home's tabs are `$11`) | ✅ type / 🔶 family |
| +5 | flags; `$80` = hidden | 🔶 |
| +6 | rect: top, left, bottom, right (2 each, HyperCard units) | ✅ |
| +14 | style, Mac numbering: 0 transparent, 1 opaque, 2 rectangle, 3 roundRect, 4 shadow, 5 checkBox, 6 radioButton, 7 scrolling | ✅ |
| +15 | flags: `$80` showName, `$40` hilite, `$20` autoHilite | 🔶 |
| +16 | **icon ID, 4 bytes** (Mac: 2) | ✅ |
| +24 | text align (1 = center, 0 = left) | 🔶 |
| +26 | font family (signed: `$FFFE` = Shaston, 3 = Geneva, 0 = system) | 🔶 |
| +28 | text size | 🔶 |
| +30 | text style (1 = bold) | 🔶 |
| +32 | line height | 🔶 |
| +36 | `$0F00` on every button: probably text and fill color indexes | ❓ |
| +42 | name (C string), then script (C string, CR line ends) | ✅ |

Scripts are plain text. **To run HyperTalk headless** in the emulator, rewrite the Home stack script's `startUp`…`resume` handlers in place at exactly the same length (keep `getHomeInfo`, or the Welcome card stops on a name prompt).

### 4.4 Pictures (BMAP)

Header: the Macintosh layout minus 4 bytes.

| Offset | Field |
|---|---|
| +$14 | card rect (`0,0,200,640`, in screen pixels) |
| +$1C | mask rect |
| +$24 | image rect |
| +$34 | mask data size |
| +$38 | image data size |
| +$3C | mask data, then image data |

| Fact | Status | How it was checked |
|---|---|---|
| **Image size 0 means a solid black image filling the image rect.** | ✅ | A filled rectangle painted by script was stored with no data |
| Rows span the rect with **left rounded down and right rounded up to a multiple of 8 pixels**, at 2 bits per pixel, storing **plain pixel values**. | ✅ | |
| Each row starts with a **mode byte**, then (unless mode 0) **ops** until the row is full (table below). | ✅ | Three of Home's pictures and two painted test pictures decode with every row the exact width and every byte consumed |
| Mode **0**: raw row, `rowBytes` literal bytes. | ✅ | Pixel match with an emulator capture |
| Mode **4**: the decoded bytes are XORed with the row 1 above. Mode **5**: XORed with the row 2 above. Above the image's top edge counts as white. | ✅ | 78/78 bytes on every such row of the Welcome card's copyright line |
| Mode **3**: ops giving the row's pixel values directly (no XOR). | ✅ | Row 20 of Home's background picture: all 160 bytes match a capture (one byte differed where the mouse pointer was) |
| Modes **1** and **2** (and probably 6), plus apparently a **row-level repeat command**, encode the first 20 rows of Home's background, 17 rows of alternating gray dither, in only 42 bytes. | ❓ | Being decoded |

Ops inside a row:

| Byte | Meaning |
|---|---|
| `$00`–`$7F` | `b & 7` zero bytes, then `b >> 3` data bytes |
| `$80`–`$9F` | `(b & 31) × 8` zero bytes |
| `$A0`–`$BF` | `(b & 31) × 8` data bytes |
| `$C0`–`$FF` | the next byte repeated `(b & 63) × 4` times |

This is the same idea as the Mac's WOBA ("Wrath of Bill Atkinson") compression, zero and data runs plus references to earlier rows, but with its own op encoding, adapted for 2-bit pixels.

---

## How to reproduce

- **Program tests** (`tests/iigs/drawicon`): a Merlin32 S16 program installed as `System:Start` on a copy of System.Disk 6.0.4 runs with no input, then saves the screen to a file on its own disk. `prodos-raw.js` reads the file back.
- **HyperCard tests:** a copy of the HyperCard IIGS hard-disk image gets the System folder, with HyperCard as `System:Start` and Home beside it. A HyperTalk startup script does the work, and a passive window capture is checked with `find-icons.js`.
- **Stack reading:** `tools/stack-import/hcgs-stack.js` (`HCGS.read`, `HCGS.hcgsRows`) and `tools/stack-import/explore.js` (block lister and hex dump).

Corrections and additions are welcome. If you have a real IIGS and can confirm or refute anything marked 🔶 or ❓, please open an issue.
