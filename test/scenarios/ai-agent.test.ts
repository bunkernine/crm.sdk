/*
 * ============================================================================
 * PERSONA: Claude — An AI Agent Operating via CLI and JSON
 * ============================================================================
 *
 * This isn't a human persona — it's an AI agent (like Claude Code, Codex,
 * or a custom LLM pipeline) that uses crm.cli as its structured data layer.
 * The agent reads and writes CRM data exclusively via JSON format and
 * relies on:
 *
 * - Deterministic --format json output for parsing
 * - ID-based entity references (not fuzzy name matching)
 * - Structured search results for RAG-style lookups
 * - Export for bulk analysis
 * - Pipeline reports for summarization
 * - Clean exit codes for error handling
 *
 * Why this scenario matters:
 * - crm.cli's #1 differentiator is AI-agent compatibility
 * - Tests that every command produces parseable JSON
 * - Validates ID-based workflows (agents don't guess — they use IDs)
 * - Tests the search → show → act pattern agents actually use
 * - Exercises error handling (agents need clean failure signals)
 * - Tests the "CRM as structured memory" pattern where an agent
 *   enriches contacts incrementally over multiple interactions
 * ============================================================================
 */

import { describe, expect, test } from 'bun:test'

import { createTestContext } from '../helpers'

describe('scenario: AI agent using CRM as structured data layer', async () => {
  test('agent ingests contacts, enriches them, and generates reports', async () => {
    const ctx = createTestContext()

    // ── Step 1: Agent creates initial contacts from parsed email data ──
    // (Simulating: agent extracts names/emails from an inbox scan)
    const contacts = [
      {
        name: 'Alice Wang',
        email: 'alice@techcorp.com',
        company: 'TechCorp',
        title: 'Engineering Manager',
      },
      {
        name: 'Bob Fischer',
        email: 'bob@dataworks.io',
        company: 'DataWorks',
        title: 'CTO',
      },
      {
        name: 'Carol Reyes',
        email: 'carol@nexgen.co',
        company: 'NexGen',
        title: 'VP Product',
      },
      {
        name: 'Dan Okoye',
        email: 'dan@flowstate.dev',
        company: 'FlowState',
        title: 'Founder',
      },
      {
        name: 'Eva Lindström',
        email: 'eva@nordicsaas.se',
        company: 'Nordic SaaS',
        title: 'CEO',
      },
    ]

    const contactIds: string[] = []
    for (const c of contacts) {
      const id = (await ctx.runOK(
          'contact',
          'add',
          '--name',
          c.name,
          '--email',
          c.email,
          '--company',
          c.company,
          '--set',
          `title=${c.title}`,
        )).trim()
      contactIds.push(id)
    }

    expect(contactIds).toHaveLength(5)
    // Agent verifies all IDs have the correct prefix
    for (const id of contactIds) {
      expect(id).toMatch(/^ct_/)
    }

    // ── Step 2: Agent reads back contacts via JSON to verify ──
    const allContacts = await ctx.runJSON<
      Array<{ id: string; name: string; emails: string[] }>
    >('contact', 'list', '--format', 'json')
    expect(allContacts).toHaveLength(5)
    // Every contact has an ID, name, and at least one email
    for (const c of allContacts) {
      expect(c.id).toMatch(/^ct_/)
      expect(c.name).toBeTruthy()
      expect(c.emails.length).toBeGreaterThanOrEqual(1)
    }

    // ── Step 3: Agent uses show to get full details by ID ──
    const detail = await ctx.runJSON<{
      id: string
      name: string
      emails: string[]
      companies: string[]
      custom_fields: Record<string, string>
    }>('contact', 'show', contactIds[0], '--format', 'json')
    expect(detail.id).toBe(contactIds[0])
    expect(detail.name).toBe('Alice Wang')
    expect(detail.companies).toHaveLength(1)
    expect(detail.companies[0]).toBe('TechCorp')
    expect(detail.custom_fields.title).toBe('Engineering Manager')

    // ── Step 4: Agent enriches contacts (simulating web research) ──
    await ctx.runOK(
      'contact',
      'edit',
      contactIds[0],
      '--linkedin',
      'alicewang',
      '--set',
      'source=inbound',
      '--set',
      'interest=high',
    )
    await ctx.runOK(
      'contact',
      'edit',
      contactIds[1],
      '--linkedin',
      'bobfischer',
      '--set',
      'source=conference',
      '--set',
      'interest=medium',
    )
    await ctx.runOK(
      'contact',
      'edit',
      contactIds[2],
      '--set',
      'source=referral',
      '--set',
      'interest=high',
    )
    await ctx.runOK(
      'contact',
      'edit',
      contactIds[3],
      '--x',
      'danokoye',
      '--set',
      'source=twitter',
      '--set',
      'interest=high',
    )
    await ctx.runOK(
      'contact',
      'edit',
      contactIds[4],
      '--set',
      'source=cold-outreach',
      '--set',
      'interest=low',
    )

    // ── Step 5: Agent creates deals for high-interest contacts ──
    const highInterest = await ctx.runJSON<Array<{ id: string; name: string }>>(
      'contact',
      'list',
      '--filter',
      'interest=high',
      '--format',
      'json',
    )
    expect(highInterest).toHaveLength(3) // Alice, Carol, Dan

    const dealIds: string[] = []
    for (const c of highInterest) {
      const dealId = (await ctx.runOK(
          'deal',
          'add',
          '--title',
          `${c.name} — Evaluation`,
          '--value',
          '10000',
          '--contact',
          c.id,
        )).trim()
      dealIds.push(dealId)
    }

    expect(dealIds).toHaveLength(3)
    for (const id of dealIds) {
      expect(id).toMatch(/^dl_/)
    }

    // ── Step 6: Agent logs activities using IDs ──
    await ctx.runOK(
      'log',
      'email',
      'Automated intro email sent',
      '--contact',
      contactIds[0],
      '--deal',
      dealIds[0],
    )
    await ctx.runOK(
      'log',
      'email',
      'Automated intro email sent',
      '--contact',
      contactIds[2],
      '--deal',
      dealIds[1],
    )
    await ctx.runOK(
      'log',
      'email',
      'Automated intro email sent',
      '--contact',
      contactIds[3],
      '--deal',
      dealIds[2],
    )

    // ── Step 7: Agent queries pipeline for summary ──
    const pipeline = await ctx.runJSON<
      Array<{ stage: string; count: number; value: number }>
    >('pipeline', '--format', 'json')
    const leadStage = pipeline.find((s) => s.stage === 'lead')
    expect(leadStage?.count).toBe(3)
    expect(leadStage?.value).toBe(30_000) // 3 × $10k

    // ── Step 8: Agent uses search for RAG-style lookup ──
    const searchResults = await ctx.runJSON<
      Array<{ type: string; id: string; name?: string; title?: string }>
    >('search', 'techcorp', '--format', 'json')
    // Should find company and contact
    expect(searchResults.length).toBeGreaterThanOrEqual(1)

    // Agent uses find for fuzzy matching
    const findResults = await ctx.runJSON<Array<{ type: string; id: string }>>(
      'find',
      'nordic',
      '--format',
      'json',
    )
    expect(findResults.length).toBeGreaterThanOrEqual(1)

    // ── Step 9: Agent handles errors gracefully ──
    // Nonexistent entity returns non-zero exit
    const badShow = await ctx.runAsync(
      'contact',
      'show',
      'ct_nonexistent',
      '--format',
      'json',
    )
    expect(badShow.exitCode).not.toBe(0)

    // Invalid deal move
    const badMove = await ctx.runAsync('deal', 'move', dealIds[0], '--stage', 'lead') // already in lead
    expect(badMove.exitCode).not.toBe(0)

    // ── Step 10: Full export for analysis ──
    const fullExport = await ctx.runJSON<{
      contacts: unknown[]
      companies: unknown[]
      deals: unknown[]
      activities: unknown[]
    }>('export', 'all', '--format', 'json')
    expect(fullExport.contacts).toHaveLength(5)
    expect(fullExport.companies).toHaveLength(5)
    expect(fullExport.deals).toHaveLength(3)
    expect(fullExport.activities.length).toBeGreaterThanOrEqual(3) // at least the 3 emails

    // ── Step 11: Agent uses --format ids for bulk operations ──
    const allDealIds = (await ctx.runOK('deal', 'list', '--format', 'ids')).trim()
      .split('\n')
    expect(allDealIds).toHaveLength(3)
    for (const id of allDealIds) {
      expect(id).toMatch(/^dl_/)
    }

    // Bulk move all deals to qualified
    for (const id of allDealIds) {
      await ctx.runOK(
        'deal',
        'move',
        id,
        '--stage',
        'qualified',
        '--note',
        'Agent bulk-qualified',
      )
    }

    // Verify all moved
    const qualifiedDeals = await ctx.runJSON<Array<{ stage: string }>>(
      'deal',
      'list',
      '--stage',
      'qualified',
      '--format',
      'json',
    )
    expect(qualifiedDeals).toHaveLength(3)

    // ── Step 12: Agent reads conversion report ──
    const conversion = await ctx.runJSON<
      Array<{ stage: string; entered: number; advanced: number }>
    >('report', 'conversion', '--format', 'json')
    const leadConv = conversion.find((s) => s.stage === 'lead')
    expect(leadConv?.entered).toBe(3)
    expect(leadConv?.advanced).toBe(3)
  })
})
