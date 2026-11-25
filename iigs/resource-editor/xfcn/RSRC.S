*-------------------------------------------------------
* RSRC -- an XFCN for HyperCard IIGS 1.1 that gives
* HyperTalk the IIGS Resource Manager, plain files and
* a few fast helpers for pixel grids.
*
*   put rsrc(op, arg2, arg3, ...) into result
*
* Every answer is text. An answer that starts with
* "ERR " is an error, followed by a message and,
* for toolbox and GS/OS errors, the error code.
* Numbers may be decimal (30001) or hex ($8001).
* Binary data travels as hex text, two digits per byte,
* in file order.
*
* Resource ops. FILE is a pathname, or empty for the
* current stack's own resource fork:
*   list,FILE,TYPE         lines "id,size,name"
*   get,FILE,TYPE,ID       hex of the resource
*   put,FILE,TYPE,ID,HEX[,ATTR]   replace or add; "OK"
*   delete,FILE,TYPE,ID    remove it and its name; "OK"
*   name,FILE,TYPE,ID[,NEW]  get or set its name
*   create,FILE            give FILE a resource fork
*
* File ops (data fork):
*   readfile,PATH[,OFFSET,LENGTH]   hex
*   writefile,PATH,HEX[,OFFSET]     patch at OFFSET, or
*   writefile,PATH,HEX,,TYPE,AUX    replace whole file
*                                   (made if missing)
*   readtext,PATH          the file as text
*   writetext,PATH,TEXT    replace or make a TXT file
*   dir,PATH               lines "name,type,aux" (hex)
*   patchstak,PATH,OFFSET,HEX  patch a stack's STAK
*                          block below $600 and fix its
*                          checksum (STAK +$0C)
*
* Hex and grid helpers:
*   peek,HEX,OFFSET,SIZE   unsigned little-endian value
*   poke,HEX,OFFSET,SIZE,VALUE   new hex
*   zeros,N                N zero bytes as hex
*   hex2text,HEX[,OFFSET,LENGTH]  bytes as characters
*   text2hex,TEXT          characters as hex
*   bits,HEX,OFFSET,ROWBYTES,ROWS,FIRSTPIX,NPIX,BPP
*                          one line of digits per row
*   setbits,HEX,OFFSET,ROWBYTES,ROWS,FIRSTPIX,BPP,DIGITS
*                          new hex
*   merge,IMAGE,MASK,MODE  display grid (MODE icon or
*                          cursor; "." clear, "x" invert)
*   split,GRID,MODE        image lines, then mask lines
*   draw,GRID,LEFT,TOP,CELLW,CELLH,MODE,FIRSTCOL
*                          paints the grid in the card
*                          window, in screen pixels
*                          (MODE c = 640 color, p = the
*                          same with "." white, m = 1
*                          bit, 1 = black). Cells of 4
*                          pixels or more get grid lines.
*   drawicon,HEX,X,Y[,MODE]  DrawIcon of an icon record
*   wave,HEX,OFFSET,COUNT,LEFT,TOP,WIDTH,HEIGHT
*                          draws 8-bit samples
*   postkey,CODE           posts a key-down event
*   version                "RSRC 1.0"
*
* Calling rules (HyperCard IIGS 1.1 ERS and the XCMD
* article): full native mode, one 4-byte parameter
* (the XCMDBlock pointer) on the stack, data bank =
* our bank, callbacks by JSL $E10220 with X = number.
* XCMDBlock: paramCount(2) params(16x4) returnValue(4)
* passFlag(2) userID(2) returnStat(2) (offsets match
* Apple's E16.HyperXCMD). The answer's handle belongs
* to HyperCard's memory ID; HyperCard disposes it.
*
* Build: Merlin32 -V . RSRC.LNK.S (one OMF segment, entry
* at the first byte). Install as resource $801F, ID 1,
* attributes $0800, named "rsrc" in rResName.
*-------------------------------------------------------
         xc
         xc
         mx    %00
         rel

Tool     =     $E10000
GSOS     =     $E100B0        ; stack-based GS/OS entry
HCB      =     $E10220        ; HyperCard callbacks

* our direct page, made on the stack
PB       =     $00            ; XCMDBlock pointer
OUTH     =     $04            ; result handle
OUTP     =     $08            ; result write pointer
SRC      =     $0C
DST      =     $10
NUM      =     $14
T2       =     $18
TYPE     =     $1C
RID      =     $1E            ; 4
FID      =     $22
OLDF     =     $24
OLDD     =     $26
OPENED   =     $28
CNT      =     $2A            ; 4
IDX      =     $2E            ; 4
HND      =     $32            ; 4
LEN      =     $36            ; 4
LEFT     =     $3A
TOP      =     $3C
CW       =     $3E
CH       =     $40
MODE     =     $42
COL      =     $44
ROW      =     $46
BPP      =     $48
ROWB     =     $4A
ROWS     =     $4C
FPIX     =     $4E
NPIX     =     $50
OFFS     =     $52            ; 4
MODF     =     $56
T3       =     $58            ; 4
SRC2     =     $5C            ; 4
BANK     =     $60
REFN     =     $62
TERR     =     $64
HLEN     =     $66            ; 4: hex text length
OB       =     $6A            ; 4: start of result text
T4       =     $6E            ; 4
NEG      =     $72
DIGP     =     $74            ; 4: digits being read
APPID    =     $78            ; HyperCard's memory ID
NH       =     $7A            ; 4: rResName handle
NP       =     $7E            ; 4
NE       =     $82            ; 4
NCNT     =     $86            ; 4
NSZ      =     $8A            ; 4
EOFF     =     $8E            ; 4
ESZ      =     $92
NESZ     =     $94
NNEW     =     $96            ; 4
AH       =     $9A            ; 4: argument handle (GetArg)
LOCSZ    =     $9E
PARAM    =     LOCSZ+6

*-------------------------------------------------------
Entry    phb
         phd
         phk
         plb
         tsc
         sec
         sbc   #LOCSZ
         tcs
         inc
         tcd
         lda   PARAM
         sta   PB
         lda   PARAM+2
         sta   PB+2
         phk
         phk
         pla
         and   #$00FF
         sta   BANK
         stz   MODF
         stz   OPENED
         stz   OUTH
         stz   OUTH+2
         pha
         ldx   #$141E         ; GetCurResourceApp
         jsl   Tool
         pla
         sta   APPID
         jsr   Main
         lda   OUTH           ; hand the answer over unlocked
         ora   OUTH+2
         beq   :x
         pei   OUTH+2
         pei   OUTH
         ldx   #$2202         ; HUnlock
         jsl   Tool
:x
         tsc
         clc
         adc   #LOCSZ
         tcs
         pld
         plb
         lda   2,s            ; slide the RTL address over
         sta   6,s            ; the 4-byte parameter
         lda   1,s
         sta   5,s
         pla
         pla
         rtl

*-------------------------------------------------------
* Main: find the op named by argument 1 and run it
Main     lda   [PB]
         beq   :none
         bpl   :have
:none    lda   #MsgNoOp
         jmp   ErrMsg
:have    lda   #1
         jsr   GetArg
         ldy   #0
:cp      lda   [SRC],y
         and   #$00FF
         cmp   #$41
         blt   :st
         cmp   #$5B
         bge   :st
         ora   #$20
:st      sep   #$20
         sta   OPBUF,y
         rep   #$20
         cmp   #0
         beq   :cpd
         iny
         cpy   #15
         blt   :cp
         sep   #$20
         lda   #0
         sta   OPBUF,y
         rep   #$20
:cpd     ldx   #0
:look    lda   OPTAB,x
         beq   :bad
         sta   T2
         ldy   #0
:cmp     lda   (T2),y
         and   #$00FF
         sta   T3
         lda   OPBUF,y
         and   #$00FF
         cmp   T3
         bne   :next
         cmp   #0
         beq   :found
         iny
         bra   :cmp
:next    inx
         inx
         inx
         inx
         bra   :look
:found   jmp   (OPTAB+2,x)
:bad     lda   #MsgBadOp
         jmp   ErrMsg

*-------------------------------------------------------
* GetArg: A = argument number (1-based). SRC -> its
* C string (handle locked). Carry set if missing
* (SRC -> an empty string).
GetArg   sta   T2
         lda   [PB]
         cmp   T2
         blt   :miss
         lda   T2
         dec
         asl
         asl
         clc
         adc   #2
         tay
         lda   [PB],y
         sta   AH
         iny
         iny
         lda   [PB],y
         sta   AH+2
         ora   AH
         beq   :miss
         pei   AH+2
         pei   AH
         ldx   #$2002         ; HLock
         jsl   Tool
         lda   [AH]
         sta   SRC
         ldy   #2
         lda   [AH],y
         sta   SRC+2
         clc
         rts
:miss    lda   #Empty
         sta   SRC
         lda   BANK
         sta   SRC+2
         sec
         rts

* ArgNum: A = argument number -> NUM. Carry set (NUM 0)
* if missing or empty.
ArgNum   jsr   GetArg
         bcs   :z
         lda   [SRC]
         and   #$00FF
         beq   :z
         jsr   ParseNum
         clc
         rts
:z       stz   NUM
         stz   NUM+2
         sec
         rts

* ParseNum: [SRC] -> NUM. Decimal, -decimal or $hex.
ParseNum stz   NUM
         stz   NUM+2
         stz   NEG
         ldy   #0
:sp      lda   [SRC],y
         and   #$00FF
         cmp   #$20
         bne   :s1
         iny
         bra   :sp
:s1      cmp   #$2D           ; -
         bne   :s2
         inc   NEG
         iny
         lda   [SRC],y
         and   #$00FF
:s2      cmp   #$24           ; $
         beq   :hex
:dec     lda   [SRC],y
         and   #$00FF
         sec
         sbc   #$30
         bcc   :done
         cmp   #10
         bge   :done
         pha
         lda   NUM
         sta   T2
         lda   NUM+2
         sta   T2+2
         asl   NUM
         rol   NUM+2
         asl   NUM
         rol   NUM+2
         clc
         lda   NUM
         adc   T2
         sta   NUM
         lda   NUM+2
         adc   T2+2
         sta   NUM+2
         asl   NUM
         rol   NUM+2
         pla
         clc
         adc   NUM
         sta   NUM
         lda   NUM+2
         adc   #0
         sta   NUM+2
         iny
         bra   :dec
:hex     iny
:hl      lda   [SRC],y
         and   #$00FF
         jsr   HexVal
         bcs   :done
         ldx   #4
:sh      asl   NUM
         rol   NUM+2
         dex
         bne   :sh
         ora   NUM
         sta   NUM
         iny
         bra   :hl
:done    lda   NEG
         beq   :r
         lda   NUM
         eor   #$FFFF
         clc
         adc   #1
         sta   NUM
         lda   NUM+2
         eor   #$FFFF
         adc   #0
         sta   NUM+2
:r       rts

* HexVal: A = character -> A = 0-15, carry clear;
* carry set if not a hex digit.
HexVal   cmp   #$30
         blt   :no
         cmp   #$3A
         blt   :dig
         ora   #$20
         cmp   #$61
         blt   :no
         cmp   #$67
         bge   :no
         sec
         sbc   #$57
         clc
         rts
:dig     sec
         sbc   #$30
         clc
         rts
:no      sec
         rts

* StrLen: length of the C string at SRC -> LEN (long)
StrLen   lda   SRC
         sta   T3
         lda   SRC+2
         sta   T3+2
         stz   LEN
         stz   LEN+2
:l       lda   [T3]
         and   #$00FF
         beq   :r
         inc   LEN
         bne   :i
         inc   LEN+2
:i       inc   T3
         bne   :l
         inc   T3+2
         bra   :l
:r       rts

*-------------------------------------------------------
* Output. NewOut: LEN = bytes; makes the result handle.
* Carry set if no memory (nothing is returned then).
* HyperCard IIGS keeps the answer's handle itself (a
* script set from an answer made under the XFCN's own
* user ID broke once the XFCN returned), so the handle
* belongs to HyperCard's memory ID.
NewOut   pha
         pha
         pei   LEN+2
         pei   LEN
         pei   APPID
         pea   $8000          ; locked
         pea   0
         pea   0
         ldx   #$0902         ; NewHandle
         jsl   Tool
         sta   TERR
         pla
         sta   OUTH
         pla
         sta   OUTH+2
         lda   TERR
         bne   :fail
         lda   [OUTH]
         sta   OUTP
         sta   OB
         ldy   #2
         lda   [OUTH],y
         sta   OUTP+2
         sta   OB+2
         ldy   #66
         lda   OUTH
         sta   [PB],y
         iny
         iny
         lda   OUTH+2
         sta   [PB],y
         clc
         rts
