import { eq } from 'drizzle-orm'

import type { CRMConfig } from '../config'
import type { DB } from '../db'
import {
  rebuildSearchIndex,
  searchIndexAll,
  searchMatch,
  upsertSearchIndex,
} from '../db'
import * as schema from '../drizzle-schema'
import { die } from '../error'
import {
  activityToRow,
  companyToRow,
  contactToRow,
  dealToRow,
} from '../format'
import { runHook } from '../hooks'
import {
  asArray,
  asList,
  diceCoefficient,
  getOrCreateCompanyId,
  getOrCreateContactId,
  levenshtein,
  makeId,
  now,
  parseCSV,
  parseKV,
} from '../lib/helpers'
import { normalizeWebsite, tryNormalizePhone } from '../normalize'
import { resolveCompany, resolveContact, resolveDeal, resolveEntity } from '../resolve'
import type { CompanyRow, ContactRow } from '../drizzle-schema'
import type {
  Activity,
  ActivityListOpts,
  Company,
  Contact,
  CustomFields,
  Deal,
  DupesOpts,
  DupeResult,
  FindOpts,
  HookPayload,
  ImportOpts,
  ImportResult,
  IndexStatus,
  LogInput,
  SearchOpts,
  TagCount,
} from '../types'

function payload(data: object): HookPayload {
  return data as HookPayload
}

const VALID_TYPES = ['note', 'call', 'meeting', 'email']

export async function logActivity(
  db: DB,
  config: CRMConfig,
  input: LogInput,
): Promise<Activity['id']> {
  const type = input.type.trim()
  const body = input.body.trim()
  if (!VALID_TYPES.includes(type)) {
    die(
      `Error: invalid activity type "${type}". Must be one of: ${VALID_TYPES.join(', ')}`,
    )
  }
  const contacts: string[] = []
  for (const cRef of asList(input.contact)) {
    const ctId = await getOrCreateContactId(db, cRef, config)
    if (!contacts.includes(ctId)) {
      contacts.push(ctId)
    }
  }
  let company: string | null = null
  let deal: string | null = null
  if (input.company) {
    company = await getOrCreateCompanyId(db, input.company.trim())
  }
  if (input.deal) {
    const d = await resolveDeal(db, input.deal.trim())
    if (!d) {
      die(`Error: deal not found: ${input.deal}`)
    }
    deal = d.id
  }
  let at = input.at
  if (at) {
    at = at.trim()
    const parsed = new Date(at)
    if (Number.isNaN(parsed.getTime())) {
      die('Error: invalid --at date')
    }
  }
  const id = makeId('ac') as Activity['id']
  const ts = at || now()
  const custom: CustomFields = {
    ...parseKV(input.set),
    ...input.custom_fields,
  }
  if (
    !(await runHook(
      config,
      'pre-activity-add',
      payload({ type, body, contacts, company, deal, custom_fields: custom }),
    ))
  ) {
    die('Error: pre-activity-add hook rejected creation')
  }
  await db.insert(schema.activities).values({
    id,
    type,
    body,
    contacts,
    company,
    deal,
    custom_fields: custom,
    created_at: ts,
  })
  await upsertSearchIndex(db, 'activity', id, `${type} ${body}`)
  await runHook(
    config,
    'post-activity-add',
    payload({
      id,
      type,
      body,
      contacts,
      company,
      deal,
      custom_fields: custom,
    }),
  )
  return id
}

export async function activityList(
  db: DB,
  config: CRMConfig,
  opts: ActivityListOpts = {},
): Promise<Activity[]> {
  let rows = (await db.select().from(schema.activities)).map((a) =>
    activityToRow(a),
  )
  if (opts.contact) {
    const ct = await resolveContact(db, opts.contact, config)
    rows = ct ? rows.filter((a) => a.contacts.includes(ct.id)) : []
  }
  if (opts.company) {
    const co = await resolveCompany(db, opts.company, config)
    rows = co ? rows.filter((a) => a.company === co.id) : []
  }
  if (opts.deal) {
    rows = rows.filter((a) => a.deal === opts.deal)
  }
  if (opts.type) {
    rows = rows.filter((a) => a.type === opts.type)
  }
  if (opts.since) {
    rows = rows.filter((a) => a.created_at >= opts.since!)
  }
  if (opts.sort) {
    const sort = opts.sort
    rows.sort((a, b) =>
      String((a as unknown as Record<string, unknown>)[sort] ?? '').localeCompare(
        String((b as unknown as Record<string, unknown>)[sort] ?? ''),
      ),
    )
  }
  if (opts.reverse) {
    rows.reverse()
  }
  if (opts.offset) {
    rows = rows.slice(opts.offset)
  }
  if (opts.limit) {
    rows = rows.slice(0, opts.limit)
  }
  return rows
}

