*-------------------------------------------------------
* ICONTEST -- how does QuickDraw II Auxiliary's DrawIcon
* put 4-bit icon pixels on the 640-mode screen?
*
* Runs as System:Start on a GS/OS boot disk (no Finder).
* Starts the tools, clears the screen to white in 640
* mode, draws test icons at known places, then saves the
* whole Super Hi-Res buffer ($E1/2000-9FFF, 32K) to the
* file */SHRDUMP and hangs. The host reads SHRDUMP back
* out of the disk image and decodes the pixels.
*
* Icons drawn (x,y):
*  A  color, opaque mask      at 100,20 101,30 102,40 103,50
*  B  color, checker mask     at 100,70
*  C  black & white, opaque   at 100,90
*  A  with displayMode $0001 (selected)            at 100,110
*-------------------------------------------------------
         xc
         xc
         mx    %00
         rel

Tool     =     $E10000
GSOS     =     $E100A8

Start    phk
         plb
         sta   MyID           ; GS/OS passes our user ID in A

         ldx   #$0201         ; TLStartUp
         jsl   Tool
         pha
         ldx   #$0202         ; MMStartUp -> user ID
         jsl   Tool
         pla
         sta   MyID
         ldx   #$0203         ; MTStartUp
         jsl   Tool

* three pages of bank-0 memory for QuickDraw's direct page
         pha
         pha                  ; result: handle
         pea   0
         pea   $0300          ; size
         lda   MyID
         pha
         pea   $C015          ; locked, fixed, page-aligned, bank 0
         pea   0
         pea   0              ; location (unused)
         ldx   #$0902         ; NewHandle
         jsl   Tool
         pla
         sta   0
         pla
         sta   2
         lda   [0]            ; handle -> pointer (low word = DP)
         sta   QDDP

         lda   QDDP
         pha                  ; dPageAddr
         pea   $0080          ; master SCB: 640 mode
         pea   160            ; max width in bytes
         lda   MyID
         pha
         ldx   #$0204         ; QDStartUp
         jsl   Tool

         pea   $0012          ; tool 18 = QuickDraw II Auxiliary
         pea   $0000          ; any version
         ldx   #$0F01         ; LoadOneTool
         jsl   Tool
         sta   LoadErr
         ldx   #$0212         ; QDAuxStartUp (function 2 = StartUp; $0112 is BootInit)
         jsl   Tool

         jsr   LogErr         ; 0: QDAuxStartUp
         pea   $FFFF          ; every pixel = 3 (white)
         ldx   #$1504         ; ClearScreen
         jsl   Tool

* sanity check: a solid black rectangle at 10,10-30,20
         pea   0              ; pixel value 0
         ldx   #$3704         ; SetSolidPenPat
         jsl   Tool
         jsr   LogErr         ; 1: SetSolidPenPat
         phk
         phk
         pla
         and   #$00FF
         pha
         pea   TestRect
         ldx   #$5404         ; PaintRect
         jsl   Tool
         jsr   LogErr         ; 2: PaintRect

* QDAux version, for the record
         pha
         ldx   #$0412         ; QDAuxVersion
         jsl   Tool
         pla
         sta   AuxVer

* our bank, for 24-bit pointers to the icon records
         phk
         phk
         pla
         and   #$00FF
         sta   Bank

         ldy   #IconA
         lda   #0
         ldx   #100
         jsr   Draw20
         ldy   #IconA         ; tool calls don't preserve Y: reload every time
         lda   #0
         ldx   #101
         jsr   Draw30
         ldy   #IconA
         lda   #0
         ldx   #102
         jsr   Draw40
         ldy   #IconA
         lda   #0
         ldx   #103
         jsr   Draw50

         ldy   #IconB
         lda   #0
         ldx   #100
         jsr   Draw70
         ldy   #IconC
         lda   #0
         ldx   #100
         jsr   Draw90
         ldy   #IconA
         lda   #1
         ldx   #100
         jsr   Draw110

* save the screen: Create, Open, Write, Close
         jsl   GSOS
         da    $2001
         adrl  CreatePB
         jsl   GSOS
         da    $2010
         adrl  OpenPB
         lda   OpenRef
         sta   WriteRef
         sta   CloseRef
         jsl   GSOS
         da    $2013
         adrl  WritePB
         jsl   GSOS
         da    $2014
         adrl  ClosePB
         jsr   LogErr

* second file: the error log (64 bytes)
         jsl   GSOS
         da    $2001
         adrl  CreatePB2
         jsl   GSOS
         da    $2010
         adrl  OpenPB2
         lda   OpenRef2
         sta   WriteRef2
         sta   CloseRef2
         jsl   GSOS
         da    $2013
         adrl  WritePB2
         jsl   GSOS
         da    $2014
         adrl  ClosePB2
         jsl   GSOS           ; Flush all, so the directory entries reach the disk
         da    $2015
         adrl  FlushPB

