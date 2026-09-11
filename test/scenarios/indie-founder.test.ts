/*
 * ============================================================================
 * PERSONA: Alex Chen — Indie SaaS Founder
 * ============================================================================
 *
 * Alex is a solo technical founder building a B2B SaaS tool. They do their
 * own sales — cold outreach, demos, and closing. They have no sales team
 * and no budget for Salesforce or HubSpot. They need a CRM that fits into
 * their terminal-centric workflow alongside git, ssh, and their editor.
 *
 * Why this scenario matters:
 * - Tests the core "single-person sales pipeline" use case end-to-end
 * - Validates that one person can manage 10-20 active deals without friction
 * - Covers the full lifecycle: lead → qualified → proposal → won/lost
 * - Tests tagging for prioritization and custom fields for deal context
 * - Exercises reports that a solo founder would actually use daily
 *
 * Typical day: Alex checks stale deals, logs calls, moves deals through
 * stages, and reviews pipeline health — all from the terminal between
 * coding sessions.
 * ============================================================================
 */

import { describe, expect, test } from 'bun:test'

import { createTestContext } from '../helpers'

describe('scenario: indie founder pipeline management', async () => {
  test('full sales cycle from cold outreach to closed-won', async () => {
    const ctx = createTestContext()

    // ── Bootstrap: Add companies and contacts from a conference ──
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Streamline Inc',
      '--website',
      'streamline.io',
      '--tag',
      'saas',
      '--set',
      'industry=Logistics',
    )
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'DataPulse',
      '--website',
      'datapulse.com',
      '--tag',
      'saas',
      '--set',
      'industry=Analytics',
    )
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'GreenOps',
      '--website',
      'greenops.co',
      '--tag',
      'climate-tech',
    )

    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Sarah Kim',
      '--email',
      'sarah@streamline.io',
      '--company',
      'Streamline Inc',
      '--tag',
      'decision-maker',
      '--set',
      'title=CTO',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Marcus Lee',
      '--email',
      'marcus@datapulse.com',
      '--company',
      'DataPulse',
      '--tag',
      'decision-maker',
      '--set',
      'title=VP Engineering',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Priya Patel',
      '--email',
      'priya@greenops.co',
      '--company',
      'GreenOps',
      '--tag',
      'champion',
      '--set',
      'title=Head of Product',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Tom Rivera',
      '--email',
      'tom@greenops.co',
      '--company',
      'GreenOps',
      '--set',
      'title=CEO',
    )

    // ── Create deals ──
    const deal1 = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Streamline Annual',
        '--value',
        '24000',
        '--contact',
        'sarah@streamline.io',
        '--company',
        'streamline.io',
        '--probability',
        '30',
        '--expected-close',
        '2026-06-15',
        '--tag',
        'annual',
      )).trim()
    const deal2 = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'DataPulse POC',
        '--value',
        '5000',
        '--contact',
        'marcus@datapulse.com',
        '--company',
        'datapulse.com',
        '--probability',
        '20',
        '--expected-close',
        '2026-05-01',
        '--tag',
        'poc',
      )).trim()
    const deal3 = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'GreenOps Enterprise',
        '--value',
        '60000',
        '--contact',
        'priya@greenops.co',
        '--company',
        'greenops.co',
        '--probability',
        '10',
        '--expected-close',
        '2026-09-01',
        '--tag',
        'enterprise',
      )).trim()

    // ── Log initial outreach activities ──
    await ctx.runOK(
      'log',
      'email',
      'Sent intro email after meeting at SaaStr',
      '--contact',
      'sarah@streamline.io',
      '--deal',
      deal1,
    )
    await ctx.runOK(
      'log',
      'email',
      'Cold email — found via LinkedIn',
      '--contact',
      'marcus@datapulse.com',
      '--deal',
      deal2,
    )
    await ctx.runOK(
      'log',
      'meeting',
      'Met at Climate Tech Summit booth',
      '--contact',
      'priya@greenops.co',
      '--deal',
      deal3,
    )

    // ── Move deals through pipeline ──
    await ctx.runOK(
      'deal',
      'move',
      deal1,
      '--stage',
      'qualified',
      '--note',
      'Sarah confirmed budget exists',
    )
    await ctx.runOK(
      'deal',
      'move',
      deal2,
      '--stage',
      'qualified',
      '--note',
      'Marcus wants a POC next week',
    )

    // Log follow-up activities
    await ctx.runOK(
      'log',
      'call',
      '30-min demo with Sarah, went well',
      '--contact',
      'sarah@streamline.io',
      '--deal',
      deal1,
      '--set',
      'duration=30m',
    )
    await ctx.runOK(
      'deal',
      'move',
      deal1,
      '--stage',
      'proposal',
      '--note',
      'Sent pricing proposal',
    )
    await ctx.runOK('deal', 'edit', deal1, '--probability', '70')

    // DataPulse deal stalls — Marcus ghosts
    await ctx.runOK(
      'log',
      'email',
      'Follow-up #1 — no response',
      '--contact',
      'marcus@datapulse.com',
      '--deal',
      deal2,
    )
    await ctx.runOK(
      'log',
      'email',
      'Follow-up #2 — still nothing',
      '--contact',
      'marcus@datapulse.com',
      '--deal',
      deal2,
    )

    // GreenOps adds a second stakeholder
    await ctx.runOK('deal', 'edit', deal3, '--add-contact', 'tom@greenops.co')
    await ctx.runOK(
      'deal',
      'move',
      deal3,
      '--stage',
      'qualified',
      '--note',
      'Priya got CEO buy-in',
    )
    await ctx.runOK(
      'log',
      'meeting',
      'Call with Priya and Tom — discussed timeline',
      '--contact',
      'priya@greenops.co',
      '--contact',
      'tom@greenops.co',
      '--deal',
      deal3,
      '--set',
      'duration=45m',
    )

    // ── Close deals ──
    await ctx.runOK('deal', 'move', deal1, '--stage', 'negotiation')
    await ctx.runOK(
      'deal',
      'move',
      deal1,
      '--stage',
      'closed-won',
      '--note',
      'Signed annual contract!',
    )
    await ctx.runOK(
      'deal',
      'move',
      deal2,
      '--stage',
      'closed-lost',
      '--note',
      'No response after 3 follow-ups',
    )

    // ── Verify pipeline state ──
    const pipeline = await ctx.runJSON<
      Array<{ stage: string; count: number; value: number }>
    >('pipeline', '--format', 'json')
    const won = pipeline.find((s) => s.stage === 'closed-won')
    const lost = pipeline.find((s) => s.stage === 'closed-lost')
    const qualified = pipeline.find((s) => s.stage === 'qualified')
    expect(won?.count).toBe(1)
    expect(won?.value).toBe(24_000)
    expect(lost?.count).toBe(1)
    expect(qualified?.count).toBe(1) // GreenOps still in qualified

    // ── Verify reports ──
    const wonReport = await ctx.runJSON<Array<{ title: string }>>(
      'report',
      'won',
      '--format',
      'json',
    )
    expect(wonReport).toHaveLength(1)
    expect(wonReport[0].title).toBe('Streamline Annual')

    const lostReport = await ctx.runJSON<Array<{ title: string }>>(
      'report',
      'lost',
      '--format',
      'json',
    )
    expect(lostReport).toHaveLength(1)
    expect(lostReport[0].title).toBe('DataPulse POC')

    // ── Filter and search ──
    const decisionMakers = await ctx.runJSON<Array<{ name: string }>>(
      'contact',
      'list',
      '--tag',
      'decision-maker',
      '--format',
      'json',
    )
    expect(decisionMakers).toHaveLength(2)

    const saasCompanies = await ctx.runJSON<Array<{ name: string }>>(
      'company',
      'list',
      '--tag',
      'saas',
      '--format',
      'json',
    )
    expect(saasCompanies).toHaveLength(2)

    const bigDeals = await ctx.runJSON<Array<{ title: string }>>(
      'deal',
      'list',
      '--min-value',
      '10000',
      '--format',
      'json',
    )
    expect(bigDeals).toHaveLength(2) // Streamline (24k) and GreenOps (60k)

    // ── Search works across entities ──
    const searchResults = await ctx.runJSON<Array<{ type: string }>>(
      'search',
      'streamline',
      '--format',
      'json',
    )
    const types = searchResults.map((r) => r.type)
    expect(types).toContain('company')
    expect(types).toContain('contact')
  })
})