:fail    stz   OUTH
         stz   OUTH+2
         sec
         rts

PutC     sep   #$20
         sta   [OUTP]
         rep   #$20
         inc   OUTP
         bne   :r
         inc   OUTP+2
:r       rts

* PutStr: X = address of a C string in our bank
PutStr   stx   T4
         ldy   #0
:l       lda   (T4),y
         and   #$00FF
         beq   :r
         phy
         jsr   PutC
         ply
         iny
         bra   :l
:r       rts

PutHex8  and   #$00FF
         pha
         lsr
         lsr
         lsr
         lsr
         jsr   PutNib
         pla
         and   #$000F
PutNib   cmp   #10
         blt   :d
         adc   #6             ; carry set: +7
:d       adc   #$30
         jmp   PutC

* PutDec: NUM, unsigned, in decimal
PutDec   lda   NUM
         sta   T3
         lda   NUM+2
         sta   T3+2
         ldx   #0
:div     lda   #0
         ldy   #32
:bit     asl   T3
         rol   T3+2
         rol
         cmp   #10
         blt   :nb
         sbc   #10
         inc   T3
:nb      dey
         bne   :bit
         pha
         inx
         lda   T3
         ora   T3+2
         bne   :div
:out     pla
         clc
         adc   #$30
         jsr   PutC
         dex
         bne   :out
         rts

* PutOK: the answer "OK"
PutOK    lda   #3
         sta   LEN
         stz   LEN+2
         jsr   NewOut
         bcs   :r
         ldx   #TxtOK
         jsr   PutStr
         lda   #0
         jsr   PutC
:r       rts

* Errors. ErrMsg: A = message. ErrCode: X = message,
* A = error code. Replaces any answer already started.
ErrMsg   sta   ERRM
         stz   ERRF
         bra   Err0
ErrCode  stx   ERRM
         sta   ERRC
         lda   #1
         sta   ERRF
Err0     lda   OUTH
         ora   OUTH+2
         beq   :new
         pei   OUTH+2
         pei   OUTH
         ldx   #$1002         ; DisposeHandle
         jsl   Tool
:new     lda   #96
         sta   LEN
         stz   LEN+2
         jsr   NewOut
         bcs   :r
         ldx   #TxtErr
         jsr   PutStr
         ldx   ERRM
         jsr   PutStr
         lda   ERRF
         beq   :z
         lda   #$20
         jsr   PutC
         lda   #$24
         jsr   PutC
         lda   ERRC
         xba
         jsr   PutHex8
         lda   ERRC
         jsr   PutHex8
:z       lda   #0
         jsr   PutC
:r       rts

*-------------------------------------------------------
* MakePath: C string at SRC -> GS/OS string in PATHBUF.
MakePath ldy   #0
:l       lda   [SRC],y
         and   #$00FF
         beq   :e
         sep   #$20
         sta   PATHBUF+2,y
         rep   #$20
         iny
         cpy   #250
         blt   :l
:e       sty   PATHBUF
         rts

* UseFile: argument 2 names the file ("" = current
* stack). Opens it if needed, makes it current with
* search depth 1. Carry set = failed (error answered).
UseFile  stz   OPENED
         pha
         ldx   #$121E         ; GetCurResourceFile
         jsl   Tool
         pla
         sta   OLDF
         lda   #2
         jsr   GetArg
         lda   [SRC]
         and   #$00FF
         bne   :path
         lda   OLDF
         sta   FID
         bra   :set
:path    jsr   MakePath
         pha                  ; fileID
         pea   3              ; read/write
         pea   0
         pea   0              ; no map in memory
         pei   BANK
         pea   PATHBUF
         ldx   #$0A1E         ; OpenResourceFile
         jsl   Tool
         sta   TERR
         pla
         sta   FID
         lda   TERR
         beq   :opened
         ldx   #MsgOpen
         jsr   ErrCode
         sec
         rts
:opened  lda   #1
         sta   OPENED
:set     pei   FID
         ldx   #$111E         ; SetCurResourceFile
         jsl   Tool
         pha
         pea   1
         ldx   #$251E         ; SetResourceFileDepth
         jsl   Tool
         pla
         sta   OLDD
         clc
         rts

* DoneFile: undo UseFile, writing changes.
DoneFile pha
         pei   OLDD
         ldx   #$251E
         jsl   Tool
         pla
         lda   MODF
         beq   :nm
         pei   FID
         ldx   #$0D1E         ; UpdateResourceFile
         jsl   Tool
* A fork HyperCard keeps open (the current stack) also
* needs a GS/OS Flush: without it the directory entry
* kept the old end of file, and data written past it was
* lost when the machine was switched off.
         pha
         pei   FID
         ldx   #$1F1E         ; GetOpenFileRefNum
         jsl   Tool
         pla
         sta   CLSREF
         lda   #$2015         ; Flush
         ldx   #CLSPB
         jsr   GSCall
:nm      pei   OLDF
         ldx   #$111E
         jsl   Tool
         lda   OPENED
         beq   :r
         pei   FID
         ldx   #$0B1E         ; CloseResourceFile
         jsl   Tool
:r       rts

* GetTypeId: argument 3 -> TYPE, argument 4 -> RID
GetTypeId lda  #3
         jsr   ArgNum
         lda   NUM
         sta   TYPE
         lda   #4
         jsr   ArgNum
         lda   NUM
         sta   RID
         lda   NUM+2
         sta   RID+2
         rts

* PutName: the Pascal string in NAMEBUF
PutName  lda   NAMEBUF
         and   #$00FF
         beq   :r
         sta   T3
         ldx   #0
:l       lda   NAMEBUF+1,x
         phx
         jsr   PutC
         plx
         inx
         cpx   T3
         blt   :l
:r       rts

* Resource names live in rResName ($8014, ID $0001xxxx
* for type $xxxx): version word, count long, then per
* name: ID long + Pascal string. The XFCN reads and
* writes the table itself. (HyperCard's GetResourceName
* and SetResourceName callbacks only reached the
* current stack, and a name set by the callback was
* never written to disk.)
*
* LoadNames: the table for TYPE in the current file ->
* NH, NP, NSZ. Carry set if there is none.
LoadNames pha
         pha
         pea   $8014
         pea   $0001
         pei   TYPE
         ldx   #$0E1E         ; LoadResource
         jsl   Tool
         sta   TERR
         pla
         sta   NH
         pla
         sta   NH+2
         lda   TERR
         beq   :ok
         sec
         rts
:ok      pha
         pha
         pei   NH+2
         pei   NH
         ldx   #$1802         ; GetHandleSize
         jsl   Tool
         pla
         sta   NSZ
         pla
         sta   NSZ+2
         lda   [NH]
         sta   NP
         ldy   #2
         lda   [NH],y
         sta   NP+2
         clc
         rts

* FindEnt: look for RID in the table at NP. Carry clear
* if found: EOFF = its offset, ESZ = its size, NE -> it.
* Not found: carry set, EOFF = NSZ, ESZ = 0.
FindEnt  ldy   #2
         lda   [NP],y
         sta   NCNT
         ldy   #4
         lda   [NP],y
         sta   NCNT+2
         lda   #6
         sta   EOFF
         stz   EOFF+2
:l       lda   NCNT
         ora   NCNT+2
         beq   :no
         lda   NP
         clc
         adc   EOFF
         sta   NE
         lda   NP+2
         adc   EOFF+2
         sta   NE+2
         ldy   #4
         lda   [NE],y
         and   #$00FF
         clc
         adc   #5
         sta   ESZ
         lda   [NE]
         cmp   RID
         bne   :next
         ldy   #2
         lda   [NE],y
         cmp   RID+2
         bne   :next
         clc
         rts
:next    lda   EOFF
         clc
         adc   ESZ
         sta   EOFF
         lda   EOFF+2
         adc   #0
         sta   EOFF+2
         lda   NCNT
         bne   :d
         dec   NCNT+2
:d       dec   NCNT
         bra   :l
:no      lda   NSZ
         sta   EOFF
         lda   NSZ+2
         sta   EOFF+2
         stz   ESZ
         sec
         rts