export async function tagEntity(
  db: DB,
  config: CRMConfig,
  ref: string,
  tags: string[],
): Promise<void> {
  const resolved = await resolveEntity(db, ref.trim(), config)
  if (!resolved) {
    die(`Error: entity not found: ${ref}`)
  }
  const existing = asArray(resolved.entity.tags)
  for (const t of tags.map((x) => x.trim())) {
    if (!existing.includes(t)) {
      existing.push(t)
    }
  }
  if (resolved.type === 'contact') {
    await db
      .update(schema.contacts)
      .set({ tags: existing, updated_at: now() })
      .where(eq(schema.contacts.id, resolved.entity.id))
  } else if (resolved.type === 'company') {
    await db
      .update(schema.companies)
      .set({ tags: existing, updated_at: now() })
      .where(eq(schema.companies.id, resolved.entity.id))
  } else {
    await db
      .update(schema.deals)
      .set({ tags: existing, updated_at: now() })
      .where(eq(schema.deals.id, resolved.entity.id))
  }
}

export async function untagEntity(
  db: DB,
  config: CRMConfig,
  ref: string,
  tags: string[],
): Promise<void> {
  const resolved = await resolveEntity(db, ref.trim(), config)
  if (!resolved) {
    die(`Error: entity not found: ${ref}`)
  }
  let existing = asArray(resolved.entity.tags)
  for (const t of tags.map((x) => x.trim())) {
    existing = existing.filter((v) => v !== t)
  }
  if (resolved.type === 'contact') {
    await db
      .update(schema.contacts)
      .set({ tags: existing, updated_at: now() })
      .where(eq(schema.contacts.id, resolved.entity.id))
  } else if (resolved.type === 'company') {
    await db
      .update(schema.companies)
      .set({ tags: existing, updated_at: now() })
      .where(eq(schema.companies.id, resolved.entity.id))
  } else {
    await db
      .update(schema.deals)
      .set({ tags: existing, updated_at: now() })
      .where(eq(schema.deals.id, resolved.entity.id))
  }
}

export async function tagList(
  db: DB,
  type?: string,
): Promise<TagCount[]> {
  const tagMap: Record<string, number> = {}
  if (!type || type === 'contact') {
    for (const r of await db.select({ tags: schema.contacts.tags }).from(schema.contacts)) {
      for (const tag of asArray(r.tags)) {
        tagMap[tag] = (tagMap[tag] || 0) + 1
      }
    }
  }
  if (!type || type === 'company') {
    for (const r of await db.select({ tags: schema.companies.tags }).from(schema.companies)) {
      for (const tag of asArray(r.tags)) {
        tagMap[tag] = (tagMap[tag] || 0) + 1
      }
    }
  }
  if (!type || type === 'deal') {
    for (const r of await db.select({ tags: schema.deals.tags }).from(schema.deals)) {
      for (const tag of asArray(r.tags)) {
        tagMap[tag] = (tagMap[tag] || 0) + 1
      }
    }
  }
  return Object.entries(tagMap).map(([tag, count]) => ({ tag, count }))
}

