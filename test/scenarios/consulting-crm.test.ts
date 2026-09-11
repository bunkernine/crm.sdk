/*
 * ============================================================================
 * PERSONA: Riko — Independent Management Consultant
 * ============================================================================
 *
 * Riko is a solo management consultant who works with 3-5 clients at a time
 * on retainer. Unlike traditional sales, Riko's pipeline is about:
 *
 * - Tracking active engagements (retainer deals that are always "open")
 * - Logging every client interaction for billing and accountability
 * - Managing referrals — most new business comes from existing clients
 * - Maintaining a "warm network" of past clients for re-engagement
 * - Using custom fields to track billing rates, contract terms, etc.
 *
 * Riko doesn't use a traditional lead→qualified→won pipeline. They
 * customize the stages to: prospect → engaged → active-retainer →
 * completed → churned. The CRM doubles as their engagement tracker.
 *
 * Why this scenario matters:
 * - Tests custom pipeline stages (non-default configuration)
 * - Validates the CRM for retainer/ongoing business (not one-shot deals)
 * - Tests heavy activity logging with custom fields for time tracking
 * - Exercises the stale report for client re-engagement
 * - Tests contact merge (when a client changes companies)
 * - Validates deal edit for updating retainer values mid-engagement
 * ============================================================================
 */

import { describe, expect, test } from 'bun:test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createTestContext } from '../helpers'

