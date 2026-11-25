// HyperTalk interpreter tests: node tests/hypertalk/test.js
// Each case runs a handler body in the stack script below and compares the message box (or a check expression).
'use strict';
require('../../lib/hcfile.js'); require('../../lib/hypertalk.js');

const STACK = `#hc 1
#stack
name: Test
#script
on mouseUp
  put "stack got " & the short name of the target into msg
end mouseUp
on countOpen
  global opens
  add 1 to opens
end countOpen
function fact n
  if n <= 1 then return 1
  return n * fact(n - 1)
end fact
on doMenu what
  if what is "Secret" then put "intercepted" into msg
  else pass doMenu
end doMenu
#background 1
name: Main
#script
on openCard
  countOpen
end openCard
#field 1
name: Name
rect: 10,10,100,30
#button 2
name: Choice A
rect: 10,40,60,50
style: radioButton
autoHilite: true
family: 1
#button 3
name: Choice B
rect: 70,40,120,50
style: radioButton
autoHilite: true
family: 1
#card 100
name: First
background: 1
#bgtext 1
Zebra one
#button 1
name: OK
rect: 200,100,260,120
style: roundRect
autoHilite: true
#script
on mouseUp
  put "button" into msg
  pass mouseUp
end mouseUp
#card 101
name: Second
background: 1
#bgtext 1
apple two
#card 102
name: Third
background: 1
#bgtext 1
Mango three
#end
`;

