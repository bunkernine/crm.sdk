import { sql } from 'drizzle-orm'
import {
  integer,
  jsonb,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { pgSchema } from 'drizzle-orm/pg-core/schema'

import type { CustomFields } from './types'

export const crmSchema = pgSchema('crm')

export const contacts = crmSchema.table(
  'contacts',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    emails: jsonb('emails').$type<string[]>().notNull().default([]),
    phones: jsonb('phones').$type<string[]>().notNull().default([]),
    companies: jsonb('companies').$type<string[]>().notNull().default([]),
    linkedin: text('linkedin'),
    x: text('x'),
    bluesky: text('bluesky'),
    telegram: text('telegram'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    custom_fields: jsonb('custom_fields')
      .$type<CustomFields>()
      .notNull()
      .default({}),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_contacts_linkedin')
      .on(t.linkedin)
      .where(sql`${t.linkedin} IS NOT NULL`),
    uniqueIndex('idx_contacts_x').on(t.x).where(sql`${t.x} IS NOT NULL`),
    uniqueIndex('idx_contacts_bluesky')
      .on(t.bluesky)
      .where(sql`${t.bluesky} IS NOT NULL`),
    uniqueIndex('idx_contacts_telegram')
      .on(t.telegram)
      .where(sql`${t.telegram} IS NOT NULL`),
  ],
)

export const companies = crmSchema.table('companies', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  websites: jsonb('websites').$type<string[]>().notNull().default([]),
  phones: jsonb('phones').$type<string[]>().notNull().default([]),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  custom_fields: jsonb('custom_fields')
    .$type<CustomFields>()
    .notNull()
    .default({}),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
})

export const deals = crmSchema.table('deals', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  value: integer('value'),
  stage: text('stage').notNull(),
  contacts: jsonb('contacts').$type<string[]>().notNull().default([]),
  company: text('company').references(() => companies.id, {
    onDelete: 'set null',
  }),
  expected_close: text('expected_close'),
  probability: integer('probability'),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  custom_fields: jsonb('custom_fields')
    .$type<CustomFields>()
    .notNull()
    .default({}),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
})

export const activities = crmSchema.table('activities', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  body: text('body').notNull().default(''),
  contacts: jsonb('contacts').$type<string[]>().notNull().default([]),
  company: text('company'),
  deal: text('deal'),
  custom_fields: jsonb('custom_fields')
    .$type<CustomFields>()
    .notNull()
    .default({}),
  created_at: text('created_at').notNull(),
})

export const searchIndex = crmSchema.table('search_index', {
  entity_type: text('entity_type').notNull(),
  entity_id: text('entity_id').notNull(),
  content: text('content').notNull(),
})

export type ContactRow = typeof contacts.$inferSelect
export type CompanyRow = typeof companies.$inferSelect
export type DealRow = typeof deals.$inferSelect
export type ActivityRow = typeof activities.$inferSelect
