import { eq } from 'drizzle-orm'

import type { CRMConfig } from '../config'
import type { DB } from '../db'
import { removeSearchIndex, upsertSearchIndex } from '../db'
import * as schema from '../drizzle-schema'
import { die } from '../error'
import { applyFilter, parseFilter } from '../filter'
import { contactToRow } from '../format'
import { runHook } from '../hooks'
import {
  asArray,
  asCustom,
  asList,
  buildContactSearch,
  checkDupeEmail,
  checkDupePhone,
  checkDupeSocial,
  confirmOrForce,
  contactDetail,
  getOrCreateCompanyId,
  makeId,
  now,
  parseKV,
  validateEmail,
} from '../lib/helpers'
import {
  normalizePhone,
  normalizeSocialHandle,
  tryNormalizePhone,
} from '../normalize'
import { resolveCompany, resolveContact } from '../resolve'
import type {
  Contact,
  ContactAddInput,
  ContactEditInput,
  CustomFields,
  HookPayload,
  JsonValue,
  ListOpts,
} from '../types'

function payload(data: object): HookPayload {
  return data as HookPayload
}

export async function contactAdd(
  db: DB,
  config: CRMConfig,
  opts: ContactAddInput,
): Promise<Contact['id']> {
  if (!opts.name?.trim()) {
    die('Error: --name is required')
  }
  const name = opts.name.trim()
  const emails = asList(opts.email)
  const phonesIn = asList(opts.phone)
  const companiesIn = asList(opts.company)
  const tags = asList(opts.tag)
  const cid = makeId('ct') as Contact['id']
  const n = now()
  for (const e of emails) {
    validateEmail(e)
    await checkDupeEmail(db, e)
  }
  const phones: string[] = []
  for (const p of phonesIn) {
    try {
      const norm = normalizePhone(p, config.phone.default_country)
      await checkDupePhone(db, norm, 'contacts')
      phones.push(norm)
    } catch (e: unknown) {
      die(`Error: invalid phone — ${(e as Error).message}`)
    }
  }
  const linkedin = opts.linkedin
    ? normalizeSocialHandle('linkedin', opts.linkedin.trim())
    : null
  const x = opts.x ? normalizeSocialHandle('x', opts.x.trim()) : null
  const bluesky = opts.bluesky
    ? normalizeSocialHandle('bluesky', opts.bluesky.trim())
    : null
  const telegram = opts.telegram
    ? normalizeSocialHandle('telegram', opts.telegram.trim())
    : null
  if (linkedin) {
    await checkDupeSocial(db, 'linkedin', linkedin)
  }
  if (x) {
    await checkDupeSocial(db, 'x', x)
  }
  if (bluesky) {
    await checkDupeSocial(db, 'bluesky', bluesky)
  }
  if (telegram) {
    await checkDupeSocial(db, 'telegram', telegram)
  }
  const companies: string[] = []
  for (const c of companiesIn) {
    companies.push(await getOrCreateCompanyId(db, c))
  }
  const custom: CustomFields = {
    ...parseKV(opts.set),
    ...opts.custom_fields,
  }
  if (
    !(await runHook(
      config,
      'pre-contact-add',
      payload({
        name,
        emails,
        phones,
        companies,
        linkedin,
        x,
        bluesky,
        telegram,
        tags,
        custom_fields: custom,
      }),
    ))
  ) {
    die('Error: pre-contact-add hook rejected creation')
  }
  await db.insert(schema.contacts).values({
    id: cid,
    name,
    emails,
    phones,
    companies,
    linkedin,
    x,
    bluesky,
    telegram,
    tags,
    custom_fields: custom,
    created_at: n,
    updated_at: n,
  })
  const results = await db
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.id, cid))
  const row = results[0]
  await upsertSearchIndex(db, 'contact', cid, await buildContactSearch(db, row))
  await runHook(
    config,
    'post-contact-add',
    payload({
      id: cid,
      name,
      emails,
      phones,
      companies,
      linkedin,
      x,
      bluesky,
      telegram,
      tags,
      custom_fields: custom,
    }),
  )
  return cid
}