* GetName: the name of TYPE/RID -> NAMEBUF (Pascal)
GetName  sep   #$20
         stz   NAMEBUF
         rep   #$20
         jsr   LoadNames
         bcs   :r
         jsr   FindEnt
         bcs   :r
         ldy   #4
:c       lda   [NE],y
         sep   #$20
         sta   NAMEBUF-4,y
         rep   #$20
         iny
         cpy   ESZ
         blt   :c
:r       rts

* Move: BlockMove T2 (long) bytes from SRC2 to DST, then
* DST += T2
Move     pei   SRC2+2
         pei   SRC2
         pei   DST+2
         pei   DST
         pei   T2+2
         pei   T2
         ldx   #$2B02         ; BlockMove
         jsl   Tool
         lda   DST
         clc
         adc   T2
         sta   DST
         lda   DST+2
         adc   T2+2
         sta   DST+2
         rts

* SetName: give TYPE/RID the name in NAMEBUF (empty =
* remove it). A name that exists is replaced where it
* stands; a new one goes at the end (as lib/rsrc.js
* does). A table left empty is removed.
SetName  stz   TERR
         jsr   LoadNames
         bcc   :have
         stz   NH
         stz   NH+2
         lda   #NoNames
         sta   NP
         lda   BANK
         sta   NP+2
         lda   #6
         sta   NSZ
         stz   NSZ+2
:have    jsr   FindEnt
         php
         lda   NAMEBUF
         and   #$00FF
         beq   :z
         clc
         adc   #5
:z       sta   NESZ
         ldy   #2
         lda   [NP],y
         sta   NCNT
         ldy   #4
         lda   [NP],y
         sta   NCNT+2
         plp
         bcc   :found
         lda   NESZ
         bne   :inc
         rts                  ; no name to remove
:inc     inc   NCNT
         bne   :sz
         inc   NCNT+2
         bra   :sz
:found   lda   NESZ
         bne   :sz
         lda   NCNT
         bne   :d1
         dec   NCNT+2
:d1      dec   NCNT
         lda   NCNT
         ora   NCNT+2
         bne   :sz
         pea   $8014          ; last name gone: no table
         pea   $0001
         pei   TYPE
         ldx   #$0F1E         ; RemoveResource
         jsl   Tool
         rts
:sz      lda   NSZ            ; LEN = NSZ - ESZ + NESZ
         sec
         sbc   ESZ
         sta   LEN
         lda   NSZ+2
         sbc   #0
         sta   LEN+2
         lda   LEN
         clc
         adc   NESZ
         sta   LEN
         lda   LEN+2
         adc   #0
         sta   LEN+2
         lda   LEN
         sta   CNT
         lda   LEN+2
         sta   CNT+2
         lda   APPID
         jsr   NewData        ; HND, DST
         bcc   :g
         rts
:g       lda   HND
         sta   NNEW
         lda   HND+2
         sta   NNEW+2
         lda   NH             ; (NewData may have moved it)
         ora   NH+2
         beq   :p1
         lda   [NH]
         sta   NP
         ldy   #2
         lda   [NH],y
         sta   NP+2
:p1      lda   NP
         sta   SRC2
         lda   NP+2
         sta   SRC2+2
         lda   EOFF
         sta   T2
         lda   EOFF+2
         sta   T2+2
         jsr   Move
         lda   NESZ
         beq   :p3
         lda   RID
         sta   [DST]
         ldy   #2
         lda   RID+2
         sta   [DST],y
         ldy   #4
         ldx   #0
:ce      lda   NAMEBUF,x
         sep   #$20
         sta   [DST],y
         rep   #$20
         inx
         iny
         cpy   NESZ
         blt   :ce
         lda   DST
         clc
         adc   NESZ
         sta   DST
         lda   DST+2
         adc   #0
         sta   DST+2
:p3      lda   NP             ; the rest, after the old entry
         clc
         adc   EOFF
         sta   SRC2
         lda   NP+2
         adc   EOFF+2
         sta   SRC2+2
         lda   SRC2
         clc
         adc   ESZ
         sta   SRC2
         lda   SRC2+2
         adc   #0
         sta   SRC2+2
         lda   NSZ
         sec
         sbc   EOFF
         sta   T2
         lda   NSZ+2
         sbc   EOFF+2
         sta   T2+2
         lda   T2
         sec
         sbc   ESZ
         sta   T2
         lda   T2+2
         sbc   #0
         sta   T2+2
         jsr   Move
         lda   [NNEW]         ; the new count
         sta   T3
         ldy   #2
         lda   [NNEW],y
         sta   T3+2
         lda   NCNT
         sta   [T3],y
         ldy   #4
         lda   NCNT+2
         sta   [T3],y
         lda   NH             ; replacing: remove the old table
         ora   NH+2
         beq   :add
         pea   $8014
         pea   $0001
         pei   TYPE
         ldx   #$0F1E         ; RemoveResource
         jsl   Tool
:add     pei   NNEW+2
         pei   NNEW
         ldx   #$2202         ; HUnlock
         jsl   Tool
         pei   NNEW+2
         pei   NNEW
         pea   0
         pea   $8014
         pea   $0001
         pei   TYPE
         ldx   #$0C1E         ; AddResource
         jsl   Tool
         sta   TERR
         rts

*-------------------------------------------------------
* list,FILE,TYPE
OpList   jsr   UseFile
         bcc   :ok
         rts
:ok      lda   #3
         jsr   ArgNum
         lda   NUM
         sta   TYPE
         pha
         pha
         pei   TYPE
         ldx   #$221E         ; CountResources
         jsl   Tool
         pla
         sta   CNT
         pla
         sta   CNT+2
* room: 288 bytes a line
         lda   #16
         sta   LEN
         stz   LEN+2
         ldx   CNT
         beq   :sz
:add     lda   LEN
         clc
         adc   #288
         sta   LEN
         lda   LEN+2
         adc   #0
         sta   LEN+2
         dex
         bne   :add
:sz      jsr   NewOut
         bcc   :go
         jmp   DoneFile
:go      lda   #1
         sta   IDX
         stz   IDX+2
:loop    lda   CNT
         beq   :end
         pha
         pha
         pei   TYPE
         pei   IDX+2
         pei   IDX
         ldx   #$231E         ; GetIndResource
         jsl   Tool
         sta   TERR
         pla
         sta   RID
         pla
         sta   RID+2
         lda   TERR
         bne   :next
         pha
         pei   TYPE
         pei   RID+2
         pei   RID
         ldx   #$151E         ; HomeResourceFile
         jsl   Tool
         pla
         cmp   FID
         bne   :next
         lda   RID
         sta   NUM
         lda   RID+2
         sta   NUM+2
         jsr   PutDec
         lda   #$2C
         jsr   PutC
         pha
         pha
         pei   TYPE
         pei   RID+2
         pei   RID
         ldx   #$1D1E         ; GetResourceSize
         jsl   Tool
         pla
         sta   NUM
         pla
         sta   NUM+2
         jsr   PutDec
         lda   #$2C
         jsr   PutC
         jsr   GetName
         jsr   PutName
         lda   #13
         jsr   PutC
:next    inc   IDX
         dec   CNT
         bra   :loop
:end     lda   #0
         jsr   PutC
:done    jmp   DoneFile

*-------------------------------------------------------
* get,FILE,TYPE,ID
OpGet    jsr   UseFile
         bcc   :ok
         rts
:ok      jsr   GetTypeId
         jsr   Load
         bcc   :ld
         ldx   #MsgLoad
         jsr   ErrCode
         jmp   DoneFile
:ld      pha
         pha
         pei   HND+2
         pei   HND
         ldx   #$1802         ; GetHandleSize
         jsl   Tool
         pla
         sta   CNT
         pla
         sta   CNT+2
         lda   CNT
         asl
         sta   LEN
         lda   CNT+2
         rol
         sta   LEN+2
         inc   LEN
         bne   :l1
         inc   LEN+2
:l1      jsr   NewOut
         bcs   :d
         ldy   #4
         lda   [HND],y        ; handle attributes
         sta   T4
         pei   HND+2
         pei   HND
         ldx   #$2002         ; HLock
         jsl   Tool
         lda   [HND]
         sta   SRC
         ldy   #2
         lda   [HND],y
         sta   SRC+2
         jsr   HexOut
         lda   #0
         jsr   PutC
         lda   T4
         bmi   :d             ; it was locked: leave it so
         pei   HND+2
         pei   HND
         ldx   #$2202         ; HUnlock
         jsl   Tool
:d       jmp   DoneFile

* Load: LoadResource(TYPE,RID) -> HND; carry set and
* A = error if it failed
Load     pha
         pha
         pei   TYPE
         pei   RID+2
         pei   RID
         ldx   #$0E1E         ; LoadResource
         jsl   Tool
         sta   TERR
         pla
         sta   HND
         pla
         sta   HND+2
         lda   TERR
         beq   :ok
         sec
         rts
:ok      clc
         rts

* HexOut: CNT bytes from SRC, as hex
HexOut   lda   CNT
         ora   CNT+2
         beq   :r
:l       lda   [SRC]
         jsr   PutHex8
         inc   SRC
         bne   :1
         inc   SRC+2
:1       lda   CNT
         bne   :2
         dec   CNT+2
:2       dec   CNT
         lda   CNT
         ora   CNT+2
         bne   :l
:r       rts

* HexIn: CNT bytes from the hex text at SRC2 to DST
HexIn    lda   CNT
         ora   CNT+2
         beq   :r
:l       lda   [SRC2]
         and   #$00FF
         jsr   HexVal
         and   #$000F
         asl
         asl
         asl
         asl
         sta   T2
         inc   SRC2
         bne   :1
         inc   SRC2+2
:1       lda   [SRC2]
         and   #$00FF
         jsr   HexVal
         and   #$000F
         ora   T2
         sep   #$20
         sta   [DST]
         rep   #$20
         inc   SRC2
         bne   :2
         inc   SRC2+2
:2       inc   DST
         bne   :3
         inc   DST+2
:3       lda   CNT
         bne   :4
         dec   CNT+2
:4       dec   CNT
         lda   CNT
         ora   CNT+2
         bne   :l
:r       rts

* HexArg: A = argument number. SRC2 -> its hex text,
* CNT = its length in bytes (characters / 2)
HexArg   jsr   GetArg
         lda   SRC
         sta   SRC2
         lda   SRC+2
         sta   SRC2+2
         jsr   StrLen
         lda   LEN
         sta   HLEN
         lda   LEN+2
         sta   HLEN+2
         lsr   LEN+2
         ror   LEN
         lda   LEN
         sta   CNT
         lda   LEN+2
         sta   CNT+2
         rts

