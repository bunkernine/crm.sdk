import { eq } from 'drizzle-orm'

import type { CRMConfig } from '../config'
import type { DB } from '../db'
import { removeSearchIndex, upsertSearchIndex } from '../db'
import * as schema from '../drizzle-schema'
import { die } from '../error'
import { applyFilter, parseFilter } from '../filter'
import { companyToRow } from '../format'
import { runHook } from '../hooks'
import {
  asArray,
  asCustom,
  asList,
  buildCompanySearch,
  checkDupePhone,
  checkDupeWebsite,
  companyDetail,
  confirmOrForce,
  makeId,
  now,
  parseKV,
} from '../lib/helpers'
import {
  normalizePhone,
  normalizeWebsite,
  tryNormalizePhone,
} from '../normalize'
import { resolveCompany } from '../resolve'
import type {
  Company,
  CompanyAddInput,
  CompanyEditInput,
  CustomFields,
  HookPayload,
  JsonValue,
  ListOpts,
} from '../types'

function payload(data: object): HookPayload {
  return data as HookPayload
}

export async function companyAdd(
  db: DB,
  config: CRMConfig,
  opts: CompanyAddInput,
): Promise<Company['id']> {
  if (!opts.name?.trim()) {
    die('Error: --name is required')
  }
  const name = opts.name.trim()
  const cid = makeId('co') as Company['id']
  const n = now()
  const websites: string[] = []
  for (const w of asList(opts.website)) {
    const norm = normalizeWebsite(w)
    await checkDupeWebsite(db, norm)
    websites.push(norm)
  }
  const phones: string[] = []
  for (const p of asList(opts.phone)) {
    try {
      const norm = normalizePhone(p, config.phone.default_country)
      await checkDupePhone(db, norm, 'companies')
      phones.push(norm)
    } catch (e: unknown) {
      die(`Error: invalid phone — ${(e as Error).message}`)
    }
  }
  const tags = asList(opts.tag)
  const custom: CustomFields = {
    ...parseKV(opts.set),
    ...opts.custom_fields,
  }
  if (
    !(await runHook(
      config,
      'pre-company-add',
      payload({ name, websites, phones, tags, custom_fields: custom }),
    ))
  ) {
    die('Error: pre-company-add hook rejected creation')
  }
  await db.insert(schema.companies).values({
    id: cid,
    name,
    websites,
    phones,
    tags,
    custom_fields: custom,
    created_at: n,
    updated_at: n,
  })
  const results = await db
    .select()
    .from(schema.companies)
    .where(eq(schema.companies.id, cid))
  await upsertSearchIndex(db, 'company', cid, buildCompanySearch(results[0]))
  await runHook(
    config,
    'post-company-add',
    payload({
      id: cid,
      name,
      websites,
      phones,
      tags,
      custom_fields: custom,
    }),
  )
  return cid
}