export async function contactList(
  db: DB,
  config: CRMConfig,
  opts: ListOpts = {},
): Promise<Contact[]> {
  let rows = (await db.select().from(schema.contacts)).map((c) =>
    contactToRow(c),
  )
  if (opts.tag) {
    rows = rows.filter((c) => c.tags.includes(opts.tag as string))
  }
  if (opts.company) {
    const co = await resolveCompany(db, opts.company, config)
    rows = co ? rows.filter((c) => c.companies.includes(co.id)) : []
  }
  if (opts.filter) {
    const f = parseFilter(opts.filter)
    rows = rows.filter((c) => applyFilter({ ...c }, f))
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

export async function contactShow(
  db: DB,
  config: CRMConfig,
  ref: string,
): Promise<Record<string, unknown>> {
  const c = await resolveContact(db, ref, config)
  if (!c) {
    die(`Error: contact not found: ${ref}`)
  }
  return contactDetail(db, c, config)
}

export async function contactEdit(
  db: DB,
  config: CRMConfig,
  ref: string,
  opts: ContactEditInput,
): Promise<Contact['id']> {
  const c = await resolveContact(db, ref.trim(), config)
  if (!c) {
    die(`Error: contact not found: ${ref}`)
  }
  let emails = asArray(c.emails)
  let phones = asArray(c.phones)
  let companies = asArray(c.companies)
  let tags = asArray(c.tags)
  const custom: CustomFields = { ...asCustom(c.custom_fields) }
  let name = c.name,
    linkedin = c.linkedin,
    x = c.x,
    bluesky = c.bluesky,
    telegram = c.telegram
  if (opts.name) {
    name = opts.name.trim()
  }
  for (const e of asList(opts.addEmail)) {
    validateEmail(e)
    await checkDupeEmail(db, e, c.id)
    if (!emails.includes(e)) {
      emails.push(e)
    }
  }
  for (const e of asList(opts.rmEmail)) {
    emails = emails.filter((v) => v !== e)
  }
  for (const p of asList(opts.addPhone)) {
    const norm = normalizePhone(p, config.phone.default_country)
    if (!phones.includes(norm)) {
      await checkDupePhone(db, norm, 'contacts', c.id)
      phones.push(norm)
    }
  }
  for (const p of asList(opts.rmPhone)) {
    const norm = tryNormalizePhone(p, config.phone.default_country)
    phones = norm
      ? phones.filter((v) => v !== norm)
      : phones.filter((v) => v !== p)
  }
  for (const co of asList(opts.addCompany)) {
    const coId = await getOrCreateCompanyId(db, co)
    if (!companies.includes(coId)) {
      companies.push(coId)
    }
  }
  for (const co of asList(opts.rmCompany)) {
    const resolved = await resolveCompany(db, co, config)
    if (resolved) {
      companies = companies.filter((v) => v !== resolved.id)
    }
  }
  for (const t of asList(opts.addTag)) {
    if (!tags.includes(t)) {
      tags.push(t)
    }
  }
  for (const t of asList(opts.rmTag)) {
    tags = tags.filter((v) => v !== t)
  }
  if (opts.linkedin) {
    linkedin = normalizeSocialHandle('linkedin', opts.linkedin.trim())
    await checkDupeSocial(db, 'linkedin', linkedin, c.id)
  }
  if (opts.x) {
    x = normalizeSocialHandle('x', opts.x.trim())
    await checkDupeSocial(db, 'x', x, c.id)
  }
  if (opts.bluesky) {
    bluesky = normalizeSocialHandle('bluesky', opts.bluesky.trim())
    await checkDupeSocial(db, 'bluesky', bluesky, c.id)
  }
  if (opts.telegram) {
    telegram = normalizeSocialHandle('telegram', opts.telegram.trim())
    await checkDupeSocial(db, 'telegram', telegram, c.id)
  }
  const kvs = { ...parseKV(opts.set), ...opts.custom_fields }
  for (const [k, v] of Object.entries(kvs)) {
    custom[k] = v as JsonValue
  }
  for (const k of asList(opts.unset)) {
    delete custom[k]
    if (k === 'linkedin') {
      linkedin = null
    }
    if (k === 'x') {
      x = null
    }
    if (k === 'bluesky') {
      bluesky = null
    }
    if (k === 'telegram') {
      telegram = null
    }
  }
  if (
    !(await runHook(
      config,
      'pre-contact-edit',
      payload({
        id: c.id,
        name,
        emails,
        phones,
        companies,
        linkedin,
        x,
        bluesky,
        telegram,
        tags,
        custom_fields: custom,
      }),
    ))
  ) {
    die('Error: pre-contact-edit hook rejected edit')
  }
  await db
    .update(schema.contacts)
    .set({
      name,
      emails,
      phones,
      companies,
      linkedin,
      x,
      bluesky,
      telegram,
      tags,
      custom_fields: custom,
      updated_at: now(),
    })
    .where(eq(schema.contacts.id, c.id))
  const results = await db
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.id, c.id))
  await upsertSearchIndex(
    db,
    'contact',
    c.id,
    await buildContactSearch(db, results[0]),
  )
  await runHook(
    config,
    'post-contact-edit',
    payload({
      id: c.id,
      name,
      emails,
      phones,
      companies,
      linkedin,
      x,
      bluesky,
      telegram,
      tags,
      custom_fields: custom,
    }),
  )
  return c.id as Contact['id']
}

