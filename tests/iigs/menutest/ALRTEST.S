*-------------------------------------------------------
* ALRTEST -- how does the IIGS draw alerts (AlertWindow)?
*
* Runs as System:Start (like MENUTEST). Starts the same
* tools as CTLTEST, then for each alert string in Alerts
* arms a heartbeat task and calls AlertWindow. 60 ticks
* later the task copies the screen (*/SHRA, */SHRB ...) and
* posts a Return key-down event, which presses the default
* button, so AlertWindow returns. The button numbers and
* error codes go to */ALRLOG. No input needed.
*-------------------------------------------------------
         xc
         xc
         mx    %00
         rel

Tool     =     $E10000
GSOS     =     $E100A8
NWIN     =     9

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

* --- each alert ---
         stz   HBCnt
         lda   Bank
         pha
         pea   HBHdr
         ldx   #$1203         ; SetHeartBeat
         jsl   Tool
         jsr   Log            ; 21
         stz   WinN
WinLp    lda   WinN
         asl
         asl
         jsr   NewBuf
         lda   WinN
         asl
         tax
         lda   Alerts,x
         sta   CurW
         pha                  ; result: button number
         pea   0              ; flags: C strings, alert string by pointer
         pea   0
         pea   0              ; no substitution array
         lda   Bank
         pha
         lda   CurW
         pha
         lda   #60
         sta   HBCnt          ; arm the capture
         ldx   #$590E         ; AlertWindow
         jsl   Tool
         jsr   Log            ; 22 + 2n
         pla
         jsr   Log            ; 23 + 2n: the button
         inc   WinN
         lda   WinN
         cmp   #NWIN
         beq   :wdone
         brl   WinLp
:wdone
         lda   Bank
         pha
         pea   HBHdr
         ldx   #$1303         ; DelHeartBeat
         jsl   Tool

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

* heartbeat task (native mode, 8-bit m and x): copy the
* screen, then post a Return key-down event
HBHdr    adrl  0
HBCnt    dw    0
         hex   5AA5
HBTask   php
         phb
         rep   #$30
         phk
         plb
         jsr   CopySHR
         pha                  ; result space
         pea   3              ; keyDown
         pea   0              ; modifiers
         pea   $000D          ; Return
         ldx   #$1406         ; PostEvent
         jsl   Tool
         pla
         plb
         plp
         rtl

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
Alerts   da    A1,A2,A3,A4,A5,A6,A7,A8,A9
A1       asc   '10/Size 1, no icon./^#0',00
A2       asc   '22/Size 2 with the stop icon and a longer message./^#0',00
A3       asc   '33/Size 3 with the note icon, and a message that should wrap over more than one line./#1/^#0',00
A4       asc   '44/Size 4 with the caution icon. This message is long enough to wrap onto several lines in the window./#2/#3/^#4',00
A5       asc   '55/Size 5 with the disk icon./^#6',00
A6       asc   '66/Size 6 with the disk swap icon, and a little more text./#5/^#0',00
A7       asc   '70/Size 7, no icon, three buttons./A/^Bb/Ccc',00
A8       asc   '82/Size 8, stop./^OK',00
A9       asc   '93/Size 9, note./^#0',00
Buf0     ds    4*16
TeachPath dw   7
         asc   '*/TEACH'
PShr     dw    6
         asc   '*/SHRA'
PLog     dw    8
         asc   '*/ALRLOG'
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
