#hc 1
#stack
name: Second
#script
on openStack
  global visits
  put "Second stack; visits so far:" && visits into field "Status"
end openStack
#background 1
#field 1
name: Status
rect: 20,20,300,50
style: shadow
lockText: true
#button 2
name: Home
rect: 20,70,120,90
style: shadow
showName: true
autoHilite: true
#script
on mouseUp
  go home
end mouseUp
#card 1
background: 1
#end
