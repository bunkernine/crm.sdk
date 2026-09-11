import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './drizzle-schema'

export type DB = ReturnType<typeof drizzle<typeof schema>>

const SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS crm;

CREATE TABLE IF NOT EXISTS crm.contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  phones JSONB NOT NULL DEFAULT '[]'::jsonb,
  companies JSONB NOT NULL DEFAULT '[]'::jsonb,
  linkedin TEXT,
  x TEXT,
  bluesky TEXT,
  telegram TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_linkedin ON crm.contacts(linkedin) WHERE linkedin IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_x ON crm.contacts(x) WHERE x IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_bluesky ON crm.contacts(bluesky) WHERE bluesky IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_telegram ON crm.contacts(telegram) WHERE telegram IS NOT NULL;

CREATE TABLE IF NOT EXISTS crm.companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  websites JSONB NOT NULL DEFAULT '[]'::jsonb,
  phones JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crm.deals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  value INTEGER,
  stage TEXT NOT NULL,
  contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  company TEXT REFERENCES crm.companies(id) ON DELETE SET NULL,
  expected_close TEXT,
  probability INTEGER,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crm.activities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  company TEXT,
  deal TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crm.search_index (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);
`

export async function openDB(connectionString: string): Promise<{
  db: DB
  sql: postgres.Sql
}> {
  const client = postgres(connectionString, { max: 1 })
  const statements = SCHEMA_SQL.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  for (const stmt of statements) {
    await client.unsafe(stmt)
  }
  const db = drizzle(client, { schema })
  return { db, sql: client }
}

export async function upsertSearchIndex(
  db: DB,
  entityType: string,
  entityId: string,
  content: string,
): Promise<void> {
  await db.execute(
    sql`DELETE FROM crm.search_index WHERE entity_id = ${entityId}`,
  )
  await db.execute(
    sql`INSERT INTO crm.search_index (entity_type, entity_id, content) VALUES (${entityType}, ${entityId}, ${content})`,
  )
}

export async function removeSearchIndex(
  db: DB,
  entityId: string,
): Promise<void> {
  await db.execute(
    sql`DELETE FROM crm.search_index WHERE entity_id = ${entityId}`,
  )
}

export async function rebuildSearchIndex(db: DB): Promise<void> {
  const {
    buildCompanySearch,
    buildContactSearch,
    buildDealSearch,
  } = await import('./lib/helpers')
  await db.execute(sql`DELETE FROM crm.search_index`)

  const allContacts = await db.select().from(schema.contacts)
  for (const c of allContacts) {
    const content = await buildContactSearch(db, c)
    await db.execute(
      sql`INSERT INTO crm.search_index (entity_type, entity_id, content) VALUES (${'contact'}, ${c.id}, ${content})`,
    )
  }

  const allCompanies = await db.select().from(schema.companies)
  for (const co of allCompanies) {
    const content = buildCompanySearch(co)
    await db.execute(
      sql`INSERT INTO crm.search_index (entity_type, entity_id, content) VALUES (${'company'}, ${co.id}, ${content})`,
    )
  }

  const allDeals = await db.select().from(schema.deals)
  for (const d of allDeals) {
    const content = buildDealSearch(d)
    await db.execute(
      sql`INSERT INTO crm.search_index (entity_type, entity_id, content) VALUES (${'deal'}, ${d.id}, ${content})`,
    )
  }

  const allActivities = await db.select().from(schema.activities)
  for (const a of allActivities) {
    const content = [a.type, a.body, JSON.stringify(a.custom_fields)]
      .filter(Boolean)
      .join(' ')
    await db.execute(
      sql`INSERT INTO crm.search_index (entity_type, entity_id, content) VALUES (${'activity'}, ${a.id}, ${content})`,
    )
  }
}

export async function searchMatch(
  db: DB,
  query: string,
): Promise<{ entity_type: string; entity_id: string; content: string }[]> {
  try {
    const rows = await db.execute(sql`
      SELECT entity_type, entity_id, content
      FROM crm.search_index
      WHERE to_tsvector('simple', content) @@ plainto_tsquery('simple', ${query})
    `)
    return asSearchRows(rows)
  } catch {
    const rows = await db.execute(sql`
      SELECT entity_type, entity_id, content
      FROM crm.search_index
      WHERE content ILIKE ${`%${query}%`}
    `)
    return asSearchRows(rows)
  }
}

function asSearchRows(rows: unknown): {
  entity_type: string
  entity_id: string
  content: string
}[] {
  const list = Array.isArray(rows)
    ? rows
    : ((rows as { rows?: unknown[] })?.rows ?? [])
  return list as {
    entity_type: string
    entity_id: string
    content: string
  }[]
}

export async function searchIndexAll(
  db: DB,
): Promise<{ entity_type: string; entity_id: string; content: string }[]> {
  const rows = await db.execute(
    sql`SELECT entity_type, entity_id, content FROM crm.search_index`,
  )
  return asSearchRows(rows)
}