async function lookupEntity(
  db: DB,
  entityType: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  if (entityType === 'contact') {
    const c = (
      await db.select().from(schema.contacts).where(eq(schema.contacts.id, id))
    )[0]
    return c ? { type: 'contact', ...contactToRow(c) } : null
  }
  if (entityType === 'company') {
    const c = (
      await db.select().from(schema.companies).where(eq(schema.companies.id, id))
    )[0]
    return c ? { type: 'company', ...companyToRow(c) } : null
  }
  if (entityType === 'deal') {
    const d = (
      await db.select().from(schema.deals).where(eq(schema.deals.id, id))
    )[0]
    return d ? { type: 'deal', ...dealToRow(d) } : null
  }
  if (entityType === 'activity') {
    const a = (
      await db
        .select()
        .from(schema.activities)
        .where(eq(schema.activities.id, id))
    )[0]
    return a ? { entity_type: 'activity', ...activityToRow(a) } : null
  }
  return null
}

export async function searchEntities(
  db: DB,
  config: CRMConfig,
  query: string,
  opts: SearchOpts = {},
): Promise<Record<string, unknown>[]> {
  const q = query.trim()
  const results: Record<string, unknown>[] = []
  const ftsRows = await searchMatch(db, q)
  for (const fr of ftsRows) {
    if (opts.type && fr.entity_type !== opts.type) {
      continue
    }
    const entity = await lookupEntity(db, fr.entity_type, fr.entity_id)
    if (entity) {
      results.push(entity)
    }
  }
  return results.slice(0, config.search_limit)
}

export async function findEntities(
  db: DB,
  config: CRMConfig,
  query: string,
  opts: FindOpts = {},
): Promise<Record<string, unknown>[]> {
  const q = query.trim()
  const queryWords = q.toLowerCase().split(/\s+/)
  const allEntities: {
    entity_type: string
    entity_id: string
    content: string
    score: number
  }[] = []
  for (const row of await searchIndexAll(db)) {
    if (opts.type && row.entity_type !== opts.type) {
      continue
    }
    if (row.entity_type === 'activity') {
      continue
    }
    const content = (row.content || '').toLowerCase()
    let score = 0
    for (const w of queryWords) {
      if (content.includes(w)) {
        score += 1
      }
    }
    if (score > 0) {
      const normalized =
        queryWords.length > 0 ? score / queryWords.length : 0
      allEntities.push({ ...row, score: normalized })
    }
  }
  allEntities.sort((a, b) => b.score - a.score)
  let limited = allEntities
  if (opts.threshold !== undefined) {
    limited = limited.filter((e) => e.score >= opts.threshold!)
  }
  const maxResults = opts.limit ?? config.search_limit
  limited = limited.slice(0, maxResults)
  const results = (
    await Promise.all(
      limited.map((r) => lookupEntity(db, r.entity_type, r.entity_id)),
    )
  ).filter(Boolean) as Record<string, unknown>[]
  return results
}

export async function indexStatus(db: DB): Promise<IndexStatus> {
  const indexRows = await searchIndexAll(db)
  const counts = { contact: 0, company: 0, deal: 0 }
  for (const r of indexRows) {
    if (r.entity_type === 'contact') {
      counts.contact++
    }
    if (r.entity_type === 'company') {
      counts.company++
    }
    if (r.entity_type === 'deal') {
      counts.deal++
    }
  }
  const contactCount = (await db.select().from(schema.contacts)).length
  const companyCount = (await db.select().from(schema.companies)).length
  const dealCount = (await db.select().from(schema.deals)).length
  return {
    contacts: contactCount,
    companies: companyCount,
    deals: dealCount,
    indexed: counts,
  }
}

export async function indexRebuild(db: DB): Promise<void> {
  await rebuildSearchIndex(db)
}

type SocialField = 'linkedin' | 'x' | 'bluesky' | 'telegram'

