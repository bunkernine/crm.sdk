import { eq } from 'drizzle-orm'

import { resolveConfig } from './config'
import { openDB } from './db'
import { formatOutput } from './format'
import * as schema from './drizzle-schema'
import {
  companyList,
  companyAdd,
  companyEdit,
  companyMerge,
  companyRm,
  companyShow,
} from './ops/company'
import {
  contactAdd,
  contactEdit,
  contactList,
  contactMerge,
  contactRm,
  contactShow,
} from './ops/contact'
import {
  dealAdd,
  dealEdit,
  dealList,
  dealMove,
  dealRm,
  dealShow,
  pipelineSummary,
} from './ops/deal'
import {
  activityList,
  exportAll,
  findDupes,
  findEntities,
  importCompanies,
  importContacts,
  importDeals,
  indexRebuild,
  indexStatus,
  logActivity,
  searchEntities,
  tagEntity,
  tagList,
  untagEntity,
} from './ops/misc'
import {
  computeConversion,
  computeForecast,
  computeLost,
  computeStale,
  computeVelocity,
  computeWon,
} from './reports'
import { contactToRow, companyToRow, dealToRow } from './format'
import type {
  Activity,
  ActivityListOpts,
  Company,
  CompanyAddInput,
  CompanyDetail,
  CompanyEditInput,
  Contact,
  ContactAddInput,
  ContactDetail,
  ContactEditInput,
  CreateCrmOptions,
  Deal,
  DealAddInput,
  DealDetail,
  DealEditInput,
  DupeResult,
  DupesOpts,
  ExportFormat,
  FindOpts,
  ImportOpts,
  ImportResult,
  IndexStatus,
  ListOpts,
  LogInput,
  PipelineRow,
  SearchOpts,
  TagCount,
} from './types'

export type * from './types'
export { CrmError } from './error'

export interface CrmClient {
  contact: {
    add: (input: ContactAddInput) => Promise<string>
    list: (opts?: ListOpts) => Promise<Contact[]>
    show: (ref: string) => Promise<ContactDetail>
    edit: (ref: string, input: ContactEditInput) => Promise<string>
    rm: (ref: string, opts?: { force?: boolean }) => Promise<void>
    merge: (a: string, b: string) => Promise<string>
  }
  company: {
    add: (input: CompanyAddInput) => Promise<string>
    list: (opts?: ListOpts) => Promise<Company[]>
    show: (ref: string) => Promise<CompanyDetail>
    edit: (ref: string, input: CompanyEditInput) => Promise<string>
    rm: (ref: string, opts?: { force?: boolean }) => Promise<void>
    merge: (a: string, b: string) => Promise<string>
  }
  deal: {
    add: (input: DealAddInput) => Promise<string>
    list: (opts?: ListOpts) => Promise<Deal[]>
    show: (ref: string) => Promise<DealDetail>
    edit: (ref: string, input: DealEditInput) => Promise<string>
    move: (ref: string, input: { stage: string; note?: string }) => Promise<string>
    rm: (ref: string, opts?: { force?: boolean }) => Promise<void>
  }
  pipeline: () => Promise<PipelineRow[]>
  log: (input: LogInput) => Promise<string>
  activity: { list: (opts?: ActivityListOpts) => Promise<Activity[]> }
  tag: ((ref: string, tags: string[]) => Promise<void>) & {
    list: (opts?: { type?: string }) => Promise<TagCount[]>
  }
  untag: (ref: string, tags: string[]) => Promise<void>
  search: (query: string, opts?: SearchOpts) => Promise<Record<string, unknown>[]>
  find: (query: string, opts?: FindOpts) => Promise<Record<string, unknown>[]>
  index: {
    status: () => Promise<IndexStatus>
    rebuild: () => Promise<void>
  }
  dupes: (opts?: DupesOpts) => Promise<DupeResult[]>
  report: {
    pipeline: () => Promise<PipelineRow[]>
    activity: (opts?: { by?: string; period?: string }) => Promise<Record<string, unknown>[]>
    stale: (opts?: { days?: number; type?: string }) => Promise<Record<string, unknown>[]>
    conversion: (opts?: { since?: string }) => Promise<Record<string, unknown>[]>
    velocity: (opts?: { wonOnly?: boolean }) => Promise<Record<string, unknown>[]>
    forecast: (opts?: { period?: string }) => Promise<Record<string, unknown>[]>
    won: (opts?: { period?: string }) => Promise<Record<string, unknown>[]>
    lost: (opts?: { period?: string }) => Promise<Record<string, unknown>[]>
  }
  import: {
    contacts: (
      input: string | Record<string, string>[],
      opts?: ImportOpts,
    ) => Promise<ImportResult>
    companies: (
      input: string | Record<string, string>[],
      opts?: ImportOpts,
    ) => Promise<ImportResult>
    deals: (
      input: string | Record<string, string>[],
      opts?: ImportOpts,
    ) => Promise<ImportResult>
  }
  export: {
    contacts: (format?: ExportFormat) => Promise<unknown>
    companies: (format?: ExportFormat) => Promise<unknown>
    deals: (format?: ExportFormat) => Promise<unknown>
    all: () => Promise<{
      contacts: Contact[]
      companies: Company[]
      deals: Deal[]
      activities: Activity[]
    }>
  }
  close: () => Promise<void>
}

