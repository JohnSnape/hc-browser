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
| STAK | +$200 | **The stack's 16 paint patterns**, 32 bytes each (§7) | ✅ |
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
| `$10` / `$11` | copy the row **1** / **2** above (no data) | ✅ |
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

`tools/export-art/export.js` exports every icon (`$8001` and `$CA`), cursor (`$8027`, drawn with the OR/XOR rule, plus a hot-spot copy), sound, paint pattern, menu bar and menu (drawn as above, plus text and JSON listings) and font (`$C8`, as a labeled glyph grid) on a set of disk images, with an `index.html` and a CSV. Given a ROM 03 image, it also exports Shaston 8 and uses it and the ROM's Apple logo for the menus. Run on the stock System 6.0.4 disks, it gave 181 icons, 10 cursors (with HyperCard's 4), 54 sounds, 2,704 patterns, 4 menu bars with 48 menus, and 74 fonts (with Shaston 8 from ROM; `SystemTools1` adds Shaston 16, Geneva 10–24 and Venice 12/14). The output is Apple's artwork and stays out of this repository.

---

## How to reproduce

- **Program tests** (`tests/iigs/drawicon`): a Merlin32 S16 program installed as `System:Start` on a copy of System.Disk 6.0.4 runs with no input, then saves the screen to a file on its own disk. `prodos-raw.js` reads the file back.
- **Menu and system-font tests** (`tests/iigs/menutest`): the same kind of program, on a copy of the HyperCard hard-disk image (more free space) with the program under test copied to the root as `TEACH`. It writes `SHR0`…`SHRn` and `SHASTON8`. `check-font.js` and `check-menus.js` compare them with `lib/font.js` and `lib/menu.js`.
- **HyperCard tests:** a copy of the HyperCard IIGS hard-disk image gets the System folder, with HyperCard as `System:Start` and Home beside it. A HyperTalk startup script does the work, and a passive window capture is checked with `find-icons.js`.
- **Stack reading:** `tools/stack-import/hcgs-stack.js` (`HCGS.read`, `HCGS.hcgsRows`) and `tools/stack-import/explore.js` (block lister and hex dump).

Corrections and additions are welcome. If you have a real IIGS and can confirm or refute anything marked 🔶 or ❓, please open an issue.
