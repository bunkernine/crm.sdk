import { eq } from 'drizzle-orm'

import type { CRMConfig } from '../config'
import type { DB } from '../db'
import { removeSearchIndex, upsertSearchIndex } from '../db'
import * as schema from '../drizzle-schema'
import { die } from '../error'
import { applyFilter, parseFilter } from '../filter'
import { dealToRow } from '../format'
import { runHook } from '../hooks'
import {
  asArray,
  asCustom,
  asList,
  buildDealSearch,
  confirmOrForce,
  dealDetail,
  getOrCreateCompanyId,
  getOrCreateContactId,
  makeId,
  now,
  parseKV,
} from '../lib/helpers'
import {
  resolveCompany,
  resolveCompanyForLink,
  resolveContact,
  resolveDeal,
} from '../resolve'
import type {
  CustomFields,
  Deal,
  DealAddInput,
  DealEditInput,
  HookPayload,
  JsonValue,
  ListOpts,
  PipelineRow,
} from '../types'

function payload(data: object): HookPayload {
  return data as HookPayload
}

export async function dealAdd(
  db: DB,
  config: CRMConfig,
  opts: DealAddInput,
): Promise<Deal['id']> {
  if (!opts.title?.trim()) {
    die('Error: --title is required')
  }
  const title = opts.title.trim()
  const id = makeId('dl') as Deal['id']
  const n = now()
  if (opts.value !== undefined && opts.value < 0) {
    die('Error: value must be non-negative')
  }
  if (opts.probability !== undefined) {
    if (opts.probability < 0 || opts.probability > 100) {
      die('Error: probability must be between 0 and 100')
    }
  }
  let expectedClose = opts.expectedClose
  if (expectedClose) {
    expectedClose = expectedClose.trim()
    const d = new Date(expectedClose)
    if (Number.isNaN(d.getTime())) {
      die('Error: invalid expected-close date')
    }
  }
  const stage = (opts.stage || config.pipeline.stages[0]).trim()
  if (!config.pipeline.stages.includes(stage)) {
    die(`Error: invalid stage "${stage}"`)
  }
  const contactIds: string[] = []
  for (const ref of asList(opts.contact)) {
    const ctId = await getOrCreateContactId(db, ref, config)
    if (!contactIds.includes(ctId)) {
      contactIds.push(ctId)
    }
  }
  let companyId: string | null = null
  if (opts.company) {
    const companyRef = opts.company.trim()
    const co = await resolveCompanyForLink(db, companyRef)
    if (co) {
      companyId = co.id
    } else {
      if (companyRef.includes('.')) {
        die(`Error: company not found: ${companyRef}`)
      }
      companyId = await getOrCreateCompanyId(db, companyRef)
    }
  }
  const custom: CustomFields = {
    ...parseKV(opts.set),
    ...opts.custom_fields,
  }
  const value = opts.value === undefined ? null : opts.value
  const probability = opts.probability === undefined ? null : opts.probability
  if (
    !(await runHook(
      config,
      'pre-deal-add',
      payload({
        title,
        value,
        stage,
        contacts: contactIds,
        company: companyId,
        expected_close: expectedClose || null,
        probability,
        tags: asList(opts.tag),
        custom_fields: custom,
      }),
    ))
  ) {
    die('Error: pre-deal-add hook rejected creation')
  }
  const tags = asList(opts.tag)
  await db.insert(schema.deals).values({
    id,
    title,
    value,
    stage,
    contacts: contactIds,
    company: companyId,
    expected_close: expectedClose || null,
    probability,
    tags,
    custom_fields: custom,
    created_at: n,
    updated_at: n,
  })
  const results = await db.select().from(schema.deals).where(eq(schema.deals.id, id))
  await upsertSearchIndex(db, 'deal', id, buildDealSearch(results[0]))
  await runHook(
    config,
    'post-deal-add',
    payload({
      id,
      title,
      value,
      stage,
      contacts: contactIds,
      company: companyId,
      expected_close: expectedClose || null,
      probability,
      tags,
      custom_fields: custom,
    }),
  )
  return id
}

export async function dealList(
  db: DB,
  config: CRMConfig,
  opts: ListOpts = {},
): Promise<Deal[]> {
  let rows = (await db.select().from(schema.deals)).map((d) => dealToRow(d))
  if (opts.stage) {
    rows = rows.filter((d) => d.stage === opts.stage)
  }
  if (opts.minValue !== undefined) {
    rows = rows.filter((d) => (d.value ?? 0) >= opts.minValue!)
  }
  if (opts.maxValue !== undefined) {
    rows = rows.filter((d) => (d.value ?? 0) <= opts.maxValue!)
  }
  if (opts.contact) {
    const ct = await resolveContact(db, opts.contact, config)
    rows = ct ? rows.filter((d) => d.contacts.includes(ct.id)) : []
  }
  if (opts.company) {
    const co = await resolveCompany(db, opts.company, config)
    rows = co ? rows.filter((d) => d.company === co.id) : []
  }
  if (opts.tag) {
    rows = rows.filter((d) => d.tags.includes(opts.tag as string))
  }
  if (opts.filter) {
    const f = parseFilter(opts.filter)
    rows = rows.filter((d) => applyFilter({ ...d }, f))
  }
  if (opts.sort) {
    const sort = opts.sort
    rows.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sort]
      const bv = (b as unknown as Record<string, unknown>)[sort]
      if (typeof av === 'number' && typeof bv === 'number') {
        return av - bv
      }
      return String(av ?? '').localeCompare(String(bv ?? ''))
    })
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

