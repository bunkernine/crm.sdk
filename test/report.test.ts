import { describe, expect, test } from 'bun:test'

import { createTestContext } from './helpers.ts'

describe('report pipeline', async () => {
  test('shows stage breakdown', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'A',
      '--value',
      '10000',
      '--stage',
      'lead',
    )
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'B',
      '--value',
      '20000',
      '--stage',
      'lead',
    )
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'C',
      '--value',
      '50000',
      '--stage',
      'qualified',
    )

    const out = await ctx.runOK('report', 'pipeline')
    expect(out).toContain('lead')
    expect(out).toContain('qualified')
    expect(out).toContain('Total')
  })

  test('json format has stage/count/value fields', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'A',
      '--value',
      '10000',
      '--stage',
      'lead',
    )

    const report = await ctx.runJSON<
      Array<{ stage: string; count: number; value: number }>
    >('report', 'pipeline', '--format', 'json')
    expect(report.length).toBeGreaterThan(0)
    expect(report[0]).toHaveProperty('stage')
    expect(report[0]).toHaveProperty('count')
    expect(report[0]).toHaveProperty('value')
  })

  test('works with no deals', async () => {
    const ctx = createTestContext()
    const out = await ctx.runOK('report', 'pipeline')
    expect(out).toContain('Total')
  })
})

describe('report activity', async () => {
  test('shows activity summary', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane', '--email', 'jane@acme.com')
    await ctx.runOK('log', 'note', 'Note 1', '--contact', 'jane@acme.com')
    await ctx.runOK('log', 'call', 'Call 1', '--contact', 'jane@acme.com')

    const out = await ctx.runOK('report', 'activity')
    expect(out).toContain('note')
    expect(out).toContain('call')
  })

  test('group by type', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane', '--email', 'jane@acme.com')
    await ctx.runOK('log', 'note', 'N1', '--contact', 'jane@acme.com')
    await ctx.runOK('log', 'note', 'N2', '--contact', 'jane@acme.com')
    await ctx.runOK('log', 'call', 'C1', '--contact', 'jane@acme.com')

    const report = await ctx.runJSON<unknown[]>(
      'report',
      'activity',
      '--by',
      'type',
      '--format',
      'json',
    )
    expect(report.length).toBeGreaterThan(0)
  })

  test('group by contact', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane', '--email', 'jane@acme.com')
    await ctx.runOK('contact', 'add', '--name', 'Bob', '--email', 'bob@acme.com')
    await ctx.runOK('log', 'note', 'N1', '--contact', 'jane@acme.com')
    await ctx.runOK('log', 'note', 'N2', '--contact', 'jane@acme.com')
    await ctx.runOK('log', 'note', 'N3', '--contact', 'bob@acme.com')

    const report = await ctx.runJSON<unknown[]>(
      'report',
      'activity',
      '--by',
      'contact',
      '--format',
      'json',
    )
    expect(report.length).toBeGreaterThanOrEqual(2)
  })

  test('period filter', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane', '--email', 'jane@acme.com')
    await ctx.runOK(
      'log',
      'note',
      'Old',
      '--contact',
      'jane@acme.com',
      '--at',
      '2025-01-01',
    )
    await ctx.runOK('log', 'note', 'Recent', '--contact', 'jane@acme.com')

    const report = await ctx.runJSON<Array<{ count: number }>>(
      'report',
      'activity',
      '--period',
      '7d',
      '--format',
      'json',
    )
    const hasActivity = report.some((r) => r.count > 0)
    expect(hasActivity).toBe(true)
  })
})

describe('report stale', async () => {
  test('flags contacts with no activity', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Active Jane',
      '--email',
      'jane@acme.com',
    )
    await ctx.runOK('log', 'note', 'Just spoke', '--contact', 'jane@acme.com')
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Stale Bob',
      '--email',
      'bob@acme.com',
    )

    const out = await ctx.runOK('report', 'stale', '--days', '1')
    expect(out).toContain('Stale Bob')
    expect(out).not.toContain('Active Jane')
  })

  test('recently created deals are not stale', async () => {
    const ctx = createTestContext()
    await ctx.runOK('deal', 'add', '--title', 'Fresh Deal')

    const out = await ctx.runOK('report', 'stale', '--type', 'deal')
    expect(out).not.toContain('Fresh Deal')
  })
})

