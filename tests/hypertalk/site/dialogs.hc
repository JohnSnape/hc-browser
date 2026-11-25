#hc 1
#stack
name: Dialogs
#background 1
#field 1
name: Result
rect: 20,150,300,170
style: rectangle
lockText: true
#button 2
name: Answer
rect: 20,20,140,40
style: roundRect
showName: true
autoHilite: true
#script
on mouseUp
  answer "Save changes before closing?" with "Cancel" or "No" or "Yes"
  put "answer: " & it into field "Result"
end mouseUp
#button 3
name: Ask
rect: 160,20,280,40
style: roundRect
showName: true
autoHilite: true
#script
on mouseUp
  ask "What is your name?" with "John"
  if the result is "Cancel" then put "ask: cancelled" into field "Result"
  else put "ask: " & it into field "Result"
end mouseUp
#button 4
name: Long
rect: 20,50,140,70
style: roundRect
showName: true
autoHilite: true
#script
on mouseUp
  answer "This is a much longer message that should need to wrap onto more than one line inside the dialog box, so we can see how wide it gets and where the lines break."
  put "answer: " & it into field "Result"
end mouseUp
#button 5
name: Password
rect: 160,50,280,70
style: roundRect
showName: true
autoHilite: true
#script
on mouseUp
  ask password "Password:"
  put "password: " & it into field "Result"
end mouseUp
#card 1
name: One
background: 1
#end
