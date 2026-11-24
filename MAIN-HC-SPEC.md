# main.hc — HyperCard Web Stack Format

**Draft 0.1 — 2026-11-24**

A site built on this format serves `main.hc` instead of `index.html`. An **HC Browser** downloads the file and shows its cards exactly as HyperCard IIGS would, on the Super Hi-Res screen, with no page scrolling. There are three clients:

| Client | How it works |
|---|---|
| **Apple IIGS** | HyperCard IIGS itself is the browser. A *Browser stack* fetches `.hc` files over Marinetti through an HTTP XCMD, builds the cards, and installs the scripts with `set the script of`. |
| **Windows / Mac** | A HyperTalk player that emulates a 640×200 Super Hi-Res screen and scales it to the window. |

**The governing rule:** HyperCard IIGS is the reference implementation. When this spec and real HyperCard IIGS disagree, the IIGS wins and the spec is corrected.

Items marked **[TBC]** still need checking against the books or a real HyperCard IIGS. Sources are cited as *Ref* (HyperCard IIGS Reference), *TN* (HCGS tech notes) and *SLG* (the HyperCard IIGS Script Language Guide, not yet in hand).

---

## 1. Goals and non-goals

**Goals**
- One file looks and behaves the same on a real IIGS, on Windows and on a Mac.
- It is plain text that you can write in Notepad or on the IIGS.
- Pictures, sounds and icons are stored in IIGS-native formats, so the IIGS loads them directly and the PC clients draw the same bytes.
- The browser can save files to the user's computer, under the rules in §9.

**Non-goals (for now)**
- Reading or writing binary HyperCard IIGS stack files. An import tool can come later.
- HTML, CSS or any web-page behavior.
- XCMDs or XFCNs downloaded from the web (see §9.3).

---

## 2. The display model

| Property | Value |
|---|---|
| Screen mode | Super Hi-Res, **640 mode**, 640 × 200 pixels |
| Card size | Full screen, 640 × 200 **[TBC: confirm the exact pixel size on a real HC IIGS]** |
| Menu bar | Drawn **over** the top of the card, not beside it. *Getting Started* (the puzzle stack) says you must hide the menu bar to see the whole card. Shown by default; the user toggles it with ⌘-Space. Scripts can hide or show it. |
| Scrolling | **None.** The card *is* the window. Scrolling fields (§6.3) scroll only inside their own rectangle. |
| Colors | 16 at a time, from a **color set** (§5) |
| Coordinates | Integer pixels, origin at the top-left of the card. A rectangle is `left,top,right,bottom`, as in HyperTalk. |

### 2.1 How PC clients must render
1. Keep a 640 × 200 **indexed** frame buffer and draw everything into it: pictures, buttons, fields, text, menus, dialogs and the pointer.
2. Map pixels to colors **the way the IIGS hardware does in 640 mode.** Each pixel is 2 bits, and its column selects one of four groups of four palette entries (`entry = (x mod 4) × 4 + value`). HyperCard IIGS builds its colors by dithering, and the result only looks right if this rule is followed exactly.
3. Scale the buffer to the window with **nearest-neighbor** scaling only. Offer two modes:
   - **True aspect:** stretch to 4:3, as a real monitor shows it.
   - **Sharp pixels:** scale by whole numbers, for example 2×5 to 1280 × 1000.
4. Letterbox inside larger windows and full-screen. The browser never reflows or scrolls the card.

### 2.2 Text
- Text is drawn with **bitmap fonts at IIGS sizes**, so lines wrap at exactly the same characters on every client.
- The default font is **Shaston 8**. *Ref* notes that the preset for Paint text is 8-point plain Shaston.
- The client ships a fixed font set **[TBC: the list of fonts that came with IIGS System 6 and HyperCard IIGS]**. Any font a stack names that the client lacks falls back to Shaston 8.
- If the browser is distributed publicly, ship redrawn lookalike fonts, not Apple's.

---

## 3. The file

