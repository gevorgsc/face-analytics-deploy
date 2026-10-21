# Face Analytics Pro deployment handoff

The owner requested a separate public repository for the analytics application
running on the SSH server, with all required source/runtime assets, verification of
completeness, and detailed Armenian installation instructions. Keep this separate
from gevorgsc/detect-deploy, the Windows GPU skeleton/activity application.

Read PROJECT_AND_INSTALLATION_HY.md first. This is the server's four-service
Face Analytics Pro deployment: FastAPI backend, Nginx/React frontend, PostgreSQL 16,
and Redis 7. A separate Telegram/catalog bot on that server is independent and is
not a dependency of this deployment. The source server was inspected/copied without
changing files, containers, credentials, camera configuration or running services.

## Install on the destination

1. Use an x86_64 Linux host with Docker Engine/Compose, or Windows Docker Desktop
   with Linux containers. The SDK assets are Linux x86_64 .so files. Native Windows
   execution would require a separate Windows SDK and additional validation.
2. Use Python 3.11+ on the host for the standard-library setup/download tools.
3. Run `python scripts/setup.py --host DESTINATION_IP_OR_HOSTNAME`. This downloads
   models/SDK and the exact served frontend, verifies all hashes, and generates
   fresh ignored .env and backend/.env files. It preserves existing environment
   files. Credentials are never shared through the public repository.
4. Run `python scripts/verify_package.py` BEFORE build, then
   `docker compose -f compose.yml up -d --build`. Default UI is port 8081 and backend
   is bound to 127.0.0.1:8001. These avoid the other Detect app's port 8000.
5. Run `python scripts/verify_running.py --url http://localhost:8081 --models`.
   This checks Compose, HTTP endpoints, copied files, CPU inference and Linux SDK
   loading inside the new container. It does not issue camera commands.
6. Log in as admin, using DEFAULT_ADMIN_PASSWORD from local backend/.env. Licensing
   is preserved and enabled. A fresh installation requires a valid signed
   face_analytics license for its new Installation ID. The source installation's
   bound license and private issuer key were deliberately excluded. Obtain a new
   license from the owner, or follow the documented fresh-issuer flow if operating
   an independent issuer. Do not disable or remove license checks as a setup fix.
7. Add actual camera connections, sites, map and operating rules through the UI.
   Existing people, camera passwords, database records, media, history and backups
   were not copied. Test real video/SDK/snapshots, recognition and reporting there.
8. Stop the new stack with `docker compose -f compose.yml down`; preserve volumes.

## Fidelity and checks

- The live backend's 131 application/migration/tool Python files matched the host
  source at capture. Original backend Python bytes remain unchanged in the repo.
- Generic Buffalo_L models and the complete used Linux SDK are copied from the
  running container, with each file's SHA-256. They include no enrolled embeddings.
- All 1624 served frontend files were individually checked against the running
  frontend. Default Dockerfile.frontend.snapshot preserves that exact UI. Editable
  React source and the build Dockerfile are also included; use the documented
  compose.frontend-source.yml override when rebuilding after source edits.
- Original application sources retain their mixed line endings. .gitattributes
  disables normalization so verify_package.py can compare exact captured bytes.
- Source had both full and headless OpenCV distributions, but imported 5.0.0.
  Target requirements use only opencv-python 5.0.0.93. Original requirements and
  the full source package inventory are retained for comparison.
- Backend unit/API tests: 189 passed. Frontend tests: 27 passed. Source UI build
  passed. See VERIFICATION.json and manifests for the final package checks.
- The preparation Windows host had no Docker or WSL; a fresh Linux Compose stack
  was not started there. Verify the destination build, volumes, health, licensing,
  real devices and performance on the destination. No test containers were started
  on the production source server.

If the destination has low disk capacity, configure retention and media limits
before prolonged use. Preserve local secrets and license/runtime volumes on updates.
Never upload production keys, environment values, personal media or database dumps.

