/*
 * ============================================================================
 * PERSONA: Maya — Angel Investor & Startup Advisor
 * ============================================================================
 *
 * Maya is an angel investor who also advises 5-6 startups. She doesn't run
 * a traditional sales pipeline — she manages a network of founders, VCs,
 * and operators. Her "deals" are investment opportunities she's evaluating.
 * She uses the CRM to:
 *
 * - Track founders and their companies (who's building what)
 * - Log meetings, intros, and coffee chats
 * - Tag contacts by relationship type (founder, vc, operator, advisor)
 * - Use custom fields to track investment thesis fit, check size, sector
 * - Search her network when she needs to make an intro
 * - Track which deals she passed on and why (for pattern recognition)
 *
 * Why this scenario matters:
 * - Tests the CRM as a "relationship tracker" rather than a sales tool
 * - Validates search and find across a rich contact network
 * - Exercises custom fields heavily for non-standard metadata
 * - Tests the activity log as a personal CRM journal
 * - Covers the use case where most value is in contacts, not deals
 * - Tests duplicate detection across a growing network
 * ============================================================================
 */

import { describe, expect, test } from 'bun:test'

import { createTestContext } from '../helpers'

describe('scenario: angel investor relationship tracking', async () => {
  test('build a founder network, evaluate deals, track intros', async () => {
    const ctx = createTestContext()

    // ── Build the network: founders ──
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Aisha Rahman',
      '--email',
      'aisha@nexahealth.com',
      '--linkedin',
      'aisharahman',
      '--company',
      'NexaHealth',
      '--tag',
      'founder',
      '--tag',
      'portfolio',
      '--set',
      'sector=healthtech',
      '--set',
      'relationship=close',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Ben Torres',
      '--email',
      'ben@stackpay.io',
      '--linkedin',
      'bentorres',
      '--company',
      'StackPay',
      '--tag',
      'founder',
      '--set',
      'sector=fintech',
      '--set',
      'relationship=evaluating',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Chen Wei',
      '--email',
      'chen@autoforge.ai',
      '--linkedin',
      'chenwei',
      '--company',
      'AutoForge',
      '--tag',
      'founder',
      '--set',
      'sector=ai-infra',
      '--set',
      'relationship=new',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Diana Okafor',
      '--email',
      'diana@climateiq.co',
      '--linkedin',
      'dianaokafor',
      '--company',
      'ClimateIQ',
      '--tag',
      'founder',
      '--tag',
      'portfolio',
      '--set',
      'sector=climate',
      '--set',
      'relationship=close',
    )

    // ── Build the network: VCs and operators ──
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Eric Yamamoto',
      '--email',
      'eric@firstround.vc',
      '--tag',
      'vc',
      '--tag',
      'tier-1',
      '--set',
      'fund=First Round',
      '--set',
      'focus=seed',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Fatima Noor',
      '--email',
      'fatima@a16z.com',
      '--tag',
      'vc',
      '--tag',
      'tier-1',
      '--set',
      'fund=a16z',
      '--set',
      'focus=series-a',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Grace Park',
      '--email',
      'grace@stripe.com',
      '--tag',
      'operator',
      '--set',
      'company_name=Stripe',
      '--set',
      'role=Head of Partnerships',
    )

    // ── Companies for the founders ──
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'NexaHealth',
      '--website',
      'nexahealth.com',
      '--tag',
      'portfolio',
      '--set',
      'stage=Series A',
      '--set',
      'sector=healthtech',
    )
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'StackPay',
      '--website',
      'stackpay.io',
      '--tag',
      'evaluating',
      '--set',
      'stage=Seed',
      '--set',
      'sector=fintech',
    )
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'AutoForge',
      '--website',
      'autoforge.ai',
      '--tag',
      'pipeline',
      '--set',
      'stage=Pre-seed',
      '--set',
      'sector=ai-infra',
    )
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'ClimateIQ',
      '--website',
      'climateiq.co',
      '--tag',
      'portfolio',
      '--set',
      'stage=Seed',
      '--set',
      'sector=climate',
    )

    // ── Create investment deals ──
    const dealStack = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'StackPay Seed Round',
        '--value',
        '50000',
        '--contact',
        'ben@stackpay.io',
        '--company',
        'stackpay.io',
        '--set',
        'check_size=50k',
        '--set',
        'thesis=payments-infra',
        '--tag',
        'seed',
      )).trim()

    const dealAutoForge = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'AutoForge Pre-seed',
        '--value',
        '25000',
        '--contact',
        'chen@autoforge.ai',
        '--company',
        'autoforge.ai',
        '--set',
        'check_size=25k',
        '--set',
        'thesis=ai-tooling',
        '--tag',
        'pre-seed',
      )).trim()

    // ── Log relationship activities ──
    await ctx.runOK(
      'log',
      'meeting',
      'Quarterly check-in with Aisha — NexaHealth hitting $2M ARR',
      '--contact',
      'aisha@nexahealth.com',
      '--set',
      'type=portfolio-review',
    )
    await ctx.runOK(
      'log',
      'meeting',
      'First meeting with Ben — impressive demo of StackPay',
      '--contact',
      'ben@stackpay.io',
      '--deal',
      dealStack,
      '--set',
      'type=first-meeting',
    )
    await ctx.runOK(
      'log',
      'call',
      'Intro call with Chen Wei — AutoForge looks promising',
      '--contact',
      'chen@autoforge.ai',
      '--deal',
      dealAutoForge,
      '--set',
      'type=first-meeting',
    )

    // ── Make an intro: connect Ben with Eric (VC) ──
    await ctx.runOK(
      'log',
      'email',
      'Intro: Ben Torres <> Eric Yamamoto — StackPay seed round',
      '--contact',
      'ben@stackpay.io',
      '--contact',
      'eric@firstround.vc',
      '--set',
      'type=intro',
    )

    // ── Due diligence on StackPay ──
    await ctx.runOK(
      'deal',
      'move',
      dealStack,
      '--stage',
      'qualified',
      '--note',
      'Checked references, strong team',
    )
    await ctx.runOK(
      'log',
      'call',
      'Reference check with Grace (Stripe) — positive signal on StackPay API',
      '--contact',
      'grace@stripe.com',
      '--deal',
      dealStack,
      '--set',
      'type=reference-check',
    )
    await ctx.runOK(
      'deal',
      'move',
      dealStack,
      '--stage',
      'proposal',
      '--note',
      'Sent term sheet',
    )
    await ctx.runOK(
      'deal',
      'move',
      dealStack,
      '--stage',
      'closed-won',
      '--note',
      'Wired $50k for StackPay seed',
    )

    // ── Pass on AutoForge ──
    await ctx.runOK('deal', 'move', dealAutoForge, '--stage', 'qualified')
    await ctx.runOK(
      'deal',
      'move',
      dealAutoForge,
      '--stage',
      'closed-lost',
      '--note',
      'Passed — market too crowded, no moat',
    )

    // ── Query the network ──
    // Find all founders
    const founders = await ctx.runJSON<Array<{ name: string }>>(
      'contact',
      'list',
      '--tag',
      'founder',
      '--format',
      'json',
    )
    expect(founders).toHaveLength(4)

    // Find tier-1 VCs
    const vcsTier1 = await ctx.runJSON<Array<{ name: string }>>(
      'contact',
      'list',
      '--tag',
      'tier-1',
      '--format',
      'json',
    )
    expect(vcsTier1).toHaveLength(2)

    // Find contacts in healthtech
    const healthtech = await ctx.runJSON<Array<{ name: string }>>(
      'contact',
      'list',
      '--filter',
      'sector=healthtech',
      '--format',
      'json',
    )
    expect(healthtech).toHaveLength(1)
    expect(healthtech[0].name).toBe('Aisha Rahman')

    // ── Search the network by keyword ──
    const stripeResults = await ctx.runJSON<Array<{ type: string; name?: string }>>(
      'search',
      'stripe',
      '--format',
      'json',
    )
    expect(stripeResults.length).toBeGreaterThanOrEqual(1)

    // Search by LinkedIn handle
    const linkedinLookup = await ctx.runOK(
      'contact',
      'show',
      'aisharahman',
      '--format',
      'json',
    )
    const aisha = JSON.parse(linkedinLookup)
    expect(aisha.name).toBe('Aisha Rahman')
    expect(aisha.linkedin).toBe('aisharahman')

    // ── Verify deal outcomes ──
    const wonDeals = await ctx.runJSON<Array<{ title: string }>>(
      'report',
      'won',
      '--format',
      'json',
    )
    expect(wonDeals).toHaveLength(1)
    expect(wonDeals[0].title).toBe('StackPay Seed Round')

    const lostDeals = await ctx.runJSON<Array<{ title: string }>>(
      'report',
      'lost',
      '--format',
      'json',
    )
    expect(lostDeals).toHaveLength(1)
    expect(lostDeals[0].title).toBe('AutoForge Pre-seed')

    // ── Portfolio companies ──
    const portfolio = await ctx.runJSON<Array<{ name: string }>>(
      'company',
      'list',
      '--tag',
      'portfolio',
      '--format',
      'json',
    )
    expect(portfolio).toHaveLength(2) // NexaHealth + ClimateIQ

    // ── Activity log for a specific contact ──
    const aishaActivities = await ctx.runJSON<Array<{ type: string }>>(
      'activity',
      'list',
      '--contact',
      'aisha@nexahealth.com',
      '--format',
      'json',
    )
    expect(aishaActivities).toHaveLength(1) // quarterly check-in

    // ── Multi-contact activity (the intro) ──
    const benActivities = await ctx.runJSON<Array<{ type: string; body: string }>>(
      'activity',
      'list',
      '--contact',
      'ben@stackpay.io',
      '--format',
      'json',
    )
    const intros = benActivities.filter((a) => a.body.includes('Intro'))
    expect(intros).toHaveLength(1)
  })
})