const cases = [
  // expressions and number formatting
  ['put 2 + 3 * 4', '14'], ['put 1/3', '0.333333'], ['put 7 div 2 & "," & -7 mod 3', '3,-1'], ['put 2^10', '1024'],
  ['put "a" & "b" && "c"', 'ab c'], ['put 10 / 4', '2.5'], ['put 1.50', '1.50'], ['put 1.50 + 0', '1.5'],
  ['put "abc" contains "B"', 'true'], ['put "x" is in "xyz" and 3 > 2', 'true'], ['put "Hello" = "hello"', 'true'], ['put "10" = 10.0', 'true'],
  ['put not (1 = 2)', 'true'], ['put ("5" is a number) && ("1,2" is a point)', 'true true'], ['put 3 is not 4', 'true'],
  ['put empty is ""', 'true'], ['put quote & "q" & quote', '"q"'], ['put "2,3" is within "0,0,10,10"', 'true'],
  // chunks
  ['put word 2 of "one two three"', 'two'], ['put item 2 of "x,y,z"', 'y'], ['put line 2 of ("a" & return & "b")', 'b'],
  ['put char 2 to 3 of "abcd"', 'bc'], ['put last word of "a b c"', 'c'], ['put the number of items in "a,b,c"', '3'],
  ['put the number of words of "  a  b "', '2'], ['put first char of word 2 of "ab cd"', 'c'], ['put the middle item of "1,2,3,4,5"', '3'],
  ['put "a,b" into x\nput "z" into item 4 of x\nput x', 'a,b,,z'],
  ['put "a" & return & "b" & return & "c" into x\ndelete line 2 of x\nput x', 'a\nc'],
  ['put "cd" into x\nput "ab" before x\nput "ef" after x\nput x', 'abcdef'],
  ['put "one two three" into x\nput "TWO" into word 2 of x\nput x', 'one TWO three'],
  ['put "a:b:c" into x\nset the itemDelimiter to colon\nput last item of x', 'c'],
  ['put "abc" into x\nput "Z" into char 2 of x\nput x', 'aZc'],
  ['put length("hello") & offset("l", "hello")', '53'], ['put the length of "abc"', '3'],
  // control flow
  ['if 1 < 2 then put "yes" else put "no"', 'yes'],
  ['if 1 > 2 then put "yes"\nelse put "no"', 'no'],
  ['if 1 > 2 then\n  put "a"\nelse if 2 > 3 then\n  put "b"\nelse\n  put "c"\nend if', 'c'],
  ['put 0 into t\nrepeat with i = 1 to 10\n  add i to t\nend repeat\nput t', '55'],
  ['put 0 into t\nrepeat with i = 10 down to 1\n  if i mod 2 = 0 then next repeat\n  add i to t\nend repeat\nput t', '25'],
  ['put 0 into n\nrepeat forever\n  add 1 to n\n  if n = 7 then exit repeat\nend repeat\nput n', '7'],
  ['put 0 into n\nrepeat 3 times\n  add 2 to n\nend repeat\nput n', '6'],
  ['put 1 into n\nrepeat while n < 100\n  multiply n by 3\nend repeat\nput n', '243'],
  ['put 1 into n\nrepeat until n > 50\n  multiply n by 2\nend repeat\nput n', '64'],
  ['put fact(6)', '720'], ['put value("3 * 4")', '12'], ['do "put 5 into msg"', '5'],
  ['put max(3, 9, 2) && min("4,1,8") && average(2, 4)', '9 1 3'], ['put trunc(-2.7) && abs(-3) && round(2.5) && round(3.5)', '-2 3 2 4'],
  ['put numToChar(65) & charToNum("a")', 'A97'],
  // objects
  ['put field "Name"', 'Zebra one'], ['put the number of cards', '3'], ['put the short name of this card', 'First'],
  ['put the name of card button 1', 'card button "OK"'], ['put the name of field 1', 'bkgnd field "Name"'],
  ['put the number of buttons && the number of bg buttons && the number of fields', '1 2 1'],
  ['put "Ann" into field "Name"\nput field "Name" of card "First"', 'Ann'],
  ['put field 1 of card 2', 'apple two'], ['put the rect of btn "OK"', '200,100,260,120'],
  ['set the loc of btn "OK" to 100,100\nput the rect of btn "OK"', '70,90,130,110'],
  ['set the hilite of bg btn "Choice B" to true\nput the short name of the hilitedButton of family 1', 'Choice B'],
  ['put there is a card "Third" && there is no card "Nope"', 'true true'],
  ['put the long name of btn 1', 'card button "OK" of card "First" of stack "Test"'],
  // messages and navigation
  ['go next card\nput the short name of this card', 'Second'], ['go to card "Third"\ngo back\nput the short name of this card', 'First'],
  ['go to card 3\nglobal opens\nput opens', '1'], ['go to card "Nope"\nput the result', 'No such card.'],
  ['send "mouseUp" to card button "OK"', 'stack got OK'], ['doMenu "Secret"', 'intercepted'],
  ['doMenu "Next"\nput the number of this card', '2'],
  ['sort by field "Name"\nput the short name of first card && the short name of this card', 'Second First'],
  ['find "mango"\nput the short name of this card && the foundText', 'Third Mango'],
  ['answer "Pick" with "Yes" or "No"\nput it', 'No'], ['ask "Name?"\nput it && the result', 'Sam '],
  ['put "x" into item 2 of line 2 of v\nput v', '\n,x'],
  ['put the params', 'test'], ['get 5 * 5\nput it', '25'], ['global g1\nput "kept" into g1\nput g1', 'kept'],
];
const errCases = [
  ['put 1 + "a"', /Expected a number/], ['frobnicate 3', /Can't understand "frobnicate"/], ['if "maybe" then put 1', /Expected true or false/],
  ['put field "Missing"', /No such bkgnd field/],
];

(async () => {
  let fails = 0;
  const run = async (body) => {
    const st = HCFILE.parse(STACK), out = { msg: null, err: null };
    st.stack.script += `\non test\n${body}\nend test\n`;
    const host = { message: t => { out.msg = t; }, error: t => { out.err = t; }, answer: (t, b) => b[b.length - 1], ask: () => 'Sam' };
    const it = new HYPERTALK.Interp(st, host);
    await it.top(() => it.send('test', [], { type: 'card', card: it.card() }));
    return out;
  };
  for (const [body, want] of cases) {
    const o = await run(body);
    if (o.err || o.msg !== want) { fails++; console.log(`FAIL ${JSON.stringify(body)}\n  want ${JSON.stringify(want)} got ${JSON.stringify(o.msg)}${o.err ? '  error: ' + o.err : ''}`); }
  }
  for (const [body, re] of errCases) {
    const o = await run(body);
    if (!o.err || !re.test(o.err)) { fails++; console.log(`FAIL (error) ${JSON.stringify(body)}: got ${JSON.stringify(o.err)}`); }
  }
  // clicking: a radio button in a family, then a roundRect button passing mouseUp to the stack
  {
    const st = HCFILE.parse(STACK), out = { msg: null };
    const it = new HYPERTALK.Interp(st, { message: t => { out.msg = t; }, error: t => { out.msg = 'ERR ' + t; } });
    await it.mouseDown(80, 45); await it.mouseUp(80, 45);
    const b = st.backgrounds[0].parts.filter(p => p.kind === 'button');
    const ok1 = b[1].props.hilite === 'true' && b[0].props.hilite !== 'true';
    await it.mouseDown(210, 110); const down = st.cards[0].parts[0].props.hilite === 'true'; await it.mouseUp(210, 110);
    const ok2 = down && st.cards[0].parts[0].props.hilite === 'false' && out.msg === 'stack got OK';
    if (!ok1 || !ok2) { fails++; console.log('FAIL clicks', ok1, ok2, out.msg); }
  }
  console.log(`${cases.length + errCases.length + 1} tests, ${fails} failed`);
  process.exitCode = fails ? 1 : 0;
})();
