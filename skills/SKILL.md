---
name: crm-sdk
description: Operate a CRM (contacts, companies, deals, pipeline, search, reports) through the typed @bunkernineai/crm.sdk package — Postgres schema crm, no filesystem mount
---

# crm.sdk

This package exists so an agent can run the CRM. Import `@bunkernineai/crm.sdk`, call `createCrm`, then use typed methods. Do not `ls` a mount, do not spawn a `crm` binary, do not invent SQL.

```ts
import { createCrm } from '@bunkernineai/crm.sdk'

const crm = await createCrm({ connectionString: process.env.DATABASE_URL! })
```

Close with `await crm.close()` when the process is done.

## When to use

- Add / edit / show / merge contacts, companies, deals
- Log notes, calls, meetings, emails
- Search (`search` keyword, `find` word-overlap), dupes, stale/forecast/pipeline reports
- Import CSV/JSON strings or in-memory records; export objects or csv/tsv/json/ids

## createCrm options

| Option | Meaning |
|---|---|
| `connectionString` | Postgres URL (required) |
| `pipeline.stages` | Ordered stage names (default lead…closed-lost) |
| `pipeline.won_stage` / `lost_stage` | Terminal stages for won/lost/stale/forecast |
| `phone.default_country` | ISO country for national numbers |
| `phone.display` | `international` \| `national` \| `e164` |
| `hooks` | `Partial<Record<HookName, (data) => boolean \| Promise<boolean>>>` |
| `search_limit` | Cap for search/find (default 20) |

Errors throw `CrmError` with the same strings the old CLI used on stderr.

`rm` requires `{ force: true }` or it throws (`refusing to delete … without --force`).

## Lookup refs

`show` / `edit` / `rm` / `tag` / `log` contact/company/deal fields accept:

- Prefixed id (`ct_…`, `co_…`, `dl_…`)
- Email, phone (any common format → E.164), LinkedIn/X/Bluesky/Telegram URL or handle, company website

## Contacts

```ts
crm.contact.add({ name, email?, phone?, company?, tag?, linkedin?, x?, bluesky?, telegram?, set? })
crm.contact.list({ tag?, company?, sort?, reverse?, limit?, offset?, filter? })
crm.contact.show(ref)           // throws if not found
crm.contact.edit(ref, { name?, addEmail?, rmEmail?, addPhone?, rmPhone?, addCompany?, rmCompany?, addTag?, rmTag?, linkedin?, x?, bluesky?, telegram?, set?, unset? })
crm.contact.rm(ref, { force: true })
crm.contact.merge(keepRef, dropRef)
```

`name` is required on add. Phones normalize to E.164. Duplicate email/phone/social handle throws. `company` auto-creates stubs. `set` is `key=value` custom fields (`json:key={…}` for JSON).

## Companies

```ts
crm.company.add({ name, website?, phone?, tag?, set? })
crm.company.list({ tag?, sort?, reverse?, limit?, offset?, filter? })
crm.company.show(ref)
crm.company.edit(ref, { name?, addWebsite?, rmWebsite?, addPhone?, rmPhone?, addTag?, rmTag?, set?, unset? })
crm.company.rm(ref, { force: true })
crm.company.merge(keepRef, dropRef)
```

## Deals

```ts
crm.deal.add({ title, value?, stage?, contact?, company?, expectedClose?, probability?, tag?, set? })
crm.deal.list({ stage?, minValue?, maxValue?, contact?, company?, tag?, filter?, sort?, reverse?, limit?, offset? })
crm.deal.show(ref)
crm.deal.edit(ref, { title?, value?, company?, expectedClose?, probability?, addContact?, rmContact?, addTag?, rmTag?, set?, unset? })
crm.deal.move(ref, { stage, note? })
crm.deal.rm(ref, { force: true })
crm.pipeline()
```

`title` required. `stage` must be in config stages. Move logs a `stage-change` activity.

## Activity, tags

```ts
crm.log({ type: 'note' | 'call' | 'meeting' | 'email', body, contact?, company?, deal?, at?, set? })
crm.activity.list({ contact?, company?, deal?, type?, since?, sort?, reverse?, limit?, offset? })
crm.tag(ref, ['vip', 'warm'])
crm.untag(ref, ['warm'])
crm.tag.list({ type?: 'contact' | 'company' | 'deal' })
```

## Search vs find

- **`search(query, { type? })`** — `to_tsvector('simple') @@ plainto_tsquery`; on failure, `content ILIKE '%query%'`.
- **`find(query, { type?, limit?, threshold? })`** — word-overlap score on `search_index.content` (not embeddings).

```ts
crm.index.status()
crm.index.rebuild()
crm.dupes({ type?: 'contact' | 'company', threshold?, limit? })
```

## Reports

```ts
crm.report.pipeline()
crm.report.activity({ by?: 'type' | 'contact', period?: '7d' })
crm.report.stale({ days?: 30, type?: 'contact' | 'deal' })
crm.report.conversion({ since? })
crm.report.velocity({ wonOnly? })
crm.report.forecast({ period?: '2026-09' | '30d' })
crm.report.won({ period? })
crm.report.lost({ period? })
```

## Import / export

Import takes a CSV/JSON **string** or `Record<string, string>[]`. Do not read a CRM mount tree.

```ts
crm.import.contacts(input, { dryRun?, skipErrors?, update? })
crm.import.companies(input, opts?)
crm.import.deals(input, opts?)
crm.export.contacts('json' | 'csv' | 'tsv' | 'ids')
crm.export.companies(format?)
crm.export.deals(format?)
crm.export.all()
```

## Filters

`field = value`, `!=`, `~=` (contains), `>`, `<`, combined with `AND` / `OR`. Nested custom fields: `custom_fields.title = CTO`.

## Hooks

`pre-` / `post-` for contact/company/deal add, edit, rm; `pre-deal-stage-change` / `post-deal-stage-change`; `pre-activity-add` / `post-activity-add`. Return `false` to abort.

## IDs and JSON shape

Entities use jsonb arrays (`emails`, `phones`, `tags`, …) and `custom_fields` objects. Wire names are snake_case (`custom_fields`, `expected_close`, `created_at`).
