# crm.sdk

**A typed CRM library for AI agents.** Contacts, companies, deals, activities, search, and reports — same domain as the old `crm.cli` product, exposed as `createCrm()` instead of a filesystem mount or CLI.

Agents import this package (or the host app wraps these methods). There is no MCP, REST, or FUSE layer.

```ts
import { createCrm } from 'crm.sdk'

const crm = await createCrm({
  connectionString: process.env.DATABASE_URL!,
  phone: { default_country: 'US', display: 'national' },
})

const id = await crm.contact.add({
  name: 'Jane Doe',
  email: ['jane@acme.com'],
  phone: ['+1-212-555-1234'],
  linkedin: 'linkedin.com/in/janedoe',
  company: ['Acme'],
})
await crm.report.stale({ days: 30 })
await crm.close()
```

> Original product by [Duet](https://duet.so) / David Zhang. Published as `crm.sdk` (unscoped). MIT.

## Install

```bash
npm install crm.sdk
# or: bun add crm.sdk
```

The skill does **not** replace the package. Agents still `import { createCrm } from 'crm.sdk'`. Postgres must be reachable. On first `createCrm`, the SDK runs `CREATE SCHEMA IF NOT EXISTS crm` and creates the four entity tables plus `search_index`.

### Install as an agent skill

The contract lives in [`skills/SKILL.md`](./skills/SKILL.md) (`name: crm-sdk`). Copy it into a Cursor skills directory so the agent can load it:

```bash
# After npm install crm.sdk (project skill)
mkdir -p .cursor/skills/crm-sdk
cp node_modules/crm.sdk/skills/SKILL.md .cursor/skills/crm-sdk/SKILL.md

# From this repo
mkdir -p .cursor/skills/crm-sdk
cp skills/SKILL.md .cursor/skills/crm-sdk/SKILL.md

# Personal (all projects)
mkdir -p ~/.cursor/skills/crm-sdk
cp skills/SKILL.md ~/.cursor/skills/crm-sdk/SKILL.md
```

Claude Code:

```bash
claude skills add https://github.com/bunkernine/crm.sdk/tree/main/skills
```

## Why this package

Existing CRMs are GUI-first. This one is **typed methods in, records or thrown errors out** so an agent can `show` a contact by email, move a deal, and answer “who is stale?” without inventing SQL.

**Deep normalization.** E.164 phones, website URLs, social handles (paste a LinkedIn URL, it stores the handle), entity merge with reference relinking, fuzzy duplicate detection.

**Lookup by ref.** IDs (`ct_` / `co_` / `dl_` / `ac_`), email, phone (any common format), social URL/handle, or website — same as the old CLI.

**Failures throw** `CrmError` with the same messages the CLI printed on stderr (`invalid phone`, `duplicate email`, `contact not found`, …). Agents can match and retry.

## createCrm

```ts
await createCrm({
  connectionString: string
  pipeline?: {
    stages?: string[]
    won_stage?: string
    lost_stage?: string
  }
  phone?: {
    default_country?: string // ISO 3166-1 alpha-2, e.g. "US"
    display?: 'international' | 'national' | 'e164'
  }
  hooks?: Partial<Record<HookName, (data) => boolean | Promise<boolean>>>
  search_limit?: number // default 20
})
```

Defaults: stages `lead` → `qualified` → `proposal` → `negotiation` → `closed-won` → `closed-lost`; phone display `international`; `search_limit` 20.

Do not walk `crm.toml` from disk. Pass options.

## Methods (CLI → SDK)

| CLI | SDK |
|---|---|
| `crm contact add/list/show/edit/rm/merge` | `crm.contact.add/list/show/edit/rm/merge` |
| `crm company *` | `crm.company.*` |
| `crm deal add/list/show/edit/move/rm` | `crm.deal.*` |
| `crm pipeline` | `crm.pipeline()` |
| `crm log` / `crm activity list` | `crm.log` / `crm.activity.list` |
| `crm tag` / `untag` / `tag list` | `crm.tag` / `crm.untag` / `crm.tag.list` |
| `crm search` / `find` / `index status\|rebuild` | `crm.search` / `crm.find` / `crm.index.status` / `crm.index.rebuild` |
| `crm dupes` | `crm.dupes` |
| `crm report *` | `crm.report.pipeline/activity/stale/conversion/velocity/forecast/won/lost` |
| `crm import contacts\|companies\|deals` | `crm.import.contacts/companies/deals` (string CSV/JSON or records) |
| `crm export *` | `crm.export.contacts/companies/deals/all` |

Flag names stay as camelCase: `--add-email` → `addEmail`, `--dry-run` → `dryRun`, `--expected-close` → `expectedClose`. Repeatable flags are `string[]`.

`rm` requires `{ force: true }` (non-interactive). Without it, throws.

List/show return entity objects (`emails: string[]`, `custom_fields: Record<…>`), not stringified JSON columns.

### Contacts

```ts
await crm.contact.add({
  name: 'Jane Doe',
  email: ['jane@acme.com'],
  phone: ['+1-212-555-1234'],
  company: ['Acme Corp'],
  tag: ['hot-lead'],
  linkedin: 'janedoe',
  x: 'janedoe',
  set: ['title=CTO', 'source=conference'],
})

await crm.contact.list({ tag: 'hot-lead', filter: 'name ~= Jane', limit: 20 })
await crm.contact.show('jane@acme.com')
await crm.contact.edit(id, { addEmail: ['jane.doe@gmail.com'], addTag: ['vip'] })
await crm.contact.merge(keepId, dropId)
await crm.contact.rm(id, { force: true })
```

### Companies and deals

```ts
await crm.company.add({ name: 'Acme', website: ['acme.com'] })
await crm.deal.add({
  title: 'Acme — platform',
  value: 50_000,
  stage: 'qualified',
  contact: ['jane@acme.com'],
  company: 'Acme',
})
await crm.deal.move(dealId, { stage: 'proposal', note: 'Sent deck' })
await crm.pipeline()
```

### Activity, tags, search

```ts
await crm.log({ type: 'note', body: 'Great call', contact: [janeId] })
await crm.activity.list({ contact: janeId })
await crm.tag(janeId, ['vip'])
await crm.search('acme')
await crm.find('fintech CTO') // word-overlap on search_index.content, not embeddings
await crm.dupes({ threshold: 0.5 })
```

`search` uses Postgres `plainto_tsquery` / `to_tsvector('simple', content)`, then `ILIKE` if that path throws. `find` scores word overlap on the same index.

### Reports and import/export

```ts
await crm.report.stale({ days: 14, type: 'contact' })
await crm.report.forecast()
await crm.import.contacts(csvString, { dryRun: true, skipErrors: true })
await crm.export.contacts('csv')
await crm.export.all()
```

### Filters

`list` `filter` expressions: `=`, `!=`, `~=`, `>`, `<`, combined with `AND` / `OR`. Custom fields: `custom_fields.role = CTO`.

### Hooks

Same names as the CLI (`pre-contact-add`, `post-deal-stage-change`, …). Callbacks receive a JSON-able payload. Return `false` (or a rejected promise) to abort.

```ts
await createCrm({
  connectionString,
  hooks: {
    'pre-contact-add': (data) => data.name !== 'spam',
  },
})
```

### IDs

Stored ids are `` `ct_${string}` ``, `` `co_${string}` ``, `` `dl_${string}` ``, `` `ac_${string}` `` (ULID). Lookup arguments that accept email/phone/handle stay `string`.

## Storage

Postgres schema **`crm`**. JSON arrays/objects are `jsonb` (`emails`, `phones`, `tags`, `custom_fields`, …). Deal `company` is a FK `ON DELETE SET NULL`. Unique partial indexes on contact social handles.

The caller owns the connection (`connectionString` or future client). No SQLite file.

## Types

The package exports `CrmClient`, `Contact`, `Company`, `Deal`, `Activity`, `ContactAddInput`, `DealMove` via `DealEditInput` / move args, `CrmError`, hook names, and the rest of the model. `strict` TypeScript; `.d.ts` ships with the package.

## Tests

Functional tests call `createCrm({ connectionString })` against Postgres (schema `crm`, truncated per context). Set `DATABASE_URL` (CI provides a Postgres 16 service). Run serially:

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
bun test --timeout 30000 --max-concurrency 1
```

## License

MIT. Original authorship retained.
