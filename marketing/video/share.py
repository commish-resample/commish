import math
from PIL import Image, ImageDraw, ImageFilter
import render as R
W,H=1200,630
bg=Image.new('RGBA',(W,H),R.YEL+(255,))
import numpy as np
g=np.linspace(0,1,H)[:,None]; top=np.array([255,236,120]); bot=np.array([255,214,70])
bg=Image.fromarray(np.repeat((top*(1-g)+bot*g)[:,None,:].reshape(H,1,3),W,1).astype(np.uint8)).convert('RGBA')
for im,(cx,cy) in [(R.blob(260,R.PINK,150),(0.78,0.2)),(R.blob(280,(140,116,255),110),(0.95,0.95)),(R.blob(220,(255,255,255),170),(0.1,0.1))]:
    bg.alpha_composite(im,(int(cx*W-im.width/2),int(cy*H-im.height/2)))
# phone
scr=Image.open('/tmp/demo-phone.png').convert('RGB')
SW,SH=300,650; BZ=12; PW,PH=SW+2*BZ,SH+2*BZ
scr=scr.resize((SW,int(scr.height*SW/scr.width)),Image.LANCZOS)
_c=Image.new('RGB',(SW,SH),(255,228,92)); _c.paste(scr.crop((0,0,SW,SH-44)),(0,44)); scr=_c
ph=Image.new('RGBA',(PW,PH),(0,0,0,0))
ph.paste(Image.new('RGBA',(PW,PH),R.INK+(255,)),(0,0),R.rr_mask(PW,PH,50))
ImageDraw.Draw(ph).rounded_rectangle((1,1,PW-2,PH-2),49,outline=(255,255,255,90),width=2)
ph.paste(scr,(BZ,BZ),R.rr_mask(SW,SH,40))
# island
ImageDraw.Draw(ph).rounded_rectangle((PW/2-48,BZ+10,PW/2+48,BZ+36),13,fill=(10,8,20,255))
dst=R.project(PW,PH,905,395,1.0,math.radians(-9),math.radians(4),f=1800)
co=R.homography([(0,0),(PW,0),(PW,PH),(0,PH)],dst)
wp=ph.transform((W,H),Image.PERSPECTIVE,tuple(co),Image.BICUBIC)
a=wp.getchannel('A').filter(ImageFilter.GaussianBlur(18)).point(lambda v:int(v*.4))
sh=Image.new('RGBA',(W,H),R.INK+(0,)); sh.putalpha(a); bg.alpha_composite(sh,(18,26)); bg.alpha_composite(wp)
for im,(x,y) in [(R.glass_disc(40),(690,520)),(R.glass_disc(26),(1120,90))]: bg.alpha_composite(im,(x-im.width//2,y-im.height//2))
d=ImageDraw.Draw(bg)
R.logo(bg,70+150,105,64,1.0)
d.text((72,200),'See what TikTok',font=R.font(70),fill=R.INK)
d.text((72,278),'Shop really',font=R.font(70),fill=R.INK)
d.text((72,356),'paid you',font=R.font(70),fill=R.INK)
d.text((74,470),'Paid, pending and lost commission, plus',font=R.font(27,600),fill=R.INK)
d.text((74,506),'ideas to earn more. Your file never',font=R.font(27,600),fill=R.INK)
d.text((74,542),'leaves your device.',font=R.font(27,600),fill=R.INK)
d.rounded_rectangle((1,1,W-2,H-2),0,outline=None)
bg.convert('RGB').save('/home/claude/commish/public/share.png',optimize=True)
