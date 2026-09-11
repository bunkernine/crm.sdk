import { eq, sql } from 'drizzle-orm'
import { ulid } from 'ulid'

import type { CRMConfig } from '../config'
import type { DB } from '../db'
import { upsertSearchIndex } from '../db'
import type {
  ActivityRow,
  CompanyRow,
  ContactRow,
  DealRow,
} from '../drizzle-schema'
import * as schema from '../drizzle-schema'
import { die } from '../error'
import type {
  Activity,
  Company,
  Contact,
  CustomFields,
  Deal,
  JsonValue,
} from '../types'
import { formatPhone, tryNormalizePhone } from '../normalize'
import { resolveCompanyForLink, resolveContact } from '../resolve'

export function makeId(prefix: string) {
  return `${prefix}_${ulid()}`
}
export function now() {
  return new Date().toISOString()
}

export function asList(v?: string | string[]): string[] {
  if (!v) {
    return []
  }
  return Array.isArray(v) ? v.map((s) => s.trim()).filter(Boolean) : [v.trim()]
}

export function confirmOrForce(force: boolean | undefined, label: string) {
  if (force) {
    return
  }
  die(`Error: refusing to delete ${label} without --force (non-interactive)`)
}

export function parseKV(arr: string[] | undefined): CustomFields {
  const r: CustomFields = {}
  for (const s of arr || []) {
    const i = s.indexOf('=')
    if (i > 0) {
      const key = s.slice(0, i).trim()
      const val = s.slice(i + 1).trim()
      if (key.startsWith('json:')) {
        try {
          r[key.slice(5)] = JSON.parse(val) as JsonValue
        } catch {
          die(`Error: invalid JSON for custom field "${key.slice(5)}"`)
        }
      } else {
        r[key] = val
      }
    }
  }
  return r
}

export function asArray<T>(v: T[] | null | undefined): T[] {
  return v ?? []
}

export function asCustom(v: CustomFields | null | undefined): CustomFields {
  return v ?? {}
}

export function contactFromRow(c: ContactRow): Contact {
  return {
    id: c.id as Contact['id'],
    name: c.name,
    emails: asArray(c.emails),
    phones: asArray(c.phones),
    companies: asArray(c.companies),
    linkedin: c.linkedin,
    x: c.x,
    bluesky: c.bluesky,
    telegram: c.telegram,
    tags: asArray(c.tags),
    custom_fields: asCustom(c.custom_fields),
    created_at: c.created_at,
    updated_at: c.updated_at,
  }
}

export function companyFromRow(c: CompanyRow): Company {
  return {
    id: c.id as Company['id'],
    name: c.name,
    websites: asArray(c.websites),
    phones: asArray(c.phones),
    tags: asArray(c.tags),
    custom_fields: asCustom(c.custom_fields),
    created_at: c.created_at,
    updated_at: c.updated_at,
  }
}

export function dealFromRow(d: DealRow): Deal {
  return {
    id: d.id as Deal['id'],
    title: d.title,
    value: d.value,
    stage: d.stage,
    contacts: asArray(d.contacts),
    company: (d.company as Deal['company']) || null,
    expected_close: d.expected_close,
    probability: d.probability,
    tags: asArray(d.tags),
    custom_fields: asCustom(d.custom_fields),
    created_at: d.created_at,
    updated_at: d.updated_at,
  }
}

export function activityFromRow(a: ActivityRow): Activity {
  return {
    id: a.id as Activity['id'],
    type: a.type,
    body: a.body,
    contacts: asArray(a.contacts),
    company: (a.company as Activity['company']) || null,
    deal: (a.deal as Activity['deal']) || null,
    custom_fields: asCustom(a.custom_fields),
    created_at: a.created_at,
  }
}

export async function getOrCreateCompanyId(
  db: DB,
  rawRef: string,
): Promise<string> {
  const ref = rawRef.trim()
  const co = await resolveCompanyForLink(db, ref)
  if (co) {
    return co.id
  }
  const cid = makeId('co')
  const n = now()
  await db.insert(schema.companies).values({
    id: cid,
    name: ref,
    websites: [],
    phones: [],
    tags: [],
    custom_fields: {},
    created_at: n,
    updated_at: n,
  })
  await upsertSearchIndex(db, 'company', cid, ref)
  return cid
}

