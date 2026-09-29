import sys, glob, os
from PIL import Image, ImageDraw
files = sorted(glob.glob(sys.argv[1]))
out = sys.argv[2]
cell = int(sys.argv[3]) if len(sys.argv) > 3 else 160
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 6
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cell, rows * (cell + 16)), (44, 46, 60))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGBA')
    im.thumbnail((cell - 8, cell - 8))
    x, y = (i % cols) * cell, (i // cols) * (cell + 16)
    sheet.paste(im, (x + 4, y + 4), im)
    d.text((x + 4, y + cell), os.path.basename(f)[:26], fill=(255, 255, 255))
sheet.save(out)
