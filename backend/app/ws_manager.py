import asyncio
import json
import logging
import os
import uuid

from fastapi import WebSocket

logger = logging.getLogger(__name__)

MAX_WS_CONNECTIONS = int(os.getenv("MAX_WS_CONNECTIONS", "100"))
MAX_WS_PER_IP = int(os.getenv("MAX_WS_PER_IP", "5"))
WS_REDIS_CHANNEL = os.getenv("WS_REDIS_CHANNEL", "face-analytics:websocket")


def _get_client_ip(websocket: WebSocket) -> str:
    if os.getenv("TRUST_PROXY_HEADERS", "0") == "1":
        forwarded_for = websocket.headers.get("X-Forwarded-For", "")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
    return websocket.client.host if websocket.client else "unknown"


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self._ip_counts: dict[str, int] = {}
        self._ws_ip: dict[int, str] = {}
        self._instance_id = uuid.uuid4().hex
        self._fanout_task: asyncio.Task | None = None
        self._fanout_stop = asyncio.Event()
        self._redis = None

    async def connect(self, websocket: WebSocket) -> bool:
        client_ip = _get_client_ip(websocket)
        if len(self.active_connections) >= MAX_WS_CONNECTIONS:
            await websocket.close(code=4008)
            return False
        if self._ip_counts.get(client_ip, 0) >= MAX_WS_PER_IP:
            await websocket.close(code=4008)
            return False

        await websocket.accept()
        self.active_connections.append(websocket)
        self._ip_counts[client_ip] = self._ip_counts.get(client_ip, 0) + 1
        self._ws_ip[id(websocket)] = client_ip
        return True

    def disconnect(self, websocket: WebSocket):
        if websocket not in self.active_connections:
            return
        self.active_connections.remove(websocket)
        client_ip = self._ws_ip.pop(id(websocket), None)
        if client_ip is None:
            client_ip = websocket.client.host if websocket.client else "unknown"
        count = self._ip_counts.get(client_ip, 1) - 1
        if count <= 0:
            self._ip_counts.pop(client_ip, None)
        else:
            self._ip_counts[client_ip] = count

    async def broadcast(self, message: dict, publish: bool = True):
        if publish and self._redis is not None:
            try:
                await self._redis.publish(
                    WS_REDIS_CHANNEL,
                    json.dumps({"instance_id": self._instance_id, "message": message}, default=str),
                )
            except Exception as exc:
                logger.warning("WebSocket Redis publish failed: %s", exc)

        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for connection in disconnected:
            logger.debug(
                "WebSocket client %s dropped during broadcast",
                self._ws_ip.get(id(connection), "unknown"),
            )
            self.disconnect(connection)

    async def start_fanout(self) -> None:
        redis_url = os.getenv("REDIS_URL", "")
        if not redis_url or self._fanout_task:
            return
        try:
            import redis.asyncio as redis_async

            self._redis = redis_async.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=3,
            )
            await self._redis.ping()
        except Exception as exc:
            self._redis = None
            logger.warning("WebSocket Redis fan-out unavailable: %s", exc)
            return

        self._fanout_stop.clear()
        self._fanout_task = asyncio.create_task(self._fanout_loop(), name="ws-redis-fanout")
        logger.info("WebSocket Redis fan-out started on %s", WS_REDIS_CHANNEL)

    async def _fanout_loop(self) -> None:
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(WS_REDIS_CHANNEL)
        try:
            while not self._fanout_stop.is_set():
                item = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if not item:
                    await asyncio.sleep(0.05)
                    continue
                try:
                    payload = json.loads(item["data"])
                    if payload.get("instance_id") == self._instance_id:
                        continue
                    message = payload.get("message")
                    if isinstance(message, dict):
                        await self.broadcast(message, publish=False)
                except Exception as exc:
                    logger.warning("Invalid WebSocket fan-out message: %s", exc)
        finally:
            await pubsub.unsubscribe(WS_REDIS_CHANNEL)
            await pubsub.aclose()

    async def stop_fanout(self) -> None:
        self._fanout_stop.set()
        if self._fanout_task:
            self._fanout_task.cancel()
            try:
                await self._fanout_task
            except asyncio.CancelledError:
                pass
            self._fanout_task = None
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None


manager = ConnectionManager()
