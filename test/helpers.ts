import postgres from 'postgres'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll } from 'bun:test'

import { type CRMConfig } from '../src/config.ts'
import { type CrmClient, createCrm, CrmError } from '../src/index.ts'
import { formatOutput, showEntity } from '../src/format.ts'
import type { CreateCrmOptions, ExportFormat } from '../src/types.ts'

export interface RunResult {
  exitCode: number
  stderr: string
  stdout: string
}

export interface TestContextOpts {
  noConfig?: boolean
  skipTruncate?: boolean
  pipeline?: CreateCrmOptions['pipeline']
  phone?: CreateCrmOptions['phone']
  hooks?: CreateCrmOptions['hooks']
  search_limit?: number
}

function collectFlag(args: string[], name: string): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && args[i + 1]) {
      out.push(args[++i])
    }
  }
  return out
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  if (i >= 0) {
    return args[i + 1]
  }
  return undefined
}

function has(args: string[], name: string): boolean {
  return args.includes(name)
}

function stripGlobals(args: string[]): { argv: string[]; format: ExportFormat } {
  const argv: string[] = []
  let format: ExportFormat = 'table'
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--format' || a === '--config' || a === '--db') {
      if (a === '--format' && args[i + 1]) {
        format = args[i + 1] as ExportFormat
      }
      i++
      continue
    }
    if (a === '--no-color') {
      continue
    }
    argv.push(a)
  }
  return { argv, format }
}

function positionals(args: string[]): string[] {
  const out: string[] = []
  for (const a of args) {
    if (a.startsWith('--')) {
      break
    }
    out.push(a)
  }
  return out
}

function withJsonFormat(args: string[]): string[] {
  if (args.includes('--format')) {
    return args
  }
  return ['--format', 'json', ...args]
}

