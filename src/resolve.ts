import { eq } from 'drizzle-orm'

import type { CRMConfig } from './config'
import type { DB } from './db'
import type { CompanyRow, ContactRow, DealRow } from './drizzle-schema'
import * as schema from './drizzle-schema'
import { asArray } from './lib/helpers'
import {
  extractPhoneDigits,
  phoneMatchesByDigits,
  tryExtractSocialHandle,
  tryNormalizePhone,
  tryNormalizeWebsite,
} from './normalize'

export async function resolveContact(
  db: DB,
  rawRef: string,
  config?: CRMConfig,
): Promise<ContactRow | null> {
  const ref = rawRef.trim()
  if (ref.startsWith('ct_')) {
    const results = await db
      .select()
      .from(schema.contacts)
      .where(eq(schema.contacts.id, ref))
    return results[0] || null
  }

  if (ref.includes('@') && !ref.includes('/')) {
    const handle = ref.startsWith('@') ? ref.slice(1) : ref
    const all = await db.select().from(schema.contacts)
    for (const c of all) {
      const emails = asArray(c.emails)
      if (emails.some((e) => e.toLowerCase() === ref.toLowerCase())) {
        return c
      }
    }
    for (const c of all) {
      if (
        c.linkedin === handle ||
        c.x === handle ||
        c.bluesky === handle ||
        c.telegram === handle
      ) {
        return c
      }
    }
    return null
  }

  const extracted = tryExtractSocialHandle(ref)
  if (extracted) {
    const col = extracted.platform as 'linkedin' | 'x' | 'bluesky' | 'telegram'
    const results = await db
      .select()
      .from(schema.contacts)
      .where(eq(schema.contacts[col], extracted.handle))
    if (results[0]) {
      return results[0]
    }
  }

  const phoneNorm = tryNormalizePhone(ref, config?.phone?.default_country)
  if (phoneNorm) {
    const all = await db.select().from(schema.contacts)
    for (const c of all) {
      if (asArray(c.phones).includes(phoneNorm)) {
        return c
      }
    }
  }

  const digits = extractPhoneDigits(ref)
  if (digits.length >= 7) {
    const all = await db.select().from(schema.contacts)
    for (const c of all) {
      for (const p of asArray(c.phones)) {
        if (phoneMatchesByDigits(p, digits)) {
          return c
        }
      }
    }
  }

  {
    const handle = ref.startsWith('@') ? ref.slice(1) : ref
    const all = await db.select().from(schema.contacts)
    for (const c of all) {
      if (
        c.linkedin === handle ||
        c.x === handle ||
        c.bluesky === handle ||
        c.telegram === handle
      ) {
        return c
      }
    }
  }

  return null
}

export async function resolveCompany(
  db: DB,
  rawRef: string,
  config?: CRMConfig,
): Promise<CompanyRow | null> {
  const ref = rawRef.trim()
  if (ref.startsWith('co_')) {
    const results = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.id, ref))
    return results[0] || null
  }

  const all = await db.select().from(schema.companies)
  const normalizedWeb = tryNormalizeWebsite(ref)
  if (normalizedWeb) {
    for (const co of all) {
      if (asArray(co.websites).some((w) => w === normalizedWeb)) {
        return co
      }
    }
  }

  const phoneNorm = tryNormalizePhone(ref, config?.phone?.default_country)
  if (phoneNorm) {
    for (const co of all) {
      if (asArray(co.phones).includes(phoneNorm)) {
        return co
      }
    }
  }

  const digits = extractPhoneDigits(ref)
  if (digits.length >= 7) {
    for (const co of all) {
      for (const p of asArray(co.phones)) {
        if (phoneMatchesByDigits(p, digits)) {
          return co
        }
      }
    }
  }

  for (const co of all) {
    if (co.name === ref) {
      return co
    }
  }

  return null
}

export async function resolveDeal(
  db: DB,
  rawRef: string,
): Promise<DealRow | null> {
  const ref = rawRef.trim()
  if (ref.startsWith('dl_')) {
    const results = await db
      .select()
      .from(schema.deals)
      .where(eq(schema.deals.id, ref))
    return results[0] || null
  }
  return null
}

export async function resolveEntity(
  db: DB,
  rawRef: string,
  config?: CRMConfig,
): Promise<
  | { type: 'contact'; entity: ContactRow }
  | { type: 'company'; entity: CompanyRow }
  | { type: 'deal'; entity: DealRow }
  | null
> {
  const contact = await resolveContact(db, rawRef, config)
  if (contact) {
    return { type: 'contact', entity: contact }
  }
  const company = await resolveCompany(db, rawRef, config)
  if (company) {
    return { type: 'company', entity: company }
  }
  const deal = await resolveDeal(db, rawRef)
  if (deal) {
    return { type: 'deal', entity: deal }
  }
  return null
}

export async function resolveCompanyForLink(
  db: DB,
  rawRef: string,
): Promise<CompanyRow | null> {
  const ref = rawRef.trim()
  if (ref.startsWith('co_')) {
    const results = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.id, ref))
    return results[0] || null
  }

  const all = await db.select().from(schema.companies)
  const normalizedWeb = tryNormalizeWebsite(ref)
  if (normalizedWeb) {
    for (const co of all) {
      if (asArray(co.websites).some((w) => w === normalizedWeb)) {
        return co
      }
    }
  }

  for (const co of all) {
    if (co.name === ref) {
      return co
    }
  }

  return null
}
