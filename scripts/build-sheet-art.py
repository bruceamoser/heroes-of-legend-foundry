"""Small, transparent previews derived from the reviewed runtime portrait manifest."""
import hashlib, json
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parent.parent
source=json.loads((root/'static/assets/creatures/manifest.json').read_text())
out=root/'web/assets/bestiary'; out.mkdir(parents=True,exist_ok=True)
previous_path=root/'web/data/sheet-art.json'
previous={r['id']:r for r in json.loads(previous_path.read_text())['records']} if previous_path.exists() else {}
records=[]
for p in source['portraits']:
    target=out/(p['id']+'.webp')
    old=previous.get(p['id'],{})
    reusable=target.exists() and target.stat().st_size>100 and old.get('sourceSha256')==p['sourceSha256'] and old.get('sha256')==hashlib.sha256(target.read_bytes()).hexdigest()
    if not reusable:
        with Image.open(root/'static'/p['asset']) as im:
            im.thumbnail((384,384),Image.Resampling.LANCZOS)
            im.save(target,format='WEBP',quality=80,method=2)
    records.append({'id':p['id'],'asset':'assets/bestiary/'+target.name,'sourceSha256':p['sourceSha256'],'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size})
(root/'web/data/sheet-art.json').write_text(json.dumps({'sourceCommit':source['source']['commit'],'records':records},indent=2)+'\n')
print(f'{len(records)} previews; {sum(r["bytes"] for r in records):,} bytes')
