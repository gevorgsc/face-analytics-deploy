"""Verify generic CPU models and Linux SDK, without database or camera access."""
import ctypes
import hashlib
import json
from pathlib import Path
import platform

ROOT = Path(__file__).resolve().parent


def main():
    manifest = json.loads((ROOT / 'assets-manifest.json').read_text(encoding='utf-8'))
    asset = next(item for item in manifest['assets'] if item['group'] == 'models-sdk')
    for record in asset['files']:
        path = ROOT / record['target'].removeprefix('backend/')
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != record['sha256']:
            raise SystemExit('Missing/modified runtime file: ' + record['target'])
    if platform.system() != 'Linux' or platform.machine() not in ('x86_64', 'amd64'):
        raise SystemExit('Run this verification inside the Linux amd64 backend container.')
    ctypes.CDLL(str(ROOT / 'SDK/lib/libhcnetsdk.so'))
    ctypes.CDLL(str(ROOT / 'SDK/lib/libPlayCtrl.so'))
    print('Linux SDK libraries loaded. No SDK initialization or camera login was performed.')
    import cv2
    import numpy as np
    import faiss
    from insightface.app import FaceAnalysis
    assert faiss.IndexFlatIP(512).ntotal == 0
    model = FaceAnalysis(name='buffalo_l', root=str(ROOT / '.insightface'),
                         allowed_modules=['detection', 'recognition', 'genderage'], providers=['CPUExecutionProvider'])
    model.prepare(ctx_id=-1, det_size=(640, 640), det_thresh=0.35)
    result = model.get(np.zeros((640, 640, 3), dtype=np.uint8))
    print(f'CPU model inference OK; {len(result)} detections on a blank frame; OpenCV {cv2.__version__}.')
    print('No enrollment, media file, database write or device command was created.')


if __name__ == '__main__':
    main()

