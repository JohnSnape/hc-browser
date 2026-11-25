Rsrc.Editor -- an Apple IIGS resource editor in HyperCard IIGS

Needs HyperCard IIGS 1.1 and System 6.

Open the stack Rsrc.Editor in HyperCard. On the Home card choose the
file whose resource fork you want to edit: click a folder to open it,
a file to choose it, or use Pathname... or This Stack. Then go to the
card for the kind of resource.

Icons: pick an icon in the list (or New...), choose a value (0 to 3)
or Clear, and click or drag in the grid. Each value shows two colors,
because in 640 mode a pixel's column picks its palette group. Save
writes the icon back; Save As... gives it a new ID and a name.

Cursors: the same, plus Invert (inverts what is under the pointer)
and Hot (click the pixel that is the pointer's position).

Sounds: see the waveform, change the sample rate, pitch and channel
(Pitch for Note works out the pitch from the note the sound plays),
import a sound from another file, name, delete, play.

Version: type the version, stage, region, name and info line; Save.

Fonts: pick a font file (System:Fonts at first, or Folder...), a
character, then paint its pixels with Ink or Paper and change its
width; Save writes the font file.

Patterns: choose another stack on the Home card, click one of its 16
patterns, paint, Save. (HyperTalk: set pattern to 17 to 32.)

Changes go straight into the chosen file, so work on a copy of
anything precious.

The XFCN "rsrc" that does the work lives in the stack's resource
fork. Copy the stack with its resource fork (the Finder does), or it
cannot read or write anything.

Source and documentation (MIT license):
https://github.com/JohnSnape/hc-browser  (iigs/resource-editor)