function contactDupeReasons(a: ContactRow, b: ContactRow): string[] {
  const reasons: string[] = []
  const aName = (a.name || '').toLowerCase()
  const bName = (b.name || '').toLowerCase()
  const nameDistance = levenshtein(aName, bName)
  const maxLen = Math.max(aName.length, bName.length)
  const levSimilarity = maxLen > 0 ? 1 - nameDistance / maxLen : 0
  const nameSimilarity = Math.max(levSimilarity, diceCoefficient(aName, bName))
  if (nameSimilarity >= 0.6) {
    reasons.push('similar name')
  }
  const aEmails = asArray(a.emails)
  const bEmails = asArray(b.emails)
  for (const ae of aEmails) {
    for (const be of bEmails) {
      if (ae.toLowerCase() === be.toLowerCase()) {
        reasons.push('same email')
      }
    }
  }
  const aPhones = asArray(a.phones)
  const bPhones = asArray(b.phones)
  for (const ap of aPhones) {
    for (const bp of bPhones) {
      if (ap === bp) {
        reasons.push('same phone')
      }
    }
  }
  const aCompanies = asArray(a.companies)
  const bCompanies = asArray(b.companies)
  for (const ac of aCompanies) {
    for (const bc of bCompanies) {
      if (ac.toLowerCase() === bc.toLowerCase()) {
        reasons.push('same company')
        break
      }
    }
  }
  const socialFields: SocialField[] = ['linkedin', 'x', 'bluesky', 'telegram']
  for (const field of socialFields) {
    if (a[field] && b[field]) {
      const aVal = a[field] as string
      const bVal = b[field] as string
      const dist = levenshtein(aVal.toLowerCase(), bVal.toLowerCase())
      const ml = Math.max(aVal.length, bVal.length)
      if (ml > 0 && 1 - dist / ml >= 0.6) {
        reasons.push(`similar ${field}`)
      }
    }
  }
  if (nameSimilarity >= 0.3) {
    let found = false
    for (const ae of aEmails) {
      if (found) {
        break
      }
      for (const be of bEmails) {
        const aDomain = ae.split('@')[1]?.toLowerCase()
        const bDomain = be.split('@')[1]?.toLowerCase()
        if (
          aDomain &&
          bDomain &&
          aDomain === bDomain &&
          !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(
            aDomain,
          )
        ) {
          reasons.push('shared email domain')
          found = true
          break
        }
      }
    }
  }
  return reasons
}

function companyDupeReasons(a: CompanyRow, b: CompanyRow): string[] {
  const reasons: string[] = []
  const aName = (a.name || '').toLowerCase()
  const bName = (b.name || '').toLowerCase()
  const nameDistance = levenshtein(aName, bName)
  const maxLen = Math.max(aName.length, bName.length)
  const levSimilarity = maxLen > 0 ? 1 - nameDistance / maxLen : 0
  const nameSimilarity = Math.max(levSimilarity, diceCoefficient(aName, bName))
  if (nameSimilarity >= 0.6) {
    reasons.push('similar name')
  }
  for (const aw of asArray(a.websites)) {
    for (const bw of asArray(b.websites)) {
      if (aw.split('/')[0] === bw.split('/')[0]) {
        reasons.push('same domain')
      }
    }
  }
  return reasons
}

function dupeScore(reasons: string[]): number {
  if (reasons.length === 0) {
    return 0
  }
  let score = 0
  for (const r of reasons) {
    if (r === 'same email' || r === 'same phone') {
      score += 0.5
    } else if (r === 'similar name') {
      score += 0.4
    } else if (r === 'same company') {
      score += 0.15
    } else if (r.startsWith('similar ')) {
      score += 0.2
    } else if (r === 'same domain') {
      score += 0.2
    } else if (r === 'shared email domain') {
      score += 0.15
    } else {
      score += 0.1
    }
  }
  return Math.min(score, 1)
}

export async function findDupes(
  db: DB,
  opts: DupesOpts = {},
): Promise<DupeResult[]> {
  const threshold = opts.threshold ?? 0.3
  let results: DupeResult[] = []
  if (!opts.type || opts.type === 'contact') {
    const contacts = await db.select().from(schema.contacts)
    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        const reasons = contactDupeReasons(contacts[i], contacts[j])
        const score = dupeScore(reasons)
        if (score >= threshold) {
          results.push({
            left: contactToRow(contacts[i]),
            right: contactToRow(contacts[j]),
            reasons,
            score,
          })
        }
      }
    }
  }
  if (!opts.type || opts.type === 'company') {
    const companies = await db.select().from(schema.companies)
    for (let i = 0; i < companies.length; i++) {
      for (let j = i + 1; j < companies.length; j++) {
        const reasons = companyDupeReasons(companies[i], companies[j])
        const score = dupeScore(reasons)
        if (score >= threshold) {
          results.push({
            left: companyToRow(companies[i]),
            right: companyToRow(companies[j]),
            reasons,
            score,
          })
        }
      }
    }
  }
  results.sort((a, b) => b.score - a.score)
  if (opts.limit) {
    results = results.slice(0, opts.limit)
  }
  return results
}