describe('report conversion', async () => {
  test('shows stage conversion rates', async () => {
    const ctx = createTestContext()
    for (let i = 0; i < 5; i++) {
      await ctx.runOK('deal', 'add', '--title', `Lead ${i}`, '--stage', 'lead')
    }
    const deals = await ctx.runJSON<Array<{ id: string }>>(
      'deal',
      'list',
      '--stage',
      'lead',
      '--format',
      'json',
    )
    for (let i = 0; i < 3; i++) {
      await ctx.runOK('deal', 'move', deals[i].id, '--stage', 'qualified')
    }

    const out = await ctx.runOK('report', 'conversion')
    expect(out).toContain('lead')
    expect(out).toContain('qualified')
  })

  test('json format', async () => {
    const ctx = createTestContext()
    await ctx.runOK('deal', 'add', '--title', 'Deal A', '--stage', 'lead')

    const report = await ctx.runJSON<unknown[]>(
      'report',
      'conversion',
      '--format',
      'json',
    )
    expect(report.length).toBeGreaterThan(0)
  })

  test('--since filters to recent transitions', async () => {
    const ctx = createTestContext()
    // Create deals and move them
    const d1 = (await ctx.runOK('deal', 'add', '--title', 'Recent', '--stage', 'lead')).trim()
    await ctx.runOK('deal', 'move', d1, '--stage', 'qualified')

    // Use a future date as --since to filter everything out
    const report = await ctx.runJSON<
      Array<{ stage: string; entered: number; advanced: number }>
    >('report', 'conversion', '--since', '2099-01-01', '--format', 'json')
    const lead = report.find((r) => r.stage === 'lead')
    expect(lead!.entered).toBe(0)
    expect(lead!.advanced).toBe(0)

    // Use a past date to include everything
    const reportAll = await ctx.runJSON<
      Array<{ stage: string; entered: number; advanced: number }>
    >('report', 'conversion', '--since', '2020-01-01', '--format', 'json')
    const leadAll = reportAll.find((r) => r.stage === 'lead')
    expect(leadAll!.entered).toBeGreaterThanOrEqual(1)
  })
})

describe('report velocity', async () => {
  test('shows time per stage', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Fast Deal', '--stage', 'lead')).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'qualified')
    await ctx.runOK('deal', 'move', id, '--stage', 'closed-won')

    const out = await ctx.runOK('report', 'velocity')
    expect(out).toContain('lead')
    expect(out).toContain('qualified')
  })

  test('--won-only filters to won deals only', async () => {
    const ctx = createTestContext()
    const won = (await ctx.runOK('deal', 'add', '--title', 'Won Deal', '--stage', 'lead')).trim()
    await ctx.runOK('deal', 'move', won, '--stage', 'qualified')
    await ctx.runOK('deal', 'move', won, '--stage', 'closed-won')

    const lost = (await ctx.runOK('deal', 'add', '--title', 'Lost Deal', '--stage', 'lead')).trim()
    await ctx.runOK('deal', 'move', lost, '--stage', 'qualified')
    await ctx.runOK('deal', 'move', lost, '--stage', 'closed-lost')

    // Without --won-only: both deals counted
    const all = await ctx.runJSON<Array<{ stage: string; deals: number }>>(
      'report',
      'velocity',
      '--format',
      'json',
    )
    const leadAll = all.find((s) => s.stage === 'lead')
    expect(leadAll!.deals).toBe(2)

    // With --won-only: only won deal counted
    const wonOnly = await ctx.runJSON<Array<{ stage: string; deals: number }>>(
      'report',
      'velocity',
      '--won-only',
      '--format',
      'json',
    )
    const leadWon = wonOnly.find((s) => s.stage === 'lead')
    expect(leadWon!.deals).toBe(1)
  })
})

describe('report forecast', async () => {
  test('shows weighted forecast', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'Deal A',
      '--value',
      '50000',
      '--probability',
      '80',
      '--expected-close',
      '2026-06-15',
    )
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'Deal B',
      '--value',
      '30000',
      '--probability',
      '50',
      '--expected-close',
      '2026-06-20',
    )

    const out = await ctx.runOK('report', 'forecast')
    expect(out).toContain('Deal A')
    expect(out).toContain('Deal B')
  })

  test('period filter', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'Q2 Deal',
      '--value',
      '50000',
      '--expected-close',
      '2026-06-15',
    )
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'Q3 Deal',
      '--value',
      '30000',
      '--expected-close',
      '2026-09-15',
    )

    const report = await ctx.runJSON<unknown[]>(
      'report',
      'forecast',
      '--period',
      '2026-06',
      '--format',
      'json',
    )
    expect(report).toHaveLength(1)
  })
})