function periodToDate(period: string): string | null {
  const m = period.match(/^(\d+)d$/)
  if (m) {
    return new Date(Date.now() - Number(m[1]) * 86_400_000).toISOString()
  }
  return null
}

export async function createCrm(options: CreateCrmOptions): Promise<CrmClient> {
  const config = resolveConfig(options)
  const { db, sql } = await openDB(options.connectionString)

  const tagFn = ((ref: string, tags: string[]) =>
    tagEntity(db, config, ref, tags)) as CrmClient['tag']
  tagFn.list = (opts?: { type?: string }) => tagList(db, opts?.type)

  const client: CrmClient = {
    contact: {
      add: (input) => contactAdd(db, config, input),
      list: (opts) => contactList(db, config, opts),
      show: (ref) =>
        contactShow(db, config, ref) as unknown as Promise<ContactDetail>,
      edit: (ref, input) => contactEdit(db, config, ref, input),
      rm: (ref, opts) => contactRm(db, config, ref, opts?.force),
      merge: (a, b) => contactMerge(db, config, a, b),
    },
    company: {
      add: (input) => companyAdd(db, config, input),
      list: (opts) => companyList(db, config, opts),
      show: (ref) =>
        companyShow(db, config, ref) as unknown as Promise<CompanyDetail>,
      edit: (ref, input) => companyEdit(db, config, ref, input),
      rm: (ref, opts) => companyRm(db, config, ref, opts?.force),
      merge: (a, b) => companyMerge(db, config, a, b),
    },
    deal: {
      add: (input) => dealAdd(db, config, input),
      list: (opts) => dealList(db, config, opts),
      show: (ref) => dealShow(db, ref) as unknown as Promise<DealDetail>,
      edit: (ref, input) => dealEdit(db, config, ref, input),
      move: (ref, input) => dealMove(db, config, ref, input.stage, input.note),
      rm: (ref, opts) => dealRm(db, config, ref, opts?.force),
    },
    pipeline: () => pipelineSummary(db, config),
    log: (input) => logActivity(db, config, input),
    activity: { list: (opts) => activityList(db, config, opts) },
    tag: tagFn,
    untag: (ref, tags) => untagEntity(db, config, ref, tags),
    search: (query, opts) => searchEntities(db, config, query, opts),
    find: (query, opts) => findEntities(db, config, query, opts),
    index: {
      status: () => indexStatus(db),
      rebuild: () => indexRebuild(db),
    },
    dupes: (opts) => findDupes(db, opts),
    report: {
      pipeline: () => pipelineSummary(db, config),
      activity: async (opts) => {
        let activities = await db.select().from(schema.activities)
        if (opts?.period) {
          const cutoff = periodToDate(opts.period)
          if (cutoff) {
            activities = activities.filter((a) => a.created_at >= cutoff)
          }
        }
        const groupBy = opts?.by || 'type'
        const groups: Record<string, number> = {}
        for (const a of activities) {
          if (groupBy === 'contact') {
            const contacts = a.contacts ?? []
            if (contacts.length === 0) {
              groups.none = (groups.none || 0) + 1
            } else {
              for (const cid of contacts) {
                groups[cid] = (groups[cid] || 0) + 1
              }
            }
          } else {
            groups[a.type] = (groups[a.type] || 0) + 1
          }
        }
        if (groupBy === 'contact') {
          return Promise.all(
            Object.entries(groups).map(async ([contact, count]) => {
              if (contact === 'none') {
                return { contact: '(none)', count }
              }
              const results = await db
                .select({ name: schema.contacts.name })
                .from(schema.contacts)
                .where(eq(schema.contacts.id, contact))
              return { contact: results[0]?.name || contact, count }
            }),
          )
        }
        return Object.entries(groups).map(([type, count]) => ({ type, count }))
      },
      stale: async (opts) => {
        let results = await computeStale(db, config, opts?.days ?? 30)
        if (opts?.type) {
          results = results.filter((r) => r.type === opts.type)
        }
        return results
      },
      conversion: (opts) =>
        computeConversion(db, config.pipeline.stages, opts?.since),
      velocity: async (opts) => {
        const wonStage = opts?.wonOnly ? config.pipeline.won_stage : undefined
        return computeVelocity(db, config.pipeline.stages, wonStage)
      },
      forecast: async (opts) => {
        let data = await computeForecast(db, config)
        if (opts?.period) {
          if (opts.period.match(/^\d{4}-\d{2}$/)) {
            data = data.filter((d) => d.expected_close?.startsWith(opts.period!))
          } else {
            const cutoff = periodToDate(opts.period)
            if (cutoff) {
              data = data.filter(
                (d) => d.expected_close && d.expected_close >= cutoff,
              )
            }
          }
        }
        return data
      },
      won: async (opts) => {
        let data = await computeWon(db, config)
        if (opts?.period) {
          const cutoff = periodToDate(opts.period)
          if (cutoff) {
            data = data.filter((d) => (d.updated_at as string) >= cutoff)
          }
        }
        return data
      },
      lost: async (opts) => {
        let data = await computeLost(db, config)
        if (opts?.period) {
          const cutoff = periodToDate(opts.period)
          if (cutoff) {
            data = data.filter((d) => (d.updated_at as string) >= cutoff)
          }
        }
        return data
      },
    },
    import: {
      contacts: (input, opts) => importContacts(db, config, input, opts),
      companies: (input, opts) => importCompanies(db, config, input, opts),
      deals: (input, opts) => importDeals(db, config, input, opts),
    },
    export: {
      contacts: async (format) => {
        const rows = (await db.select().from(schema.contacts)).map(contactToRow)
        if (!format || format === 'json') {
          return rows
        }
        return formatOutput(rows as unknown as Record<string, unknown>[], format, config)
      },
      companies: async (format) => {
        const rows = (await db.select().from(schema.companies)).map(companyToRow)
        if (!format || format === 'json') {
          return rows
        }
        return formatOutput(rows as unknown as Record<string, unknown>[], format, config)
      },
      deals: async (format) => {
        const rows = (await db.select().from(schema.deals)).map(dealToRow)
        if (!format || format === 'json') {
          return rows
        }
        return formatOutput(rows as unknown as Record<string, unknown>[], format, config)
      },
      all: () => exportAll(db),
    },
    close: () => sql.end({ timeout: 5 }),
  }
  return client
}
