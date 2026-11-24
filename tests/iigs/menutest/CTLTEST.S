*-------------------------------------------------------
* CTLTEST -- how does the IIGS draw controls?
*
* Runs as System:Start (like MENUTEST), with a program
* that has window templates (rWindParam1 $800E) copied to
* the root directory as TEACH. For each window ID in
* WinIDs it calls NewWindow2 (which also makes the
* window's controls from its rControlList), ShowWindow,
* erases the content, DrawControls, copies the screen,
* and closes the window. The copies go to */SHRA, */SHRB
* ... and a log (error codes, window pointers) to
* */CTLLOG. check-controls.js compares them with
* lib/control.js. No input needed.
* For another program, change NWIN and WinIDs.
*-------------------------------------------------------
         xc
         xc
         mx    %00
         rel

Tool     =     $E10000
GSOS     =     $E100A8
NWIN     =     12

Start    phk
         plb
         sta   MyID
         phk
         phk
         pla
         and   #$00FF
         sta   Bank
         ldx   #$0201         ; TLStartUp
         jsl   Tool
         pha
         ldx   #$0202         ; MMStartUp
         jsl   Tool
         pla
         sta   MyID
         ldx   #$0203         ; MTStartUp
         jsl   Tool
         ldx   #$020B         ; IMStartUp
         jsl   Tool

* nine pages of bank-0 direct page:
* QD 0-2, EM 3, Ctl 4, Menu 5, LE 6, FM 7, TE 8
         pha
         pha
         pea   0
         pea   $0900
         lda   MyID
         pha
         pea   $C015
         pea   0
         pea   0
         ldx   #$0902         ; NewHandle
         jsl   Tool
         pla
         sta   0
         pla
         sta   2
         lda   [0]
         sta   DPBase

         ldy   #0
LoadLp   lda   Tools,y
         beq   :done
         phy
         pha
         pea   0
         ldx   #$0F01         ; LoadOneTool
         jsl   Tool
         jsr   Log            ; 0..8
         ply
         iny
         iny
         bra   LoadLp
:done

         lda   DPBase
         pha
         pea   $0080          ; 640 mode
         pea   160
         lda   MyID
         pha
         ldx   #$0204         ; QDStartUp
         jsl   Tool
         jsr   Log            ; 9
         lda   #$0300
         jsr   DPAt
         pha
         pea   20
         pea   0
         pea   639
         pea   0
         pea   199
         lda   MyID
         pha
         ldx   #$0206         ; EMStartUp
         jsl   Tool
         jsr   Log            ; 10
         ldx   #$0212         ; QDAuxStartUp
         jsl   Tool
         jsr   Log            ; 11
         lda   MyID
         pha
         ldx   #$020E         ; WindStartUp
         jsl   Tool
         jsr   Log            ; 12
         lda   MyID
         pha
         lda   #$0400
         jsr   DPAt
         pha
         ldx   #$0210         ; CtlStartUp
         jsl   Tool
         jsr   Log            ; 13
         lda   MyID
         pha
         lda   #$0600
         jsr   DPAt
         pha
         ldx   #$0214         ; LEStartUp
         jsl   Tool
         jsr   Log            ; 14
         lda   MyID
         pha
         lda   #$0500
         jsr   DPAt
         pha
         ldx   #$020F         ; MenuStartUp
         jsl   Tool
         jsr   Log            ; 15
         lda   MyID
         pha
         lda   #$0700
         jsr   DPAt
         pha
         ldx   #$021B         ; FMStartUp
         jsl   Tool
         jsr   Log            ; 16
         ldx   #$021C         ; ListStartUp
         jsl   Tool
         jsr   Log            ; 17
         lda   MyID
         pha
         lda   #$0800
         jsr   DPAt
         pha
         ldx   #$0222         ; TEStartUp
         jsl   Tool
         jsr   Log            ; 18
         lda   MyID
         pha
         ldx   #$021E         ; ResourceStartUp
         jsl   Tool
         jsr   Log            ; 19

         pha                  ; OpenResourceFile -> file ID
         pea   1
         pea   0
         pea   0
         lda   Bank
         pha
         pea   TeachPath
         ldx   #$0A1E
         jsl   Tool
         jsr   Log            ; 20
         pla

         pea   $FFFF
         ldx   #$1504         ; ClearScreen (white)
         jsl   Tool

* --- each window ---
         stz   WinN
WinLp    lda   WinN
         asl
         asl
         jsr   NewBuf
         lda   WinN
         asl
         asl
         tax
         lda   WinIDs+2,x
         sta   CurW+2
         lda   WinIDs,x
         sta   CurW
         pha
         pha                  ; result: window pointer
         pea   0
         pea   0              ; titlePtr
         pea   0
         pea   0              ; refCon
         pea   0
         pea   0              ; contentDraw
         pea   0
         pea   0              ; defProc
         pea   2              ; template by resource ID
         lda   CurW+2
         pha
         lda   CurW
         pha
         pea   $800E
         ldx   #$610E         ; NewWindow2
         jsl   Tool
         jsr   Log            ; 21 + 4n
         pla
         sta   Win
         pla
         sta   Win+2
         lda   WinN
         asl
         asl
         tax
         lda   Win
         sta   WinPtrs,x
         lda   Win+2
         sta   WinPtrs+2,x
         lda   Win
         ora   Win+2
         bne   :ok
         jsr   CopySHR        ; keep the buffer slot in step
         bra   :next
:ok      lda   Win+2
         pha
         lda   Win
         pha
         ldx   #$130E         ; ShowWindow
         jsl   Tool
         lda   Win+2
         pha
         lda   Win
         pha
         ldx   #$1B04         ; SetPort
         jsl   Tool
         lda   Bank
         pha
         pea   PRect
         ldx   #$2004         ; GetPortRect
         jsl   Tool
         lda   Bank
         pha
         pea   PRect
         ldx   #$5504         ; EraseRect
         jsl   Tool
         lda   Win+2
         pha
         lda   Win
         pha
         ldx   #$1010         ; DrawControls
         jsl   Tool
         jsr   Log            ; 22 + 4n
         jsr   CopySHR
         lda   Win+2
         pha
         lda   Win
         pha
         ldx   #$0B0E         ; CloseWindow
         jsl   Tool
         jsr   Log            ; 23 + 4n
:next    inc   WinN
         lda   WinN
         cmp   #NWIN
         beq   :wdone
         brl   WinLp
:wdone

* --- write the files ---
         stz   FileN
FileLp   lda   FileN
         asl
         asl
         tax
         lda   Buf0,x
         sta   WBuf
         lda   Buf0+2,x
         sta   WBuf+2
         lda   #$8000
         sta   WLen
         stz   WLen+2
         lda   FileN
         clc
         adc   #'A'
         sep   #$20
         sta   PShr+7         ; */SHRA ...
         rep   #$20
         lda   #PShr
         sta   PathLo
         jsr   WriteF
         inc   FileN
         lda   FileN
         cmp   #NWIN
         bne   FileLp
         lda   #PLog
         sta   PathLo
         lda   #Errs
         sta   WBuf
         lda   Bank
         sta   WBuf+2
         lda   #LogEnd-Errs
         sta   WLen
         stz   WLen+2
         jsr   WriteF
         jsl   GSOS
         da    $2015
         adrl  FlushPB
Hang     bra   Hang

* A = offset of a direct page in our block -> its address
DPAt     clc
         adc   DPBase
         rts

* allocate a 32K buffer, store its pointer at Buf0+A
NewBuf   sta   BufSlot
         pha
         pha
         pea   0
         pea   $8000
         lda   MyID
         pha
         pea   $C01C          ; locked, fixed, no bank cross, page aligned
         pea   0
         pea   0
         ldx   #$0902
         jsl   Tool
         pla
         sta   0
         pla
         sta   2
         lda   [0]
         ldx   BufSlot
         sta   Buf0,x
         sta   SMDst+1
         ldy   #2
         lda   [0],y
         sta   Buf0+2,x
         sep   #$20
         sta   SMDst+3
         rep   #$20
         rts

* copy $E1/2000..9FFF to the current buffer (self-modified)
CopySHR  ldx   #0
:l       ldal  $E12000,x
SMDst    stal  $000000,x
         inx
         inx
         cpx   #$8000
         bne   :l
         rts

* write WBuf/WLen to the path at PathLo (in our bank)
WriteF   lda   PathLo
         sta   CrPath
         sta   OpPath
         lda   Bank
         sta   CrPath+2
         sta   OpPath+2
         jsl   GSOS
         da    $2001
         adrl  CreatePB
         jsl   GSOS
         da    $2010
         adrl  OpenPB
         lda   OpenRef
         sta   WriteRef
         sta   CloseRef
         lda   WBuf
         sta   WrBuf
         lda   WBuf+2
         sta   WrBuf+2
         lda   WLen
         sta   WrLen
         lda   WLen+2
         sta   WrLen+2
         jsl   GSOS
         da    $2013
         adrl  WritePB
         jsr   Log
         jsl   GSOS
         da    $2014
         adrl  ClosePB
         rts

Log      php
         ldx   ErrN
         cpx   #200
         bcs   :x
         sta   Errs,x
         inx
         inx
         stx   ErrN
:x       plp
         rts

MyID     dw    0
DPBase   dw    0
Bank     dw    0
WinN     dw    0
FileN    dw    0
BufSlot  dw    0
PathLo   dw    0
CurW     adrl  0
Win      adrl  0
WBuf     adrl  0
WLen     adrl  0
PRect    ds    8
* tools to load: Window, Control, Menu, QDAux, LineEdit,
* Font Manager, List Manager, TextEdit, Integer Math
Tools    dw    $0E,$10,$0F,$12,$14,$1B,$1C,$22,$0B,0
WinIDs   adrl  $5,$6,$8,$9,$B,$C,$D,$E,$F,$11,$13,$3E7
Buf0     ds    4*16
TeachPath dw   7
         asc   '*/TEACH'
PShr     dw    6
         asc   '*/SHRA'
PLog     dw    8
         asc   '*/CTLLOG'
CreatePB dw    3
CrPath   adrl  0
         dw    $00C3
         dw    $0006
OpenPB   dw    2
OpenRef  dw    0
OpPath   adrl  0
WritePB  dw    4
WriteRef dw    0
WrBuf    adrl  0
WrLen    adrl  0
         adrl  0
ClosePB  dw    1
CloseRef dw    0
FlushPB  dw    1
         dw    0
* log: 200 bytes of error codes in call order, then the
* window pointers (long each)
ErrN     dw    0
Errs     ds    200
WinPtrs  ds    4*16
LogEnd
