/*
 * ============================================================================
 * PERSONA: Sam — Developer Relations Engineer
 * ============================================================================
 *
 * Sam runs DevRel at a developer tools company. Their job isn't traditional
 * sales — it's community building, conference outreach, and partnership
 * development. They track:
 *
 * - Speakers, community leaders, and content creators they want to collaborate with
 * - Conference talks and meetup appearances
 * - Partnership deals with other dev tool companies
 * - Content collaborations (blog posts, podcasts, livestreams)
 *
 * Sam loves the CLI because they live in the terminal already. They use
 * shell scripts to automate weekly community reports and pipe CRM data
 * into their content planning workflow.
 *
 * Why this scenario matters:
 * - Tests the CRM for a non-sales use case (community/partnerships)
 * - Exercises social handle storage and lookup (LinkedIn, X, Bluesky)
 * - Tests activity types as a flexible event log (not just sales calls)
 * - Validates export for reporting and shell-based automation
 * - Tests the --format ids pipe workflow for bulk operations
 * - Exercises company-as-partner (not company-as-prospect) relationships
 * ============================================================================
 */

import { describe, expect, test } from 'bun:test'

import { createTestContext } from '../helpers'

describe('scenario: devrel community and partnership tracking', async () => {
  test('track community members, conferences, and partnerships', async () => {
    const ctx = createTestContext()

    // ── Add community contacts with social handles ──
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Kelsey Hightower',
      '--email',
      'kelsey@example.com',
      '--x',
      'kelseyhightower',
      '--linkedin',
      'kelseyhightower',
      '--tag',
      'speaker',
      '--tag',
      'cloud-native',
      '--set',
      'reach=large',
      '--set',
      'collab_interest=podcast',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Cassidy Williams',
      '--email',
      'cassidy@example.com',
      '--x',
      'cassidoo',
      '--bluesky',
      'cassidy.bsky.social',
      '--tag',
      'speaker',
      '--tag',
      'content-creator',
      '--tag',
      'frontend',
      '--set',
      'reach=large',
      '--set',
      'collab_interest=livestream',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Theo Browne',
      '--email',
      'theo@example.com',
      '--x',
      't3dotgg',
      '--tag',
      'content-creator',
      '--tag',
      'typescript',
      '--set',
      'reach=massive',
      '--set',
      'collab_interest=video',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Julia Evans',
      '--email',
      'julia@example.com',
      '--x',
      'b0rk',
      '--bluesky',
      'jvns.bsky.social',
      '--tag',
      'content-creator',
      '--tag',
      'systems',
      '--set',
      'reach=large',
      '--set',
      'collab_interest=zine',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Nadia Zhuk',
      '--email',
      'nadia@example.com',
      '--linkedin',
      'nadiazhuk',
      '--tag',
      'speaker',
      '--tag',
      'career-dev',
      '--set',
      'reach=medium',
      '--set',
      'collab_interest=talk',
    )

    // ── Add partner companies ──
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Vercel',
      '--website',
      'vercel.com',
      '--tag',
      'partner',
      '--tag',
      'frontend',
      '--set',
      'type=platform-partner',
    )
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Railway',
      '--website',
      'railway.app',
      '--tag',
      'partner',
      '--tag',
      'infra',
      '--set',
      'type=integration-partner',
    )
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'KubeCon',
      '--website',
      'kubecon.io',
      '--tag',
      'conference',
      '--set',
      'type=conference',
    )

    // ── Create partnership deals ──
    const vercelDeal = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Vercel Integration Partnership',
        '--value',
        '0',
        '--company',
        'vercel.com',
        '--tag',
        'integration',
        '--tag',
        'q2',
        '--set',
        'type=integration',
        '--set',
        'status=in-discussion',
      )).trim()

    const kubeconDeal = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'KubeCon Talk Submission',
        '--value',
        '0',
        '--company',
        'kubecon.io',
        '--contact',
        'kelsey@example.com',
        '--tag',
        'conference',
        '--tag',
        'q3',
        '--set',
        'type=speaking',
        '--set',
        'cfp_deadline=2026-06-01',
      )).trim()

    // ── Log community interactions ──
    await ctx.runOK(
      'log',
      'meeting',
      'DM about potential podcast collab',
      '--contact',
      'kelsey@example.com',
      '--set',
      'channel=twitter-dm',
    )
    await ctx.runOK(
      'log',
      'email',
      'Sent collab proposal for livestream series',
      '--contact',
      'cassidy@example.com',
      '--set',
      'channel=email',
    )
    await ctx.runOK(
      'log',
      'note',
      'Theo mentioned us in his latest video — great organic reach',
      '--contact',
      'theo@example.com',
      '--set',
      'channel=organic',
    )
    await ctx.runOK(
      'log',
      'meeting',
      'Partnership kickoff call with Vercel team',
      '--deal',
      vercelDeal,
      '--set',
      'channel=zoom',
      '--set',
      'duration=45m',
    )

    // ── Move deals ──
    await ctx.runOK(
      'deal',
      'move',
      vercelDeal,
      '--stage',
      'qualified',
      '--note',
      'Vercel team interested in co-marketing',
    )
    await ctx.runOK(
      'deal',
      'move',
      kubeconDeal,
      '--stage',
      'qualified',
      '--note',
      'CFP submitted with Kelsey as co-speaker',
    )

    // ── Social handle lookups ──
    // Look up by X handle
    const kelsey = JSON.parse(
      await ctx.runOK('contact', 'show', 'kelseyhightower', '--format', 'json'),
    )
    expect(kelsey.name).toBe('Kelsey Hightower')
    expect(kelsey.x).toBe('kelseyhightower')

    // Look up by Bluesky handle
    const julia = JSON.parse(
      await ctx.runOK('contact', 'show', 'jvns.bsky.social', '--format', 'json'),
    )
    expect(julia.name).toBe('Julia Evans')

    // ── Filter by collaboration interest ──
    const podcastCandidates = await ctx.runJSON<Array<{ name: string }>>(
      'contact',
      'list',
      '--filter',
      'collab_interest=podcast',
      '--format',
      'json',
    )
    expect(podcastCandidates).toHaveLength(1)
    expect(podcastCandidates[0].name).toBe('Kelsey Hightower')

    const videoCreators = await ctx.runJSON<Array<{ name: string }>>(
      'contact',
      'list',
      '--filter',
      'collab_interest=video',
      '--format',
      'json',
    )
    expect(videoCreators).toHaveLength(1)
    expect(videoCreators[0].name).toBe('Theo Browne')

    // ── Tag-based queries ──
    const speakers = await ctx.runJSON<Array<{ name: string }>>(
      'contact',
      'list',
      '--tag',
      'speaker',
      '--format',
      'json',
    )
    expect(speakers).toHaveLength(3) // Kelsey, Cassidy, Nadia

    const contentCreators = await ctx.runJSON<Array<{ name: string }>>(
      'contact',
      'list',
      '--tag',
      'content-creator',
      '--format',
      'json',
    )
    expect(contentCreators).toHaveLength(3) // Cassidy, Theo, Julia

    const partners = await ctx.runJSON<Array<{ name: string }>>(
      'company',
      'list',
      '--tag',
      'partner',
      '--format',
      'json',
    )
    expect(partners).toHaveLength(2) // Vercel, Railway

    // ── Bulk tag operation: tag all speakers as "kubecon-invite" ──
    const speakerIds = (await ctx.runOK('contact', 'list', '--tag', 'speaker', '--format', 'ids')).trim()
      .split('\n')
    expect(speakerIds).toHaveLength(3)
    for (const id of speakerIds) {
      await ctx.runOK('tag', id, 'kubecon-invite')
    }

    // Verify bulk tag
    const invites = await ctx.runJSON<Array<{ name: string }>>(
      'contact',
      'list',
      '--tag',
      'kubecon-invite',
      '--format',
      'json',
    )
    expect(invites).toHaveLength(3)

    // ── Export for reporting ──
    const exported = await ctx.runJSON<Record<string, unknown>[]>(
      'export',
      'contacts',
      '--format',
      'json',
    )
    expect(exported.length).toBeGreaterThanOrEqual(5)

    // ── Search across the network ──
    const frontendSearch = await ctx.runJSON<Array<{ type: string }>>(
      'search',
      'frontend',
      '--format',
      'json',
    )
    expect(frontendSearch.length).toBeGreaterThanOrEqual(1) // Cassidy tagged frontend, Vercel tagged frontend

    // ── Activity report ──
    const activityReport = await ctx.runJSON<Array<{ type: string; count: number }>>(
      'report',
      'activity',
      '--by',
      'type',
      '--format',
      'json',
    )
    expect(activityReport.length).toBeGreaterThanOrEqual(1)
  })
})
