import { eq } from 'drizzle-orm'

import type { CRMConfig } from './config'
import type { DB } from './db'
import * as schema from './drizzle-schema'
import { dealToRow } from './format'
import { asArray } from './lib/helpers'

export function computePipeline(
  deals: { stage: string; value: number | null }[],
  stages: string[],
) {
  return stages.map((stage) => ({
    stage,
    count: deals.filter((d) => d.stage === stage).length,
    value: deals
      .filter((d) => d.stage === stage)
      .reduce((s, d) => s + (d.value || 0), 0),
  }))
}

export async function computeStale(
  db: DB,
  config: CRMConfig,
  days = 30,
): Promise<Record<string, unknown>[]> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
  const terminal = new Set([
    config.pipeline.won_stage,
    config.pipeline.lost_stage,
  ])
  const results: Record<string, unknown>[] = []

  const contacts = await db.select().from(schema.contacts)
  const allActivities = await db.select().from(schema.activities)
  for (const c of contacts) {
    const contactActivities = allActivities.filter((a) => {
      return asArray(a.contacts).includes(c.id)
    })
    const last = contactActivities.reduce<string | null>(
      (max, a) => (max && max > a.created_at ? max : a.created_at),
      null,
    )
    if (!last || last < cutoff) {
      results.push({
        type: 'contact',
        id: c.id,
        name: c.name,
        last_activity: last,
      })
    }
  }

  const deals = await db.select().from(schema.deals)
  for (const d of deals) {
    if (terminal.has(d.stage)) {
      continue
    }
    const dealActivities = allActivities.filter((a) => a.deal === d.id)
    const last = dealActivities.reduce<string | null>(
      (max, a) => (max && max > a.created_at ? max : a.created_at),
      null,
    )
    const lastTouch = last || d.created_at
    if (lastTouch < cutoff) {
      results.push({
        type: 'deal',
        id: d.id,
        title: d.title,
        last_activity: last,
      })
    }
  }

  return results
}

export async function computeConversion(
  db: DB,
  stages: string[],
  since?: string,
) {
  let activities = await db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.type, 'stage-change'))
  if (since) {
    activities = activities.filter((a) => a.created_at >= since)
  }
  const stageEntries: Record<string, Set<string>> = {}
  const stageExits: Record<string, Set<string>> = {}
  for (const s of stages) {
    stageEntries[s] = new Set()
    stageExits[s] = new Set()
  }
  const deals = await db.select().from(schema.deals)
  for (const d of deals) {
    const dealActivities = activities.filter((a) => a.deal === d.id)
    if (dealActivities.length === 0) {
      stageEntries[d.stage]?.add(d.id)
    } else {
      const first = dealActivities[0]
      const m = first.body.match(/from (\S+) to/)
      const initialStage = m ? m[1] : d.stage
      if (stageEntries[initialStage]) {
        stageEntries[initialStage].add(d.id)
      }
      for (const a of dealActivities) {
        const from = a.body.match(/from (\S+) to/)?.[1]
        const to = a.body.match(/to (\S+)/)?.[1]
        if (from && stageExits[from]) {
          stageExits[from].add(d.id)
        }
        if (to && stageEntries[to]) {
          stageEntries[to].add(d.id)
        }
      }
    }
  }
  return stages.map((stage) => ({
    stage,
    entered: stageEntries[stage].size,
    advanced: stageExits[stage].size,
    rate:
      stageEntries[stage].size > 0
        ? `${Math.round(
            (stageExits[stage].size / stageEntries[stage].size) * 100,
          )}%`
        : '0%',
  }))
}

export function formatDuration(ms: number): string {
  if (ms === 0) {
    return '0s'
  }
  const secs = Math.floor(ms / 1000)
  const mins = Math.floor(secs / 60)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) {
    return `${days}d ${hours % 24}h`
  }
  if (hours > 0) {
    return `${hours}h ${mins % 60}m`
  }
  if (mins > 0) {
    return `${mins}m ${secs % 60}s`
  }
  return `${secs}s`
}