function parseRecords(
  input: string | Record<string, string>[],
): Record<string, string>[] {
  if (Array.isArray(input)) {
    return input
  }
  const raw = input.trim()
  if (!raw) {
    return []
  }
  if (raw.startsWith('[') || raw.startsWith('{')) {
    return JSON.parse(raw) as Record<string, string>[]
  }
  return parseCSV(raw)
}

function splitField(val: string | undefined): string[] {
  if (!val) {
    return []
  }
  return val.split(',').map((s) => s.trim()).filter(Boolean)
}

const CONTACT_FIELDS = new Set([
  'name',
  'email',
  'emails',
  'phone',
  'phones',
  'company',
  'companies',
  'tags',
  'linkedin',
  'x',
  'bluesky',
  'telegram',
])
const COMPANY_FIELDS = new Set([
  'name',
  'website',
  'websites',
  'phone',
  'phones',
  'tags',
])
const DEAL_FIELDS = new Set([
  'title',
  'value',
  'stage',
  'contacts',
  'company',
  'expected_close',
  'probability',
  'tags',
])

async function findContactByEmail(
  db: DB,
  email: string,
): Promise<ContactRow | null> {
  const all = await db.select().from(schema.contacts)
  for (const c of all) {
    if (
      asArray(c.emails).some((e) => e.toLowerCase() === email.toLowerCase())
    ) {
      return c
    }
  }
  return null
}

export async function importContacts(
  db: DB,
  config: CRMConfig,
  input: string | Record<string, string>[],
  opts: ImportOpts = {},
): Promise<ImportResult> {
  const records = parseRecords(input)
  let imported = 0,
    skipped = 0,
    errors = 0
  const dryRunLines: string[] = []
  for (const rec of records) {
    try {
      if (!rec.name) {
        if (opts.skipErrors) {
          errors++
          continue
        }
        die('Error: row missing name')
      }
      const name = (rec.name || '').trim()
      const emails = splitField(rec.email || rec.emails)
        .map((e) => e.trim())
        .filter((e) => e.includes('@') && !e.startsWith('@') && !e.endsWith('@'))
      const phones = splitField(rec.phone || rec.phones)
        .map((p) => {
          const n = tryNormalizePhone(p, config.phone.default_country)
          return n || p
        })
        .filter((p) => /^\+\d+$/.test(p))
      const companies = splitField(rec.company || rec.companies).map((c) =>
        c.trim(),
      )
      const tags = splitField(rec.tags).map((t) => t.trim())
      let existing: ContactRow | null = null
      for (const e of emails) {
        existing = await findContactByEmail(db, e)
        if (existing) {
          break
        }
      }
      if (existing && !opts.update) {
        skipped++
        continue
      }
      if (existing && opts.update) {
        const custom: CustomFields = { ...(existing.custom_fields || {}) }
        for (const [k, v] of Object.entries(rec)) {
          if (!CONTACT_FIELDS.has(k) && v) {
            custom[k] = v
          }
        }
        await db
          .update(schema.contacts)
          .set({
            name: name || existing.name,
            custom_fields: custom,
            updated_at: now(),
          })
          .where(eq(schema.contacts.id, existing.id))
        imported++
        continue
      }
      if (opts.dryRun) {
        dryRunLines.push(`[dry-run] ${name} (${emails.join(', ')})`)
        imported++
        continue
      }
      const id = makeId('ct')
      const n = now()
      const custom: CustomFields = {}
      for (const [k, v] of Object.entries(rec)) {
        if (!CONTACT_FIELDS.has(k) && v) {
          custom[k] = v
        }
      }
      await db.insert(schema.contacts).values({
        id,
        name,
        emails,
        phones,
        companies,
        linkedin: rec.linkedin?.trim() || null,
        x: rec.x?.trim() || null,
        bluesky: rec.bluesky?.trim() || null,
        telegram: rec.telegram?.trim() || null,
        tags,
        custom_fields: custom,
        created_at: n,
        updated_at: n,
      })
      imported++
    } catch (e: unknown) {
      if (opts.skipErrors) {
        errors++
        continue
      }
      die(`Error importing row: ${(e as Error).message}`)
    }
  }
  return { imported, skipped, errors, dryRunLines }
}