describe('report won/lost', async () => {
  test('report won shows closed-won deals', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Won Deal',
        '--value',
        '25000',
        '--stage',
        'lead',
      )).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'closed-won')

    const out = await ctx.runOK('report', 'won')
    expect(out).toContain('Won Deal')
    expect(out).toContain('25000')
  })

  test('report lost shows notes', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Lost Deal',
        '--value',
        '15000',
        '--stage',
        'lead',
      )).trim()
    await ctx.runOK(
      'deal',
      'move',
      id,
      '--stage',
      'closed-lost',
      '--note',
      'Too expensive',
    )

    const out = await ctx.runOK('report', 'lost')
    expect(out).toContain('Lost Deal')
    expect(out).toContain('Too expensive')
  })

  test('report won with period', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Won Deal',
        '--value',
        '25000',
        '--stage',
        'lead',
      )).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'closed-won')

    const report = await ctx.runJSON<unknown[]>(
      'report',
      'won',
      '--period',
      '30d',
      '--format',
      'json',
    )
    expect(report).toHaveLength(1)
  })

  test('report lost always includes notes field', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Lost', '--stage', 'lead')).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'closed-lost', '--note', 'Price')

    const report = await ctx.runJSON<Record<string, unknown>[]>(
      'report',
      'lost',
      '--format',
      'json',
    )
    expect(report).toHaveLength(1)
    expect(report[0]).toHaveProperty('notes')
    expect(report[0].notes).toContain('Price')
  })

  test('report lost with --period filters old deals', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Recent Loss', '--stage', 'lead')).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'closed-lost')

    const report = await ctx.runJSON<unknown[]>(
      'report',
      'lost',
      '--period',
      '30d',
      '--format',
      'json',
    )
    expect(report).toHaveLength(1)
  })

  test('report won includes notes', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Won With Note',
        '--value',
        '30000',
        '--stage',
        'lead',
      )).trim()
    await ctx.runOK(
      'deal',
      'move',
      id,
      '--stage',
      'closed-won',
      '--note',
      'Signed annual contract',
    )

    const report = await ctx.runJSON<Array<{ notes: string }>>(
      'report',
      'won',
      '--format',
      'json',
    )
    expect(report).toHaveLength(1)
    expect(report[0].notes).toContain('Signed annual contract')
  })

  test('report won json format includes all deal fields', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Full Won',
        '--value',
        '50000',
        '--stage',
        'lead',
      )).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'closed-won')

    const report = await ctx.runJSON<Record<string, unknown>[]>(
      'report',
      'won',
      '--format',
      'json',
    )
    expect(report[0]).toHaveProperty('id')
    expect(report[0]).toHaveProperty('title')
    expect(report[0]).toHaveProperty('value')
    expect(report[0]).toHaveProperty('stage')
    expect(report[0].stage).toBe('closed-won')
  })
})

