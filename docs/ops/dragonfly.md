# DragonflyDB compatibility

The API server (`apps/server`) works with either Redis 6.2+ or [DragonflyDB](https://www.dragonflydb.io/). Both speak RESP, so the same `ioredis` client and the same `REDIS_*` variables work for both. To switch engines, point `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_TLS` at a Dragonfly instance. No code change is needed.

Local development runs Dragonfly (`compose.yaml`, service `redis`, port `26379`).

## Commands the server uses

Every command below was checked against Dragonfly v2.1 (`ghcr.io/dragonflydb/dragonfly:v2.1.0`):

| Area | Code | Commands |
|------|------|----------|
| Cache | `utils/cache.ts` | `SET EX`, `SET EX NX`, `GET`, `EXISTS`, `GETDEL`, `DEL`, `FLUSHDB` |
| Rate limiting | `utils/rateLimit.ts` | `INCR`, `EXPIRE` |
| Access engine | `services/access/engine.ts` | `GET`, `INCR`, `SET EX`, `SET EX NX` |
| Nightly jobs, pools list, Telegram dedupe | `services/access/nightly.ts`, `trpc/pools/list.ts`, `routes/telegram.ts` | `SET EX NX`, `DEL` |
| Reserved handles | `services/reservedHandles.ts` | `GET`, `INCR` |
| Notification lock | `services/notifications/jobs.ts` | `SET PX NX`, `EVAL` (`GET` + `PEXPIRE`) |
| Realtime bus | `services/realtime/bus.ts` | `PUBLISH`, `SUBSCRIBE`, `UNSUBSCRIBE`, `SET EX`, `EXISTS` |

## Rules for new Redis code

- **Lua scripts must declare every key in `KEYS`.** Dragonfly rejects scripts that read or write a key they did not declare (Redis allows it). Never build key names inside a script.
- **Do not depend on keyspace notifications, `CLIENT TRACKING`, or modules** (RedisJSON, RediSearch, ...) without checking the [Dragonfly command reference](https://www.dragonflydb.io/docs/command-reference/compatibility) first.
- **Avoid `KEYS` in request paths.** Use `SCAN` or a known key instead, which is good practice on both engines.
- Build every client from `redisConnectionOptions()` in `utils/cache.ts`, so TLS and auth stay the same for every connection.

## Running Dragonfly

- Dragonfly needs 256 MiB of memory per thread and exits at startup when the host has less. Set `--proactor_threads` (and optionally `--maxmemory`) on small machines.
- Managed Dragonfly (Dragonfly Cloud) uses a password and TLS: set `REDIS_PASSWORD` and `REDIS_TLS=true`.
- From v2.1 Dragonfly ships under an updated license (see the upstream `LICENSE.md`). Review it before you use Dragonfly in production.
