"""Download deployment assets and generate fresh local configuration."""
from __future__ import annotations

import argparse
import base64
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def read_env(path: Path) -> dict[str, str]:
    values = {}
    if path.exists():
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            match = re.match(r'^([A-Za-z_]\w*)=(.*)$', line.strip())
            if match:
                values[match[1]] = match[2].strip()
    return values


def write_env(path: Path, values: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8', newline='\n') as output:
        output.write('# Local installation secrets. Do not commit this file.\n')
        output.writelines(f'{key}={value}\n' for key, value in values.items())
    path.chmod(0o600)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='localhost', help='Destination PC hostname or LAN IPv4, without http://.')
    parser.add_argument('--frontend-port', type=int, default=8081)
    parser.add_argument('--backend-port', type=int, default=8001)
    parser.add_argument('--skip-download', action='store_true', help='Generate config only; assets must be supplied separately.')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9.-]+', args.host):
        parser.error('Host must be a hostname or IPv4 address, without scheme, port or path.')
    if not all(1 <= port <= 65535 for port in (args.frontend_port, args.backend_port)):
        parser.error('Ports must be between 1 and 65535.')
    if args.frontend_port == args.backend_port:
        parser.error('Frontend and backend host ports must differ.')
    if not args.skip_download:
        subprocess.run([sys.executable, str(ROOT / 'scripts/fetch_assets.py')], check=True)
    root_env_path = ROOT / '.env'
    if not root_env_path.exists():
        write_env(root_env_path, {
            'COMPOSE_PROJECT_NAME': 'face-analytics', 'POSTGRES_USER': 'faceadmin',
            'POSTGRES_PASSWORD': secrets.token_hex(24), 'REDIS_PASSWORD': secrets.token_hex(24),
            'FRONTEND_PORT': str(args.frontend_port), 'BACKEND_PORT': str(args.backend_port),
            'MEDIA_MIN_FREE_GB': '2', 'MEDIA_MAX_GB': '0', 'ENABLE_API_DOCS': '0'})
        print('Created local .env with fresh PostgreSQL and Redis credentials.')
    else:
        print('Preserved existing .env.')
    root_env = read_env(root_env_path)
    port = root_env.get('FRONTEND_PORT', str(args.frontend_port))
    backend_env_path = ROOT / 'backend/.env'
    if not backend_env_path.exists():
        values = read_env(ROOT / 'deploy/backend.face.env.example')
        origins = list(dict.fromkeys([f'http://localhost:{port}', f'http://127.0.0.1:{port}', f'http://{args.host}:{port}']))
        values.update({
            'SECRET_KEY': secrets.token_urlsafe(64), 'DEFAULT_ADMIN_PASSWORD': secrets.token_urlsafe(24),
            'CAMERA_PASSWORD_KEY': base64.urlsafe_b64encode(os.urandom(32)).decode(),
            'ALARM_API_KEY': secrets.token_urlsafe(32), 'METRICS_API_KEY': secrets.token_urlsafe(32),
            'DATABASE_URL': 'postgresql+psycopg2://faceadmin:unused@postgres:5432/face_analytics',
            'REDIS_URL': 'redis://redis:6379/0', 'ALLOWED_ORIGINS': ','.join(origins),
            'ALLOWED_HOSTS': ','.join(dict.fromkeys(['localhost', '127.0.0.1', 'backend', args.host])),
            'INSIGHTFACE_CTX_ID': '-1', 'INSIGHTFACE_MODEL': 'buffalo_l',
            'LICENSE_ENFORCEMENT': '1', 'LICENSE_SERVER_URL': '',
            'LICENSE_PUBLIC_KEY_FILE': 'license_public_key.pem', 'LICENSE_FILE': 'runtime/license.json',
            'LICENSE_INSTALLATION_ID_FILE': 'runtime/installation_id',
            'ALARM_OPEN_ACCESS': '0', 'CAMERA_AUTO_REGISTER': '0'})
        write_env(backend_env_path, values)
        print('Created backend/.env. Initial admin password is stored there as DEFAULT_ADMIN_PASSWORD.')
    else:
        print('Preserved existing backend/.env.')
    print(f'Next: docker compose -f compose.yml up -d --build\nWeb UI: http://{args.host}:{port}')
    print('Keep license enforcement enabled. Activate this new installation with a valid signed license.')


if __name__ == '__main__':
    main()

