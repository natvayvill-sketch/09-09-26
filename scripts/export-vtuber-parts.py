# Exports the layers of public/images/vtuber/vtuber.psd as half-size, cropped
# .webp parts plus parts.json (positions), for the 2D Living Portrait puppet.
# Needs Python 3 with psd-tools:  pip install psd-tools
# Usage:  python3 scripts/export-vtuber-parts.py public/images/vtuber/vtuber.psd public/images/vtuber/parts
# Layer names in the PSD are generic, so parts are matched by their position
# in the layer tree (NAMES below). Moving/adding layers means updating NAMES.
import sys, json, os, warnings
warnings.filterwarnings("ignore")
from psd_tools import PSDImage
psd = PSDImage.open(sys.argv[1]); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
SCALE = 0.5
# path -> (name, unfinished?)
NAMES = {
 "1.0":"halo","2.0":"hair-back","3.0":"sleeve-back-r","3.1":"sleeve-back-l",
 "4.0":"sleeve-puff-r","4.1":"sleeve-puff-l","5":"torso","6":"tassels","7":"head",
 "8.0":"eye-white-l","8.1":"eye-white-r","9.0.0":"iris-l","9.0.1":"iris-r",
 "9.1.0":"highlight-l","9.1.1":"highlight-r","9.2.0.0":"eyelid-l","9.2.0.1":"eyelid-r",
 "9.2.1":"mouth-inside","9.2.2":"teeth-top","9.2.3":"teeth-bottom","9.2.4":"lip-lower",
 "9.2.5":"lip-upper","9.2.6":"nose","9.2.7.0":"lash-lower-l","9.2.7.1":"lash-lower-r",
 "9.2.8.0":"brow-l","9.2.8.1":"brow-r","10.0":"crown","11.0":"lash-upper-l","11.1":"lash-upper-r",
 "12":"hair-curl","13.1":"earrings","14":"hair-front",
}
UNFINISHED = {"sleeve-back-r","sleeve-back-l","sleeve-puff-r","sleeve-puff-l","tassels","hair-curl","earrings"}
parts = []
def walk(layers, path):
    for i, l in enumerate(layers):
        p = path + [str(i)]; pid = ".".join(p)
        if l.is_group(): walk(l, p); continue
        name = NAMES.get(pid)
        if not name: continue
        im = l.topil().convert("RGBA"); bb = im.getbbox()
        if not bb: continue
        im = im.crop(bb)
        im = im.resize((max(1,round(im.width*SCALE)), max(1,round(im.height*SCALE))))
        im.save(f"{out}/{name}.webp", "WEBP", quality=88, method=6)
        parts.append({"name":name,"x":round(bb[0]*SCALE),"y":round(bb[1]*SCALE),"w":im.width,"h":im.height,"unfinished":name in UNFINISHED})
walk(psd, [])
json.dump({"width":round(psd.width*SCALE),"height":round(psd.height*SCALE),"parts":parts}, open(f"{out}/parts.json","w"), indent=1)
print(len(parts), "parts")
