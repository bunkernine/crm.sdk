import type { CRMConfig } from './config'
import type { ActivityRow, CompanyRow, ContactRow, DealRow } from './drizzle-schema'
import {
  activityFromRow,
  companyFromRow,
  contactFromRow,
  dealFromRow,
} from './lib/helpers'
import { formatPhone } from './normalize'
import type { Activity, Company, Contact, Deal, ExportFormat } from './types'

export function contactToRow(c: ContactRow): Contact {
  return contactFromRow(c)
}

export function companyToRow(c: CompanyRow): Company {
  return companyFromRow(c)
}

export function dealToRow(d: DealRow): Deal {
  return dealFromRow(d)
}

export function activityToRow(a: ActivityRow): Activity {
  return activityFromRow(a)
}

export function asRecord(
  obj: Contact | Company | Deal | Activity | Record<string, unknown>,
): Record<string, unknown> {
  return obj as unknown as Record<string, unknown>
}

export function formatOutput(
  data: Record<string, unknown> | Record<string, unknown>[],
  format: ExportFormat | string,
  config?: CRMConfig,
): string {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2)
    case 'csv':
      return formatCSV(Array.isArray(data) ? data : [data])
    case 'tsv':
      return formatTSV(Array.isArray(data) ? data : [data])
    case 'ids':
      return formatIDs(Array.isArray(data) ? data : [data])
    default:
      return formatTable(data, config)
  }
}

function formatIDs(data: Record<string, unknown>[]): string {
  return data.map((r) => r.id).join('\n')
}

function formatCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) {
    return ''
  }
  const keys = Object.keys(data[0])
  const header = keys.map(csvEscape).join(',')
  const rows = data.map((row) =>
    keys
      .map((k) => {
        const v = row[k]
        if (Array.isArray(v)) {
          return csvEscape(v.join(', '))
        }
        if (v && typeof v === 'object') {
          return csvEscape(JSON.stringify(v))
        }
        return csvEscape(String(v ?? ''))
      })
      .join(','),
  )
  return [header, ...rows].join('\n')
}

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function formatTSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) {
    return ''
  }
  const keys = Object.keys(data[0])
  const header = keys.join('\t')
  const rows = data.map((row) =>
    keys
      .map((k) => {
        const v = row[k]
        if (Array.isArray(v)) {
          return v.join(', ')
        }
        if (v && typeof v === 'object') {
          return JSON.stringify(v)
        }
        return String(v ?? '')
      })
      .join('\t'),
  )
  return [header, ...rows].join('\n')
}

function formatTable(
  data: Record<string, unknown> | Record<string, unknown>[],
  config?: CRMConfig,
): string {
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return ''
  }
  if (!Array.isArray(data)) {
    return formatEntityDetail(data)
  }
  const keys = Object.keys(data[0]).filter((k) =>
    data.some((row) => {
      const v = row[k]
      if (v === null || v === undefined || v === '') {
        return false
      }
      if (Array.isArray(v) && v.length === 0) {
        return false
      }
      if (
        typeof v === 'object' &&
        !Array.isArray(v) &&
        Object.keys(v as object).length === 0
      ) {
        return false
      }
      return true
    }),
  )
  if (keys.length === 0) {
    return ''
  }

  const widths: Record<string, number> = {}
  for (const k of keys) {
    widths[k] = k.length
  }
  for (const row of data) {
    for (const k of keys) {
      const v = displayValue(row[k], config)
      widths[k] = Math.max(widths[k], v.length)
    }
  }
  const header = keys.map((k) => k.padEnd(widths[k])).join('  ')
  const separator = keys.map((k) => '─'.repeat(widths[k])).join('──')
  const rows = data.map((row) =>
    keys.map((k) => displayValue(row[k], config).padEnd(widths[k])).join('  '),
  )
  return [header, separator, ...rows].join('\n')
}

function displayValue(v: unknown, config?: CRMConfig): string {
  if (v === null || v === undefined) {
    return ''
  }
  if (Array.isArray(v)) {
    return v.map((item) => displayValue(item, config)).join(', ')
  }
  if (typeof v === 'object') {
    return JSON.stringify(v)
  }
  const s = String(v)
  if (/^\+\d{7,15}$/.test(s)) {
    return formatPhone(
      s,
      config?.phone?.display || 'international',
      config?.phone?.default_country,
    )
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    }
  }
  return s
}

export function formatEntityDetail(entity: Record<string, unknown>): string {
  const lines: string[] = []
  for (const [key, value] of Object.entries(entity)) {
    if (key === '_display_phones') {
      continue
    }
    if (value === null || value === undefined) {
      continue
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        continue
      }
      if (typeof value[0] === 'object') {
        lines.push(`${key}:`)
        for (const item of value) {
          lines.push(
            `  ${typeof item === 'object' ? JSON.stringify(item) : item}`,
          )
        }
      } else {
        lines.push(`${key}: ${value.join(', ')}`)
      }
    } else if (typeof value === 'object') {
      lines.push(`${key}:`)
      for (const [sk, sv] of Object.entries(value as Record<string, unknown>)) {
        lines.push(`  ${sk}: ${sv}`)
      }
    } else {
      lines.push(`${key}: ${value}`)
    }
  }
  const displayPhones = entity._display_phones as string[] | undefined
  if (displayPhones?.length) {
    const idx = lines.findIndex((l) => l.startsWith('phones:'))
    if (idx >= 0) {
      lines[idx] = `phones: ${displayPhones.join(', ')}`
    }
  }
  return lines.join('\n')
}

export function showEntity(detail: Record<string, unknown>, fmt: string) {
  if (fmt === 'json') {
    return JSON.stringify(detail, null, 2)
  }
  return formatEntityDetail(detail)
}

export function asArray<T>(v: T[] | null | undefined): T[] {
  return v ?? []
}