* NewData: CNT bytes, a new locked handle -> HND, DST.
* A = owner ID. Carry set = no memory.
NewData  sta   T2
         pha
         pha
         pei   CNT+2
         pei   CNT
         pei   T2
         pea   $8000
         pea   0
         pea   0
         ldx   #$0902
         jsl   Tool
         sta   TERR
         pla
         sta   HND
         pla
         sta   HND+2
         lda   TERR
         beq   :ok
         sec
         rts
:ok      lda   [HND]
         sta   DST
         ldy   #2
         lda   [HND],y
         sta   DST+2
         clc
         rts

*-------------------------------------------------------
* put,FILE,TYPE,ID,HEX[,ATTR]
OpPut    jsr   UseFile
         bcc   :ok
         rts
:ok      jsr   GetTypeId
         lda   #5
         jsr   HexArg
         jsr   Load
         bcs   :new
* an existing resource is removed and added again with its
* attributes (changing its data in place never reached the
* disk for the current stack's own fork)
         pha
         pei   TYPE
         pei   RID+2
         pei   RID
         ldx   #$1B1E         ; GetResourceAttr
         jsl   Tool
         pla
         sta   T4
         pei   TYPE
         pei   RID+2
         pei   RID
         ldx   #$0F1E         ; RemoveResource
         jsl   Tool
         bra   :add
* a new resource, owned by HyperCard (not by us)
:new     lda   #6
         jsr   ArgNum
         lda   NUM
         sta   T4             ; attributes
:add     pha
         ldx   #$141E         ; GetCurResourceApp
         jsl   Tool
         pla
         jsr   NewData
         bcc   :got
         ldx   #MsgMem
         jsr   ErrCode
         jmp   DoneFile
:got     jsr   HexIn
         pei   HND+2
         pei   HND
         ldx   #$2202         ; HUnlock
         jsl   Tool
         pei   HND+2
         pei   HND
         pei   T4
         pei   TYPE
         pei   RID+2
         pei   RID
         ldx   #$0C1E         ; AddResource
         jsl   Tool
         bcc   :done
         ldx   #MsgAdd
         jsr   ErrCode
         jmp   DoneFile
:done    lda   #1
         sta   MODF
         jsr   PutOK
         jmp   DoneFile

*-------------------------------------------------------
* delete,FILE,TYPE,ID
OpDel    jsr   UseFile
         bcc   :ok
         rts
:ok      jsr   GetTypeId
         jsr   Load
         bcc   :there
         ldx   #MsgLoad
         jsr   ErrCode
         jmp   DoneFile
:there   sep   #$20           ; clear its name first
         stz   NAMEBUF
         rep   #$20
         jsr   SetName
         pei   TYPE
         pei   RID+2
         pei   RID
         ldx   #$0F1E         ; RemoveResource
         jsl   Tool
         bcc   :done
         ldx   #MsgDel
         jsr   ErrCode
         lda   #1
         sta   MODF
         jmp   DoneFile
:done    lda   #1
         sta   MODF
         jsr   PutOK
         jmp   DoneFile

*-------------------------------------------------------
* name,FILE,TYPE,ID[,NEW]
OpName   jsr   UseFile
         bcc   :ok
         rts
:ok      jsr   GetTypeId
         lda   [PB]
         cmp   #5
         bge   :set
         jsr   GetName
         lda   #258
         sta   LEN
         stz   LEN+2
         jsr   NewOut
         bcs   :d
         jsr   PutName
         lda   #0
         jsr   PutC
:d       jmp   DoneFile
:set     lda   #5
         jsr   GetArg
         ldy   #0
:cp      lda   [SRC],y
         and   #$00FF
         beq   :e
         sep   #$20
         sta   NAMEBUF+1,y
         rep   #$20
         iny
         cpy   #255
         blt   :cp
:e       sep   #$20
         tya
         sta   NAMEBUF
         rep   #$20
         jsr   SetName
         lda   #1
         sta   MODF
         lda   TERR
         beq   :ok2
         ldx   #MsgWrite
         jsr   ErrCode
         jmp   DoneFile
:ok2     jsr   PutOK
         jmp   DoneFile

*-------------------------------------------------------
* postkey,CODE: post a key-down event for CODE (a
* character) to the IIGS event queue, so a dialog the
* script opens next can be answered without a person
* (used while building the editor stack)
OpPost   lda   #2
         jsr   ArgNum
         pha
         pea   3              ; keyDownEvt
         pea   0
         lda   NUM
         and   #$00FF
         pha
         ldx   #$1406         ; PostEvent
         jsl   Tool
         pla
         jmp   PutOK

*-------------------------------------------------------
* create,FILE: CreateResourceFile (keeps a file that
* exists; makes a $06 BIN file otherwise)
OpCreate lda   #2
         jsr   GetArg
         jsr   MakePath
         pea   0
         pea   0              ; aux type
         pea   $06            ; file type
         pea   $C3            ; access
         pei   BANK
         pea   PATHBUF
         ldx   #$091E         ; CreateResourceFile
         jsl   Tool
         bcc   :ok
         ldx   #MsgCreate
         jmp   ErrCode
:ok      jmp   PutOK

*-------------------------------------------------------
* GS/OS. GSCall: A = call number, X = parameter block
* (our bank). Returns A = error, carry set on error.
GSCall   sta   T2
         pei   BANK
         phx
         pei   T2
         jsl   GSOS
         rts

* OpenPath: A = access. Opens PATHBUF -> REFN.
OpenPath sta   OPNACC
         lda   #PATHBUF
         sta   OPNPATH
         lda   BANK
         sta   OPNPATH+2
         lda   #$2010         ; Open
         ldx   #OPNPB
         jsr   GSCall
         bcs   :r
         lda   OPNREF
         sta   REFN
         sta   EOFREF
         sta   RWREF
         sta   MRKREF
         sta   CLSREF
         clc
:r       rts

CloseIt  lda   #$2015         ; Flush
         ldx   #CLSPB
         jsr   GSCall
         lda   #$2014         ; Close
         ldx   #CLSPB
         jmp   GSCall

* ReadIt / WriteIt: CNT bytes at DST
ReadIt   lda   #$2012
         bra   RW0
WriteIt  lda   #$2013
RW0      pha
         lda   DST
         sta   RWBUF
         lda   DST+2
         sta   RWBUF+2
         lda   CNT
         sta   RWCNT
         lda   CNT+2
         sta   RWCNT+2
         pla
         ldx   #RWPB
         jmp   GSCall

* SetMarkTo: NUM = position
SetMarkTo lda  NUM
         sta   MRKPOS
         lda   NUM+2
         sta   MRKPOS+2
         lda   #$2016         ; SetMark
         ldx   #MRKPB
         jmp   GSCall

GetEof   lda   #$2019
         ldx   #EOFPB
         jmp   GSCall

* readfile,PATH[,OFFSET,LENGTH]
OpRdFile lda   #2
         jsr   GetArg
         jsr   MakePath
         lda   #1
         jsr   OpenPath
         bcc   :o
         ldx   #MsgOpen
         jmp   ErrCode
:o       jsr   GetEof
         lda   EOFVAL
         sta   CNT
         lda   EOFVAL+2
         sta   CNT+2
         lda   #3
         jsr   ArgNum
         bcs   :all
         jsr   SetMarkTo
         lda   CNT            ; CNT = eof - offset
         sec
         sbc   NUM
         sta   CNT
         lda   CNT+2
         sbc   NUM+2
         sta   CNT+2
         bcs   :len
         stz   CNT
         stz   CNT+2
:len     lda   #4
         jsr   ArgNum
         bcs   :all
         lda   NUM+2          ; CNT = min(CNT, NUM)
         cmp   CNT+2
         bne   :c
         lda   NUM
         cmp   CNT
:c       bge   :all
         lda   NUM
         sta   CNT
         lda   NUM+2
         sta   CNT+2
:all     ldy   #72
         lda   [PB],y
         jsr   NewData
         bcc   :rd
         jsr   CloseIt
         ldx   #MsgMem
         lda   #$0201
         jmp   ErrCode
:rd      jsr   ReadIt
         jsr   CloseIt
         lda   RWXFER
         sta   CNT
         lda   RWXFER+2
         sta   CNT+2
         lda   CNT
         asl
         sta   LEN
         lda   CNT+2
         rol
         sta   LEN+2
         inc   LEN
         bne   :n
         inc   LEN+2
:n       jsr   NewOut
         bcs   :x
         lda   [HND]
         sta   SRC
         ldy   #2
         lda   [HND],y
         sta   SRC+2
         jsr   HexOut
         lda   #0
         jsr   PutC
:x       pei   HND+2
         pei   HND
         ldx   #$1002         ; DisposeHandle
         jsl   Tool
         rts

* Opens PATHBUF for writing; makes it (type T3, aux
* T4) if missing; with WHOLE set, empties it.
OpenOut  lda   #3
         jsr   OpenPath
         bcc   :have
         lda   #PATHBUF
         sta   CRPATH
         lda   BANK
         sta   CRPATH+2
         lda   T3
         sta   CRTYPE
         lda   T4
         sta   CRAUX
         lda   T4+2
         sta   CRAUX+2
         lda   #$2001         ; Create
         ldx   #CRPB
         jsr   GSCall
         bcs   :r
         lda   #3
         jsr   OpenPath
         bcs   :r
:have    lda   WHOLE
         beq   :ok
         stz   MRKPOS
         stz   MRKPOS+2
         lda   #$2018         ; SetEOF 0
         ldx   #MRKPB
         jsr   GSCall
:ok      clc
:r       rts

* writefile,PATH,HEX[,OFFSET[,TYPE,AUX]]
OpWrFile lda   #3
         jsr   HexArg
         ldy   #72
         lda   [PB],y
         jsr   NewData
         bcc   :g
         ldx   #MsgMem
         lda   #$0201
         jmp   ErrCode
:g       jsr   HexIn          ; (moves DST)
         lda   [HND]
         sta   DST
         ldy   #2
         lda   [HND],y
         sta   DST+2
         lda   #5
         jsr   ArgNum
         lda   NUM
         sta   T3
         lda   #6
         jsr   ArgNum
         lda   NUM
         sta   T4
         lda   NUM+2
         sta   T4+2
         lda   #1
         sta   WHOLE
         lda   #4
         jsr   ArgNum
         bcs   :whole
         stz   WHOLE
:whole   lda   #2
         jsr   GetArg
         jsr   MakePath
         lda   HLEN           ; CNT again (HexIn used it)
         sta   CNT
         lda   HLEN+2
         sta   CNT+2
         lsr   CNT+2
         ror   CNT
         jsr   OpenOut
         bcc   :o
         ldx   #MsgOpen
         jsr   ErrCode
         bra   :x
:o       lda   WHOLE
         bne   :w
         lda   #4
         jsr   ArgNum
         jsr   SetMarkTo
:w       jsr   WriteIt
         sta   TERR
         jsr   CloseIt
         lda   TERR
         beq   :k
         ldx   #MsgWrite
         jsr   ErrCode
         bra   :x
:k       jsr   PutOK
:x       pei   HND+2
         pei   HND
         ldx   #$1002
         jsl   Tool
         rts

* readtext,PATH
OpRdText lda   #2
         jsr   GetArg
         jsr   MakePath
         lda   #1
         jsr   OpenPath
         bcc   :o
         ldx   #MsgOpen
         jmp   ErrCode
:o       jsr   GetEof
         lda   EOFVAL
         sta   CNT
         sta   LEN
         lda   EOFVAL+2
         sta   CNT+2
         sta   LEN+2
         inc   LEN
         bne   :n
         inc   LEN+2
:n       jsr   NewOut
         bcs   :c
         lda   OUTP
         sta   DST
         lda   OUTP+2
         sta   DST+2
         jsr   ReadIt
         lda   OUTP           ; zero after what was read
         clc
         adc   RWXFER
         sta   OUTP
         lda   OUTP+2
         adc   RWXFER+2
         sta   OUTP+2
         lda   #0
         jsr   PutC
:c       jmp   CloseIt

* writetext,PATH,TEXT: TXT file, replaced or made
OpWrText lda   #3
         jsr   GetArg
         lda   SRC
         sta   DST
         lda   SRC+2
         sta   DST+2
         jsr   StrLen
         lda   LEN
         sta   CNT
         lda   LEN+2
         sta   CNT+2
         lda   #4
         sta   T3
         stz   T4
         stz   T4+2
         lda   #1
         sta   WHOLE
         lda   #2
         jsr   GetArg
         jsr   MakePath
         jsr   OpenOut
         bcc   :o
         ldx   #MsgOpen
         jmp   ErrCode
:o       jsr   WriteIt
         sta   TERR
         jsr   CloseIt
         lda   TERR
         beq   :k
         ldx   #MsgWrite
         jmp   ErrCode
:k       jmp   PutOK

* dir,PATH
OpDir    lda   #2
         jsr   GetArg
         jsr   MakePath
         lda   #1
         jsr   OpenPath
         bcc   :o
         ldx   #MsgOpen
         jmp   ErrCode
:o       lda   REFN
         sta   GDREF
         stz   GDBASE
         stz   GDDISP
         lda   #DIRNAME
         sta   GDNAME
         lda   BANK
         sta   GDNAME+2
         lda   #68
         sta   DIRNAME
         lda   #$201C         ; GetDirEntry: count
         ldx   #GDPB
         jsr   GSCall
         lda   GDENTRY        ; entries * 80
         asl
         asl
         asl
         asl
         sta   T2
         asl
         asl
         clc
         adc   T2
         adc   #16
         sta   LEN
         stz   LEN+2
         jsr   NewOut
         bcs   :c
         lda   #1
         sta   GDBASE
         sta   GDDISP
:l       lda   #$201C
         ldx   #GDPB
         jsr   GSCall
         bcs   :end
         ldx   #0
:n       cpx   DIRNAME+2
         bge   :t
         lda   DIRNAME+4,x
         phx
         jsr   PutC
         plx
         inx
         bra   :n
:t       lda   #$2C
         jsr   PutC
         lda   GDTYPE
         jsr   PutHex8
         lda   #$2C
         jsr   PutC
         lda   GDAUX+1
         jsr   PutHex8
         lda   GDAUX
         jsr   PutHex8
         lda   #13
         jsr   PutC
         bra   :l
:end     lda   #0
         jsr   PutC
:c       jmp   CloseIt

* patchstak,PATH,OFFSET,HEX: write bytes inside the
* first $600 bytes of a stack and rebalance STAK +$0C
* so the longs of those $600 bytes sum to zero.
OpStak   lda   #2
         jsr   GetArg
         jsr   MakePath
         lda   #3
         jsr   OpenPath
         bcc   :o
         ldx   #MsgOpen
         jmp   ErrCode
:o       stz   NUM
         stz   NUM+2
         jsr   SetMarkTo
         lda   #STAKBUF
         sta   DST
         lda   BANK
         sta   DST+2
         lda   #$600
         sta   CNT
         stz   CNT+2
         jsr   ReadIt
         bcc   :k1
         jmp   :bad
:k1
         lda   STAKBUF+4      ; must be a STAK block
         cmp   #$5453         ; "ST"
         beq   :k2
         jmp   :bad
:k2
         lda   STAKBUF+6
         cmp   #$4B41         ; "AK"
         beq   :k3
         jmp   :bad
:k3
         lda   #3
         jsr   ArgNum
         lda   NUM
         sta   T3
         lda   #4
         jsr   HexArg
         lda   T3             ; offset + count <= $600
         clc
         adc   CNT
         cmp   #$601
         blt   :k4
         jmp   :bad
:k4
         lda   #STAKBUF
         clc
         adc   T3
         sta   DST
         lda   BANK
         sta   DST+2
         jsr   HexIn
* checksum: zero +$0C, sum the longs, store -sum
         stz   STAKBUF+$0C
         stz   STAKBUF+$0E
         stz   T2
         stz   T2+2
         ldx   #0
:sum     lda   STAKBUF,x
         clc
         adc   T2
         sta   T2
         lda   STAKBUF+2,x
         adc   T2+2
         sta   T2+2
         inx
         inx
         inx
         inx
         cpx   #$600
         blt   :sum
         lda   T2
         eor   #$FFFF
         clc
         adc   #1
         sta   STAKBUF+$0C
         lda   T2+2
         eor   #$FFFF
         adc   #0
         sta   STAKBUF+$0E
         stz   NUM
         stz   NUM+2
         jsr   SetMarkTo
         lda   #STAKBUF
         sta   DST
         lda   BANK
         sta   DST+2
         lda   #$600
         sta   CNT
         stz   CNT+2
         jsr   WriteIt
         sta   TERR
         jsr   CloseIt
         lda   TERR
         beq   :k
         ldx   #MsgWrite
         jmp   ErrCode
:k       jmp   PutOK
:bad     jsr   CloseIt
         lda   #MsgStak
         jmp   ErrMsg

*-------------------------------------------------------
* Hex helpers. HexByteAt: T2 (long) = byte index into
* the hex text at SRC2 (HLEN chars) -> A = byte, 0 if
* past the end.
HexByteAt lda  T2
         asl
         sta   T3
         lda   T2+2
         rol
         sta   T3+2
         lda   T3             ; index*2+1 < HLEN ?
         clc
         adc   #1
         tax
         lda   T3+2
         adc   #0
         cmp   HLEN+2
         bne   :c
         cpx   HLEN
:c       blt   :in
         lda   #0
         rts
:in      lda   SRC2
         clc
         adc   T3
         sta   T3
         lda   SRC2+2
         adc   T3+2
         sta   T3+2
         lda   [T3]
         and   #$00FF
         jsr   HexVal
         and   #$000F
         asl
         asl
         asl
         asl
         sta   T4
         ldy   #1
         lda   [T3],y
         and   #$00FF
         jsr   HexVal
         and   #$000F
         ora   T4
         rts

* peek,HEX,OFFSET,SIZE
OpPeek   lda   #2
         jsr   HexArg
         lda   #3
         jsr   ArgNum
         lda   NUM
         sta   OFFS
         lda   NUM+2
         sta   OFFS+2
         lda   #4
         jsr   ArgNum
         lda   NUM
         bne   :s
         lda   #1
:s       sta   T4+2           ; size
         sta   IDX
         stz   CNT            ; value
         stz   CNT+2
:l       lda   IDX            ; byte IDX-1 is the highest left
         beq   :out
         dec
         sta   IDX
         clc
         adc   OFFS
         sta   T2
         lda   OFFS+2
         adc   #0
         sta   T2+2
         jsr   HexByteAt
         pha
         ldx   #8
:sh      asl   CNT
         rol   CNT+2
         dex
         bne   :sh
         pla
         ora   CNT
         sta   CNT
         bra   :l
:out     lda   #16
         sta   LEN
         stz   LEN+2
         jsr   NewOut
         bcs   :r
         lda   CNT
         sta   NUM
         lda   CNT+2
         sta   NUM+2
         jsr   PutDec
         lda   #0
         jsr   PutC
:r       rts

* CopyHex: result = the hex text at SRC2, padded with
* "00" to at least T4 (long) bytes. Sets HLEN to the
* new length in characters. Carry set = no memory.
CopyHex  lda   T4             ; need = max(HLEN, 2*T4)
         asl
         sta   T3
         lda   T4+2
         rol
         sta   T3+2
         cmp   HLEN+2
         bne   :c
         lda   T3
         cmp   HLEN
:c       bge   :pad
         lda   HLEN
         sta   T3
         lda   HLEN+2
         sta   T3+2
:pad     lda   T3
         clc
         adc   #1
         sta   LEN
         lda   T3+2
         adc   #0
         sta   LEN+2
         jsr   NewOut
         bcc   :go
         rts
:go      lda   SRC2
         sta   SRC
         lda   SRC2+2
         sta   SRC+2
         lda   HLEN
         sta   CNT
         lda   HLEN+2
         sta   CNT+2
:cp      lda   CNT
         ora   CNT+2
         beq   :z
         lda   [SRC]
         jsr   PutC
         inc   SRC
         bne   :1
         inc   SRC+2
:1       lda   CNT
         bne   :2
         dec   CNT+2
:2       dec   CNT
         bra   :cp
:z       lda   T3             ; pad: T3 - HLEN zeros
         sec
         sbc   HLEN
         sta   CNT
         lda   T3+2
         sbc   HLEN+2
         sta   CNT+2
:p       lda   CNT
         ora   CNT+2
         beq   :e
         lda   #$30
         jsr   PutC
         lda   CNT
         bne   :3
         dec   CNT+2
:3       dec   CNT
         bra   :p
:e       lda   #0
         jsr   PutC
         lda   T3
         sta   HLEN
         lda   T3+2
         sta   HLEN+2
         clc
         rts

* OutByte: write byte A at byte index T2 of the result
* hex (at OB)
OutByte  pha
         lda   T2
         asl
         sta   T3
         lda   T2+2
         rol
         sta   T3+2
         lda   OB
         clc
         adc   T3
         sta   T3
         lda   OB+2
         adc   T3+2
         sta   T3+2
         pla
         pha
         lsr
         lsr
         lsr
         lsr
         and   #$000F
         jsr   NibChar
         sep   #$20
         sta   [T3]
         rep   #$20
         pla
         and   #$000F
         jsr   NibChar
         ldy   #1
         sep   #$20
         sta   [T3],y
         rep   #$20
         rts

NibChar  cmp   #10
         blt   :d
         adc   #6
:d       adc   #$30
         rts

* InByte: byte at index T2 of the result hex -> A
InByte   lda   T2
         asl
         sta   T3
         lda   T2+2
         rol
         sta   T3+2
         lda   OB
         clc
         adc   T3
         sta   T3
         lda   OB+2
         adc   T3+2
         sta   T3+2
         lda   [T3]
         and   #$00FF
         jsr   HexVal
         and   #$000F
         asl
         asl
         asl
         asl
         sta   T4
         ldy   #1
         lda   [T3],y
         and   #$00FF
         jsr   HexVal
         and   #$000F
         ora   T4
         rts

* poke,HEX,OFFSET,SIZE,VALUE
OpPoke   lda   #2
         jsr   HexArg
         lda   #3
         jsr   ArgNum
         lda   NUM
         sta   OFFS
         lda   NUM+2
         sta   OFFS+2
         lda   #4
         jsr   ArgNum
         lda   NUM
         bne   :s
         lda   #1
:s       sta   IDX
         clc
         adc   OFFS
         sta   T4
         lda   OFFS+2
         adc   #0
         sta   T4+2
         jsr   CopyHex
         bcs   :r
         lda   #5
         jsr   ArgNum
         lda   OFFS
         sta   T2
         lda   OFFS+2
         sta   T2+2
:l       lda   IDX
         beq   :r
         lda   NUM
         and   #$00FF
         jsr   OutByte
         ldx   #8
:sh      lsr   NUM+2
         ror   NUM
         dex
         bne   :sh
         inc   T2
         bne   :1
         inc   T2+2
:1       dec   IDX
         bra   :l
:r       rts

* zeros,N
OpZeros  lda   #2
         jsr   ArgNum
         lda   NUM
         sta   CNT
         asl
         sta   LEN
         lda   NUM+2
         sta   CNT+2
         rol
         sta   LEN+2
         inc   LEN
         bne   :n
         inc   LEN+2
:n       jsr   NewOut
         bcs   :r
:l       lda   CNT
         ora   CNT+2
         beq   :e
         lda   #$30
         jsr   PutC
         lda   #$30
         jsr   PutC
         lda   CNT
         bne   :1
         dec   CNT+2
:1       dec   CNT
         bra   :l
:e       lda   #0
         jsr   PutC
:r       rts

* text2hex,TEXT
OpT2H    lda   #2
         jsr   GetArg
         jsr   StrLen
         lda   LEN
         sta   CNT
         asl
         sta   LEN
         lda   LEN+2
         sta   CNT+2
         rol
         sta   LEN+2
         inc   LEN
         bne   :n
         inc   LEN+2
:n       jsr   NewOut
         bcs   :r
         jsr   HexOut
         lda   #0
         jsr   PutC
:r       rts

* hex2text,HEX[,OFFSET,LENGTH]
OpH2T    lda   #2
         jsr   HexArg
         lda   #3
         jsr   ArgNum
         lda   NUM
         sta   OFFS
         lda   NUM+2
         sta   OFFS+2
         lda   #4
         jsr   ArgNum
         bcs   :all
         lda   NUM
         sta   CNT
         lda   NUM+2
         sta   CNT+2
         bra   :go
:all     lda   CNT            ; CNT = bytes - OFFS
         sec
         sbc   OFFS
         sta   CNT
         lda   CNT+2
         sbc   OFFS+2
         sta   CNT+2
         bcs   :go
         stz   CNT
         stz   CNT+2
:go      lda   CNT
         clc
         adc   #1
         sta   LEN
         lda   CNT+2
         adc   #0
         sta   LEN+2
         jsr   NewOut
         bcs   :r
         lda   OFFS
         sta   T2
         lda   OFFS+2
         sta   T2+2
:l       lda   CNT
         ora   CNT+2
         beq   :e
         jsr   HexByteAt
         cmp   #0
         bne   :p
         lda   #$20           ; no zero bytes inside text
:p       jsr   PutC
         inc   T2
         bne   :1
         inc   T2+2
:1       lda   CNT
         bne   :2
         dec   CNT+2
:2       dec   CNT
         bra   :l
:e       lda   #0
         jsr   PutC
:r       rts

*-------------------------------------------------------
* PixPos: pixel PIX (0..) of row ROW -> T2 = byte index,
* SHIFT (in X) = right shift for the value.
* Byte = OFFS + ROW*ROWB + (PIX*BPP)/8,
* shift = 8 - BPP - ((PIX*BPP) & 7)
PixPos   lda   PIX
         ldx   BPP
         cpx   #1
         beq   :b1
         asl
         cpx   #2
         beq   :b1
         asl                  ; 4 bpp
         cpx   #4
         beq   :b1
         asl                  ; 8 bpp
:b1      sta   T4             ; bit number in the row
         and   #7
         sta   T4+2
         lda   #8
         sec
         sbc   BPP
         sec
         sbc   T4+2
         tax
         lda   T4
         lsr
         lsr
         lsr
         clc
         adc   RBASE
         sta   T2
         lda   RBASE+2
         adc   #0
         sta   T2+2
         rts

* RowBase: RBASE = OFFS + ROW*ROWB
RowBase  stz   RBASE+2
         lda   OFFS
         sta   RBASE
         lda   OFFS+2
         sta   RBASE+2
         ldy   ROW
         beq   :r
:l       lda   RBASE
         clc
         adc   ROWB
         sta   RBASE
         lda   RBASE+2
         adc   #0
         sta   RBASE+2
         dey
         bne   :l
:r       rts

* ValMask: A = (1 << BPP) - 1
ValMask  ldx   BPP
         lda   #0
:l       sec
         rol
         dex
         bne   :l
         rts

GridArgs lda   #3
         jsr   ArgNum
         lda   NUM
         sta   OFFS
         lda   NUM+2
         sta   OFFS+2
         lda   #4
         jsr   ArgNum
         lda   NUM
         sta   ROWB
         lda   #5
         jsr   ArgNum
         lda   NUM
         sta   ROWS
         lda   #6
         jsr   ArgNum
         lda   NUM
         sta   FPIX
         rts

* bits,HEX,OFFSET,ROWBYTES,ROWS,FIRSTPIX,NPIX,BPP
OpBits   lda   #2
         jsr   HexArg
         jsr   GridArgs
         lda   #7
         jsr   ArgNum
         lda   NUM
         sta   NPIX
         lda   #8
         jsr   ArgNum
         lda   NUM
         bne   :b
         lda   #1
:b       sta   BPP
         lda   NPIX           ; LEN = ROWS*(NPIX+1)+1
         inc
         sta   T4
         stz   LEN
         stz   LEN+2
         ldy   ROWS
         beq   :z
:m       lda   LEN
         clc
         adc   T4
         sta   LEN
         lda   LEN+2
         adc   #0
         sta   LEN+2
         dey
         bne   :m
:z       inc   LEN
         jsr   NewOut
         bcc   :go
         rts
:go      stz   ROW
:row     lda   ROW
         cmp   ROWS
         bge   :end
         jsr   RowBase
         lda   ROW
         beq   :nocr
         lda   #13
         jsr   PutC
:nocr    stz   COL
:pix     lda   COL
         cmp   NPIX
         bge   :nr
         clc
         adc   FPIX
         sta   PIX
         jsr   PixPos
         phx
         jsr   HexByteAt
         plx
         beq   :ns
:shr     lsr
         dex
         bne   :shr
:ns      sta   T4
         jsr   ValMask
         and   T4
         cmp   #10
         blt   :dg
         adc   #6
:dg      adc   #$30
         jsr   PutC
         inc   COL
         bra   :pix
:nr      inc   ROW
         bra   :row
:end     lda   #0
         jmp   PutC

* setbits,HEX,OFFSET,ROWBYTES,ROWS,FIRSTPIX,BPP,DIGITS
OpSetB   lda   #2
         jsr   HexArg
         jsr   GridArgs
         lda   #7
         jsr   ArgNum
         lda   NUM
         bne   :b
         lda   #1
:b       sta   BPP
         stz   ROW            ; T4 = OFFS + ROWS*ROWB
         lda   ROWS
         sta   ROW
         jsr   RowBase
         stz   ROW
         lda   RBASE
         sta   T4
         lda   RBASE+2
         sta   T4+2
         jsr   CopyHex
         bcc   :go
         rts
:go      lda   #8
         jsr   GetArg
         lda   SRC            ; digits -> SRC2 (HexByteAt
         sta   DIGP           ; is not used from here)
         lda   SRC+2
         sta   DIGP+2
:row     lda   ROW
         cmp   ROWS
         bge   :done
         jsr   RowBase
         stz   COL
:pix     lda   [DIGP]
         and   #$00FF
         beq   :done
         cmp   #13
         beq   :eol
         jsr   HexVal         ; digit value, others 0
         bcc   :v
         lda   #0
:v       sta   NPIX           ; (value to store)
         lda   COL
         clc
         adc   FPIX
         sta   PIX
         jsr   PixPos         ; T2, X = shift
         stx   SHIFT
         jsr   InRange
         bcs   :skip
         jsr   ValMask
         ldx   SHIFT
         beq   :m0
:m1      asl
         dex
         bne   :m1
:m0      eor   #$FFFF
         sta   T3+2           ; keep mask (InByte uses T3)
         lda   NPIX
         jsr   ValMaskAnd
         ldx   SHIFT
         beq   :v0
:v1      asl
         dex
         bne   :v1
:v0      sta   SHIFTV
         lda   T3+2
         sta   KEEP
         jsr   InByte
         and   KEEP
         ora   SHIFTV
         and   #$00FF
         jsr   OutByte
:skip    inc   COL
         jsr   NextDig
         bra   :pix
:eol     jsr   NextDig
         inc   ROW
         bra   :row
:done    rts

* InRange: carry clear if byte T2 lies inside HLEN
InRange  lda   T2
         asl
         sta   T3
         lda   T2+2
         rol
         sta   T3+2
         lda   T3
         clc
         adc   #1
         tax
         lda   T3+2
         adc   #0
         cmp   HLEN+2
         bne   :c
         cpx   HLEN
:c       blt   :ok
         sec
         rts
:ok      clc
         rts

NextDig  inc   DIGP
         bne   :r
         inc   DIGP+2
:r       rts

ValMaskAnd sta T4+2
         jsr   ValMask
         and   T4+2
         rts

*-------------------------------------------------------
* merge,IMAGE,MASK,MODE
OpMerge  lda   #4
         jsr   GetArg
         lda   [SRC]
         and   #$00FF
         ora   #$20
         sta   MODE           ; "i" or "c"
         lda   #3
         jsr   GetArg
         lda   SRC
         sta   SRC2
         lda   SRC+2
         sta   SRC2+2
         lda   #2
         jsr   GetArg
         jsr   StrLen
         inc   LEN
         bne   :n
         inc   LEN+2
:n       jsr   NewOut
         bcc   :l
         rts
:l       lda   [SRC]
         and   #$00FF
         beq   :e
         cmp   #13
         beq   :put
         sta   T2             ; image digit
         lda   [SRC2]
         and   #$00FF
         sta   T3             ; mask digit
         lda   MODE
         cmp   #$63           ; c
         beq   :cur
         lda   T3
         cmp   #$30
         beq   :dot
         lda   T2
         bra   :put
:cur     lda   T3
         cmp   #$30
         bne   :solid
         lda   T2
         cmp   #$30
         beq   :dot
         lda   #$78           ; x = invert
         bra   :put
:solid   lda   T2             ; shown = 3 xor image
         eor   #3
         bra   :put
:dot     lda   #$2E
:put     jsr   PutC
         inc   SRC
         bne   :1
         inc   SRC+2
:1       lda   [SRC2]
         and   #$00FF
         beq   :l
         inc   SRC2
         bne   :l
         inc   SRC2+2
         bra   :l
:e       lda   #0
         jmp   PutC

* split,GRID,MODE: image lines, CR, mask lines
OpSplit  lda   #3
         jsr   GetArg
         lda   [SRC]
         and   #$00FF
         ora   #$20
         sta   MODE
         lda   #2
         jsr   GetArg
         jsr   StrLen
:trim    lda   LEN            ; drop trailing returns
         ora   LEN+2
         beq   :tz
         lda   SRC
         clc
         adc   LEN
         sta   T3
         lda   SRC+2
         adc   LEN+2
         sta   T3+2
         lda   T3
         bne   :t1
         dec   T3+2
:t1      dec   T3
         lda   [T3]
         and   #$00FF
         cmp   #13
         bne   :tz
         lda   LEN
         bne   :t2
         dec   LEN+2
:t2      dec   LEN
         bra   :trim
:tz      lda   LEN
         sta   CNT
         lda   LEN+2
         sta   CNT+2
         asl   LEN
         rol   LEN+2
         lda   LEN
         clc
         adc   #2
         sta   LEN
         lda   LEN+2
         adc   #0
         sta   LEN+2
         jsr   NewOut
         bcc   :go
         rts
:go      stz   IDX            ; pass 0 = image, 1 = mask
:pass    lda   SRC
         sta   SRC2
         lda   SRC+2
         sta   SRC2+2
         lda   CNT
         sta   T4
         lda   CNT+2
         sta   T4+2
:l       lda   T4
         ora   T4+2
         beq   :pe
         lda   [SRC2]
         and   #$00FF
         cmp   #13
         beq   :put
         jsr   SplitCh
:put     jsr   PutC
         inc   SRC2
         bne   :1
         inc   SRC2+2
:1       lda   T4
         bne   :2
         dec   T4+2
:2       dec   T4
         bra   :l
:pe      lda   IDX
         bne   :e
         inc   IDX
         lda   #13
         jsr   PutC
         bra   :pass
:e       lda   #0
         jmp   PutC

* SplitCh: A = grid char -> A = image or mask digit
* (IDX 0 = image, 1 = mask)
SplitCh  sta   T2
         lda   MODE
         cmp   #$63
         beq   :cur
         lda   T2             ; icon
         cmp   #$2E
         beq   :clr
         cmp   #$78
         beq   :clr
         ldx   IDX
         bne   :m3
         rts
:clr     lda   #$30
         rts
:m3      lda   #$33
         rts
:cur     lda   T2
         cmp   #$2E
         beq   :clr
         cmp   #$78
         bne   :cs
         ldx   IDX
         bne   :clr           ; invert: mask 0
         lda   #$33           ; image 3
         rts
:cs      ldx   IDX
         bne   :m3
         lda   T2             ; image = 3 xor shown
         eor   #3
         rts

*-------------------------------------------------------
* draw,GRID,LEFT,TOP,CELLW,CELLH,MODE,FIRSTCOL
OpDraw   lda   #3
         jsr   ArgNum
         lda   NUM
         sta   LEFT
         lda   #4
         jsr   ArgNum
         lda   NUM
         sta   TOP
         lda   #5
         jsr   ArgNum
         lda   NUM
         bne   :w
         lda   #1
:w       sta   CW
         lda   #6
         jsr   ArgNum
         lda   NUM
         bne   :h
         lda   #1
:h       sta   CH
         lda   #8
         jsr   ArgNum
         lda   NUM
         sta   FPIX
         lda   #7
         jsr   GetArg
         lda   [SRC]
         and   #$00FF
         ora   #$20
         sta   MODE
         lda   #2
         jsr   GetArg
         pei   BANK
         pea   PENSAVE
         ldx   #$2B04         ; GetPenState
         jsl   Tool
         ldx   #$3604         ; PenNormal
         jsl   Tool
* with grid lines (cells of 4 pixels or more), paint the
* grid black first: the 1-pixel gaps become the lines
         lda   CW
         cmp   #4
         blt   :nobg
         jsr   GridSize       ; COL = columns, ROW = rows
         pea   0
         ldx   #$3704         ; SetSolidPenPat black
         jsl   Tool
         lda   TOP
         dec
         sta   RECT
         lda   LEFT
         dec
         sta   RECT+2
         lda   ROW
         ldx   CH
         jsr   Mul
         clc
         adc   TOP
         sta   RECT+4
         lda   COL
         ldx   CW
         jsr   Mul
         clc
         adc   LEFT
         sta   RECT+6
         pei   BANK
         pea   RECT
         ldx   #$5404         ; PaintRect
         jsl   Tool
:nobg    stz   ROW
         stz   COL
:l       lda   [SRC]
         and   #$00FF
         bne   :c
         jmp   :end
:c       cmp   #13
         bne   :cell
         stz   COL
         inc   ROW
         jmp   :nx
:cell    jsr   MakePat
         pei   BANK
         pea   PATBUF
         ldx   #$3004         ; SetPenPat
         jsl   Tool
* the cell's rect, one pixel smaller for a grid line
* when cells are 4 or more pixels
         lda   ROW
         ldx   CH
         jsr   Mul
         clc
         adc   TOP
         sta   RECT
         clc
         adc   CH
         sta   RECT+4
         lda   COL
         ldx   CW
         jsr   Mul
         clc
         adc   LEFT
         sta   RECT+2
         clc
         adc   CW
         sta   RECT+6
         lda   CW
         cmp   #4
         blt   :nogap
         dec   RECT+6
         lda   CH
         cmp   #4
         blt   :nogap
         dec   RECT+4
:nogap   pei   BANK
         pea   RECT
         ldx   #$5404         ; PaintRect
         jsl   Tool
         inc   COL
:nx      inc   SRC
         bne   :l0
         inc   SRC+2
:l0      jmp   :l
:end     pei   BANK
         pea   PENSAVE
         ldx   #$2A04         ; SetPenState
         jsl   Tool
         jmp   PutOK

* GridSize: the grid text at SRC -> COL = widest line,
* ROW = number of lines
GridSize lda   SRC
         sta   T3
         lda   SRC+2
         sta   T3+2
         stz   COL
         stz   ROW
         stz   T4
:l       lda   [T3]
         and   #$00FF
         beq   :end
         cmp   #13
         bne   :ch
         jsr   :eol
         bra   :n
:ch      inc   T4
:n       inc   T3
         bne   :l
         inc   T3+2
         bra   :l
:end     lda   T4
         beq   :r
         jsr   :eol
:r       rts
:eol     inc   ROW
         lda   T4
         cmp   COL
         blt   :e2
         sta   COL
:e2      stz   T4
         rts

* drawicon,HEX,X,Y[,MODE]: draw an icon record with
* QuickDraw II Auxiliary's DrawIcon, exactly as the
* IIGS shows icons
OpDIcon  lda   #2
         jsr   HexArg
         ldy   #72
         lda   [PB],y
         jsr   NewData
         bcc   :g
         rts
:g       jsr   HexIn
         lda   #3
         jsr   ArgNum
         lda   NUM
         sta   LEFT
         lda   #4
         jsr   ArgNum
         lda   NUM
         sta   TOP
         lda   #5
         jsr   ArgNum
         lda   NUM
         sta   MODE
         lda   [HND]
         sta   T3
         ldy   #2
         lda   [HND],y
         sta   T3+2
         pei   T3+2
         pei   T3
         pei   MODE
         pei   LEFT
         pei   TOP
         ldx   #$0B12         ; DrawIcon
         jsl   Tool
         sta   TERR
         pei   HND+2
         pei   HND
         ldx   #$1002         ; DisposeHandle
         jsl   Tool
         lda   TERR
         beq   :ok
         ldx   #MsgDraw
         jmp   ErrCode
:ok      jmp   PutOK

* Mul: A * X -> A (small numbers)
Mul      sta   T3
         stx   T3+2
         lda   #0
         ldx   T3+2
         beq   :r
:l       clc
         adc   T3
         dex
         bne   :l
:r       rts

* MakePat: A = grid character -> PATBUF (32 bytes).
* Colors follow the System color set in 640 mode:
* pixel slots 0,2 show black/red/green/white for values
* 0-3, slots 1,3 black/blue/yellow/white.
MakePat  sta   T2
         lda   MODE           ; p (preview): clear = white,
         cmp   #$70           ; invert = gray
         bne   :np
         lda   T2
         cmp   #$2E
         bne   :px
         lda   #$FFFF
         bra   :fill
:px      cmp   #$78
         bne   :np
         lda   #$CCCC
         bra   :fill
:np      lda   T2
         cmp   #$2E
         bne   :nd
         ldx   #PatDot
         jmp   CopyPat
:nd      cmp   #$78
         bne   :nx
         ldx   #PatX
         jmp   CopyPat
:nx      jsr   HexVal
         bcc   :v
         lda   #0
:v       and   #3
         sta   T2
         lda   MODE
         cmp   #$6D           ; m: 1 = black, 0 = white
         bne   :col
         lda   T2
         beq   :white
         lda   #$0000
         bra   :fill
:white   lda   #$FFFF
         bra   :fill
:col     lda   COL            ; the column's slot parity
         clc
         adc   FPIX
         and   #1
         beq   :even
         lda   T2             ; odd column: B colors
         clc
         adc   #4
         bra   :ix
:even    lda   T2
:ix      tax
         lda   ColPat,x
         and   #$00FF
         sta   T3
         xba
         ora   T3
:fill    ldx   #30
:f       sta   PATBUF,x
         dex
         dex
         bpl   :f
         rts

CopyPat  stx   T4
         ldy   #30
:l       lda   (T4),y
         sta   PATBUF,y
         dey
         dey
         bpl   :l
         rts

*-------------------------------------------------------
* wave,HEX,OFFSET,COUNT,LEFT,TOP,WIDTH,HEIGHT: one
* vertical line per column from the lowest to the
* highest sample under it.
OpWave   lda   #2
         jsr   HexArg
         lda   #3
         jsr   ArgNum
         lda   NUM
         sta   OFFS
         lda   NUM+2
         sta   OFFS+2
         lda   #4
         jsr   ArgNum
         lda   NUM
         sta   IDX
         lda   NUM+2
         sta   IDX+2
         lda   #5
         jsr   ArgNum
         lda   NUM
         sta   LEFT
         lda   #6
         jsr   ArgNum
         lda   NUM
         sta   TOP
         lda   #7
         jsr   ArgNum
         lda   NUM
         bne   :w
         lda   #1
:w       sta   CW
         lda   #8
         jsr   ArgNum
         lda   NUM
         sta   CH
         pei   BANK
         pea   PENSAVE
         ldx   #$2B04
         jsl   Tool
         ldx   #$3604
         jsl   Tool
         pea   0
         ldx   #$3704         ; SetSolidPenPat black
         jsl   Tool
* samples per column = COUNT / WIDTH (at least 1)
         lda   IDX
         sta   T3
         lda   IDX+2
         sta   T3+2
         jsr   DivW
         sta   ROWB           ; per column
         bne   :pc
         inc   ROWB
:pc      stz   COL
         lda   OFFS
         sta   T2
         lda   OFFS+2
         sta   T2+2
:col     lda   COL
         cmp   CW
         bge   :end
         lda   #255
         sta   ROW            ; min
         stz   BPP            ; max
         lda   ROWB
         sta   ROWS
:s       lda   IDX            ; samples left?
         ora   IDX+2
         beq   :dr
         jsr   HexByteAt
         cmp   ROW
         bge   :1
         sta   ROW
:1       cmp   BPP
         blt   :2
         sta   BPP
:2       inc   T2
         bne   :3
         inc   T2+2
:3       lda   IDX
         bne   :4
         dec   IDX+2
:4       dec   IDX
         dec   ROWS
         bne   :s
:dr      lda   BPP
         cmp   ROW
         blt   :next          ; no samples
         lda   COL
         clc
         adc   LEFT
         sta   T4
         pei   T4
         lda   BPP
         jsr   Ysc
         pha
         ldx   #$3A04         ; MoveTo
         jsl   Tool
         pei   T4
         lda   ROW
         jsr   Ysc
         pha
         ldx   #$3C04         ; LineTo
         jsl   Tool
:next    inc   COL
         bra   :col
:end     pei   BANK
         pea   PENSAVE
         ldx   #$2A04
         jsl   Tool
         jmp   PutOK

* Ysc: A = sample 0-255 -> TOP + (255-A)*CH/256
Ysc      eor   #$00FF
         ldx   CH
         jsr   Mul
         xba
         and   #$00FF
         clc
         adc   TOP
         rts

* DivW: T3 (long) / CW -> A (16 bits)
DivW     lda   #0
         ldy   #32
:b       asl   T3
         rol   T3+2
         rol
         cmp   CW
         blt   :n
         sbc   CW
         inc   T3
:n       dey
         bne   :b
         lda   T3
         rts

* version
OpVer    lda   #16
         sta   LEN
         stz   LEN+2
         jsr   NewOut
         bcs   :r
         ldx   #TxtVer
         jsr   PutStr
         lda   #0
         jsr   PutC
:r       rts

*-------------------------------------------------------
* data
OPTAB    da    NmList,OpList
         da    NmGet,OpGet
         da    NmPut,OpPut
         da    NmDel,OpDel
         da    NmName,OpName
         da    NmCreate,OpCreate
         da    NmRdFile,OpRdFile
         da    NmWrFile,OpWrFile
         da    NmRdText,OpRdText
         da    NmWrText,OpWrText
         da    NmDir,OpDir
         da    NmStak,OpStak
         da    NmPeek,OpPeek
         da    NmPoke,OpPoke
         da    NmZeros,OpZeros
         da    NmH2T,OpH2T
         da    NmT2H,OpT2H
         da    NmBits,OpBits
         da    NmSetB,OpSetB
         da    NmMerge,OpMerge
         da    NmSplit,OpSplit
         da    NmDraw,OpDraw
         da    NmWave,OpWave
         da    NmVer,OpVer
         da    NmPost,OpPost
         da    NmDIcon,OpDIcon
         da    0,0

NmList   asc   'list'
         dfb   0
NmGet    asc   'get'
         dfb   0
NmPut    asc   'put'
         dfb   0
NmDel    asc   'delete'
         dfb   0
NmName   asc   'name'
         dfb   0
NmCreate asc   'create'
         dfb   0
NmRdFile asc   'readfile'
         dfb   0
NmWrFile asc   'writefile'
         dfb   0
NmRdText asc   'readtext'
         dfb   0
NmWrText asc   'writetext'
         dfb   0
NmDir    asc   'dir'
         dfb   0
NmStak   asc   'patchstak'
         dfb   0
NmPeek   asc   'peek'
         dfb   0
NmPoke   asc   'poke'
         dfb   0
NmZeros  asc   'zeros'
         dfb   0
NmH2T    asc   'hex2text'
         dfb   0
NmT2H    asc   'text2hex'
         dfb   0
NmBits   asc   'bits'
         dfb   0
NmSetB   asc   'setbits'
         dfb   0
NmMerge  asc   'merge'
         dfb   0
NmSplit  asc   'split'
         dfb   0
NmDraw   asc   'draw'
         dfb   0
NmWave   asc   'wave'
         dfb   0
NmVer    asc   'version'
         dfb   0
NmPost   asc   'postkey'
         dfb   0
NmDIcon  asc   'drawicon'
         dfb   0

TxtErr   asc   'ERR '
         dfb   0
TxtOK    asc   'OK'
         dfb   0
TxtVer   asc   'RSRC 1.0'
         dfb   0
MsgNoOp  asc   'no operation given'
         dfb   0
MsgBadOp asc   'unknown operation'
         dfb   0
MsgOpen  asc   'cannot open the file'
         dfb   0
MsgLoad  asc   'no such resource'
         dfb   0
MsgMem   asc   'out of memory'
         dfb   0
MsgDraw  asc   'DrawIcon failed'
         dfb   0
MsgWrite asc   'cannot write'
         dfb   0
MsgAdd   asc   'cannot add the resource'
         dfb   0
MsgDel   asc   'cannot remove the resource'
         dfb   0
MsgCreate asc  'cannot make a resource fork'
         dfb   0
MsgStak  asc   'not a stack, or the bytes do not fit below $600'
         dfb   0
Empty    dfb   0,0
NoNames  da    1              ; empty rResName: version 1,
         adrl  0              ; no names

* pattern byte for each value: A group (slots 0,2:
* black red green white) and B group (slots 1,3:
* black blue yellow white). Byte = a,b,a,b slots.
* Red shows as red/black stripes, blue as black/blue.
ColPat   dfb   $00,$44,$88,$FF  ; even columns: 0-3
         dfb   $00,$11,$22,$FF  ; odd columns: 0-3
PatDot   hex   FFFFFFFF3F3F3F3FFFFFFFFFF3F3F3F3
         hex   FFFFFFFF3F3F3F3FFFFFFFFFF3F3F3F3
PatX     hex   3F3F3F3FCFCFCFCFF3F3F3F3FCFCFCFC
         hex   3F3F3F3FCFCFCFCFF3F3F3F3FCFCFCFC

ERRM     da    0
ERRC     da    0
ERRF     da    0
WHOLE    da    0
RBASE    adrl  0

SHIFT    da    0
SHIFTV   da    0
KEEP     da    0
PIX      da    0
RECT     ds    8
OPBUF    ds    16

* GS/OS parameter blocks
OPNPB    da    3
OPNREF   da    0
OPNPATH  adrl  0
OPNACC   da    1
EOFPB    da    2
EOFREF   da    0
EOFVAL   adrl  0
RWPB     da    4
RWREF    da    0
RWBUF    adrl  0
RWCNT    adrl  0
RWXFER   adrl  0
MRKPB    da    3
MRKREF   da    0
MRKBASE  da    0
MRKPOS   adrl  0
CLSPB    da    1
CLSREF   da    0
CRPB     da    5
CRPATH   adrl  0
CRACC    da    $C3
CRTYPE   da    0
CRAUX    adrl  0
CRSTOR   da    1
GDPB     da    13
GDREF    da    0
GDFLAGS  da    0
GDBASE   da    0
GDDISP   da    0
GDNAME   adrl  0
GDENTRY  da    0
GDTYPE   da    0
GDEOF    adrl  0
GDBLKS   adrl  0
GDCRDT   ds    8
GDMODT   ds    8
GDACC    da    0
GDAUX    adrl  0

DIRNAME  ds    72
NAMEBUF  ds    260
PATHBUF  ds    260
PATBUF   ds    32
PENSAVE  ds    64
STAKBUF  ds    $600
