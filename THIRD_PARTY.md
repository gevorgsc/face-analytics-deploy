# Runtime provenance

This repository preserves the owner's application code and deployment inputs.
Third-party libraries, native SDKs and model weights retain their upstream terms.

- Hikvision Linux HCNetSDK and PlayCtrl: complete used /app/SDK/lib directory from
  the running backend, including the HCNetSDKCom libraries and supporting files.
- InsightFace Buffalo_L: five generic pretrained ONNX models from that backend's
  model cache. No enrolled identity embeddings or personal training data accompany them.
- FastAPI, SQLAlchemy, Alembic, Redis client, FAISS CPU, ONNX Runtime, InsightFace,
  OpenCV, WebRTC and report libraries: versions recorded in source-runtime.json and
  backend/requirements.lock; installed from upstream Python packages.
- React/Vite and frontend libraries: source package.json/package-lock.json preserved.
- Python, Node, Nginx, PostgreSQL and Redis images: official Docker Hub references
  verified and pinned by digest in base-images.lock.json/deployment definitions.
- The public verification key belongs to the application's license system. Private
  issuer keys and the source installation's bound license are excluded. Licensing
  code and issuance tools are retained for the legitimate activation workflow.

