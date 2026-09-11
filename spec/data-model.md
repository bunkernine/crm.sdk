# Data Model — Design Decisions

Four tables: `contacts`, `companies`, `deals`, `activities`, plus `search_index`. They live in Postgres schema `crm`. Schema is defined in `src/drizzle-schema.ts` — this document captures the reasoning, not the DDL.

## Why JSON columns instead of junction tables

Contacts have multiple emails, phones, companies, and tags. Companies have multiple websites. Deals link to multiple contacts. The textbook relational approach is junction tables: `contact_emails`, `contact_companies`, `deal_contacts`, etc.

We store these as JSON arrays in Postgres `jsonb` columns instead. The reasoning:

1. **Scale assumption drives the whole decision.** crm.sdk targets individual developers or small teams — <5,000 contacts, <1,000 companies, <500 deals. At this scale, scanning jsonb is fast enough. We're never scanning 100K rows. If we were building HubSpot, we'd need junction tables and indexes. We're building `contacts.csv` with structure.

2. **One round-trip per entity.** `SELECT * FROM crm.contacts WHERE id = ?` returns the complete contact in one row. With junction tables, that's 4-5 joins to assemble the same object.

3. **Code simplicity.** One table = one Drizzle schema = one TypeScript type. Junction tables would roughly double the number of schema definitions and insert/update operations.

4. **The trade-off we're accepting:** jsonb array containment can be indexed later (GIN). Filtering contacts by email can scan jsonb. At <5K records this is fine. The migration path if the project grows: add junction tables, backfill from jsonb. But we're not building for that scale in v0.1.

## Why jsonb, not a document database

Postgres `jsonb` keeps relational FKs (deal → company) and unique indexes (social handles) while storing multi-value fields the way the app already modeled them. Validation happens in TypeScript before write; invalid shapes are application bugs.

## Why ULID, not UUID or autoincrement

Autoincrement leaks information (IDs are sequential → someone can guess how many records exist) and doesn't sort meaningfully. UUIDs are random — they don't sort chronologically and they're ugly in CLI output.

ULIDs give us: (a) time-sorted IDs so `ORDER BY id` = `ORDER BY created_at` for free, (b) 80 bits of randomness for collision resistance, (c) a readable-ish format where the timestamp prefix is visually obvious.

The entity prefix (`ct_`, `co_`, `dl_`, `ac_`) is part of the stored primary key value. This means you can look at any ID anywhere in the system — a log line, a JSON file, a symlink filename — and immediately know what kind of entity it is. No context needed.

## Why no pipelines table

Early design had a `pipelines` table with stages as rows. We removed it. Stages are a configuration concern, not a data concern.

The reasoning: stages rarely change, and when they do it's a deliberate project decision ("we're adding a 'demo' stage to our pipeline"), not a CRUD operation. Pass stages into `createCrm({ pipeline })`. They are validated at the application layer.

The `deals.stage` column stores the stage name as plain text. Config passed to `createCrm` is the source of truth for valid names. This is simpler (no FK to a pipelines table, no seed data, no migration when stages change).

## Why stage-change is an activity, not a column on deals

We considered three approaches for tracking deal stage history:

1. **`stage_history` JSON column on deals** — array of `{stage, timestamp}` pairs. Rejected because: updates to a JSON array aren't append-only (race conditions if two processes write simultaneously), and it creates a second source of truth alongside the activities table.

2. **Separate `stage_transitions` table** — normalized, FK'd. Rejected because: it's a whole new table for something that's conceptually just an event. Activities already exist for "something happened to an entity."

3. **Stage-change as an activity type (chosen):** `crm deal move` creates an activity with `type = 'stage-change'` and `body = 'lead → qualified'`. Stage history is reconstructed by querying activities.

Why this works well:
- **Single source of truth.** Everything that happens to a deal is in the activity log. Stage changes aren't special-cased.
- **Timestamps for free.** Every activity has `created_at`. Deal velocity (time per stage) comes from the same query as "show me all stage changes."
- **Append-only.** Inserting a row is simpler and safer than updating a JSON array in a concurrent environment.
- **Reports query one table.** Conversion rates, velocity, and forecast all query `activities WHERE type = 'stage-change'`. No joins to a separate history table.

## Why deals link to multiple contacts

The original design had `deals.contact` as a single scalar FK. Real deals involve multiple people: the decision-maker, the champion, the technical evaluator, the procurement person. Forcing users to pick one contact per deal loses important relationship data.

Changed to `deals.contacts` as a JSON array of contact IDs. The `--contact` flag is repeatable on `deal add`, and `deal edit` supports `--add-contact` / `--rm-contact`.

**FK enforcement note:** Postgres enforces scalar FKs (`deals.company → companies.id`, `ON DELETE SET NULL`). FKs can't reference into jsonb arrays. So `deals.contacts[]` and `contacts.companies[]` are maintained by application code. When a contact is deleted, application code scans deals and removes the contact ID from their `contacts[]` arrays.

## Why activities are append-only

Activities have no `updated_at` column. Once created, they're immutable. To correct a mistake, delete it and create a new one.

This was a deliberate choice, not an oversight:
- **Audit trail integrity.** If activities can be edited, stage-change timestamps can be retroactively altered, which corrupts velocity and conversion reports. Making all activities immutable (not just stage-changes) is simpler than having two mutability rules.
- **No conflict model needed.** No optimistic concurrency, no "who edited last" — the activity either exists or it doesn't.

## Why custom fields are a flat JSON object

We needed extensibility without schema migrations. `--set title=CTO` works on any entity, immediately, no setup.

Considered alternatives:
- **Typed custom field definitions.** Over-engineered. The target user doesn't want an admin panel.
- **Nested JSON objects.** More expressive but harder to filter and index. `--filter "address.city=London"` requires JSON path parsing. Flat keys are simpler.
- **Separate key-value table.** More relational, but adds a join to every query.

Flat key-value JSON in `custom_fields` hits the sweet spot: zero setup, filterable with the same filter syntax as core fields, included in the search index, and trivially extensible.

## Referential integrity — the two-tier model

Scalar FKs (`deals.company`) use real Postgres `FOREIGN KEY` constraints. JSON array references (`contacts.companies[]`, `deals.contacts[]`) are maintained by application code. Postgres can't enforce FKs into jsonb.

This creates a two-tier integrity model: scalar references are guaranteed consistent by the DB; array references are best-effort maintained by the application. The risk of drift is low in practice because: (a) there are only two JSON-array relationships, (b) the delete/merge code paths that touch them are well-tested, and (c) at <5K records, a full scan to fix any drift takes milliseconds.

**Delete behavior decisions:**
- When a contact is deleted, their ID is removed from all `deals.contacts[]` arrays (application code). Activities referencing the contact are *kept* — the orphaned contact ID serves as a historical record ("this activity was about someone who no longer exists").
- When a company is deleted, it's removed from `contacts.companies[]` arrays and `deals.company` is set to NULL. Same orphan-is-informational logic for activities.
- Merge operations relink all references before deleting the absorbed entity, so cascades never trigger during merge.

The orphaned-ID-is-informational decision was intentional: deleting a contact shouldn't erase the fact that you had a meeting with them. The activity log is a historical record, not a live relationship graph.