| Property | Rule |
|---|---|
| Extension | `.hc` |
| Character set | **Mac OS Roman**, the native IIGS character set. Writers should stay within 7-bit ASCII where they can. |
| Line endings | Readers accept CR, LF or CRLF. Writers emit CR, as the IIGS does. |
| MIME type | `text/x-hc` |
| First line | `#hc 1`, which is the magic word plus the format version |

### 3.1 Structure
The file is **line-oriented**. A line that starts with `#` in column 1 opens a **section**, which runs until the next `#` line. HyperTalk never starts a line with `#`, so scripts can be embedded verbatim with no escaping.

| Section | Contains |
|---|---|
| `#stack` | Stack properties (one per file) |
| `#background <id>` | One background |
| `#card <id>` | One card, in stack order |
| `#button <id>` | A button belonging to the most recent background or card |
| `#field <id>` | A field belonging to the most recent background or card |
| `#script` | The script of the object most recently opened |
| `#text` | The text of the field most recently opened |
| `#bgtext <field-id>` | On a card: that card's contents for the background field `<field-id>` |
| `#resource <type> <id>` | A declaration of an external picture, icon or sound file (§7) |
| `#end` | Optional. Ends the file; anything after it is ignored. |

Inside a property section, each line is `name: value`. Names are case-insensitive. Blank lines and lines starting with `--` are ignored.

Inside `#text` and `#bgtext`, every line is content. A content line that would itself start with `#` is written with a doubled `##`, and the reader strips one `#`.

### 3.2 IDs and order
- IDs are positive integers. They are unique per object type within a stack, as in HyperCard.
- The **order of sections is the stacking order.** Cards are numbered in file order. Buttons and fields take part numbers in the order they appear under their card or background, from back to front.

---

## 4. Objects and properties

These properties mirror HyperTalk property names, so a script can `get` and `set` them under the same names. Everything below comes from *Ref* ch. 2–6 unless marked otherwise.

### 4.1 Stack
| Property | Value |
|---|---|
| `name` | The stack name |
| `colors` | A color set (§5) |
| `userLevel` | The highest level the visitor may use: 1 Browsing, 2 Typing, 3 Painting, 4 Authoring, 5 Scripting. Default 2. |
| `cantModify` | true/false. Web stacks act as if true unless §9.2 applies. |
| `cantPeek` | true/false |

### 4.2 Background
| Property | Value |
|---|---|
| `name` | Text |
| `colors` | A color set; overrides the stack's set for its cards |
| `picture` | The resource id of the background picture (§7) |
| `showPict` | true/false |
| `dontSearch` | true/false |
| `cantDelete` | true/false |

### 4.3 Card
| Property | Value |
|---|---|
| `name` | Text |
| `background` | A background id. It must be declared earlier in the file. |
| `colors` | A color set; overrides the background's set |
| `picture` | The resource id of the card picture |
| `showPict` | true/false |
| `marked` | true/false |
| `dontSearch` | true/false |
| `cantDelete` | true/false |

### 4.4 Button
| Property | Value |
|---|---|
| `name` | Text |
| `rect` | `left,top,right,bottom` |
| `style` | `transparent` · `opaque` · `rectangle` · `shadow` · `roundRect` · `checkBox` · `radioButton` |
| `showName` | true/false |
| `autoHilite` | true/false |
| `sharedHilite` | true/false (background buttons only) |
| `hilite` | true/false |
| `family` | 0 for none, or 1–15 **[TBC: confirm the IIGS family range]**. Buttons in one family highlight as a group (*Ref* p. 189). |
| `icon` | A resource id, or 0 for no icon |
| `textFont`, `textSize`, `textStyle`, `textAlign` | As in HyperTalk |
| `visible` | true/false |
| `colors` | **[TBC: which parts of a button the Colors... dialog sets]** |