export async function computeVelocity(
  db: DB,
  stages: string[],
  wonStage?: string,
) {
  const activities = await db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.type, 'stage-change'))
    .orderBy(schema.activities.created_at)
  const stageTimes: Record<string, number[]> = {}
  for (const s of stages) {
    stageTimes[s] = []
  }
  const dealIds = [...new Set(activities.map((a) => a.deal).filter(Boolean))]
  for (const did of dealIds) {
    if (!did) {
      continue
    }
    const dealActs = activities.filter((a) => a.deal === did)
    const dealResults = await db
      .select()
      .from(schema.deals)
      .where(eq(schema.deals.id, did))
    const deal = dealResults[0]
    if (!deal) {
      continue
    }
    if (wonStage && deal.stage !== wonStage) {
      continue
    }
    let prevTime = new Date(deal.created_at).getTime()
    const first = dealActs[0]
    const initialStage = first.body.match(/from (\S+) to/)?.[1]
    if (initialStage && stageTimes[initialStage]) {
      const duration = new Date(first.created_at).getTime() - prevTime
      stageTimes[initialStage].push(duration)
      prevTime = new Date(first.created_at).getTime()
    }
    for (let i = 1; i < dealActs.length; i++) {
      const from = dealActs[i].body.match(/from (\S+) to/)?.[1]
      if (from && stageTimes[from]) {
        const duration =
          new Date(dealActs[i].created_at).getTime() -
          new Date(dealActs[i - 1].created_at).getTime()
        stageTimes[from].push(duration)
      }
    }
  }
  return stages.map((stage) => {
    const times = stageTimes[stage]
    const avg =
      times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0
    return {
      stage,
      avg_ms: Math.round(avg),
      deals: times.length,
      avg_display: formatDuration(avg),
    }
  })
}

export async function computeForecast(db: DB, config: CRMConfig) {
  const terminal = new Set([
    config.pipeline.won_stage,
    config.pipeline.lost_stage,
  ])
  const deals = await db.select().from(schema.deals)
  const open = deals.filter((d) => !terminal.has(d.stage))
  return open.map((d) => ({
    id: d.id,
    title: d.title,
    value: d.value || 0,
    probability: d.probability ?? 100,
    weighted: Math.round(((d.value || 0) * (d.probability ?? 100)) / 100),
    expected_close: d.expected_close,
    stage: d.stage,
  }))
}

export async function computeWon(db: DB, config: CRMConfig) {
  const wonStage = config.pipeline.won_stage
  const deals = await db
    .select()
    .from(schema.deals)
    .where(eq(schema.deals.stage, wonStage))
  return Promise.all(
    deals.map(async (d) => {
      const row: Record<string, unknown> = { ...dealToRow(d) }
      row.notes = await extractStageNotes(db, d.id, wonStage)
      return row
    }),
  )
}

export async function computeLost(db: DB, config: CRMConfig) {
  const lostStage = config.pipeline.lost_stage
  const deals = await db
    .select()
    .from(schema.deals)
    .where(eq(schema.deals.stage, lostStage))
  return Promise.all(
    deals.map(async (d) => {
      const row: Record<string, unknown> = { ...dealToRow(d) }
      row.notes = await extractStageNotes(db, d.id, lostStage)
      return row
    }),
  )
}

async function extractStageNotes(
  db: DB,
  dealId: string,
  stage: string,
): Promise<string> {
  const actResults = await db
    .select({ body: schema.activities.body })
    .from(schema.activities)
    .where(eq(schema.activities.deal, dealId))
  const match = actResults.find((a) => a.body.includes(stage))
  const body = match?.body
  return (
    body
      ?.split('|')
      .slice(1)
      .map((s: string) => s.trim())
      .join(', ') || ''
  )
}
