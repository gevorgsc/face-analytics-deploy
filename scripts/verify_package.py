"""Verify the exact server source and all extracted SDK/model/frontend files."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main() -> None:
    missing, changed = [], []
    sources = json.loads((ROOT / 'source-code-manifest.json').read_text(encoding='utf-8'))
    manifest = json.loads((ROOT / 'assets-manifest.json').read_text(encoding='utf-8'))
    records = sources + [entry for asset in manifest['assets'] for entry in asset['files']]
    for record in records:
        name = record.get('target') or record['path']
        path = (ROOT / name).resolve()
        if not path.is_relative_to(ROOT):
            raise SystemExit('Invalid manifest path.')
        if not path.is_file():
            missing.append(name)
        elif digest(path) != record['sha256']:
            changed.append(name)
    if missing or changed:
        print(json.dumps({'missing': missing, 'changed': changed}, indent=2))
        raise SystemExit(1)
    print(f'Package verified: {len(sources)} original backend Python files, '
          f'{sum(len(asset["files"]) for asset in manifest["assets"])} runtime SDK/model/frontend files.')
    print('This checks file completeness and content. Use verify_running.py for a started installation.')


if __name__ == '__main__':
    main()