### 4.5 Field
| Property | Value |
|---|---|
| `name` | Text |
| `rect` | `left,top,right,bottom` |
| `style` | `transparent` · `opaque` · `rectangle` · `shadow` · `scrolling` |
| `lockText`, `showLines`, `wideMargins`, `autoTab`, `dontWrap`, `dontSearch`, `fixedLineHeight` | true/false |
| `sharedText` | true/false (background fields only) |
| `scroll` | The scroll position in pixels (scrolling fields only) |
| `textFont`, `textSize`, `textStyle`, `textAlign`, `textHeight` | As in HyperTalk |
| `visible` | true/false |
| `colors` | **[TBC]** |

**Text styles inside field text** (style runs) are **[TBC]**. Draft 0.1 supports one style per field.

**Limits** come from the 32K text model of HyperCard: no more than 30,000 characters per field or per script **[TBC: the exact IIGS limits from SLG]**.

---

## 5. Color sets

The color set determines the 16 colors available at each level (*Ref* ch. 6, pp. 272–278). They inherit from the top down: **stack → background → card**, and the nearest one wins.

```
colors: system                    -- one of the built-in sets
colors: gray
colors: custom 0000 0777 0841 072C 000F 0080 0F70 0D00 0FA9 0FF0 00E0 04DF 0DAF 078F 0CCC 0FFF
```

- Built-in names: `system`, `gray`, and three more **[TBC: names and values from Ref pp. 95 and 272–278]**.
- A `custom` set is 16 IIGS color words written `0RGB`, 4 bits per channel, in palette order.
- *Ref* says a card or background can import one extra set. The `custom` form covers that.

---

## 6. Behavior notes

### 6.1 Layers
Each card draws in this order:
1. The background picture.
2. Background buttons and fields.
3. The card picture.
4. Card buttons and fields.

Transparent buttons and fields let lower layers show through (*Ref* Fig. 4-40 and 5-14).

