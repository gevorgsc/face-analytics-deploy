# Face Analytics Pro — verified server deployment

**Մանրամասն հայերեն նախագծի նկարագրություն և տեղադրման ամբողջական ուղեցույց՝
[PROJECT_AND_INSTALLATION_HY.md](PROJECT_AND_INSTALLATION_HY.md)**։

Public repository: https://github.com/gevorgsc/face-analytics-deploy  
Runtime assets: https://github.com/gevorgsc/face-analytics-deploy/releases/tag/deployment-v1

This packages the running server's Face Analytics Pro application: FastAPI, React/
Nginx, PostgreSQL 16, Redis 7, InsightFace Buffalo_L on CPU, FAISS, and the used Linux
Hikvision SDK. It includes both editable React source and the exact served frontend.
It is separate from the Windows GPU application at gevorgsc/detect-deploy.

## Install

Use Linux x86_64 Docker Engine/Compose, or Windows Docker Desktop with Linux
containers. Python 3.11+ is needed on the host for the standard-library setup tools.
GitHub authentication and Git LFS are not required.

```text
git clone https://github.com/gevorgsc/face-analytics-deploy.git
cd face-analytics-deploy
python scripts/setup.py
python scripts/verify_package.py
docker compose -f compose.yml up -d --build
python scripts/verify_running.py --url http://localhost:8081 --models
```

On Linux, use `python3` if that is the Python command. For LAN use, pass
`--host DESTINATION_IP` to setup.py before the local env files are created.
The UI defaults to **http://localhost:8081**; backend diagnostics bind to
**127.0.0.1:8001**, avoiding the other Detect application's port 8000.

Setup generates fresh ignored `.env` and `backend/.env` files, preserves existing
ones, and downloads verified model/SDK/frontend archives. Initial login is `admin`;
its generated password is in local `backend/.env` as `DEFAULT_ADMIN_PASSWORD`.

**Licensing remains enabled.** A new installation needs a signed `face_analytics`
license for its new Installation ID. The original public verification key and
legitimate issuance tools are included. Private issuer keys and the old bound
license are excluded. See the guide's licensing section before configuring devices.

## Included and verified

- All 131 live application/migration/tool Python files matched the host source.
- Original backend Python bytes are preserved, with a source hash manifest.
- Five generic Buffalo_L models and the complete used Linux SDK are copied from
  the running container: 30 runtime files verified individually.
- All 1624 served frontend files were individually verified against the live container.
- Editable React source, package lock, source dependency inventory, database schema/
  migrations, setup tools and digest-pinned official Docker images are included.
- Backend tests: **189 passed**. Frontend tests: **27 passed**. Source UI build passed.
- An isolated fresh SQLite bootstrap, admin creation, health/readiness, real CPU
  model inference and the license-required API guard also passed.

Source had two OpenCV distributions; it imported OpenCV 5.0.0. Target requirements
retain that imported version using one `opencv-python` distribution. Original
requirements and the full source package list are kept for comparison.

The preparation Windows host had no Docker/WSL. A new Linux Compose stack must
still be built and checked on the destination; no test services were installed on
the production server. See VERIFICATION.json and INSTALL_HANDOFF.md for details.

## Data and frontend builds

Production credentials, enrolled people/embeddings, camera records, personal media,
database state, logs and backups are excluded. New databases start empty. Configure
actual cameras and operating rules locally after installing a valid license.

Default `Dockerfile.frontend.snapshot` serves the captured running UI. To rebuild
after editing React source:

```text
docker compose -f compose.yml -f compose.frontend-source.yml up -d --build frontend
```

Stop with `docker compose -f compose.yml down`; preserve the named volumes.
Do not use `down -v` when retaining local data. Keep local environment and license
keys out of Git. Third-party components retain their upstream terms.

