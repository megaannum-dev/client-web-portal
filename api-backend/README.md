# api-backend

## Deployment: single worker

Run exactly ONE process (`uvicorn --workers 1`, one replica). The Dockerfile pins this.

In-process state that assumes it:
- Chat WebSocket tickets (`app/libs/chat/realtime.py` `_tickets`) and the connection manager (`manager`) used for message fan-out.
- The in-app schedulers started in `app/main.py`.
- Caches (`allocation_matrix/cache.py`, `core/flex_query.py`).

With more than one worker or replica:
- A WS ticket minted on process A is rejected on process B.
- A message posted on A is not pushed to sockets parked on B.
- Every scheduler runs N times.
- Each process holds its own cache, so reads can disagree.

Upgrade path: Redis-backed tickets plus pub/sub fan-out for chat; move the schedulers out of
process (a separate job/cron container); then a shared or invalidated cache.