### 6.2 Messages and scripts
- Messages travel along the HyperTalk path: button or field → card → background → stack → Browser (the client's built-in handlers).
- The command vocabulary is **HyperCard IIGS HyperTalk**. Until the SLG is in hand, the Mac HyperCard 1.2.5 language is the stand-in; *Ref* says Mac 1.2.5 books largely apply to the IIGS.
- The corrections in TN.HCGS.001 apply.

### 6.3 Scrolling fields
These are the only scrolling allowed on a card. The scroll bar is drawn into the 640 × 200 frame buffer like everything else.

### 6.4 Sound
- `play "name"` plays a sampled sound resource (§7).
- Following TN.HCGS.003, a sample is assumed to be recorded at **26.32 kHz** and to sound **261.63 Hz (middle C)** at normal pitch. Notes are pitched relative to that.

---

## 7. Resources

Resources are separate files on the server, declared once per stack:

```
#resource picture 1
file: art/title.shr
mask: art/title.msk
#resource icon 200
file: icons/house.ico
#resource sound 1
file: sounds/chime.snd
name: chime
```

| Type | File format |
|---|---|
| `picture` | **`.shr`**: an unpacked Super Hi-Res screen ($C1/$0000, 32,768 bytes): pixel data, SCBs and 16 palettes, exactly as in IIGS memory. Packed `.pnt` (Apple Preferred, $C0/$0002) is also accepted. |
| picture `mask` | Optional. **`.msk`**: 1 bit per pixel, 640 × 200 = 16,000 bytes; a 1 bit means opaque. A card picture without a mask is fully opaque. **[TBC: how HC IIGS decides card-picture transparency. Match it.]** |
| `icon` | **`.ico`**: 32 × 32 **[TBC: confirm the IIGS icon size and depth]** |
| `sound` | **`.snd`**: raw 8-bit unsigned samples at 26,320 Hz (§6.4) |

**Picture palettes:** the color set in force wins (§5). A `.shr` file's own palettes are used only when the picture's resource line says `palette: own`.

Paths are relative to the `.hc` file's own URL.

---

## 8. Navigation between stacks

- `go to stack "games.hc"` resolves relative to the current stack's URL.
- `go to stack "http://example.com/main.hc"` opens another site.
- `go home` goes to the current site's `main.hc`.
- `go to card 3 of stack "games.hc"` and `go to card "Scores" of stack ...` work as in HyperTalk.
- The Browser keeps the HyperCard *Recent* list and the back/forward history (`go back`, `go recent`) across stacks and sites.

---

## 9. Security and saving files

### 9.1 Saving files (the "save locally" feature)
Scripts use the ordinary HyperTalk file commands: `open file`, `read from file`, `write to file`, `close file`.

- A **bare file name** is confined to a **per-site folder** on the user's machine:
  - IIGS: `/HCB/SITES/<host>/`
  - Windows/Mac: `HC Browser\Sites\<host>\` in the user's documents
- Paths that try to leave that folder (`..`, a volume name, an absolute path) are refused.
- To save **anywhere else**, the script must use `ask file` (or the equivalent dialog). The user then picks the location in a real save dialog, which is the user's consent.
- Writes use the Mac OS Roman encoding on every client.

### 9.2 Changes to the stack itself
- A web stack is read-only on the server. Typed field text and other changes last for the visit.
- If the stack sets `keepChanges: true` in `#stack`, the Browser saves a local copy of the changes in the site folder and replays it on the next visit **[TBC: the exact change-file format]**.

### 9.3 Externals
- **Downloaded stacks cannot load XCMDs or XFCNs.** Native code from a website could do anything to the computer.
- Each client offers a fixed built-in set that behaves the same everywhere (for example `hcbVersion()`). The IIGS Browser stack's own XCMDs (HTTP fetch and friends) belong to the Browser, not to the sites.

---

## 10. Serving

- Plain **HTTP must be available** on every site, because the IIGS cannot do modern TLS. HTTPS can run alongside it for the PC clients.
- Responses must carry `Content-Length`. Use HTTP/1.0-compatible responses, so the IIGS fetcher can be simple.
- nginx:

```
index main.hc;
types { text/x-hc hc; application/octet-stream shr msk ico snd; }
```

### 10.1 Size guidance for the IIGS
- Keep `main.hc` under about **64 KB** and each linked stack similarly small. Split big sites into several stacks.
- Each `.shr` picture is 32 KB. Share background pictures across cards.

---

## 11. Example

```
#hc 1
#stack
name: Example Home
colors: system
userLevel: 2
#script
on openStack
  hide message box
end openStack
#background 1
name: Main
picture: 1
#button 1
name: Next
rect: 560,170,620,190
style: roundRect
showName: true
#script
on mouseUp
  go next card
end mouseUp
#field 1
name: Title
rect: 20,20,620,40
style: transparent
textFont: Shaston
textSize: 16
#card 1
background: 1
#bgtext 1
Welcome to the Example Home stack
#field 2
name: Notes
rect: 20,60,620,160
style: scrolling
#text
Type notes here. Use the Save button to keep them.
#button 2
name: Save
rect: 480,170,550,190
style: roundRect
showName: true
#script
on mouseUp
  open file "notes.txt"
  write card field "Notes" to file "notes.txt"
  close file "notes.txt"
  answer "Saved."
end mouseUp
#card 2
background: 1
#bgtext 1
Second card
#resource picture 1
file: art/main-bg.shr
#end
```

---

## 12. Open questions

1. **Card size:** confirm 640 × 200 on a real HC IIGS. (The menu bar overlaying the card is settled; see §2.)
2. **Card picture transparency:** how does HC IIGS decide which card-picture pixels let the background show through?
3. **Built-in color sets:** the names and the exact 16 values of each.
4. **Button and field colors:** which parts the Colors... dialog controls.
5. **Style runs inside field text:** syntax, if they are needed.
6. **The full IIGS HyperTalk vocabulary and its differences from Mac 1.2.5:** this needs the SLG. Meanwhile, use TN.HCGS.001 together with the Mac guides.
7. **The font set** each client must ship.
8. **Whether the IIGS Browser stack can create objects at full speed** with `doMenu "New Button"` and `set`, or needs an XCMD that builds a whole card at once.