export async function getOrCreateContactId(
  db: DB,
  rawRef: string,
  config: CRMConfig,
): Promise<string> {
  const ref = rawRef.trim()
  const ct = await resolveContact(db, ref, config)
  if (ct) {
    return ct.id
  }
  const cid = makeId('ct')
  const n = now()
  const isEmail = ref.includes('@') && !ref.includes('/')
  const normalizedPhone = isEmail
    ? null
    : tryNormalizePhone(ref, config.phone?.default_country)

  let name = ref
  if (isEmail) {
    name = ref.split('@')[0]
  }

  await db.insert(schema.contacts).values({
    id: cid,
    name,
    emails: isEmail ? [ref] : [],
    phones: normalizedPhone ? [normalizedPhone] : [],
    companies: [],
    tags: [],
    custom_fields: {},
    created_at: n,
    updated_at: n,
  })
  await upsertSearchIndex(db, 'contact', cid, ref)
  return cid
}

export function validateEmail(email: string): void {
  if (!email.includes('@') || email.startsWith('@') || email.endsWith('@')) {
    die(`Error: invalid email "${email}" — must contain @`)
  }
}

export async function checkDupeEmail(
  db: DB,
  email: string,
  excludeId?: string,
) {
  const all = await db.select().from(schema.contacts)
  for (const c of all) {
    if (excludeId && c.id === excludeId) {
      continue
    }
    const emails = asArray(c.emails)
    if (emails.some((e) => e.toLowerCase() === email.toLowerCase())) {
      die(
        `Error: duplicate email "${email}" — already belongs to ${c.name} (${c.id})`,
      )
    }
  }
}

export async function checkDupePhone(
  db: DB,
  phone: string,
  table: string,
  excludeId?: string,
) {
  const all =
    table === 'contacts'
      ? await db.select().from(schema.contacts)
      : await db.select().from(schema.companies)
  for (const c of all) {
    if (excludeId && c.id === excludeId) {
      continue
    }
    const phones = asArray(c.phones)
    if (phones.includes(phone)) {
      die(
        `Error: duplicate phone "${phone}" — already belongs to ${c.name} (${c.id})`,
      )
    }
  }
}

export async function checkDupeWebsite(
  db: DB,
  website: string,
  excludeId?: string,
) {
  const all = await db.select().from(schema.companies)
  for (const co of all) {
    if (excludeId && co.id === excludeId) {
      continue
    }
    const websites = asArray(co.websites)
    if (websites.includes(website)) {
      die(
        `Error: duplicate website "${website}" — already belongs to ${co.name} (${co.id})`,
      )
    }
  }
}

export async function checkDupeSocial(
  db: DB,
  platform: string,
  handle: string,
  excludeId?: string,
) {
  const col = platform as 'linkedin' | 'x' | 'bluesky' | 'telegram'
  const existing = await db
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts[col], handle))
  const match = existing[0]
  if (match && match.id !== excludeId) {
    die(
      `Error: duplicate ${platform} handle "${handle}" — already belongs to ${match.name} (${match.id})`,
    )
  }
}

export async function buildContactSearch(
  db: DB,
  c: ContactRow,
): Promise<string> {
  const companyIds = asArray(c.companies)
  const allCompanies = await db.select().from(schema.companies)
  const companyNames = companyIds
    .map((id) => allCompanies.find((co) => co.id === id)?.name)
    .filter(Boolean)
  return [
    c.name,
    JSON.stringify(asArray(c.emails)),
    JSON.stringify(asArray(c.phones)),
    companyNames.join(' '),
    c.linkedin,
    c.x,
    c.bluesky,
    c.telegram,
    JSON.stringify(asCustom(c.custom_fields)),
    JSON.stringify(asArray(c.tags)),
  ]
    .filter(Boolean)
    .join(' ')
}

export function buildCompanySearch(co: CompanyRow): string {
  return [
    co.name,
    JSON.stringify(asArray(co.websites)),
    JSON.stringify(asArray(co.phones)),
    JSON.stringify(asCustom(co.custom_fields)),
    JSON.stringify(asArray(co.tags)),
  ]
    .filter(Boolean)
    .join(' ')
}

export function buildDealSearch(d: DealRow): string {
  return [
    d.title,
    d.stage,
    JSON.stringify(asCustom(d.custom_fields)),
    JSON.stringify(asArray(d.tags)),
  ]
    .filter(Boolean)
    .join(' ')
}

export async function contactDetail(
  db: DB,
  c: ContactRow,
  config: CRMConfig,
): Promise<Record<string, JsonValue>> {
  const row = contactFromRow(c)
  const phones = asArray(c.phones)
  const companyIds = asArray(c.companies)
  const allCompanies = await db.select().from(schema.companies)
  const allDeals = await db.select().from(schema.deals)
  const deals = allDeals
    .filter((d) => asArray(d.contacts).includes(c.id))
    .map((d) => ({
      id: d.id,
      title: d.title,
      stage: d.stage,
      value: d.value,
    }))
  return {
    ...row,
    companies: companyIds.map((id) => {
      const co = allCompanies.find((x) => x.id === id)
      return co ? co.name : id
    }),
    deals,
    _display_phones: phones.map((p) =>
      formatPhone(p, config.phone.display, config.phone.default_country),
    ),
  } as unknown as Record<string, JsonValue>
}

