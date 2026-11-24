*-------------------------------------------------------
* MENUTEST -- how does the IIGS draw menus, and what is
* the ROM system font?
*
* Runs as System:Start on a GS/OS boot disk (no Finder),
* with a copy of a program that has rMenuBar 1 (Teach)
* in the root directory as TEACH.
*
* 1. Starts QuickDraw II (640 mode), the Event, Window,
*    Control, Menu and Resource Managers.
* 2. Clears the screen, draws every character code in
*    eight rows of 32 (pen x 10, baselines 104 + 12*row)
*    with the current font, logs GetFont/GetSysFont (both
*    $FC/DD1B, a master pointer in ROM) and writes the
*    2,176-byte font record it points to as */SHASTON8.
* 3. Builds TEACH's menu bar 1 with NewMenuBar2, draws
*    it, and copies the screen (buffer 0).
* 4. For each menu in the bar: calls MenuSelect with a
*    mouse-down event on its title. (The Menu Manager
*    reads the mouse itself, not through the Button,
*    StillDown or GetMouse calls, and waits for a mouse-up
*    event in the queue; PosMouse did not move the
*    pointer it uses, which sat over the Apple menu's
*    first item.) A heartbeat (VBL) task fires 90 ticks
*    later, copies the screen with the menu down (buffers
*    1..n) and posts a mouse-up event, so MenuSelect
*    returns.
* 5. Writes the copies as */SHR0 .. */SHRn and a log as
*    */MENULOG, flushes, and hangs.
* No mouse or keyboard input is needed. For another
* program, change NMENUS and MenuIDs (its menuIDs).
* check-font.js and check-menus.js compare the dumps.
*-------------------------------------------------------
         xc
         xc
         mx    %00
         rel

Tool     =     $E10000
GSOS     =     $E100A8
NMENUS   =     6
HBTICKS  =     90             ; capture 1.5 s into MenuSelect

Start    phk
         plb
         sta   MyID
         ldx   #$0201         ; TLStartUp
         jsl   Tool
         pha
         ldx   #$0202         ; MMStartUp
         jsl   Tool
         pla
         sta   MyID
         ldx   #$0203         ; MTStartUp
         jsl   Tool

* seven pages of bank-0 direct page: QD 3, EM 1, Ctl 1, Menu 1
         pha
         pha
         pea   0
         pea   $0700
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

* load the RAM tools (newest on the disk)
         pea   $000E          ; Window Manager
         pea   0
         ldx   #$0F01
         jsl   Tool
         jsr   Log            ; 0
         pea   $0010          ; Control Manager
         pea   0
         ldx   #$0F01
         jsl   Tool
         jsr   Log            ; 1
         pea   $000F          ; Menu Manager
         pea   0
         ldx   #$0F01
         jsl   Tool
         jsr   Log            ; 2
         pea   $0012          ; QuickDraw II Auxiliary
         pea   0
         ldx   #$0F01
         jsl   Tool
         jsr   Log            ; 3

         lda   DPBase
         pha
         pea   $0080          ; 640 mode
         pea   160
         lda   MyID
         pha
         ldx   #$0204         ; QDStartUp
         jsl   Tool
         jsr   Log            ; 4

         lda   DPBase
         clc
         adc   #$0300
         pha                  ; dPageAddr
         pea   20             ; queue size
         pea   0
         pea   639
         pea   0
         pea   199
         lda   MyID
         pha
         ldx   #$0206         ; EMStartUp
         jsl   Tool
         jsr   Log            ; 5

         ldx   #$0212         ; QDAuxStartUp
         jsl   Tool
         jsr   Log            ; 6

         lda   MyID
         pha
         ldx   #$020E         ; WindStartUp
         jsl   Tool
         jsr   Log            ; 7

         lda   MyID
         pha
         lda   DPBase
         clc
         adc   #$0400
         pha
         ldx   #$0210         ; CtlStartUp
         jsl   Tool
         jsr   Log            ; 8

         lda   MyID
         pha
         lda   DPBase
         clc
         adc   #$0500
         pha
         ldx   #$020F         ; MenuStartUp
         jsl   Tool
         jsr   Log            ; 9

         lda   MyID
         pha
         ldx   #$021E         ; ResourceStartUp
         jsl   Tool
         jsr   Log            ; 10