export async function companyList(
  db: DB,
  _config: CRMConfig,
  opts: ListOpts = {},
): Promise<Company[]> {
  let rows = (await db.select().from(schema.companies)).map((c) =>
    companyToRow(c),
  )
  if (opts.filter) {
    const f = parseFilter(opts.filter)
    rows = rows.filter((c) => applyFilter({ ...c }, f))
  }
  if (opts.tag) {
    rows = rows.filter((c) => c.tags.includes(opts.tag as string))
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

export async function companyShow(
  db: DB,
  config: CRMConfig,
  ref: string,
): Promise<Record<string, unknown>> {
  const co = await resolveCompany(db, ref, config)
  if (!co) {
    die(`Error: company not found: ${ref}`)
  }
  return companyDetail(db, co, config)
}

export async function companyEdit(
  db: DB,
  config: CRMConfig,
  ref: string,
  opts: CompanyEditInput,
): Promise<Company['id']> {
  const co = await resolveCompany(db, ref.trim(), config)
  if (!co) {
    die(`Error: company not found: ${ref}`)
  }
  let websites = asArray(co.websites)
  let phones = asArray(co.phones)
  let tags = asArray(co.tags)
  const custom: CustomFields = { ...asCustom(co.custom_fields) }
  let name = co.name
  if (opts.name) {
    name = opts.name.trim()
  }
  for (const w of asList(opts.addWebsite)) {
    const norm = normalizeWebsite(w)
    if (!websites.includes(norm)) {
      await checkDupeWebsite(db, norm, co.id)
      websites.push(norm)
    }
  }
  for (const w of asList(opts.rmWebsite)) {
    const norm = normalizeWebsite(w)
    websites = websites.filter((v) => v !== norm)
  }
  for (const p of asList(opts.addPhone)) {
    const norm = normalizePhone(p, config.phone.default_country)
    if (!phones.includes(norm)) {
      await checkDupePhone(db, norm, 'companies', co.id)
      phones.push(norm)
    }
  }
  for (const p of asList(opts.rmPhone)) {
    const norm = tryNormalizePhone(p, config.phone.default_country)
    phones = norm
      ? phones.filter((v) => v !== norm)
      : phones.filter((v) => v !== p)
  }
  for (const t of asList(opts.addTag)) {
    if (!tags.includes(t)) {
      tags.push(t)
    }
  }
  for (const t of asList(opts.rmTag)) {
    tags = tags.filter((v) => v !== t)
  }
  const kvs = parseKV(opts.set)
  for (const [k, v] of Object.entries(kvs)) {
    custom[k] = v as JsonValue
  }
  for (const k of asList(opts.unset)) {
    delete custom[k]
  }
  if (
    !(await runHook(
      config,
      'pre-company-edit',
      payload({
        id: co.id,
        name,
        websites,
        phones,
        tags,
        custom_fields: custom,
      }),
    ))
  ) {
    die('Error: pre-company-edit hook rejected edit')
  }
  await db
    .update(schema.companies)
    .set({
      name,
      websites,
      phones,
      tags,
      custom_fields: custom,
      updated_at: now(),
    })
    .where(eq(schema.companies.id, co.id))
  const results = await db
    .select()
    .from(schema.companies)
    .where(eq(schema.companies.id, co.id))
  await upsertSearchIndex(db, 'company', co.id, buildCompanySearch(results[0]))
  await runHook(
    config,
    'post-company-edit',
    payload({
      id: co.id,
      name,
      websites,
      phones,
      tags,
      custom_fields: custom,
    }),
  )
  return co.id as Company['id']
}

export async function companyRm(
  db: DB,
  config: CRMConfig,
  ref: string,
  force?: boolean,
): Promise<void> {
  const co = await resolveCompany(db, ref, config)
  if (!co) {
    die(`Error: company not found: ${ref}`)
  }
  confirmOrForce(force, `company "${co.name}" (${co.id})`)
  if (
    !(await runHook(
      config,
      'pre-company-rm',
      payload({ id: co.id, name: co.name }),
    ))
  ) {
    die('Error: pre-company-rm hook rejected deletion')
  }
  const allContacts = await db.select().from(schema.contacts)
  for (const ct of allContacts) {
    const companies = asArray(ct.companies)
    if (companies.includes(co.id)) {
      await db
        .update(schema.contacts)
        .set({ companies: companies.filter((n) => n !== co.id) })
        .where(eq(schema.contacts.id, ct.id))
    }
  }
  await db
    .update(schema.deals)
    .set({ company: null })
    .where(eq(schema.deals.company, co.id))
  await db.delete(schema.companies).where(eq(schema.companies.id, co.id))
  await removeSearchIndex(db, co.id)
  await runHook(config, 'post-company-rm', payload({ id: co.id, name: co.name }))
}

export async function companyMerge(
  db: DB,
  config: CRMConfig,
  id1: string,
  id2: string,
): Promise<Company['id']> {
  const c1 = await resolveCompany(db, id1, config)
  const c2 = await resolveCompany(db, id2, config)
  if (!(c1 && c2)) {
    die('Error: one or both companies not found')
  }
  const mergedWebsites = [
    ...new Set([...asArray(c1.websites), ...asArray(c2.websites)]),
  ]
  const mergedPhones = [...new Set([...asArray(c1.phones), ...asArray(c2.phones)])]
  const mergedTags = [...new Set([...asArray(c1.tags), ...asArray(c2.tags)])]
  const mergedCustom = {
    ...asCustom(c2.custom_fields),
    ...asCustom(c1.custom_fields),
  }
  await db
    .update(schema.companies)
    .set({
      websites: mergedWebsites,
      phones: mergedPhones,
      tags: mergedTags,
      custom_fields: mergedCustom,
      updated_at: now(),
    })
    .where(eq(schema.companies.id, c1.id))
  const allContacts = await db.select().from(schema.contacts)
  for (const ct of allContacts) {
    const companies = asArray(ct.companies)
    if (companies.includes(c2.id)) {
      const updated = [
        ...new Set(companies.map((n) => (n === c2.id ? c1.id : n))),
      ]
      await db
        .update(schema.contacts)
        .set({ companies: updated })
        .where(eq(schema.contacts.id, ct.id))
    }
  }
  await db
    .update(schema.deals)
    .set({ company: c1.id })
    .where(eq(schema.deals.company, c2.id))
  await db
    .update(schema.activities)
    .set({ company: c1.id })
    .where(eq(schema.activities.company, c2.id))
  await db.delete(schema.companies).where(eq(schema.companies.id, c2.id))
  await removeSearchIndex(db, c2.id)
  const results = await db
    .select()
    .from(schema.companies)
    .where(eq(schema.companies.id, c1.id))
  await upsertSearchIndex(db, 'company', c1.id, buildCompanySearch(results[0]))
  return c1.id as Company['id']
}
