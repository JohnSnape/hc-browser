#hc 1
#stack
name: Main
#script
on openStack
  global visits
  add 1 to visits
  put "Main stack, visit" && visits into field "Status"
end openStack
#background 1
#field 1
name: Status
rect: 20,20,300,40
style: rectangle
lockText: true
#button 2
name: Go to Second
rect: 20,60,140,80
style: roundRect
showName: true
autoHilite: true
#script
on mouseUp
  go to stack "second"
  put "arrived from Main" into line 2 of field "Status"
end mouseUp
#button 3
name: Card 2
rect: 160,60,280,80
style: roundRect
showName: true
autoHilite: true
#script
on mouseUp
  visual effect dissolve
  go next card
end mouseUp
#card 1
name: One
background: 1
#card 2
name: Two
background: 1
#end