export function createTestContext(_opts?: TestContextOpts) {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.CRM_DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/postgres'

  const dir = mkdtempSync(join(tmpdir(), 'crm-sdk-'))
  const phone = _opts?.phone
    ? _opts.phone
    : _opts?.noConfig
      ? { display: 'international' as const }
      : { default_country: 'US', display: 'national' as const }
  const pipeline = _opts?.pipeline ?? {
    stages: [
      'lead',
      'qualified',
      'proposal',
      'negotiation',
      'closed-won',
      'closed-lost',
    ],
    won_stage: 'closed-won',
    lost_stage: 'closed-lost',
  }
  const config: CRMConfig = {
    pipeline: {
      stages: pipeline.stages ?? [
        'lead',
        'qualified',
        'proposal',
        'negotiation',
        'closed-won',
        'closed-lost',
      ],
      won_stage: pipeline.won_stage ?? 'closed-won',
      lost_stage: pipeline.lost_stage ?? 'closed-lost',
    },
    phone: {
      default_country: phone.default_country,
      display: phone.display ?? 'international',
    },
    hooks: _opts?.hooks ?? {},
    search_limit: _opts?.search_limit ?? 20,
  }

  let crm: CrmClient | null = null
  const ready = (async () => {
    crm = await createCrm({
      connectionString,
      phone,
      pipeline,
      hooks: _opts?.hooks,
      search_limit: _opts?.search_limit,
    })
    if (!_opts?.skipTruncate) {
      const admin = postgres(connectionString, { max: 1 })
      await admin.unsafe(`
      TRUNCATE crm.activities, crm.deals, crm.contacts, crm.companies, crm.search_index CASCADE
    `)
      await admin.end({ timeout: 5 })
    }
  })()

  async function dispatch(args: string[]): Promise<RunResult> {
    await ready
    if (!crm) {
      throw new Error('crm not ready')
    }
    const { argv, format } = stripGlobals(args)
    try {
      const stdout = await runCommand(crm, argv, format, config)
      return {
        exitCode: 0,
        stdout: stdout.endsWith('\n') ? stdout : `${stdout}\n`,
        stderr: '',
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { exitCode: 1, stdout: '', stderr: `${msg}\n` }
    }
  }

  async function runAsync(...args: string[]): Promise<RunResult> {
    return dispatch(args)
  }

  async function runOK(...args: string[]): Promise<string> {
    const result = await dispatch(args)
    if (result.exitCode !== 0) {
      throw new Error(
        `crm ${args.join(' ')} failed (exit ${result.exitCode}):\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
      )
    }
    return result.stdout
  }

  async function runFail(...args: string[]): Promise<RunResult> {
    const result = await dispatch(args)
    if (result.exitCode === 0) {
      throw new Error(`expected failure: crm ${args.join(' ')}`)
    }
    return result
  }

  async function runJSON<T>(...args: string[]): Promise<T> {
    const out = await runOK(...withJsonFormat(args))
    return JSON.parse(out) as T
  }

  async function runWithEnv(
    _env: Record<string, string>,
    ...args: string[]
  ): Promise<RunResult> {
    return dispatch(args)
  }

  afterAll(async () => {
    await crm?.close()
  })

  return {
    dir,
    dbPath: join(dir, 'crm.db'),
    run: runAsync,
    runAsync,
    runOK,
    runFail,
    runJSON,
    runWithEnv,
    getCrm: () => crm!,
  }
}

async function runCommand(
  crm: CrmClient,
  args: string[],
  fmt: string,
  config: CRMConfig,
): Promise<string> {
  const [cmd, sub, ...rest] = args
  if (cmd === 'contact' && sub === 'add') {
    const id = await crm.contact.add({
      name: flag(rest, '--name') || '',
      email: collectFlag(rest, '--email'),
      phone: collectFlag(rest, '--phone'),
      company: collectFlag(rest, '--company'),
      tag: collectFlag(rest, '--tag'),
      linkedin: flag(rest, '--linkedin'),
      x: flag(rest, '--x'),
      bluesky: flag(rest, '--bluesky'),
      telegram: flag(rest, '--telegram'),
      set: collectFlag(rest, '--set'),
    })
    return id
  }
  if (cmd === 'contact' && sub === 'list') {
    const rows = await crm.contact.list({
      tag: flag(rest, '--tag'),
      company: flag(rest, '--company'),
      sort: flag(rest, '--sort'),
      reverse: has(rest, '--reverse'),
      limit: flag(rest, '--limit') ? Number(flag(rest, '--limit')) : undefined,
      offset: flag(rest, '--offset') ? Number(flag(rest, '--offset')) : undefined,
      filter: flag(rest, '--filter'),
    })
    return formatOutput(rows as unknown as Record<string, unknown>[], fmt, config)
  }
  if (cmd === 'contact' && sub === 'show') {
    const detail = await crm.contact.show(rest[0])
    return showEntity(detail as unknown as Record<string, unknown>, fmt)
  }
  if (cmd === 'contact' && sub === 'edit') {
    const ref = rest[0]
    const id = await crm.contact.edit(ref, {
      name: flag(rest, '--name'),
      addEmail: collectFlag(rest, '--add-email'),
      rmEmail: collectFlag(rest, '--rm-email'),
      addPhone: collectFlag(rest, '--add-phone'),
      rmPhone: collectFlag(rest, '--rm-phone'),
      addCompany: collectFlag(rest, '--add-company'),
      rmCompany: collectFlag(rest, '--rm-company'),
      addTag: collectFlag(rest, '--add-tag'),
      rmTag: collectFlag(rest, '--rm-tag'),
      linkedin: flag(rest, '--linkedin'),
      x: flag(rest, '--x'),
      bluesky: flag(rest, '--bluesky'),
      telegram: flag(rest, '--telegram'),
      set: collectFlag(rest, '--set'),
      unset: collectFlag(rest, '--unset'),
    })
    return id
  }
  if (cmd === 'contact' && sub === 'rm') {
    await crm.contact.rm(rest[0], { force: has(rest, '--force') })
    return ''
  }
  if (cmd === 'contact' && sub === 'merge') {
    return crm.contact.merge(rest[0], rest[1])
  }
  if (cmd === 'company' && sub === 'add') {
    return crm.company.add({
      name: flag(rest, '--name') || '',
      website: collectFlag(rest, '--website'),
      phone: collectFlag(rest, '--phone'),
      tag: collectFlag(rest, '--tag'),
      set: collectFlag(rest, '--set'),
    })
  }
  if (cmd === 'company' && sub === 'list') {
    const rows = await crm.company.list({
      tag: flag(rest, '--tag'),
      sort: flag(rest, '--sort'),
      reverse: has(rest, '--reverse'),
      limit: flag(rest, '--limit') ? Number(flag(rest, '--limit')) : undefined,
      offset: flag(rest, '--offset') ? Number(flag(rest, '--offset')) : undefined,
      filter: flag(rest, '--filter'),
    })
    return formatOutput(rows as unknown as Record<string, unknown>[], fmt, config)
  }
  if (cmd === 'company' && sub === 'show') {
    return showEntity(
      (await crm.company.show(rest[0])) as unknown as Record<string, unknown>,
      fmt,
    )
  }
  if (cmd === 'company' && sub === 'edit') {
    return crm.company.edit(rest[0], {
      name: flag(rest, '--name'),
      addWebsite: collectFlag(rest, '--add-website'),
      rmWebsite: collectFlag(rest, '--rm-website'),
      addPhone: collectFlag(rest, '--add-phone'),
      rmPhone: collectFlag(rest, '--rm-phone'),
      addTag: collectFlag(rest, '--add-tag'),
      rmTag: collectFlag(rest, '--rm-tag'),
      set: collectFlag(rest, '--set'),
      unset: collectFlag(rest, '--unset'),
    })
  }
  if (cmd === 'company' && sub === 'rm') {
    await crm.company.rm(rest[0], { force: has(rest, '--force') })
    return ''
  }
  if (cmd === 'company' && sub === 'merge') {
    return crm.company.merge(rest[0], rest[1])
  }
  if (cmd === 'deal' && sub === 'add') {
    const value = flag(rest, '--value')
    const probability = flag(rest, '--probability')
    return crm.deal.add({
      title: flag(rest, '--title') || '',
      value: value !== undefined ? Number(value) : undefined,
      stage: flag(rest, '--stage'),
      contact: collectFlag(rest, '--contact'),
      company: flag(rest, '--company'),
      expectedClose: flag(rest, '--expected-close'),
      probability: probability !== undefined ? Number(probability) : undefined,
      tag: collectFlag(rest, '--tag'),
      set: collectFlag(rest, '--set'),
    })
  }
  if (cmd === 'deal' && sub === 'list') {
    const rows = await crm.deal.list({
      stage: flag(rest, '--stage'),
      minValue: flag(rest, '--min-value')
        ? Number(flag(rest, '--min-value'))
        : undefined,
      maxValue: flag(rest, '--max-value')
        ? Number(flag(rest, '--max-value'))
        : undefined,
      contact: flag(rest, '--contact'),
      company: flag(rest, '--company'),
      tag: flag(rest, '--tag'),
      filter: flag(rest, '--filter'),
      sort: flag(rest, '--sort'),
      reverse: has(rest, '--reverse'),
      limit: flag(rest, '--limit') ? Number(flag(rest, '--limit')) : undefined,
      offset: flag(rest, '--offset') ? Number(flag(rest, '--offset')) : undefined,
    })
    return formatOutput(rows as unknown as Record<string, unknown>[], fmt, config)
  }
  if (cmd === 'deal' && sub === 'show') {
    return showEntity(
      (await crm.deal.show(rest[0])) as unknown as Record<string, unknown>,
      fmt,
    )
  }
  if (cmd === 'deal' && sub === 'edit') {
    const value = flag(rest, '--value')
    const probability = flag(rest, '--probability')
    return crm.deal.edit(rest[0], {
      title: flag(rest, '--title'),
      value: value !== undefined ? Number(value) : undefined,
      company: flag(rest, '--company'),
      expectedClose: flag(rest, '--expected-close'),
      probability: probability !== undefined ? Number(probability) : undefined,
      addContact: collectFlag(rest, '--add-contact'),
      rmContact: collectFlag(rest, '--rm-contact'),
      addTag: collectFlag(rest, '--add-tag'),
      rmTag: collectFlag(rest, '--rm-tag'),
      set: collectFlag(rest, '--set'),
      unset: collectFlag(rest, '--unset'),
    })
  }
  if (cmd === 'deal' && sub === 'move') {
    return crm.deal.move(rest[0], {
      stage: flag(rest, '--stage') || '',
      note: flag(rest, '--note'),
    })
  }
  if (cmd === 'deal' && sub === 'rm') {
    await crm.deal.rm(rest[0], { force: has(rest, '--force') })
    return ''
  }
  if (cmd === 'pipeline') {
    const data = await crm.pipeline()
    return formatOutput(data as unknown as Record<string, unknown>[], fmt, config)
  }
  if (cmd === 'log') {
    await crm.log({
      type: sub as 'note' | 'call' | 'meeting' | 'email',
      body: positionals(rest).join(' ') || '',
      contact: collectFlag(rest, '--contact'),
      company: flag(rest, '--company'),
      deal: flag(rest, '--deal'),
      at: flag(rest, '--at'),
      set: collectFlag(rest, '--set'),
    })
    return ''
  }
  if (cmd === 'activity' && sub === 'list') {
    const rows = await crm.activity.list({
      contact: flag(rest, '--contact'),
      company: flag(rest, '--company'),
      deal: flag(rest, '--deal'),
      type: flag(rest, '--type'),
      since: flag(rest, '--since'),
      sort: flag(rest, '--sort'),
      reverse: has(rest, '--reverse'),
      limit: flag(rest, '--limit') ? Number(flag(rest, '--limit')) : undefined,
      offset: flag(rest, '--offset') ? Number(flag(rest, '--offset')) : undefined,
    })
    return formatOutput(rows as unknown as Record<string, unknown>[], fmt, config)
  }
  if (cmd === 'tag' && sub === 'list') {
    const data = await crm.tag.list({ type: flag(rest, '--type') })
    return JSON.stringify(data, null, 2)
  }
  if (cmd === 'tag') {
    const ref = sub
    const tags = rest.filter((a) => !a.startsWith('--'))
    await crm.tag(ref, tags)
    return ''
  }
  if (cmd === 'untag') {
    await crm.untag(sub, rest.filter((a) => !a.startsWith('--')))
    return ''
  }
  if (cmd === 'search') {
    const results = await crm.search(sub, {
      type: flag(rest, '--type') as never,
    })
    if (fmt === 'json') {
      return JSON.stringify(results, null, 2)
    }
    if (results.length === 0) {
      return ''
    }
    return results
      .map((r) => {
        if (r.type === 'contact') {
          return `[contact] ${r.name} (${r.id})`
        }
        if (r.type === 'company') {
          return `[company] ${r.name} (${r.id})`
        }
        if (r.type === 'deal') {
          return `[deal] ${r.title} (${r.id})`
        }
        if (r.entity_type === 'activity') {
          return `[activity] ${r.body} (${r.id})`
        }
        return `[${r.type}] ${r.id}`
      })
      .join('\n')
  }
  if (cmd === 'find') {
    const results = await crm.find(sub, {
      type: flag(rest, '--type') as never,
      limit: flag(rest, '--limit') ? Number(flag(rest, '--limit')) : undefined,
      threshold: flag(rest, '--threshold')
        ? Number(flag(rest, '--threshold'))
        : undefined,
    })
    if (fmt === 'json') {
      return JSON.stringify(results, null, 2)
    }
    if (results.length === 0) {
      return ''
    }
    return results
      .map((r) => `[${r.type}] ${r.name || r.title} (${r.id})`)
      .join('\n')
  }
  if (cmd === 'index' && sub === 'status') {
    const s = await crm.index.status()
    return `contacts: ${s.contacts} (indexed: ${s.indexed.contact})\ncompanies: ${s.companies} (indexed: ${s.indexed.company})\ndeals: ${s.deals} (indexed: ${s.indexed.deal})`
  }
  if (cmd === 'index' && sub === 'rebuild') {
    await crm.index.rebuild()
    return 'Index rebuilt'
  }
  if (cmd === 'dupes') {
    const results = await crm.dupes({
      type: flag(rest, '--type') as never,
      threshold: flag(rest, '--threshold')
        ? Number(flag(rest, '--threshold'))
        : undefined,
      limit: flag(rest, '--limit') ? Number(flag(rest, '--limit')) : undefined,
    })
    if (fmt === 'json') {
      return JSON.stringify(results, null, 2)
    }
    if (results.length === 0) {
      return ''
    }
    return results
      .map((r) => {
        const left = r.left as { name?: string; id: string }
        const right = r.right as { name?: string; id: string }
        return `${left.name} <-> ${right.name}: ${r.reasons.join(', ')}`
      })
      .join('\n')
  }
  if (cmd === 'report') {
    return runReport(crm, sub, rest, fmt, config)
  }
  if (cmd === 'import') {
    const file = rest[0] || ''
    const { existsSync, readFileSync } = await import('node:fs')
    const raw =
      file === '-'
        ? ''
        : existsSync(file)
          ? readFileSync(file, 'utf-8')
          : file
    const opts = {
      dryRun: has(rest, '--dry-run'),
      skipErrors: has(rest, '--skip-errors'),
      update: has(rest, '--update'),
    }
    if (sub === 'contacts') {
      const r = await crm.import.contacts(raw, opts)
      if (r.dryRunLines.length) {
        return `${r.dryRunLines.join('\n')}\nImported: ${r.imported}, skipped: ${r.skipped}, errors: ${r.errors}`
      }
      return `Imported: ${r.imported}, skipped: ${r.skipped}, errors: ${r.errors}`
    }
    if (sub === 'companies') {
      const r = await crm.import.companies(raw, opts)
      return r.dryRunLines.length
        ? `${r.dryRunLines.join('\n')}\nImported: ${r.imported}`
        : `Imported: ${r.imported}`
    }
    if (sub === 'deals') {
      const r = await crm.import.deals(raw, opts)
      return r.dryRunLines.length
        ? `${r.dryRunLines.join('\n')}\nImported: ${r.imported}`
        : `Imported: ${r.imported}`
    }
  }
  if (cmd === 'export') {
    if (sub === 'all') {
      return JSON.stringify(await crm.export.all(), null, 2)
    }
    const expFmt = fmt === 'table' ? 'json' : (fmt as ExportFormat)
    if (sub === 'contacts') {
      const data = await crm.export.contacts(expFmt)
      return typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    }
    if (sub === 'companies') {
      const data = await crm.export.companies(expFmt)
      return typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    }
    if (sub === 'deals') {
      const data = await crm.export.deals(expFmt)
      return typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    }
  }
  throw new Error(`unknown command: ${args.join(' ')}`)
}

async function runReport(
  crm: CrmClient,
  sub: string,
  rest: string[],
  fmt: string,
  config: CRMConfig,
): Promise<string> {
  if (sub === 'pipeline') {
    const data = await crm.report.pipeline()
    return formatOutput(data as unknown as Record<string, unknown>[], fmt, config)
  }
  if (sub === 'activity') {
    const data = await crm.report.activity({
      by: flag(rest, '--by'),
      period: flag(rest, '--period'),
    })
    return JSON.stringify(data, null, 2)
  }
  if (sub === 'stale') {
    const results = await crm.report.stale({
      days: flag(rest, '--days') ? Number(flag(rest, '--days')) : undefined,
      type: flag(rest, '--type'),
    })
    if (fmt === 'json') {
      return JSON.stringify(results, null, 2)
    }
    if (results.length === 0) {
      return 'No stale entities found.'
    }
    return results
      .map(
        (r) =>
          `[${r.type}] ${r.name || r.title} (${r.id}) — last: ${r.last_activity || 'never'}`,
      )
      .join('\n')
  }
  if (sub === 'conversion') {
    const data = await crm.report.conversion({ since: flag(rest, '--since') })
    return formatOutput(data as unknown as Record<string, unknown>[], fmt, config)
  }
  if (sub === 'velocity') {
    const data = await crm.report.velocity({ wonOnly: has(rest, '--won-only') })
    return formatOutput(
      data.map((d) => ({
        stage: (d as { stage: string }).stage,
        avg_time: (d as { avg_display: string }).avg_display,
        deals: (d as { deals: number }).deals,
      })),
      fmt,
      config,
    )
  }
  if (sub === 'forecast') {
    const data = await crm.report.forecast({ period: flag(rest, '--period') })
    return formatOutput(data as unknown as Record<string, unknown>[], fmt, config)
  }
  if (sub === 'won') {
    const data = await crm.report.won({ period: flag(rest, '--period') })
    return formatOutput(data as unknown as Record<string, unknown>[], fmt, config)
  }
  if (sub === 'lost') {
    const data = await crm.report.lost({ period: flag(rest, '--period') })
    return formatOutput(data as unknown as Record<string, unknown>[], fmt, config)
  }
  throw new Error(`unknown report ${sub}`)
}

export { CrmError }