Hang     bra   Hang

* append A (the call's error code) to the log
LogErr   php
         ldx   ErrN
         sta   Errs,x
         inx
         inx
         stx   ErrN
         plp
         rts

* Draw icon Y (offset in our bank) with displayMode A at x = X
Draw20   pha
         lda   #20
         bra   DrawY
Draw30   pha
         lda   #30
         bra   DrawY
Draw40   pha
         lda   #40
         bra   DrawY
Draw50   pha
         lda   #50
         bra   DrawY
Draw70   pha
         lda   #70
         bra   DrawY
Draw90   pha
         lda   #90
         bra   DrawY
Draw110  pha
         lda   #110
DrawY    sta   Ypos
         stx   Xpos
         pla
         sta   Mode
         sty   Ptr
         lda   Bank
         pha                  ; iconPtr high
         lda   Ptr
         pha                  ; iconPtr low
         lda   Mode
         pha                  ; displayMode
         lda   Xpos
         pha
         lda   Ypos
         pha
         ldx   #$0B12         ; DrawIcon
         jsl   Tool
         jsr   LogErr         ; 3..9: DrawIcon calls
         rts

MyID     dw    0
QDDP     dw    0
Bank     dw    0
Ptr      dw    0
Mode     dw    0
Xpos     dw    0
Ypos     dw    0

* GS/OS parameter blocks
CreatePB dw    3
         adrl  Path
         dw    $00C3          ; access
         dw    $0006          ; file type BIN
OpenPB   dw    2
OpenRef  dw    0
         adrl  Path
WritePB  dw    4
WriteRef dw    0
         adrl  $00E12000      ; the Super Hi-Res buffer
         adrl  $00008000      ; 32768 bytes
         adrl  0
ClosePB  dw    1
CloseRef dw    0
Path     dw    9
         asc   '*/SHRDUMP'

CreatePB2 dw   3
         adrl  Path2
         dw    $00C3
         dw    $0006
OpenPB2  dw    2
OpenRef2 dw    0
         adrl  Path2
WritePB2 dw    4
WriteRef2 dw   0
         adrl  Errs
         adrl  64
         adrl  0
ClosePB2 dw    1
CloseRef2 dw   0
FlushPB  dw    1
         dw    0              ; refNum 0 = all open files
Path2    dw    9
         asc   '*/ICONERR'

TestRect dw    10,10,20,30    ; top, left, bottom, right

* log layout (words): 0 QDAuxStartUp, 1 SetSolidPenPat, 2 PaintRect,
* 3..9 DrawIcon x7, 10 Close; then LoadErr at +56, AuxVer at +58
ErrN     dw    0
Errs     ds    56
LoadErr  dw    0
AuxVer   dw    0

* Icon records (Toolbox Ref. vol. 2, Fig. 17-1):
* type, size, height, width, image, mask.
* 16 x 4 pixels, rows of 1+(16-1)/2 = 8 bytes, 32 bytes each.
IconA    dw    $8000          ; color
         dw    32
         dw    4
         dw    16
         hex   0123456789ABCDEF   ; nibbles 0..F left to right
         hex   FEDCBA9876543210   ; F..0
         hex   1111111111111111   ; all 1
         hex   2222222222222222   ; all 2
         hex   FFFFFFFFFFFFFFFF   ; mask: all opaque
         hex   FFFFFFFFFFFFFFFF
         hex   FFFFFFFFFFFFFFFF
         hex   FFFFFFFFFFFFFFFF

IconB    dw    $8000
         dw    32
         dw    4
         dw    16
         hex   0123456789ABCDEF
         hex   0123456789ABCDEF
         hex   0123456789ABCDEF
         hex   0123456789ABCDEF
         hex   F0F0F0F0F0F0F0F0   ; mask: even pixels opaque
         hex   0F0F0F0F0F0F0F0F   ; odd pixels opaque
         hex   FF00FF00FF00FF00   ; pairs
         hex   00000000FFFFFFFF   ; right half

IconC    dw    $0000          ; black & white
         dw    32
         dw    4
         dw    16
         hex   0123456789ABCDEF
         hex   FEDCBA9876543210
         hex   1111111111111111
         hex   2222222222222222
         hex   FFFFFFFFFFFFFFFF
         hex   FFFFFFFFFFFFFFFF
         hex   FFFFFFFFFFFFFFFF
         hex   FFFFFFFFFFFFFFFF