* --- open TEACH's resource fork ---
         pha                  ; result: file ID
         pea   1              ; read access
         pea   0
         pea   0              ; map address (none)
         phk
         phk
         pla
         and   #$00FF
         sta   Bank
         pha
         pea   TeachPath
         ldx   #$0A1E         ; OpenResourceFile
         jsl   Tool
         jsr   Log            ; 11
         pla
         sta   ResFile

* --- screen: white, then the character rows ---
         pea   $FFFF
         ldx   #$1504         ; ClearScreen
         jsl   Tool
         pea   0
         ldx   #$A004         ; SetForeColor 0 (black)
         jsl   Tool
         pea   3
         ldx   #$A204         ; SetBackColor 3 (white)
         jsl   Tool
         stz   Row
RowLoop  lda   Row
         asl
         asl
         asl
         asl
         asl                  ; *32 = first code
         sta   Code
         sep   #$20
         lda   #32
         sta   Str
         ldx   #0
CharLp   lda   Code
         sta   Str+1,x
         inc   Code
         inx
         cpx   #32
         bne   CharLp
         rep   #$20
         pea   10             ; h
         lda   Row
         asl
         asl
         sta   Tmp
         asl
         clc
         adc   Tmp            ; Row*12
         adc   #104           ; baseline
         pha                  ; v
         ldx   #$3A04         ; MoveTo(h, v)
         jsl   Tool
         lda   Bank
         pha
         pea   Str
         ldx   #$A504         ; DrawString
         jsl   Tool
         inc   Row
         lda   Row
         cmp   #8
         bne   RowLoop

* --- the system font, as its handle holds it ---
         pha
         pha
         ldx   #$9504         ; GetFont (after drawing text)
         jsl   Tool
         pla
         sta   FontH
         pla
         sta   FontH+2
         pha
         pha
         ldx   #$B304         ; GetSysFont
         jsl   Tool
         pla
         sta   SysFontH
         pla
         sta   SysFontH+2
* The handle is a master pointer in ROM ($FC/DD1B), so the
* Memory Manager knows no size for it: write the record's
* own length (header 14 + Mac record 26 + strike 1104 +
* locTable 516 + owTable 516 = 2,176 bytes).
         lda   #2176
         sta   FontLen
         stz   FontLen+2
         lda   FontH
         sta   0
         lda   FontH+2
         sta   2
         lda   [0]
         sta   FontPtr
         ldy   #2
         lda   [0],y
         sta   FontPtr+2

* --- the menu bar ---
         pha
         pha                  ; result: menu bar handle
         pea   2              ; refDesc: resource ID
         pea   0
         pea   1              ; rMenuBar 1
         pea   0
         pea   0              ; windowPtr NIL: system bar
         ldx   #$430F         ; NewMenuBar2
         jsl   Tool
         jsr   Log            ; 12
         pla
         sta   BarH
         pla
         sta   BarH+2
         lda   BarH+2
         pha
         lda   BarH
         pha
         ldx   #$120F         ; SetSysBar
         jsl   Tool
         jsr   Log            ; 13
         pea   0
         pea   0
         ldx   #$390F         ; SetMenuBar(NIL)
         jsl   Tool
         jsr   Log            ; 14
         pha
         ldx   #$130F         ; FixMenuBar -> height
         jsl   Tool
         jsr   Log            ; 15
         pla
         sta   BarHt
         ldx   #$2A0F         ; DrawMenuBar
         jsl   Tool
         jsr   Log            ; 16
         pha
         ldx   #$1A0F         ; GetMTitleStart
         jsl   Tool
         pla
         sta   TitleX
         sta   TStart

         lda   #0
         jsr   NewBuf
         jsr   CopySHR

* --- pull down each menu ---
         stz   HBCnt          ; inactive until armed
         lda   Bank
         pha
         pea   HBHdr
         ldx   #$1203         ; SetHeartBeat
         jsl   Tool
         jsr   Log            ; 18
         stz   MenuN