export async function companyDetail(
  db: DB,
  co: CompanyRow,
  config: CRMConfig,
): Promise<Record<string, JsonValue>> {
  const row = companyFromRow(co)
  const phones = asArray(co.phones)
  const linkedContacts = await db.select().from(schema.contacts)
  const contacts = linkedContacts
    .filter((ct) => asArray(ct.companies).includes(co.id))
    .map((ct) => ({ id: ct.id, name: ct.name, emails: asArray(ct.emails) }))
  const allDeals = await db
    .select()
    .from(schema.deals)
    .where(eq(schema.deals.company, co.id))
  return {
    ...row,
    _display_phones: phones.map((p) =>
      formatPhone(p, config.phone.display, config.phone.default_country),
    ),
    contacts,
    deals: allDeals.map((d) => ({
      id: d.id,
      title: d.title,
      stage: d.stage,
      value: d.value,
    })),
  } as unknown as Record<string, JsonValue>
}

export async function dealDetail(
  db: DB,
  d: DealRow,
): Promise<Record<string, JsonValue>> {
  const row = dealFromRow(d)
  const contactIds = asArray(d.contacts)
  const contactPromises = contactIds.map(async (cid) => {
    const results = await db
      .select()
      .from(schema.contacts)
      .where(eq(schema.contacts.id, cid))
    const ct = results[0]
    return ct ? { id: ct.id, name: ct.name, emails: asArray(ct.emails) } : null
  })
  const contacts = (await Promise.all(contactPromises)).filter(Boolean)
  let company: { id: string; name: string } | null = null
  if (d.company) {
    const results = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.id, d.company))
    const co = results[0]
    company = co ? { id: co.id, name: co.name } : null
  }
  const stageChanges = await db
    .select()
    .from(schema.activities)
    .where(
      sql`${schema.activities.deal} = ${d.id} AND ${schema.activities.type} = 'stage-change'`,
    )
    .orderBy(schema.activities.created_at)
  const history: { stage: string; at: string }[] = []
  if (stageChanges.length > 0) {
    const m = stageChanges[0].body.match(/from (\S+) to/)
    history.push({ stage: m ? m[1] : d.stage, at: d.created_at })
    for (const sc of stageChanges) {
      const tm = sc.body.match(/to (\S+)/)
      history.push({ stage: tm ? tm[1] : '', at: sc.created_at })
    }
  } else {
    history.push({ stage: d.stage, at: d.created_at })
  }
  return {
    ...row,
    contacts,
    company,
    stage_history: history,
    notes: stageChanges.filter((a) => a.body.includes('|')).map((a) => a.body),
  } as unknown as Record<string, JsonValue>
}

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length < 1) {
    return []
  }
  const headers = parseCSVLine(lines[0])
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i])
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = vals[j] || ''
    }
    rows.push(row)
  }
  return rows
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
        continue
      }
      if (ch === '"') {
        inQuotes = false
        continue
      }
      current += ch
    } else {
      if (ch === '"') {
        inQuotes = true
        continue
      }
      if (ch === ',') {
        result.push(current)
        current = ''
        continue
      }
      current += ch
    }
  }
  result.push(current)
  return result
}

export function levenshtein(a: string, b: string): number {
  const la = a.length,
    lb = b.length
  const dp: number[][] = Array.from({ length: la + 1 }, () =>
    new Array(lb + 1).fill(0),
  )
  for (let i = 0; i <= la; i++) {
    dp[i][0] = i
  }
  for (let j = 0; j <= lb; j++) {
    dp[0][j] = j
  }
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return dp[la][lb]
}

export function diceCoefficient(a: string, b: string): number {
  if (a === b) {
    return 1
  }
  if (a.length < 2 || b.length < 2) {
    return 0
  }
  const bigrams = (s: string): Map<string, number> => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2)
      m.set(bg, (m.get(bg) || 0) + 1)
    }
    return m
  }
  const aBi = bigrams(a)
  const bBi = bigrams(b)
  let overlap = 0
  for (const [bg, count] of aBi) {
    overlap += Math.min(count, bBi.get(bg) || 0)
  }
  return (2 * overlap) / (a.length - 1 + b.length - 1)
}

export { die }
