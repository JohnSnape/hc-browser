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
| STAK | +$0C | **Checksum.** The block's first `$600` bytes, read as little-endian 32-bit longs, must **sum to 0**; this long balances it. It is the Mac HyperCard rule, byte-swapped. If it is off, HyperCard IIGS opens the stack with **"That password was incorrect."** Edits past `$600` (the stack script starts at `$702` in Home) are not covered. | ✅ | Home sums to 0; an edited pattern table gave the password error; rebalancing `+$0C` made the stack open and paint normally (§7) |
| STAK | +$60 | 16 color words: the stack's color set | 🔶 |
| STAK | +$600 | a long (4 in every stack seen), then **the stack script** as a C string (CR line ends) | ✅ ten stacks |
| STAK | +$200 | **The stack's 16 paint patterns**, 32 bytes each (§7) | ✅ |
| LIST | +$0C | page count (4); +$10 page size; +$14 card count; **+$18 card-entry size (2): 8, 12, 16, 20, 28 and 68 seen**; from +$28, one 6-byte entry per PAGE: PAGE ID (4), cards in it (2) | ✅ ten stacks, 1 to 99 cards, 1 and 2 pages |
| PAGE | +$18 | card entries of the LIST's entry size: card ID (4), then flags and the search hash. Stack order. (Home happens to use 20.) | ✅ every card of ten stacks found, in HyperCard's order |
| CARD | +$0C | picture (BMAP) ID; +$10 flags; +$1C page ID; +$20 background ID | ✅ |
| BKGD | +$0C | picture ID; +$10 flags; +$14 card count; +$18 next background; +$1C previous background | 🔶 |
| CARD, BKGD | +$24 | part count; +$26 next part ID; +$28 part list size; +$2C contents count; +$2E contents size; **parts start at +$32**; then contents, name and script | ✅ |
| CARD, BKGD | after the parts | **Contents**, one entry per part that has any: part ID (2, signed: positive = a background part, negative = the card's own part), then a C string. For a field that is its text (CR line ends). For a background button the string is the single byte $80 or $81: its per-card state, bit 0 hilite (🔶). The sizes add up to +$2E exactly in all ten stacks. | ✅ |
| CARD, BKGD | after the contents | the object's name (C string), a long (4), then its script (C string) | ✅ |
| CARD, BKGD | +$10 | flags, Mac bits: $4000 cantDelete, $2000 picture hidden, $0800 dontSearch | 🔶 |

### 4.3 Parts (buttons and fields)

| Offset | Meaning | Status |
|---|---|---|
| +0 | size (2) | ✅ |
| +2 | part ID (2) | ✅ |
| +4 | low nibble: 1 = button, 2 = field; **high nibble: button family** (Home's tabs are `$11`) | ✅ type / 🔶 family |
| +5 | flags; `$80` = hidden. Other bits not yet seen set. | 🔶 |
| +6 | rect: top, left, bottom, right (2 each, HyperCard units) | ✅ |
| +14 | style, Mac numbering: 0 transparent, 1 opaque, 2 rectangle, 3 roundRect, 4 shadow, 5 checkBox, 6 radioButton, 7 scrolling | ✅ |
| +15 | **buttons:** `$80` showName, `$40` hilite, `$20` autoHilite. **Fields:** `$80` autoTab, `$40` showLines, `$20` wideMargins, `$10` lockText. | ✅ a stack built by script with one property set per part (`tests/hcgs-render/probe.hts`) |
| +16 | **icon ID, 4 bytes** (Mac: 2) | ✅ |
| +24 | text align (0 = left, 1 = center, -1 = right) | ✅ left and center (probe) |
| +26 | font family (signed: `$FFFE` = Shaston, 3 = Geneva, 0 = system) | 🔶 |
| +28 | text size | 🔶 |
| +30 | text style, Mac bits (1 = bold) | ✅ bold (probe) |
| +32 | line height (textHeight) | ✅ (field layout matches HyperCard) |
| +34 | **frame color**, +35 **text color**, 640-mode color nibbles (below). Notes' scrolling field has frame 1 (its frame and scroll bar are black and blue pixel pairs); StoryBook's fields 4 (red) with text 1. | ✅ |
| +36 | **buttons: foreground color**, +37 **background color**, 640-mode nibbles; `$0F` (black on white) is the default. A black-and-white icon record is drawn in these colors, per screen pixel: black → foreground, white → background. Addresses' arrow buttons have background `$E`, so their icons' white shows as white and yellow pixels. | ✅ |
| +42 | name (C string), **one zero byte, a long (always 4 so far)**, then the script (C string, CR line ends) | ✅ ten stacks |

**640-mode color nibbles.** HyperCard IIGS stores a part color as 4 bits: the even screen pixel's value in the high 2 bits, the odd one's in the low 2. `$F` is white, 0 black; in the System color set `$E` is white and yellow, 1 black and blue. ✅

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
| Rows span the rect with **left rounded down and right rounded up to a multiple of 8 pixels**, at 2 bits per pixel, storing **plain 640-mode pixel values**. The mask plane uses the same encoding; in it `11` = opaque. | ✅ | See the decoding results below |
| Each row is one **row command** (table below). Most commands carry **ops** (second table) that produce the row's bytes. | ✅ | |
| **Decoding results:** three pictures decode to **exactly** the pixels HyperCard IIGS shows: Home's full-screen background (119,596 pixels; the only 84 that differ are under the mouse pointer), the Welcome card's picture (2,496 of 2,496), and a script-painted pair of pattern-filled rectangles (28,662 of 28,662). Every picture in Home and in two painted test stacks decodes with every row the exact width and every byte consumed. | ✅ | Emulator captures compared value by value |

**Row commands** (one per row, read where a row starts):

| Byte | Meaning | Status |
|---|---|---|
| `$00` | raw row: `rowBytes` literal bytes | ✅ |
| `$01 a b` | fill the row with the 2-byte pattern `a b` | ✅ |
| `$03` + ops | the ops give the row's values directly | ✅ |
| `$04` + ops / `$05` + ops | the ops' bytes are XORed with the row **1** / **2** above. Rows above the picture's top count as white (`$FF`). | ✅ |
| `$06` + ops | presumably XOR with the row 3 above | ❓ (not seen yet) |
| `$10` / `$11` | copy the row **1** / **2** above (no data). **Above the top edge these copy black (`$00`)**, while the XOR rows count rows above the top as white. Whats.New's black slides start with `$11`. | ✅ |
| `$12` | presumably copy the row 3 above | ❓ (not seen yet) |
| `$20`–`$7F` | **repeat** the next row command `b − $20` times. Seen: `$23` (3), `$2B` (11), `$4F` (47, apparently the longest run HyperCard writes). | ✅ |
| `$02`, `$07`–`$0F`, `$13`–`$1F` | not seen in any picture so far | ❓ |

**Ops inside a row** (until the row is full):

| Byte | Meaning |
|---|---|
| `$00`–`$7F` | `b & 7` zero bytes, then `b >> 3` data bytes |
| `$80`–`$9F` | `(b & 31) × 8` zero bytes |
| `$A0`–`$BF` | `(b & 31) × 8` data bytes |
| `$C0`–`$DF` | the next byte, repeated `(b & 31) × 4` times |
| `$E0`–`$FF` | the next **4 bytes** as a pattern, repeated `b & 31` times (`(b & 31) × 4` bytes) |

The `$E0` rule was the only one of 15 candidates that made every picture decode exactly.

This is the same idea as the Mac's WOBA ("Wrath of Bill Atkinson") compression: zero and data runs, plus references to earlier rows. HyperCard IIGS uses its own byte encoding, adapted for 2-bit color pixels, with row-repeat commands that make dithered patterns very cheap. The 17 rows of gray border at the top of Home's background take 23 bytes.

| Still open | Status |
|---|---|
| How a card picture with **no mask data and no mask rect** decides transparency. The decoder currently treats non-white pixels as opaque. | ❓ |

### 4.5 How HyperCard IIGS draws a card

`lib/card.js` draws cards by these rules. **Seven cards now match HyperCard IIGS 1.1 pixel for pixel, except under the mouse pointer** (StoryBook's title card to within 5 more pixels). Five are from sample stacks (Notes, Phone Book, Addresses, FileCards, StoryBook), and two come from a test stack built by script (`tests/hcgs-render/probe.hts`) with one property set per field or button. `tests/hcgs-render` captures the real screen headlessly and compares every pixel. All sizes are in screen pixels; a HyperCard unit is 2 pixels across.

| Rule | Status |
|---|---|
| Layers: background picture, background parts, card picture, card parts, back to front. | ✅ |
| Lines are 2 pixels wide and 1 tall. `rectangle` fills white and frames the rect. `shadow` frames the rect less 2 pixels at the right and 1 at the bottom, with a 2-pixel shadow down the right side from 2 rows below the top, and a 1-row shadow along the bottom from 4 pixels in. | ✅ |
| `roundRect` buttons: per row from the top, the frame's black runs are [9, w−9), then [6, 10), [3, 6), [2, 4), [1, 3), then [0, 2) down the sides, mirrored at the bottom and right. (Measured on 13- to 20-row buttons.) | ✅ |
| Check box: a 24 × 9 box at the button's left + 2, centered down the button (rounded down). Checked, it holds an X drawn in 3-pixel strokes. Radio button: a 20 × 9 circle. The name starts at left + 30. | ✅ (the hilited radio button is not measured) |
| A hilite inverts what is inside the frame; the frame stays black (rectangle, roundRect). | ✅ |
| Button names: centered across, `left + 6` when left-aligned. The baseline is `top + ceil((height − font height) / 2) + ascent`. | ✅ |
| **Bold** smears each glyph 1 pixel to the right and adds 1 pixel to every character's advance. | ✅ |
| Field text wraps inside `[left + 6, right − 6)`; for a scrolling field, `right` is the scroll bar's left edge + 2. Line *n*'s baseline is `top + n × textHeight`, whatever the style. **wideMargins** adds 6 pixels on each side and moves the text 3 rows down. | ✅ |
| **showLines**: a dotted line one row under each baseline, to the bottom of the field. The dots fall where `x mod 4` is 2 or 3. The line runs `[left + 6, right − 8)`, or `[left + 12, right − 12)` with wideMargins. An empty scrolling field with showLines drew none. | ✅ (the scrolling case 🔶) |
| Scroll bar: 26 pixels wide (13 units) at the field's right edge. The arrow boxes are 12 rows, each followed by a 1-row separator, and the arrows are drawn in 2-pixel strokes. With nothing to scroll, the track is white with no thumb. When the text is longer than the field, the track is a 2 × 1 checkerboard and the thumb sits under the up arrow with 4-pixel sides, `ceil(track × fieldHeight / textHeight)` rows tall. | ✅ (thumb size from one sample 🔶) |
| Icons: centered in HyperCard units (rounded down) and clipped to the rect. Black-and-white icon records take the button's colors (§4.3). With showName, the icon is centered down the button as if the name took the font height + 4 rows, and the name's baseline is ascent + 1 rows under the icon. | ✅ (with a name: one sample) |
| Centered field text is centered in `[left + 6, right − 8)`, the same span as the showLines dots. | ✅ 3 fields |
| Field text is drawn in the field's text color (+35) and its frame in the frame color (+34). Whats.New's white text on black slides comes from +35 = `$F`. | ✅ |
| A font that is not installed draws as Shaston 8 scaled up (Times 24 → Shaston × 3). Scaled text still lands a few pixels off. | 🔶 |
| roundRect buttons under 13 rows tall use a squeezed corner: [8, w−8), [4, 8), [2, 5), [1, 3), [0, 2) on a 10-row button. | 🔶 not drawn yet |
| Scripts run when a stack opens, so a capture shows the card after its `openStack`/`openCard` handlers (ToDo adds a card; StoryBook shows hidden buttons). The renderer draws the stored state. | ✅ |

### 4.6 HyperCard's answer and ask dialogs

HyperCard IIGS 1.1 draws `answer` and `ask` itself, in the system font (Shaston 8). They are **not** the Window Manager alerts of §13: the buttons are 15 rows tall, not 13, and are placed differently. `lib/hcdialog.js` draws them by these rules. **All 12 test dialogs match HyperCard pixel for pixel**, apart from the mouse pointer: `answer` with 1, 2 and 3 buttons, 1, 2, 3, 4 and 18 lines, a name too wide for its button, and `ask` with and without a default answer, `ask password`, and a 3-line question (`tests/hcgs-render/dialogs.sh` captures them, `dialogs.js` compares). Pixels are screen pixels, measured with the menu bar hidden.

| Rule | Status |
|---|---|
| **Window:** content x 130–510 (centered on the screen), top row 40, always. A black band 2 rows / 5 pixels wide just outside the content. Then 5 white pixels and 2 white rows, then a line 1 row tall with 2-pixel sides: the dialog's outer edge is x 118–521, row 35 at the top. | ✅ |
| **Message:** pen x 150, first baseline row 58, 9 rows a line. It wraps at spaces to 340 pixels, and **spaces at the end of a line do not count** (a 338-pixel line followed by a space stays whole). Return starts a new line. | ✅ (the width lies in 338–347; 340 matches the field) |
| **Vertical layout:** the message box runs from row 50, 9 rows a line, and is at least 10 rows tall. `answer`'s buttons start 10 rows below it (row 70 for 1 line, 96 for 4). `ask`'s field starts 7 rows below it (row 67 for 1 line, 84 for 3). The content ends 5 rows below the buttons. | ✅ |
| **Screen bottom:** the dialog never runs off the screen. Its outer edge stops at row 199, so the buttons start at row 175 or above, and the message is cut off 10 rows above them (18 lines show 12, the 13th cut). | ✅ (`answer`; `ask`'s cut-off 🔶) |
| **answer buttons:** 90 × 15 pixels, 125 apart, the last one's right edge at x 490, so they line up from the right. **The last button is the default.** | ✅ |
| **ask buttons:** OK at x 330–400 (the default), Cancel at 420–490, both 70 × 15. | ✅ |
| **Button frame:** 3-pixel sides. Per row from the top, the black runs are [6, w−6), then [3, 7), [1, 4), then [0, 3) down the sides, mirrored at the bottom and right. The name is centered (rounded down), baseline 11 rows from the top. | ✅ |
| **A name wider than its button is not drawn at all** (185 pixels of text in a 90-pixel button left it empty). | ✅ (the exact limit 🔶; 6 pixels less than the width is used) |
| **Default ring:** 4 pixels and 2 rows outside the button (19 rows). Per row from the top, the runs are [11, w−11), [6, 11), [3, 7), [2, 5), [1, 4), then [0, 3) down the sides, mirrored. | ✅ |
| **ask field:** x 150–490, 13 rows, a 2-pixel / 1-row frame. Its text starts at x + 6, baseline 10 rows from the top. The default answer is selected: an inverted band 9 rows tall from 2 rows inside the top. With no default answer, a 1-pixel insertion point at x 156 runs those same 9 rows. | ✅ |
| `ask password` draws the same dialog as `ask`. | ✅ (empty field); 🔶 how typed characters show |
| `ask password` returns the answer **encrypted to a number** (HyperTalk Bible: "greyfog" → 1939083412 on the Mac). The IIGS's encryption is not known; the browser returns the text. | ❓ |
| Not yet measured: how a pressed button looks (the browser inverts its inside), the caret's blink rate, how the field scrolls when the text is longer than it, and what Return does in the field. | 🔶 |

## 5. Fonts: QuickDraw II font files and text drawing

IIGS fonts live in `System:Fonts` as ProDOS files of type **`$C8` (FON), aux `$0000`**, named *Family.Size* (`Courier.27`, `Symbol.09`). `lib/font.js` reads, writes and draws them. `tests/iigs/test-font.js` round-trips real fonts, and `tests/iigs/find-text.js` checks HyperCard's text against the prediction.

| Finding | Status | How |
|---|---|---|
| **File layout:** Pascal family name; IIGS header `offseToMF, family, style, size, version, fbrExtent`; then the Macintosh font record `fontType firstChar lastChar widMax kernMax nDescent fRectWidth fRectHeight owTLoc ascent descent leading rowWords`; then the strike, `locTable` and `owTable`. All little-endian. The file ends exactly at the end of `owTable`. | ✅ | Six Apple fonts (Symbol 9, Courier 27, Helvetica 27, Times 27, Helvetica 96, HyperCard's Monostrike 9) parse and **write back byte for byte** |
| Strike: 1 bit per pixel, **bit 7 = leftmost pixel**, `rowWords` × 2 bytes per row, `fRectHeight` rows. | ✅ | Glyphs rendered from the strike are correct letters, with the baseline at `ascent` |
| **`owTable` entries: low byte = advance width, high byte = offset**; the image's left edge = `kernMax` + offset from the pen. `$FFFF` = missing character. *Toolbox Reference* vol. 2 contradicts itself here: its overview of the four sections calls the low byte the offset, and its detailed section calls it the width. The files settle it. | ✅ | Monostrike "A" = `08 00` (8 wide, offset 0); Symbol "Α" = `07 02` with `kernMax` −2 |
| **Big fonts have a 7-word header, version `$0105`**, whose 7th word is the **high word of `owTLoc`**. The distance to `owTable` no longer fits in 16 bits. Not in the *Toolbox Reference*, which describes version `$0101` with a 6-word header. **A 7-word header does not imply `$0105`:** the ROM's Shaston 8 (below) has 7 words, version `$0101`, word 7 = 0. The writer keeps a font's own version and range. | ✅ | Helvetica 96: `offseToMF` = 7, header word 7 = 1; with it the tables line up and the font writes back byte for byte. Shaston 8 from ROM, likewise |
| **The system font, Shaston 8, is not a file on any System disk: it is built into ROM.** On ROM 03, QuickDraw II's `GetFont` and `GetSysFont` both return the handle **`$FC/DD1B`, a master pointer in ROM** to **`$FC/DD21`**: an ordinary font record of **2,176 bytes** (7-word IIGS header, family `$FFFE`, size 8, `fontType` `$9001`, characters 0–255 with 0–8 and some others missing, ascent 7, descent 1, leading 1, `rowWords` 69). The Memory Manager knows no size for that handle (`GetHandleSize` returns garbage). A search for a 6-word header misses it. | ✅ | `tests/iigs/menutest`: the emulator program wrote the record from QuickDraw's own handle, byte-identical to the ROM file at `$DD21`. **`lib/font.js` reads it and writes it back byte for byte**, and drawing all 256 codes with it matches what QuickDraw drew on screen: **15,640 of 15,640 pixels** (`check-font.js`) |
| Code `lastChar + 1` is the missing symbol, and `locTable[lastChar + 2]` is the strike length, as documented. Fonts may start at `firstChar` 0 and go to 255; the missing symbol is then code 256. | ✅ | Symbol 9 (0–255) |
| Apple's stored metrics are often **looser than needed**: Symbol 9 has `kernMax` −2 although no inked glyph kerns left, and `fbrExtent` 253; Helvetica and Times 27 store `nDescent` 0 instead of −descent; Courier 27's strike is one word wider than its images. Values at least this loose are safe to keep. | 🔶 | Apple's fonts, compared with values computed from the glyphs |
| Third-party fonts may leave junk in the strike padding and in the terminator `owTable` entry (code `lastChar + 2`). QuickDraw never reads either. | 🔶 | AGUAMUNDO 12 (1988) from the HyperCard disk |
| Apple family numbers: Times 20, Helvetica 21, Courier 22, Symbol 23. Shaston (the system font) is `$FFFE` in HyperCard parts (§4.3). | 🔶 | Font headers |
| **HyperCard IIGS keeps no fonts in stacks.** It uses the fonts in `System:Fonts`; neither the 1.1 ERS nor any stack fork shows a font resource. | 🔶 | ERS, Home's and HyperCard's resource forks |
| **A font added to `System:Fonts` is usable by name from HyperTalk** (`set textFont of last btn to "Arial"`), and **HyperCard draws its text exactly as the QuickDraw rules predict**: each glyph image at pen + left edge, the pen advanced by the width. | ✅ | Editor-made Arial 12: a script-made button's name matched **1,246 of 1,246 pixels** |
| `doMenu "New Field"` in a startup script produced no visible field, although `doMenu "New Button"` works the same way. Unknown whether no field was made, or it was made transparent and the text never arrived. | ❓ | One emulator run |

### Icons, additionally

| Finding | Status | How |
|---|---|---|
| All 48 icon records in Home and HyperCard IIGS decode to per-screen-pixel values and masks, and re-encode to records that decode identically. | ✅ | `lib/shr.js` `iconToPixels` / `iconFromPixels` |
| A fork saved by the HC Icon Editor, with a new icon drawn in the editor, works in HyperCard IIGS 1.1: a script-made button showed it pixel for pixel. | ✅ | `find-icons.js` |

### Macintosh bitmap fonts → IIGS fonts

`lib/macfont.js` converts them; the HC Font Editor's "Import a Macintosh bitmap font" uses it; `tests/iigs/test-macfont.js` checks every conversion.

| Finding | Status | How |
|---|---|---|
| **A Mac `FONT` or `NFNT` resource is the IIGS font's Macintosh record**, big-endian: the 13 header words, the strike, `locTable` and `owTable`. Converting = add a Pascal name and the IIGS header, byte-swap the header words and both tables. | ✅ | 25 fonts: Chicago, Geneva (8 sizes), Monaco, New York (7 sizes) from System 7.0.1's Fonts disk, and the 5 in System 6.0.8's System file |
| **The strike is copied unchanged.** On both machines it is a byte stream with the leftmost pixel in bit 7: the Mac reads it as big-endian words, whose first byte is the left 8 pixels. | ✅ | For all 25, the IIGS file's strike is **byte-identical** to the Mac resource's, and every character's pixels, offset and advance as `lib/font.js` reads them equal the Mac strike decoded directly as big-endian words |
| **Apple's NFNTs often end 2 bytes early**: the `owTable`'s last entry (the `$FFFF` after the missing symbol, never read) is left off. The converter supplies it. | ✅ | Geneva 9/10/12/14/18, Monaco 12, others |
| The NFNT's optional glyph-width and image-height tables (after `owTable`) are dropped, and `fontType` bits 0–1 that announce them are cleared. `owTLoc` is recomputed; a Mac font over 64K words keeps its high word in `nDescent`, the IIGS in a 7th header word. `nDescent` becomes −descent. Color (more than 1 bit per pixel) fonts are refused. | 🔶 | No measured font needed the 7-word header or carried color |
| Names and sizes come from the `FOND` (family name, family number, font association table: size, style, resource ID). Old-style `FONT`s are numbered family × 128 + size, and the size-0 `FONT`'s resource name is the family name. | ✅ | Both kinds above |
| **Family numbers.** The IIGS's own families use the Mac's numbers (Geneva 3, Venice 5, Times 20, Helvetica 21, Courier 22, Symbol 23, Shaston `$FFFE`). The importer keeps the Mac number when it is free or names the same family (Geneva → 3, Monaco → 4). Otherwise it derives one from the name, like the editor does, so every size still shares it. That covers Chicago, which is 0 (the Mac's system font). | 🔶 | Rule, not a measured IIGS behavior |
| Containers: MacBinary (`.bin`), AppleSingle (`.as`), AppleDouble (`._name`) and raw resource forks (`.rsrc`, CiderPress II's `…r` files from HFS images). FFIL suitcases and System files are just files with these resources. | ✅ | Each form opened Chicago or Geneva; CiderPress II reads the HFS disk images |
| **HyperCard IIGS draws an imported Mac font exactly**: Chicago 12, converted from System 7.0.1's suitcase and put in `System:Fonts`, drew a script-made button's name **1,545 of 1,545 pixels** as `lib/font.js` predicts; Shaston does not match. | ✅ | `find-text.js` on an emulator capture |

### Font families, additionally

| Finding | Status | How |
|---|---|---|
| A family number should belong to the family, not the size: the HC Font Editor gives every size of one family the same number, derived from the name. Whether HyperCard IIGS then shows two files with one family number and different sizes as one family has **not been measured** yet. | ❓ | — |

## 6. Cursors (`$8027` rCursor)

`lib/cursor.js` reads and writes them; the HC Cursor Editor edits them. `tests/iigs/find-cursor.js` finds a cursor in a capture.

| Finding | Status | How |
|---|---|---|
| Record (*Toolbox Reference* vol. 2, Fig. 16-24): `cursorHeight` (rows), `cursorWidth` (**words** per row), image (height × width words), mask (same), `hotSpotY`, `hotSpotX`. The pixel data is screen format, so in 640 mode a word is 8 two-bit pixels. The last word of every row is 0. | ✅ | HyperCard IIGS's four cursors decode to recognizable shapes, and all four write back byte for byte |
| **The `$8027` resource adds 10 bytes after the hot spot: a flags word and 8 reserved bytes.** *IIGS Technical Note #76* defines them: flags bit 7 = 1 for 640 mode, "all other bits are reserved and must be zero", reserved = 0. Not in *Toolbox Reference* vol. 2. **HyperCard IIGS's own four cursors store flags `$00FF`**, with bits 0–6 set, contrary to the note; it plays them fine. **System 6.0.4's six cursors in `Sys.Resources` follow the note:** three are `$0080` (640 mode) and three `$0000` (320 mode), the same shapes in pairs. The editor keeps whatever a cursor had, and writes `$00FF` for new ones, the value verified in HyperCard. | ✅ layout (TN #76 + data) / 🔶 meaning of the extra bits | HyperCard IIGS's fork; `Sys.Resources`; TN.IIGS.076 |
| Drawing: **screen = (screen OR mask) XOR image.** So mask 0 + image 0 is see-through, mask 0 + image 3 inverts (IBeam and Cross are all invert pixels), and mask 3 + image (3 XOR *v*) shows value *v*. A pixel you *see* as black is stored as image 3. | ✅ | Book text; our test cursor showed the predicted values |
| HyperCard's own cursors: 1 IBeam (16 × 11, hot 5,7), 2 Cross (24 × 9, hot 9,4), 3 Plus, 4 Watch, matching the Mac's numbers. Names live in `rResName` like icons. | 🔶 | HyperCard IIGS's fork |
| **A cursor added to the stack's fork works from HyperTalk**: `set cursor to 30001` drew our 16 × 12 test cursor; **188 of 192** opaque pixels match. The 4 others are on screen line 12, which HyperCard's rainbow bar gives a different palette: same values, different colors. | ✅ | `find-cursor.js` on a capture taken during `wait 6000` |
| A script-set cursor stays only while the script runs. Set from an `idle` handler, it was immediately replaced; set in a tight `repeat` loop, captures caught it only in pieces (the pointer is redrawn constantly). Use `set cursor` then `wait`. | 🔶 | Three emulator runs |

## 7. Paint patterns

`lib/pattern.js` reads and writes them; the HC Pattern Editor edits them. `tests/iigs/find-pattern.js` checks a painted area.

| Finding | Status | How |
|---|---|---|
| **A stack has 16 editable paint patterns, not the Mac's 40.** They are kept at **STAK +`$200`**, 32 bytes each, right after the color set. HyperCard IIGS's program holds a default copy of the same table, followed by its default color sets. | ✅ | Home's STAK and HyperCard's data fork; Home's pattern 4 differs from the default (edited) |
| A pattern is 8 rows × 4 bytes of **640-mode screen pixels**: 16 × 8 pixels, 2 bits each, leftmost in bits 7–6, in the stack's color set. It is **aligned to the screen** (pixel *x*, *y* uses pattern pixel *x* mod 16, *y* mod 8). | ✅ | An edited pattern painted with HyperCard's rectangle tool: **6,864 of 6,864** checked pixels match at alignment (0,0) |
| The Patterns palette has 4 columns of 8. Columns 1–2 are the 16 colors (not editable); columns 3–4 are patterns 0–7 and 8–15. **HyperTalk numbers it down the columns**, so `set pattern to 1`–`16` are the colors and **`17`–`32` are patterns 0–15**. | ✅ | `set pattern to 24` painted with pattern 7 |
| Editing the pattern table requires fixing the STAK checksum (§4.2). | ✅ | Same test |
| HyperCard IIGS 1.1's default table is at **+$699B in HyperCard's data fork**: 16 entries, all 16 found in stacks. The stack header's color set follows the patterns in the same table. All **168 stacks** on the HyperCard disk keep their own 16 at STAK +`$200`. | ✅ | `tools/export-art/export.js` (finds the table by matching stack patterns, no fixed offset) |
| Where System 6.0.4 keeps desktop or other standard patterns was **not found**: no `$802F` resource and no pattern table was identified in the System files. | ❓ | Fork scan of the System 6.0.4 disks |
| **`$802F` (pattern list) is rare and undocumented.** Toolbox Reference vol. 3 does not list it. Of 2,092 IIGS disk images (637 with resource forks), only two programs have one: Full Metal Planète (ID 1 = 384 bytes, ID 2 = 64 bytes) and the shareware MineSweeper (ID 1 = 480 bytes). All three are **bare arrays of 32-byte QuickDraw II patterns** (8 rows × 4 bytes; 12, 2 and 15 of them; MineSweeper's look like 320-mode tiles), with no header or count. No Apple tool that reads them is known, so there is nothing to verify against on the IIGS, and **no editor was built** for them. | 🔶 | Fork scan of every image under the Asimov GS mirror |

## 8. Sampled sounds (`$8024` rSoundSample)

`lib/sound.js` reads and writes them; the HC Sound Editor edits them. `tests/iigs/test-sound.js` checks HyperCard's own sounds. **No audio was recorded in any test**, so nothing here is measured by ear or by waveform.

| Finding | Status | How |
|---|---|---|
| Header (*IIGS Technical Note #76*): format word (0), **wave size in 256-byte pages**, relative pitch, stereo channel (low nibble), sample rate in Hz; then 8-bit unsigned samples, 128 = silence, to the end of the resource. | ✅ | HyperCard IIGS's three sounds (Harpsichord, Boing, Silence) parse this way and write back byte for byte |
| **The page count is the data length rounded down**, not up: Harpsichord has 5,290 bytes and says 20 pages, Boing 7,722 bytes and 30 pages. The extra bytes are silence (`$80`). The editor pads new sounds with `$80` to whole pages, so either reading agrees. | 🔶 | HyperCard's sounds |
| HyperCard's sounds store a **sample rate of 22,255 Hz**, and their **relative pitch makes up the difference** from the 26.32 kHz that HyperCard assumes. | 🔶 | HyperCard's sounds |
| **Relative pitch** (*HyperCard IIGS Technical Note #3*): offset = 3072 × log₂((261.63 ÷ F<sub>w</sub>) × (F<sub>s</sub> ÷ 26,320)); negative values are stored as \|offset\| + `$8000`. So the high byte is semitones and the low byte 1/256 semitone (TN #76). Applied to HyperCard's sounds, it gives Harpsichord = sampled at **391.5 Hz (G4)** and Boing = **586.2 Hz (D5)**, and recomputing from those reproduces `$89E2` and `$90DF` exactly. | ✅ formula round trip | `test-sound.js` |
| The data never contains `$00`, which the Ensoniq DOC treats as end-of-sample. The editor replaces any `$00` with `$01`. | 🔶 | HyperCard's sounds (minimum byte 1) |
| **A sound added to the stack's fork plays by name**: `play "TestTone"`, a 1.5 s G4 tone written by `lib/sound.js` as `$8024` ID 30001 with a name, ran in a loop with no error dialog, and GSport's sound-chip meter rose (`snd1` 0.6–0.7 %, `st_snd` 1; 0.0 % in every other run). | ✅ accepted and played / ❓ sound itself | Emulator screenshots |
| **System sound files** (`System:Sounds`, 98 files counting both forks) are type `$D8` aux `$0003`, "Sampled Sound Resource" (*File Type Note $D8*): an **empty data fork**, with the sound as one `$8024` resource plus its `rResName` name in the resource fork. | ✅ | System 6.0.4's Sounds folder (SystemTools2 floppy and the installed volume) |
| **Apple's System sounds use the "indefinite pitch" rule of TN #3**: relative pitch = 3072 × log₂(F<sub>s</sub> ÷ 26,320), so HyperCard plays them at their own recording rate. Ahh is 11,127 Hz with `$8EE8`, which gives 11,126 samples/s at middle C; Droplet is 22,254 Hz with `$82E8`, giving 22,253. | ✅ formula vs data | `tools/export-art/export.js` CSV |
| `$D8` aux `$0004` files (SynthLAB's `.wav` wave banks) are not described by any File Type Note we have, and are not decoded. | ❓ | — |
| **Playback pitch and length are not verified by measurement.** The editor's preview assumes HyperCard plays middle C at 26,320 × 2^(offset ÷ 3072) samples per second, and note *f* at that × *f* ÷ 261.63, from TN #3. Nobody has compared that against real output. | ❓ | Not measured (no audio recording, by choice) |

## 9. Version resources (`$8029` rVersion)

`lib/version.js` reads and writes them; the HC Version Editor edits them.

| Finding | Status | How |
|---|---|---|
| Layout (*IIGS Technical Note #76*): long version (4 bytes), country/region word, Pascal string name, Pascal string more-info, nothing after. The long version (*Technical Note #100*) is stored least significant byte first: release number (BCD), stage (`$20` development, `$40` alpha, `$60` beta, `$80` final, `$A0` release), minor and bug digits (BCD nibbles), major (BCD). | ✅ | **All 71** `rVersion` resources on the System 6.0.4 disks and the HyperCard disk parse this way, end exactly after the two strings, and write back byte for byte. Versions seen: 1.0 to 6.0.4, including 2.0d1, 1.1a and 1.0.7b1 |
| Files show ID 1. HyperStudio's icon file on the HyperCard disk also carries ID `$20000`. | 🔶 | Same scan |
| **HyperCard IIGS ignores its own `rVersion`.** With HyperCard's ID 1 changed to 4.5.6b7 "Changed Name", `the version` still said **1.1** and `the long version` **01108003** (Mac long-version format, built in: 1.1.0 final 3). So HyperTalk cannot show an edited version. The Finder's Get Info presumably does, but that needs mouse input, so **display of an edited version on the IIGS is not verified**. | ✅ (HyperCard ignores it) / ❓ (Finder display) | Emulator screenshot |

## 10. Finder icon files (type `$CA`)

| Finding | Status | How |
|---|---|---|
| Layout (*File Type Note $CA*): 26-byte header (`iBlkID` at +4 must be `$0001`, a 16-byte name at +10), then Icon Data records: length word (0 ends the list), 64-byte owner pathname, 16-byte filename pattern (`*` wildcard), file type, aux type, the large icon record, the small icon record. | ✅ | Both icon files on the System 6.0.4 disks (AppleBowl.Icon, SL.Icons): every record's length equals 86 + both icon records exactly |
| The icon records are ordinary QuickDraw II icons (§2). AppleBowl.Icon's large icon is a 16 × 16 black-and-white record. | ✅ | Same |

## 11. Menus (`$8008` rMenuBar, `$8009` rMenu, `$800A` rMenuItem)

`lib/menu.js` reads them and draws them as System 6.0.4's Menu Manager does in 640 mode. `tests/iigs/menutest` is the emulator program that measured it: it builds a program's menu bar from its resource fork with `NewMenuBar2`, draws it, pulls down each menu with `MenuSelect`, and saves the screen each time; `check-menus.js` compares.

| Finding | Status | How |
|---|---|---|
| **Layouts** (*Toolbox Reference* vol. 3, App. E): bar = version 0, flags (bits 15–14: how the list refers to menus; 2 = resource ID), list of longs ending in 0. Menu = version 0, menuID, menuFlag, title ref (long), item refs ending in 0. Item = version 0, itemID, itemChar, itemAltChar, itemCheck (mark character), itemFlag, title ref (long), 14 bytes. Titles by resource ID are `rPString` (`$8006`). | ✅ | All 7 bars, 90 menus and 338 items on the System 6.0.4 disks are version 0 and parse this way; every item is 14 bytes |
| **menuFlag**: bits 15–14 title ref type, **13–12 item ref type**, bit 8 alwaysCallmChoose, bit 7 disabled, bit 5 XOR, bit 4 custom, bit 3 allowCache. Seen: `$A008` (67), `$A088` (11, disabled), `$A000` (9), `$8000` (3: items set by the program). **itemFlag**: bits 15–14 title ref type, 12 shadow, 11 outline, 7 disabled, 6 divider below, 5 XOR, 2 underline, 1 italic, 0 bold. Teach's Style menu confirms the style bits by name (Bold `$8001`, Italic `$8002`, Underline `$8004`, Outline `$8800`, Shadow `$9000`); every `-` item is `$8080` (disabled). | ✅ | Same scan + vol. 3 |
| A title of `@` alone is the Apple menu. Menus in no bar are pop-up menus for controls (Slots, Archiver, Standard File) or menus a program fills in itself (the Finder's Extras; Installer's empty one). | 🔶 | Same scan |
| **The bar**: 13 lines (as `FixMenuBar` returns), black top and bottom lines, 2-pixel black sides. `GetMTitleStart` is 10 and the first title's rectangle starts at **x 12**. A title is as wide as its text in Shaston 8 (Teach's `"  File  "` = 45), the Apple title 24. Title baseline y 10. A selected title is inverted on lines 1–11, except the Apple title, which gets black behind its logo. Disabled titles keep only the pixels where x + y is even; the rest become the background. When the title is also selected, this happens after the inversion. | ✅ | Screen dumps; widths also from `GetMTitleWidth` |
| **The color Apple** is a 16 × 8 640-mode image with a mask (screen = (screen AND mask) OR image), in System 6.0.4's `System:Tools:Tool015` at +`$33B4` and in ROM 03 at +`$181EE`, identical. The bar's colors come from per-line palettes the Menu Manager installs: SCBs 0 0 1 1 1 2 3 4 5 6 0 0 0, where palette *n*'s color 1 is green `$0C0` (lines 2–4), yellow `$FF0`, orange `$F80`, red `$F00`, purple `$F0F`, blue `$004`. | ✅ | Found by searching for the logo's bytes from the dump; SCBs and palettes from the dump |
| **A pulled-down menu**: the box hangs from the bar's bottom line at its title's x, with 2-pixel sides and a 1-pixel bottom. The shadow is 4 pixels wide on the right (from 3 lines down) and 1 line below (from 5 pixels in). Items are **12 lines**, baseline 9 down, text **15 pixels in**. Width = widest item + 27, where an item with a key equivalent counts **+22, whatever the letter**. The key equivalent (Shaston's open-apple `$11`, then itemChar) starts **20 pixels from the right edge**: a fixed column, not right-aligned. A `-` item is a dimmed line 6 lines down. Disabled menus and items are dimmed with the same pattern as titles. | ✅ | `check-menus.js`: Teach's bar and all six menus match **121,314 of 121,314** pixels. With the rules fixed, **Archiver's bar and four menus match 64,130 of 64,130**, an independent check |
| **Item text styles** (Shaston 8, character by character): bold = glyph plus a copy 1 pixel right, +1 advance; italic = rows shifted right by ⌊−y/4⌋ (y from the baseline, up negative), no extra advance; outline = the 8 neighbours of the glyph minus the glyph, +1; shadow = offsets −1…+2 both ways minus the glyph, +2. **Underline drew nothing.** | ✅ on the visible half / 🔶 | Teach's Style menu is disabled, so only the pixels the dim pattern keeps could be compared; all of them match. Underline in an enabled menu was not seen |
| The check-mark column and the divider-below flag (bit 6): **not measured.** No captured menu used them. The exporter draws marks 4 pixels in. | ❓ | — |
| **`MenuSelect` reads the mouse itself** and waits for a mouse-up event in the queue. Replacing the Event Manager's `Button`, `StillDown` and `GetMouse` through the Tool Locator changed nothing (none was called), and `PosMouse` did not move the pointer it tracks. A heartbeat task that copies the screen and posts a mouse-up event (`PostEvent`) captures a menu while it is down, with no input. | 🔶 | Three emulator runs |

## 12. Controls (`$8004` rControlTemplate, `$8003` rControlList)

`lib/control.js` reads them and draws them as System 6.0.4's Control Manager does. `tests/iigs/menutest/CTLTEST.S` has the real Window Manager make a program's windows from its `rWindParam1` (`$800E`) templates with `NewWindow2`, which also makes their controls. It then runs `DrawControls` and saves the screen, and `check-controls.js` compares.

| Finding | Status | How |
|---|---|---|
| **Types confirmed:** rControlList `$8003` is a list of rControlTemplate IDs ending in 0; rControlTemplate `$8004` is the vol. 3 header (pCount, ID, rect, procRef, flag, moreFlags, refCon) plus per-type fields. HyperCard IIGS has 252 templates and 36 lists; the System 6.0.4 disks have 793 and 122. | ✅ | All parse; field counts follow pCount |
| procRefs seen: the 12 standard ones of vol. 3, plus **`$87FF0003` (rectangle) and `$87FF0002` (thermometer)** from System 6, and `$07FF0002`, which vol. 3 doesn't list. HyperCard and Archiver use **custom procedures by resource ID** (`$00000001`–`3` with fCtlProcRefNotPtr). The rectangle's and `$07FF0002`'s extra fields are kept raw: their layout isn't documented here. | 🔶 | Scan of all templates |
| A window template names its control list at +`$4A`, with NewControl2's referenceDesc in the low byte of +`$4E` (always 9, an rControlList ID, in the data). Its content rectangle (+`$3E`) places the controls. | ✅ | The emulator placed every control exactly there |
| **rTextForLETextBox2 (`$800B`) has no length word in Apple's resources**: the text and its LETextBox2 codes fill the resource, although vol. 3 (Fig. E-34) shows one. | 🔶 | Archiver's and HyperCard's static texts |
| **Measured drawing** (Archiver, 12 windows): round simple button (1-line top and bottom, two corner rows, 3-pixel sides; auto width = title + 30, height 14; title at ⌊(W − text)/2⌋, baseline at top + ⌈(H − 8)/2⌉ + 7); the default button's outer ring (4 pixels out at the sides, 2 lines above and below); check box (23 × 9, title at +27, baseline +8); radio button (21 × 9 oval, dot of three rows when set, title at +25); pop-up (12-line box, 2-pixel sides, shadow 4 pixels right from 4 lines down and 1 line below from 5 in; **its rect's width includes the right shadow**; with no right edge it fits its widest item + 23; item text at +13, baseline +9; no arrow); LineEdit (frame with 2-pixel sides; the first active one gets a 9-line insertion bar 6 pixels in); static text (LETextBox2: erases its rect, first baseline top + 8, lines word-wrapped, J/S codes for justification and style). **The first control in a list ends up on top** (each new control goes to the head of the window's list, and drawing starts there). | ✅ | `check-controls.js`: 19 buttons, 10 default buttons, 11 check boxes, 9 radio buttons, 4 pop-ups, 5 LineEdits and 15 static texts all match **every pixel** (138,000+ pixels) |
| Inactive controls (ctlHilite 255) are dimmed with the menus' checkerboard, except that a LineEdit is not dimmed, a pop-up's shadow stays solid, and a button keeps its frame (only its inside, from 2 pixels in on the middle rows, is dimmed). | ✅ / 🔶 button (one inactive default button: 1,590 of 1,596 pixels) | Same |
| **Not measured, drawn from the documentation:** checked check boxes, square buttons, pop-up titles, LineEdit text, lists, scroll bars, icon buttons, pictures, TextEdit, rectangles, thermometers, size boxes, custom controls. The export's notes say which pictures contain them. Static text with `*0`, `*1`… is filled in by the program at run time and is drawn with the markers. | ❓ | — |

## 13. Dialogs: window templates and alerts

`lib/dialog.js` reads alert strings and window templates and draws them; `tools/export-art/export.js` puts each window (with its controls) and each alert in a Dialogs folder, with a JSON listing every part and resource. Checked with `tests/iigs/menutest/ALRTEST.S` (`AlertWindow` on nine test strings; a heartbeat task copies the screen and posts a Return key, so no input is needed) and CTLTEST's window captures: `check-alerts.js`, `check-windows.js`.

| Finding | Status | How |
|---|---|---|
| **Types confirmed:** `$800E` rWindParam1 (108 on the System disks), `$8010` rWindColor (9: five colour words, frame, title, title bar, grow, info), `$8015` rAlertString (327), `$800B` rTextForLETextBox2 (241). No `$800F` rWindParam2 on these disks. A window template's colour table type is plInDesc bits 11–10. | ✅ | Fork scan; vol. 3 App. E |
| **Alert strings** (vol. 3 ch. 52): size digit (`0` = custom, then a 4-word rect), icon digit (`1` = custom, then a pointer, width and height), a separator, the message, the button titles, `$00`. `^` marks the default button; `#0`–`#6` are OK, Cancel, Yes, No, Try Again, Quit, Continue; `*0`–`*9` are filled in by the program. Apple uses `/`, `\|` and `&` as separators. | ✅ | All 327 parse |
| **Alert sizes:** the frame is vol. 3 Table 52-1's 640-mode width + 24 and height + 10, exactly, centred on the screen (top = (200 − height) ÷ 2). The table says "approximate"; on System 6.0.4 it is exact. | ✅ | Sizes 1–9 measured |
| **Alert drawing:** an outer 1-line edge with 2-pixel sides; 2 lines/pixels inside it an inner border 2 lines tall and 5 pixels wide at the sides; content 12 pixels and 5 lines in. **The icons are rIcons `$07FF0002`–`$07FF0006` in `System:System.Setup:Sys.Resources`** (named Stop, Note, Caution, Disk, Disk Swap), drawn at content + (8, 4). The message (LETextBox2) starts at content + 20 + the icon's width, first baseline 11 lines down, 9 lines apart, wrapped 13–19 pixels short of the content's right edge (16 used). Buttons are all max(60, longest title + 20) wide and 13 tall, 5 lines above the content's bottom, evenly spaced (gap = (content width − n × width) ÷ (n + 1)); the default one has the ring. | ✅ | `check-alerts.js`: all nine alerts, **278,160 of 278,160 pixels** |
| **Window frames:** fAlert (`$2000`) is the alert frame; a plain frame is 2-pixel sides beside the content and 1-line top and bottom edges; fTitle (`$8000`) adds a 13-line title bar above the content, black with the title in white, centred, baseline 10 lines down (the frontmost window). | ✅ | `check-windows.js`: Archiver's 12 windows (alert, plain and titled frames), **56,741 of 56,741 frame pixels** |
| Close box, zoom box, size box, scroll bars, information bar, inactive title bars and rWindColor colours are **not measured**: drawn from the documentation (or not at all), and each picture's note says so. Custom alert icons are pointers in the program and cannot be drawn from a file. | ❓ | — |

`tools/export-art/export.js` exports every icon (`$8001` and `$CA`), cursor (`$8027`, drawn with the OR/XOR rule, plus a hot-spot copy), sound, paint pattern, menu bar, menu, menu item, control list, window and alert (drawn as above, plus text and JSON listings; every rMenuItem also on its own, with the menus that use it, in Menus/Items and items.csv) and font (`$C8`, as a labeled glyph grid) on a set of disk images, with an `index.html` and a CSV. Given a ROM 03 image, it also exports Shaston 8 and uses it and the ROM's Apple logo for the menus. Run on the stock System 6.0.4 disks, it gave 181 icons, 10 cursors (with HyperCard's 4), 54 sounds, 2,704 patterns, 4 menu bars with 48 menus and 180 distinct menu items (5 used by no menu), 692 distinct control templates in 104 windows and lists, 61 window templates and 196 alerts (Dialogs), and 74 fonts (with Shaston 8 from ROM; `SystemTools1` adds Shaston 16, Geneva 10–24 and Venice 12/14). The output is Apple's artwork and stays out of this repository.

## 14. HyperCard IIGS externals and scripting

Measured while building [`iigs/resource-editor`](../iigs/resource-editor), a HyperCard IIGS stack that edits resources on the IIGS through an XFCN written in 65816 assembly. Everything here ran in HyperCard IIGS 1.1 with no input sent to the emulator: a startup script did the work and wrote its results to files.

| Finding | Status | How |
|---|---|---|
| **An XFCN can be a Merlin32 OMF file as it stands:** one segment, kind `$0000`, entry at its first byte, relocations as a SUPER record. Stored as `$801F` with attributes `$0800` (as HyperCard's own `$801E`) and a name in rResName (`$8014` ID `$0001801F`), it is found by name and called. | ✅ | `rsrc("version")` answered from Home's fork |
| **XCMDBlock offsets** are those in Apple's `E16.HyperXCMD` (on the HyperCard disk): paramCount +0, params +2 (16 handles), returnValue +66, passFlag +70, userID +72, returnStat +74. Callbacks are `JSL $E10220` with the number in X; `GetResourceName` is 40, `SetResourceName` 39. | ✅ | Every op of the XFCN reads its parameters this way |
| An XFCN that opens another file with `OpenResourceFile`, makes it current and sets the search depth to 1 can list, load, add, replace (`RemoveResource` + `AddResource`, attributes kept) and remove resources in it; `CloseResourceFile` writes them, and the index comes out sorted. | ✅ | `lib/rsrc.js` read the forks back: IDs, attributes, data and names as written |
| HyperCard's `GetResourceName`/`SetResourceName` callbacks did **not** see names in a file the XFCN had opened and made current (list showed none, set had no effect on it). The XFCN reads and writes rResName itself instead. | 🔶 | Two runs |
| **A stack's own fork needs a GS/OS `Flush` after `UpdateResourceFile`.** HyperCard keeps it open; without the flush the map on disk already pointed at a name table past the directory entry's end of file, so after the machine stopped the table was gone. With `GetOpenFileRefNum` + `Flush` it was all there. | ✅ | Home's fork after a run, read with `lib/rsrc.js` |
| An XFCN's `DrawIcon` and QuickDraw calls draw in the card window, whose local coordinates are **screen pixels** (x = 2 × HyperCard units). Patterns are aligned to screen columns. | ✅ | Editor's `DrawIcon` preview **5,593 of 5,593** pixels as `lib/shr.js` predicts; grid colors 11,016 of 11,016 |
| HyperCard disposes an XFCN's `returnValue` handle itself (as the ERS says). The editor allocates it under HyperCard's memory ID (`GetCurResourceApp`) and unlocks it before returning; strings of tens of kilobytes came back intact. | 🔶 | Many runs; the variant under the XFCN's own ID was not tried long enough to rule it out |
| **`create stack "path"` works from a script** (through `do`), makes an empty stack and goes to it; the stack gets an empty resource fork. | ✅ | `the long name of this stack` afterwards; the file on disk |
| `doMenu "New Field"`, `"New Button"` and `"New Card"` work from a script; then `the number of card fields/buttons` finds the new object, whose name, rect, style, script and text can be set. | ✅ | Index and Icons cards built this way |
| **Home's stack script intercepts menu commands sent from scripts** with warnings ("New cards added to this stack will be placed after the last card of this background", "The Home stack works best if you do not add new backgrounds"), which stop a script that has no user. `send "doMenu …" to HyperCard` bypasses them. | ✅ | Dialogs in captures; gone with `send … to HyperCard` |
| `doMenu "New Background"` from a script left HyperCard **editing the background** (the menu bar said "Background"), so the next new field was a background field. The editor's cards share one background instead. | 🔶 | One run |
| A card script with a handler named `newCard` (a HyperCard message name) failed with "Can't understand what's after 'end'"; renaming the handler fixed it. A failing script makes **every** handler in it unknown ("Can't understand"). | ✅ | Two runs |
| `set script of this card to …` then `send` to it runs the new handlers at once (any script size tried, to 7 KB). | ✅ | The headless runs (`test/rig.sh`) all start this way |
| **A resource fork's index starts 4 bytes after the free list:** map + 36 + 8 × (free-list slots), so map + 116 with 10 slots, in a fork made by `CreateResourceFile` and in Apple's Home. A fork written with the index at map + 112 (and the map's `mapToIndex` saying so) was not usable by HyperCard IIGS: the stack's XFCN was never found there. | ✅ | `tools/forktool.js` empty forks, before and after the fix |
| **The search for an XFCN starts at the stack whose script calls it:** called from Home's card script while another stack was current, `rsrc` came from Home's fork (`RSRC H.0`); called from that stack's own script, from its fork (`RSRC 1.0`). | 🔶 | `version` answers in the same run |
| HyperCard IIGS has **no `is a number`** (a HyperCard 2 operator): a script using it stops with "Can't understand what's after '<>'". | ✅ | Version card, fixed with a helper |
| A stack made by script must be **left** (e.g. `go home`) before the machine stops: stopped a few seconds after the last change, the new stack later failed to open with "Can't read card or background id …". | ✅ | Two builds; with `go home` + a short wait it opens every time |
| A new stack made by `create stack` has an empty resource fork that the Resource Manager cannot open (GS/OS error `$4C`, end of file); `CreateResourceFile` or a fork written on the host fixes that. | ✅ | `rsrc("list")` on such a stack |
| **Fonts as resources:** no IIGS font resource type is defined in Technical Note #76 or anywhere else we have, and none appeared in the forks read. Not confirmed, so the editor edits `$C8` files only. | ❓ | — |
| A HyperCard IIGS stack's patterns patched on disk (STAK +`$200`, checksum fixed) are used by HyperCard when it next opens the stack: `set pattern to 21` painted pattern 4 as edited, **10,976 of 10,976** pixels. | ✅ | `iigs/resource-editor/test/run-cards.sh` |
| HyperCard IIGS 1.1 has `the clickLine`, the `itemDelimiter` property and an `ask` that sets `the result` to "Cancel" (ERS). The editor relies on them; the clicks themselves are **not** exercised headlessly. | ❓ | — |

---

## How to reproduce

- **Program tests** (`tests/iigs/drawicon`): a Merlin32 S16 program installed as `System:Start` on a copy of System.Disk 6.0.4 runs with no input, then saves the screen to a file on its own disk. `prodos-raw.js` reads the file back.
- **Menu and system-font tests** (`tests/iigs/menutest`): the same kind of program, on a copy of the HyperCard hard-disk image (more free space) with the program under test copied to the root as `TEACH`. It writes `SHR0`…`SHRn` and `SHASTON8`. `check-font.js` and `check-menus.js` compare them with `lib/font.js` and `lib/menu.js`.
- **Alert tests** (`ALRTEST.S`): nine AlertWindow strings, captured by a heartbeat task that also posts a Return key; `check-alerts.js` compares (needs Sys.Resources for the icons).
- **HyperCard tests:** a copy of the HyperCard IIGS hard-disk image gets the System folder, with HyperCard as `System:Start` and Home beside it. A HyperTalk startup script does the work, and a passive window capture is checked with `find-icons.js`.
- **HyperCard XFCN tests** (`iigs/resource-editor/test`): `rig.sh` rewrites Home's `startUp` (same length) to load a text file into the card script and send it `boot`; the XFCN `rsrc` in Home's fork reads the file. `run-icons.sh` and `run-cards.sh` build the editor stack on the IIGS, drive it, and check the results with the project's libraries and screen captures.
- **Stack reading:** `tools/stack-import/hcgs-stack.js` (`HCGS.read`, `HCGS.hcgsRows`) and `tools/stack-import/explore.js` (block lister and hex dump).

Corrections and additions are welcome. If you have a real IIGS and can confirm or refute anything marked 🔶 or ❓, please open an issue.
