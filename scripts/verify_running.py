"""Check the new deployment without contacting or changing camera devices."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://localhost:8081')
    parser.add_argument('--models', action='store_true', help='Also run copied model inference and load native SDK inside backend.')
    args = parser.parse_args()
    command = ['docker', 'compose', '-f', str(ROOT / 'compose.yml')]
    subprocess.run(command + ['config', '--quiet'], cwd=ROOT, check=True)
    subprocess.run(command + ['ps'], cwd=ROOT, check=True)
    for route in ('/', '/health', '/ready'):
        request = urllib.request.Request(args.url.rstrip('/') + route, headers={'User-Agent': 'Face-Analytics-Verify/1'})
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                payload = response.read()
                print(f'{route}: HTTP {response.status}')
                if route != '/':
                    state = json.loads(payload)
                    if state.get('status') not in ('ok', 'ready'):
                        raise SystemExit(f'{route}: application reports {state.get("status")}; inspect its local readiness details.')
                    faiss_state = state.get('faiss', state.get('checks', {}).get('faiss'))
                    if faiss_state != 'ok':
                        raise SystemExit(f'{route}: FAISS is unavailable.')
        except urllib.error.HTTPError as error:
            print(f'{route}: HTTP {error.code}; inspect docker compose logs backend and /ready details locally.')
            raise SystemExit(1)
    if args.models:
        subprocess.run(command + ['exec', '-T', 'backend', 'python', 'verify_runtime.py'], cwd=ROOT, check=True)
    print('Verify the signed license and real video/camera configuration in the UI next. No camera command was issued by this check.')


if __name__ == '__main__':
    main()

