Rsrc.Editor -- an Apple IIGS resource editor in HyperCard IIGS

Needs HyperCard IIGS 1.1 and System 6.

Open the stack Rsrc.Editor in HyperCard. On the Index card choose the
file whose resource fork you want to edit: click a folder to open it,
a file to choose it, or use Pathname... or This Stack. Then go to the
card for the kind of resource.

Icons card: pick an icon in the list (or New...), choose a value
(0 to 3) or Clear, and click or drag in the grid. Each value shows
two colors, because in 640 mode a pixel's column picks its palette
group. Save writes the icon back; Save As... gives it a new ID and
a name. Changes go straight into the chosen file, so work on a copy
of anything precious.

The XFCN "rsrc" that does the work lives in the stack's resource
fork. Copy the stack with its resource fork (the Finder does), or it
cannot read or write anything.

Source and documentation (MIT license):
https://github.com/JohnSnape/hc-browser  (iigs/resource-editor)