export async function contactRm(
  db: DB,
  config: CRMConfig,
  ref: string,
  force?: boolean,
): Promise<void> {
  const c = await resolveContact(db, ref, config)
  if (!c) {
    die(`Error: contact not found: ${ref}`)
  }
  confirmOrForce(force, `contact "${c.name}" (${c.id})`)
  if (
    !(await runHook(config, 'pre-contact-rm', payload({ id: c.id, name: c.name })))
  ) {
    die('Error: pre-contact-rm hook rejected deletion')
  }
  const allDeals = await db.select().from(schema.deals)
  for (const d of allDeals) {
    const contacts = asArray(d.contacts)
    if (contacts.includes(c.id)) {
      await db
        .update(schema.deals)
        .set({ contacts: contacts.filter((id) => id !== c.id) })
        .where(eq(schema.deals.id, d.id))
    }
  }
  await db.delete(schema.contacts).where(eq(schema.contacts.id, c.id))
  await removeSearchIndex(db, c.id)
  await runHook(config, 'post-contact-rm', payload({ id: c.id, name: c.name }))
}

export async function contactMerge(
  db: DB,
  config: CRMConfig,
  id1: string,
  id2: string,
): Promise<Contact['id']> {
  const c1 = await resolveContact(db, id1, config)
  const c2 = await resolveContact(db, id2, config)
  if (!(c1 && c2)) {
    die('Error: one or both contacts not found')
  }
  const mergedEmails = [...new Set([...asArray(c1.emails), ...asArray(c2.emails)])]
  const mergedPhones = [...new Set([...asArray(c1.phones), ...asArray(c2.phones)])]
  const mergedCompanies = [
    ...new Set([...asArray(c1.companies), ...asArray(c2.companies)]),
  ]
  const mergedTags = [...new Set([...asArray(c1.tags), ...asArray(c2.tags)])]
  const mergedCustom = {
    ...asCustom(c2.custom_fields),
    ...asCustom(c1.custom_fields),
  }
  const linkedin = c1.linkedin || c2.linkedin
  const x = c1.x || c2.x
  const bluesky = c1.bluesky || c2.bluesky
  const telegram = c1.telegram || c2.telegram
  await db
    .update(schema.contacts)
    .set({ linkedin: null, x: null, bluesky: null, telegram: null })
    .where(eq(schema.contacts.id, c2.id))
  await db
    .update(schema.contacts)
    .set({
      emails: mergedEmails,
      phones: mergedPhones,
      companies: mergedCompanies,
      tags: mergedTags,
      custom_fields: mergedCustom,
      linkedin,
      x,
      bluesky,
      telegram,
      updated_at: now(),
    })
    .where(eq(schema.contacts.id, c1.id))
  const allDeals = await db.select().from(schema.deals)
  for (const d of allDeals) {
    const contacts = asArray(d.contacts)
    if (contacts.includes(c2.id)) {
      const updated = [
        ...new Set(contacts.map((id) => (id === c2.id ? c1.id : id))),
      ]
      await db
        .update(schema.deals)
        .set({ contacts: updated })
        .where(eq(schema.deals.id, d.id))
    }
  }
  const allActivities = await db.select().from(schema.activities)
  for (const a of allActivities) {
    const contacts = asArray(a.contacts)
    if (contacts.includes(c2.id)) {
      const updated = [
        ...new Set(contacts.map((id) => (id === c2.id ? c1.id : id))),
      ]
      await db
        .update(schema.activities)
        .set({ contacts: updated })
        .where(eq(schema.activities.id, a.id))
    }
  }
  await db.delete(schema.contacts).where(eq(schema.contacts.id, c2.id))
  await removeSearchIndex(db, c2.id)
  const results = await db
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.id, c1.id))
  await upsertSearchIndex(
    db,
    'contact',
    c1.id,
    await buildContactSearch(db, results[0]),
  )
  return c1.id as Contact['id']
}