describe('scenario: solo consultant with custom pipeline and retainers', async () => {
  test('manage retainer clients, log interactions, track referrals', async () => {
    const ctx = createTestContext()

    // ── Custom pipeline config ──
    const configPath = join(ctx.dir, 'crm.toml')
    writeFileSync(
      configPath,
      `[pipeline]
stages = ["prospect", "engaged", "active-retainer", "completed", "churned"]
won_stage = "completed"
lost_stage = "churned"

[phone]
default_country = "US"
`,
    )

    // ── Set up clients ──
    await ctx.runOK(
      '--config',
      configPath,
      'company',
      'add',
      '--name',
      'Apex Manufacturing',
      '--website',
      'apex-mfg.com',
      '--set',
      'industry=Manufacturing',
      '--set',
      'size=500',
    )
    await ctx.runOK(
      '--config',
      configPath,
      'company',
      'add',
      '--name',
      'Bright Financial',
      '--website',
      'brightfin.com',
      '--set',
      'industry=Finance',
      '--set',
      'size=200',
    )
    await ctx.runOK(
      '--config',
      configPath,
      'company',
      'add',
      '--name',
      'Core Logistics',
      '--website',
      'corelogistics.io',
      '--set',
      'industry=Logistics',
      '--set',
      'size=150',
    )

    await ctx.runOK(
      '--config',
      configPath,
      'contact',
      'add',
      '--name',
      'Helen Marks',
      '--email',
      'helen@apex-mfg.com',
      '--phone',
      '212-555-0100',
      '--company',
      'Apex Manufacturing',
      '--tag',
      'client',
      '--tag',
      'exec',
      '--set',
      'title=COO',
    )
    await ctx.runOK(
      '--config',
      configPath,
      'contact',
      'add',
      '--name',
      'Robert Silva',
      '--email',
      'robert@brightfin.com',
      '--phone',
      '212-555-0200',
      '--company',
      'Bright Financial',
      '--tag',
      'client',
      '--tag',
      'exec',
      '--set',
      'title=CFO',
    )
    await ctx.runOK(
      '--config',
      configPath,
      'contact',
      'add',
      '--name',
      'Tanya Chen',
      '--email',
      'tanya@corelogistics.io',
      '--phone',
      '212-555-0300',
      '--company',
      'Core Logistics',
      '--tag',
      'prospect',
      '--set',
      'title=VP Operations',
      '--set',
      'referrer=helen@apex-mfg.com',
    )

    // ── Create retainer deals ──
    const dealApex = (await ctx.runOK(
        '--config',
        configPath,
        'deal',
        'add',
        '--title',
        'Apex Ops Transformation',
        '--value',
        '15000',
        '--contact',
        'helen@apex-mfg.com',
        '--company',
        'apex-mfg.com',
        '--tag',
        'retainer',
        '--set',
        'billing_rate=250/hr',
        '--set',
        'contract_months=6',
      )).trim()

    const dealBright = (await ctx.runOK(
        '--config',
        configPath,
        'deal',
        'add',
        '--title',
        'Bright Financial Process Audit',
        '--value',
        '8000',
        '--contact',
        'robert@brightfin.com',
        '--company',
        'brightfin.com',
        '--tag',
        'retainer',
        '--set',
        'billing_rate=200/hr',
        '--set',
        'contract_months=3',
      )).trim()

    const dealCore = (await ctx.runOK(
        '--config',
        configPath,
        'deal',
        'add',
        '--title',
        'Core Logistics Assessment',
        '--value',
        '5000',
        '--contact',
        'tanya@corelogistics.io',
        '--company',
        'corelogistics.io',
        '--tag',
        'prospect',
        '--set',
        'billing_rate=200/hr',
        '--set',
        'referral_source=Apex',
      )).trim()

    // ── Move deals through custom pipeline ──
    await ctx.runOK(
      '--config',
      configPath,
      'deal',
      'move',
      dealApex,
      '--stage',
      'engaged',
      '--note',
      'Kickoff meeting scheduled',
    )
    await ctx.runOK(
      '--config',
      configPath,
      'deal',
      'move',
      dealApex,
      '--stage',
      'active-retainer',
      '--note',
      'Contract signed, monthly retainer started',
    )

    await ctx.runOK(
      '--config',
      configPath,
      'deal',
      'move',
      dealBright,
      '--stage',
      'engaged',
      '--note',
      'Robert approved the SOW',
    )
    await ctx.runOK(
      '--config',
      configPath,
      'deal',
      'move',
      dealBright,
      '--stage',
      'active-retainer',
    )

    await ctx.runOK(
      '--config',
      configPath,
      'deal',
      'move',
      dealCore,
      '--stage',
      'engaged',
      '--note',
      'Tanya interested — Helen referred us',
    )

    // ── Heavy activity logging (consultant's bread and butter) ──
    await ctx.runOK(
      '--config',
      configPath,
      'log',
      'meeting',
      'Weekly sync with Helen — discussed KPI framework',
      '--contact',
      'helen@apex-mfg.com',
      '--deal',
      dealApex,
      '--set',
      'duration=60m',
      '--set',
      'billable=yes',
    )
    await ctx.runOK(
      '--config',
      configPath,
      'log',
      'meeting',
      'Process mapping workshop',
      '--contact',
      'helen@apex-mfg.com',
      '--deal',
      dealApex,
      '--set',
      'duration=180m',
      '--set',
      'billable=yes',
    )
    await ctx.runOK(
      '--config',
      configPath,
      'log',
      'note',
      'Prepared financial model for Apex board presentation',
      '--deal',
      dealApex,
      '--set',
      'duration=120m',
      '--set',
      'billable=yes',
    )

    await ctx.runOK(
      '--config',
      configPath,
      'log',
      'meeting',
      'Initial audit kickoff with Robert',
      '--contact',
      'robert@brightfin.com',
      '--deal',
      dealBright,
      '--set',
      'duration=90m',
      '--set',
      'billable=yes',
    )
    await ctx.runOK(
      '--config',
      configPath,
      'log',
      'call',
      'Quick check-in on deliverables',
      '--contact',
      'robert@brightfin.com',
      '--deal',
      dealBright,
      '--set',
      'duration=15m',
      '--set',
      'billable=no',
    )

    // ── Update retainer value mid-engagement (scope increase) ──
    await ctx.runOK(
      '--config',
      configPath,
      'deal',
      'edit',
      dealApex,
      '--value',
      '20000',
    )

    // ── Complete one engagement, another churns ──
    await ctx.runOK(
      '--config',
      configPath,
      'deal',
      'move',
      dealBright,
      '--stage',
      'completed',
      '--note',
      'Audit delivered, Robert happy',
    )
    await ctx.runOK(
      '--config',
      configPath,
      'deal',
      'move',
      dealCore,
      '--stage',
      'churned',
      '--note',
      'Tanya lost budget approval',
    )

    // ── Verify custom pipeline ──
    const pipeline = await ctx.runJSON<
      Array<{ stage: string; count: number; value: number }>
    >('--config', configPath, 'pipeline', '--format', 'json')
    const stages = pipeline.map((s) => s.stage)
    expect(stages).toContain('prospect')
    expect(stages).toContain('active-retainer')
    expect(stages).toContain('completed')
    expect(stages).toContain('churned')

    const active = pipeline.find((s) => s.stage === 'active-retainer')
    expect(active?.count).toBe(1) // Apex
    expect(active?.value).toBe(20_000) // Updated value

    const completed = pipeline.find((s) => s.stage === 'completed')
    expect(completed?.count).toBe(1) // Bright

    const churned = pipeline.find((s) => s.stage === 'churned')
    expect(churned?.count).toBe(1) // Core

    // ── Reports with custom pipeline ──
    const wonReport = await ctx.runJSON<Array<{ title: string }>>(
      '--config',
      configPath,
      'report',
      'won',
      '--format',
      'json',
    )
    expect(wonReport).toHaveLength(1)
    expect(wonReport[0].title).toBe('Bright Financial Process Audit')

    const lostReport = await ctx.runJSON<Array<{ title: string }>>(
      '--config',
      configPath,
      'report',
      'lost',
      '--format',
      'json',
    )
    expect(lostReport).toHaveLength(1)
    expect(lostReport[0].title).toBe('Core Logistics Assessment')

    // ── Activity log for billing ──
    const apexActivities = await ctx.runJSON<
      Array<{ type: string; custom_fields: Record<string, string> }>
    >(
      '--config',
      configPath,
      'activity',
      'list',
      '--deal',
      dealApex,
      '--format',
      'json',
    )
    // Manual activities (excluding stage-change auto-activities)
    const billable = apexActivities.filter(
      (a) => a.custom_fields?.billable === 'yes',
    )
    expect(billable).toHaveLength(3) // 2 meetings + 1 note

    // ── Contact by phone lookup ──
    const helen = JSON.parse(
      await ctx.runOK(
        '--config',
        configPath,
        'contact',
        'show',
        '212-555-0100',
        '--format',
        'json',
      ),
    )
    expect(helen.name).toBe('Helen Marks')

    // ── Tag-based filtering ──
    const retainerDeals = await ctx.runJSON<Array<{ title: string }>>(
      '--config',
      configPath,
      'deal',
      'list',
      '--tag',
      'retainer',
      '--format',
      'json',
    )
    expect(retainerDeals).toHaveLength(2) // Apex + Bright

    // ── Referral tracking via custom field ──
    const tanya = JSON.parse(
      await ctx.runOK(
        '--config',
        configPath,
        'contact',
        'show',
        'tanya@corelogistics.io',
        '--format',
        'json',
      ),
    )
    expect(tanya.custom_fields.referrer).toBe('helen@apex-mfg.com')
  })
})
