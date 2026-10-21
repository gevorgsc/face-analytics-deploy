FROM python:3.11.15-slim-trixie@sha256:90744cff8f32887f075c47d747a173ff333e9e98801667af93c357fa9f5e28ff
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libsm6 libxrender1 libxext6 libgomp1 libopenblas-dev \
    libstdc++6 ffmpeg postgresql-client fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV LD_LIBRARY_PATH=/app/SDK/lib:/app/SDK/lib/HCNetSDKCom
COPY backend/requirements.txt backend/requirements.lock ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY assets-manifest.json ./assets-manifest.json
RUN chmod -R a+rX SDK .insightface
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser && \
    mkdir -p media exports backups runtime logs .cache .insightface && \
    chown -R appuser:appgroup media exports backups runtime logs .cache .insightface
ENV HOME=/app
ENV XDG_CACHE_HOME=/app/.cache
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1
CMD ["sh", "-c", "python bootstrap_database.py && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --timeout-keep-alive 120"]