describe('report edge cases', async () => {
  test('stale report excludes closed-won deals', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Closed Won', '--stage', 'lead')).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'closed-won')

    const report = await ctx.runJSON<Array<{ title?: string }>>(
      'report',
      'stale',
      '--type',
      'deal',
      '--format',
      'json',
    )
    const titles = report.map((r) => r.title)
    expect(titles).not.toContain('Closed Won')
  })

  test('stale report excludes closed-lost deals', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Closed Lost', '--stage', 'lead')).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'closed-lost')

    const report = await ctx.runJSON<Array<{ title?: string }>>(
      'report',
      'stale',
      '--type',
      'deal',
      '--format',
      'json',
    )
    const titles = report.map((r) => r.title)
    expect(titles).not.toContain('Closed Lost')
  })

  test('stale report with no stale entities shows message', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Active Jane', '--email', 'j@co.com')
    await ctx.runOK('log', 'note', 'Just talked', '--contact', 'j@co.com')

    const out = await ctx.runOK('report', 'stale', '--days', '30')
    expect(out).toContain('No stale entities found')
  })

  test('stale --type contact filters to contacts only', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Stale Jane')
    await ctx.runOK('deal', 'add', '--title', 'Stale Deal')

    const report = await ctx.runJSON<Array<{ type: string }>>(
      'report',
      'stale',
      '--type',
      'contact',
      '--days',
      '0',
      '--format',
      'json',
    )
    for (const r of report) {
      expect(r.type).toBe('contact')
    }
  })

  test('forecast excludes terminal stage deals', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'Open',
      '--value',
      '5000',
      '--stage',
      'lead',
    )
    const id = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Won',
        '--value',
        '3000',
        '--stage',
        'lead',
      )).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'closed-won')

    const report = await ctx.runJSON<Array<{ title: string }>>(
      'report',
      'forecast',
      '--format',
      'json',
    )
    expect(report).toHaveLength(1)
    expect(report[0].title).toBe('Open')
  })

  test('forecast defaults probability to 100 when not set', async () => {
    const ctx = createTestContext()
    await ctx.runOK('deal', 'add', '--title', 'No Prob', '--value', '10000')

    const report = await ctx.runJSON<
      Array<{ probability: number; weighted: number }>
    >('report', 'forecast', '--format', 'json')
    expect(report[0].probability).toBe(100)
    expect(report[0].weighted).toBe(10_000)
  })

  test('forecast with relative period filter (30d)', async () => {
    const ctx = createTestContext()
    const future = new Date(Date.now() + 15 * 86_400_000)
      .toISOString()
      .slice(0, 10)
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'Soon',
      '--value',
      '1000',
      '--expected-close',
      future,
    )

    const report = await ctx.runJSON<unknown[]>(
      'report',
      'forecast',
      '--period',
      '30d',
      '--format',
      'json',
    )
    expect(report).toHaveLength(1)
  })

  test('velocity with empty DB returns stages with 0', async () => {
    const ctx = createTestContext()
    const report = await ctx.runJSON<Array<{ avg_ms: number; deals: number }>>(
      'report',
      'velocity',
      '--format',
      'json',
    )
    expect(report.length).toBeGreaterThan(0)
    for (const s of report) {
      expect(s.avg_ms).toBe(0)
      expect(s.deals).toBe(0)
    }
  })

  test('conversion with empty DB returns 0% rates', async () => {
    const ctx = createTestContext()
    const report = await ctx.runJSON<Array<{ rate: string }>>(
      'report',
      'conversion',
      '--format',
      'json',
    )
    expect(report.length).toBeGreaterThan(0)
    for (const s of report) {
      expect(s.rate).toBe('0%')
    }
  })

  test('conversion tracks entries and exits correctly', async () => {
    const ctx = createTestContext()
    for (let i = 0; i < 4; i++) {
      await ctx.runOK('deal', 'add', '--title', `D${i}`, '--stage', 'lead')
    }
    const deals = await ctx.runJSON<Array<{ id: string }>>(
      'deal',
      'list',
      '--stage',
      'lead',
      '--format',
      'json',
    )
    // Move 2 of 4 to qualified
    await ctx.runOK('deal', 'move', deals[0].id, '--stage', 'qualified')
    await ctx.runOK('deal', 'move', deals[1].id, '--stage', 'qualified')

    const report = await ctx.runJSON<
      Array<{ stage: string; entered: number; advanced: number; rate: string }>
    >('report', 'conversion', '--format', 'json')
    const lead = report.find((r) => r.stage === 'lead')
    expect(lead).toBeDefined()
    expect(lead!.entered).toBe(4)
    expect(lead!.advanced).toBe(2)
    expect(lead!.rate).toBe('50%')
  })

  test('velocity json includes avg_display', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'V', '--stage', 'lead')).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'qualified')

    const report = await ctx.runJSON<Array<{ stage: string; avg_display: string }>>(
      'report',
      'velocity',
      '--format',
      'json',
    )
    const lead = report.find((r) => r.stage === 'lead')
    expect(lead).toBeDefined()
    expect(lead!.avg_display).toBeDefined()
    expect(typeof lead!.avg_display).toBe('string')
  })

  test('lost deal with no note returns empty notes', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'No Reason', '--stage', 'lead')).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'closed-lost')

    const report = await ctx.runJSON<Array<{ notes: string }>>(
      'report',
      'lost',
      '--format',
      'json',
    )
    expect(report).toHaveLength(1)
    expect(report[0].notes).toBe('')
  })
})
