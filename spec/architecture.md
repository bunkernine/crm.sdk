# Architecture — Design Decisions

## Spec-first

Functional tests are the behavioral contract: they call `createCrm` (via a thin argv dispatcher in `test/helpers.ts`) and assert on returned objects or thrown `CrmError` messages. Implementation = make those tests green. The README and `skills/SKILL.md` describe the same surface for humans and agents.

## Why an SDK, not a mount

The previous product taught agents to `ls` / `cat` a FUSE or NFS tree. That layer is gone. The SDK **is** the agent interface: strongly typed arguments in, typed records or thrown errors out, plus `skills/SKILL.md`. No MCP, REST, or second protocol.

## Why Postgres schema `crm` + Drizzle

Four tables (contacts, companies, deals, activities) plus `search_index` live in schema `crm`. JSON arrays/objects are `jsonb` with the same shapes the app already used after `JSON.parse`. Unique partial indexes remain on contact social handles. `deals.company` is `ON DELETE SET NULL`.

The caller supplies a connection string. There is no embedded SQLite file, no `database.path` config, no Turso fallback.

## Why `search` and `find` both exist (as implemented)

**`search`:** Postgres `to_tsvector('simple', content) @@ plainto_tsquery('simple', query)`, then `content ILIKE` if that path throws — same control flow as the old FTS5 try/catch.

**`find`:** Word-overlap score on `search_index.content`. README historically mentioned ONNX embeddings; the code never shipped them. Keep word-overlap.

## Why hooks are callbacks

CLI hooks ran a shell command with JSON on stdin. The SDK keeps the same hook **names** and abort semantics (`false` / throw aborts) with `(data) => boolean | Promise<boolean>`.

## Concurrency

Postgres serializes writes. Tests truncate `crm.*` and run with `--max-concurrency 1` so they do not wipe each other. Production callers should use a connection pool appropriate to their host; `createCrm` uses a single `postgres` client (`max: 1`) per SDK instance.