export async function importCompanies(
  db: DB,
  config: CRMConfig,
  input: string | Record<string, string>[],
  opts: ImportOpts = {},
): Promise<ImportResult> {
  const records = parseRecords(input)
  let imported = 0
  const dryRunLines: string[] = []
  for (const rec of records) {
    try {
      if (!rec.name) {
        if (opts.skipErrors) {
          continue
        }
        die('Error: company missing name')
      }
      rec.name = rec.name.trim()
      const websites = splitField(rec.website || rec.websites).map((w) => {
        try {
          return normalizeWebsite(w)
        } catch {
          return w
        }
      })
      const phones = splitField(rec.phone || rec.phones).map((p) => {
        const n = tryNormalizePhone(p, config.phone.default_country)
        return n || p
      })
      const tags = splitField(rec.tags)
      const custom: CustomFields = {}
      for (const [k, v] of Object.entries(rec)) {
        if (!COMPANY_FIELDS.has(k) && v) {
          custom[k] = v
        }
      }
      if (opts.dryRun) {
        dryRunLines.push(`[dry-run] ${rec.name}`)
        imported++
        continue
      }
      const id = makeId('co')
      const n = now()
      await db.insert(schema.companies).values({
        id,
        name: rec.name,
        websites,
        phones,
        tags,
        custom_fields: custom,
        created_at: n,
        updated_at: n,
      })
      imported++
    } catch (e: unknown) {
      if (opts.skipErrors) {
        continue
      }
      die(`Error: ${(e as Error).message}`)
    }
  }
  return { imported, skipped: 0, errors: 0, dryRunLines }
}

export async function importDeals(
  db: DB,
  config: CRMConfig,
  input: string | Record<string, string>[],
  opts: ImportOpts = {},
): Promise<ImportResult> {
  const records = parseRecords(input)
  let imported = 0
  const dryRunLines: string[] = []
  for (const rec of records) {
    try {
      if (!rec.title) {
        if (opts.skipErrors) {
          continue
        }
        die('Error: deal missing title')
      }
      rec.title = rec.title.trim()
      const stage = (rec.stage || config.pipeline.stages[0]).trim()
      const value = rec.value ? Number(rec.value) : null
      const tags = splitField(rec.tags)
      const custom: CustomFields = {}
      for (const [k, v] of Object.entries(rec)) {
        if (!DEAL_FIELDS.has(k) && v) {
          custom[k] = v
        }
      }
      if (opts.dryRun) {
        dryRunLines.push(`[dry-run] ${rec.title}`)
        imported++
        continue
      }
      const id = makeId('dl')
      const n = now()
      await db.insert(schema.deals).values({
        id,
        title: rec.title,
        value,
        stage,
        contacts: [],
        company: null,
        expected_close: rec.expected_close || null,
        probability: rec.probability ? Number(rec.probability) : null,
        tags,
        custom_fields: custom,
        created_at: n,
        updated_at: n,
      })
      imported++
    } catch (e: unknown) {
      if (opts.skipErrors) {
        continue
      }
      die(`Error: ${(e as Error).message}`)
    }
  }
  return { imported, skipped: 0, errors: 0, dryRunLines }
}

export async function exportAll(db: DB): Promise<{
  contacts: Contact[]
  companies: Company[]
  deals: Deal[]
  activities: Activity[]
}> {
  return {
    contacts: (await db.select().from(schema.contacts)).map(contactToRow),
    companies: (await db.select().from(schema.companies)).map(companyToRow),
    deals: (await db.select().from(schema.deals)).map(dealToRow),
    activities: (await db.select().from(schema.activities)).map(activityToRow),
  }
}