MenuLp   lda   MenuN
         asl
         tax
         lda   MenuIDs,x
         sta   CurID
         pha                  ; result space
         lda   CurID
         pha
         ldx   #$1E0F         ; GetMTitleWidth(menuID)
         jsl   Tool
         pla
         sta   TitleW
         lda   MenuN
         asl
         tax
         lda   TitleW
         sta   Widths,x
         lda   TitleW
         lsr
         clc
         adc   TitleX
         sta   MouseH
         lda   #5
         sta   MouseV
         lda   TitleX
         clc
         adc   TitleW
         sta   TitleX

         lda   MenuN
         inc
         asl
         asl
         jsr   NewBuf         ; buffer MenuN+1 -> DstPtr

         stz   CntMouse
         stz   CntBtn
         stz   Fired
         stz   EvRec+$10      ; wmTaskData
         stz   EvRec+$12
         lda   #1
         sta   EvRec          ; mouseDown
         lda   MouseV
         sta   EvRec+10
         lda   MouseH
         sta   EvRec+12

         lda   Bank
         pha
         pea   EvRec
         pea   0
         pea   0              ; system bar
         lda   MouseH         ; the real pointer on the title too
         pha
         lda   MouseV
         pha
         ldx   #$1E03         ; PosMouse(x, y)
         jsl   Tool
         lda   #HBTICKS
         sta   HBCnt          ; arm the capture
         ldx   #$2B0F         ; MenuSelect
         jsl   Tool
         jsr   Log            ; 20 + 3*n

         lda   MenuN
         asl
         tax
         lda   CntMouse
         sta   Counts,x
         lda   CntBtn
         sta   BCounts,x
         lda   Fired
         sta   FCounts,x
         lda   EvRec+$10
         sta   Results,x
         pea   0
         lda   CurID
         pha
         ldx   #$2C0F         ; HiliteMenu(FALSE, menuID)
         jsl   Tool
         ldx   #$2A0F         ; DrawMenuBar again
         jsl   Tool

         inc   MenuN
         lda   MenuN
         cmp   #NMENUS
         beq   :done
         brl   MenuLp
:done

         lda   Bank
         pha
         pea   HBHdr
         ldx   #$1303         ; DelHeartBeat
         jsl   Tool

* --- write the files ---
         lda   #PFont
         sta   PathLo
         lda   FontPtr
         sta   WBuf
         lda   FontPtr+2
         sta   WBuf+2
         lda   FontLen
         sta   WLen
         lda   FontLen+2
         sta   WLen+2
         jsr   WriteF
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
         adc   #'0'
         sep   #$20
         sta   PShr+7         ; */SHRn
         rep   #$20
         lda   #PShr
         sta   PathLo
         jsr   WriteF
         inc   FileN
         lda   FileN
         cmp   #NMENUS+1
         bne   FileLp

         lda   FontLen        ; for the log
         sta   LFontLen
         lda   FontLen+2
         sta   LFontLen+2
         lda   BarHt
         sta   LBarHt
         lda   TStart
         sta   LTStart
         lda   FontH
         sta   LFontH
         lda   FontH+2
         sta   LFontH+2
         lda   SysFontH
         sta   LSysH
         lda   SysFontH+2
         sta   LSysH+2
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

* heartbeat task: entered in native mode, 8-bit m and x
HBHdr    adrl  0
HBCnt    dw    0
         hex   5AA5
HBTask   php
         phb
         rep   #$30
         phk
         plb
         jsr   CopySHR
         inc   Fired
         pha                  ; result space
         pea   2              ; mouseUp
         pea   $0080          ; modifiers: button 0 up
         pea   0              ; button 0
         ldx   #$1406         ; PostEvent
         jsl   Tool
         sta   PostErr
         pla
         plb
         plp
         rtl

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
         cpx   #120
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
FontH    adrl  0
SysFontH adrl  0
FontLen  adrl  0
FontPtr  adrl  0
ResFile  dw    0
BarH     adrl  0
BarHt    dw    0
TitleX   dw    0
TStart   dw    0
TitleW   dw    0
MouseV   dw    0
MouseH   dw    0
CurID    dw    0
MenuN    dw    0
CntMouse dw    0
CntBtn   dw    0
Fired    dw    0
Row      dw    0
Code     dw    0
Tmp      dw    0
FileN    dw    0
BufSlot  dw    0
PathLo   dw    0
WBuf     adrl  0
WLen     adrl  0
MenuIDs  dw    $0901,$0902,$0903,$0904,$0905,$0906
Buf0     ds    28
Str      ds    34
EvRec    ds    32
TeachPath dw   7
         asc   '*/TEACH'
PFont    dw    10
         asc   '*/SHASTON8'
PShr     dw    6
         asc   '*/SHR0'
PLog     dw    9
         asc   '*/MENULOG'
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
* log: 120 bytes of error codes in call order, then facts
ErrN     dw    0
Errs     ds    120
LFontLen adrl  0
LBarHt   dw    0
LTStart  dw    0
LFontH   adrl  0
LSysH    adrl  0
Widths   ds    12
Counts   ds    12
BCounts  ds    12
FCounts  ds    12
Results  ds    12
PostErr  dw    0
LogEnd