export async function dealShow(
  db: DB,
  ref: string,
): Promise<Record<string, unknown>> {
  const d = await resolveDeal(db, ref)
  if (!d) {
    die(`Error: deal not found: ${ref}`)
  }
  return dealDetail(db, d)
}

export async function dealEdit(
  db: DB,
  config: CRMConfig,
  ref: string,
  opts: DealEditInput,
): Promise<Deal['id']> {
  const d = await resolveDeal(db, ref.trim())
  if (!d) {
    die(`Error: deal not found: ${ref}`)
  }
  const title = opts.title?.trim() ?? d.title
  const value = opts.value === undefined ? d.value : opts.value
  const expectedClose = opts.expectedClose
    ? opts.expectedClose.trim()
    : d.expected_close
  const probability =
    opts.probability === undefined ? d.probability : opts.probability
  let companyId = d.company
  if (opts.company) {
    companyId = await getOrCreateCompanyId(db, opts.company.trim())
  }
  let contacts = asArray(d.contacts)
  let tags = asArray(d.tags)
  const custom: CustomFields = { ...asCustom(d.custom_fields) }
  for (const r of asList(opts.addContact)) {
    const ctId = await getOrCreateContactId(db, r, config)
    if (!contacts.includes(ctId)) {
      contacts.push(ctId)
    }
  }
  for (const r of asList(opts.rmContact)) {
    const ct = await resolveContact(db, r, config)
    if (ct) {
      contacts = contacts.filter((id) => id !== ct.id)
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
      'pre-deal-edit',
      payload({
        id: d.id,
        title,
        value,
        contacts,
        tags,
        custom_fields: custom,
      }),
    ))
  ) {
    die('Error: pre-deal-edit hook rejected edit')
  }
  await db
    .update(schema.deals)
    .set({
      title,
      value,
      company: companyId,
      expected_close: expectedClose,
      probability,
      contacts,
      tags,
      custom_fields: custom,
      updated_at: now(),
    })
    .where(eq(schema.deals.id, d.id))
  const results = await db
    .select()
    .from(schema.deals)
    .where(eq(schema.deals.id, d.id))
  await upsertSearchIndex(db, 'deal', d.id, buildDealSearch(results[0]))
  await runHook(
    config,
    'post-deal-edit',
    payload({
      id: d.id,
      title,
      value,
      contacts,
      tags,
      custom_fields: custom,
    }),
  )
  return d.id as Deal['id']
}

export async function dealMove(
  db: DB,
  config: CRMConfig,
  ref: string,
  stage: string,
  note?: string,
): Promise<Deal['id']> {
  stage = stage.trim()
  if (note) {
    note = note.trim()
  }
  const d = await resolveDeal(db, ref)
  if (!d) {
    die(`Error: deal not found: ${ref}`)
  }
  if (!config.pipeline.stages.includes(stage)) {
    die(`Error: invalid stage "${stage}"`)
  }
  if (d.stage === stage) {
    die(`Error: deal is already in stage "${stage}"`)
  }
  const oldStage = d.stage
  if (
    !(await runHook(
      config,
      'pre-deal-stage-change',
      payload({ deal: d.id, from: oldStage, to: stage, note: note ?? null }),
    ))
  ) {
    die('Error: pre-deal-stage-change hook rejected stage move')
  }
  const n = now()
  await db
    .update(schema.deals)
    .set({ stage, updated_at: n })
    .where(eq(schema.deals.id, d.id))
  let body = `from ${oldStage} to ${stage}`
  if (note) {
    body += ` | ${note}`
  }
  const aid = makeId('ac')
  await db.insert(schema.activities).values({
    id: aid,
    type: 'stage-change',
    body,
    deal: d.id,
    created_at: n,
  })
  await upsertSearchIndex(db, 'activity', aid, `stage-change ${body}`)
  await runHook(
    config,
    'post-deal-stage-change',
    payload({ deal: d.id, from: oldStage, to: stage, note: note ?? null }),
  )
  return d.id as Deal['id']
}

export async function dealRm(
  db: DB,
  config: CRMConfig,
  ref: string,
  force?: boolean,
): Promise<void> {
  const d = await resolveDeal(db, ref)
  if (!d) {
    die(`Error: deal not found: ${ref}`)
  }
  confirmOrForce(force, `deal "${d.title}" (${d.id})`)
  if (
    !(await runHook(
      config,
      'pre-deal-rm',
      payload({ id: d.id, title: d.title }),
    ))
  ) {
    die('Error: pre-deal-rm hook rejected deletion')
  }
  await db.delete(schema.activities).where(eq(schema.activities.deal, d.id))
  await db.delete(schema.deals).where(eq(schema.deals.id, d.id))
  await removeSearchIndex(db, d.id)
  await runHook(config, 'post-deal-rm', payload({ id: d.id, title: d.title }))
}

export async function pipelineSummary(
  db: DB,
  config: CRMConfig,
): Promise<PipelineRow[]> {
  const deals = await db.select().from(schema.deals)
  const summary = config.pipeline.stages.map((stage) => ({
    stage,
    count: deals.filter((d) => d.stage === stage).length,
    value: deals
      .filter((d) => d.stage === stage)
      .reduce((s, d) => s + (d.value || 0), 0),
  }))
  const total = {
    stage: 'Total',
    count: deals.length,
    value: deals.reduce((s, d) => s + (d.value || 0), 0),
  }
  return [...summary, total]
}
