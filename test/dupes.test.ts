import { describe, expect, test } from 'bun:test'

import { createTestContext } from './helpers.ts'

describe('dupes', async () => {
  test('finds likely duplicate contacts by fuzzy name', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Sarah Chen',
      '--email',
      'sarah@stripe.com',
      '--company',
      'Stripe',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'S. Chen',
      '--email',
      'sarah.chen@gmail.com',
      '--company',
      'Stripe',
    )

    const out = await ctx.runOK('dupes', '--type', 'contact')
    expect(out).toContain('Sarah Chen')
    expect(out).toContain('S. Chen')
  })

  test('finds likely duplicate companies by fuzzy name', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Ford Motor', '--website', 'ford.com')
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Ford Motors',
      '--website',
      'fordmotors.co',
    )

    const out = await ctx.runOK('dupes', '--type', 'company')
    expect(out).toContain('Ford Motor')
    expect(out).toContain('Ford Motors')
  })

  test('json output includes candidate pairs and reasons', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Sarah Chen',
      '--email',
      'sarah@stripe.com',
      '--company',
      'Stripe',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'S. Chen',
      '--email',
      'sarah.chen@gmail.com',
      '--company',
      'Stripe',
    )

    const results = await ctx.runJSON<
      Array<{ left: unknown; right: unknown; reasons: string[] }>
    >('dupes', '--type', 'contact', '--format', 'json')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]).toHaveProperty('left')
    expect(results[0]).toHaveProperty('right')
    expect(results[0]).toHaveProperty('reasons')
  })

  test('does not rely on exact overlapping emails or phones', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Sarah Chen',
      '--email',
      'sarah@stripe.com',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Sarah C',
      '--email',
      'sarah.personal@gmail.com',
    )

    const out = await ctx.runOK('dupes', '--type', 'contact')
    expect(out).toContain('Sarah Chen')
    expect(out).toContain('Sarah C')
  })

  test('finds likely duplicate companies by fuzzy name even when websites differ', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Hershey Foods',
      '--website',
      'hersheys.com/brands',
    )
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Hershey Foods Inc',
      '--website',
      'hersheys.com/corporate',
    )

    const out = await ctx.runOK('dupes', '--type', 'company')
    expect(out).toContain('Hershey Foods')
    expect(out).toContain('Hershey Foods Inc')
  })

  test('finds likely duplicate contacts by same company plus fuzzy name when emails differ', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Michael Ross',
      '--email',
      'michael@datadog.com',
      '--company',
      'Datadog',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Mike Ross',
      '--email',
      'mike.personal@gmail.com',
      '--company',
      'Datadog',
    )

    const out = await ctx.runOK('dupes', '--type', 'contact')
    expect(out).toContain('Michael Ross')
    expect(out).toContain('Mike Ross')
  })

  test('finds likely duplicate contacts by similar social handles', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Lisa Park',
      '--email',
      'lisa@figma.com',
      '--linkedin',
      'lisapark',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Lisa M. Park',
      '--email',
      'lisampark@gmail.com',
      '--linkedin',
      'lisampark',
    )

    const out = await ctx.runOK('dupes', '--type', 'contact')
    expect(out).toContain('Lisa Park')
    expect(out).toContain('Lisa M. Park')
  })

  test('contacts with shared email domain flagged when names are similar', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Robert Kim',
      '--email',
      'bob@salesforce.com',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Roberto Kim',
      '--email',
      'roberto.kim@salesforce.com',
    )

    const out = await ctx.runOK('dupes', '--type', 'contact')
    expect(out).toContain('Robert Kim')
    expect(out).toContain('Roberto Kim')
  })

  test('completely different contacts are not flagged', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Sarah Chen',
      '--email',
      'sarah@stripe.com',
      '--company',
      'Stripe',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Mike Ross',
      '--email',
      'mike@datadog.com',
      '--company',
      'Datadog',
    )

    const results = await ctx.runJSON<unknown[]>(
      'dupes',
      '--type',
      'contact',
      '--format',
      'json',
    )
    expect(results).toHaveLength(0)
  })

  test('unrelated names like Walter and Sawyer are not flagged as similar', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Walter',
      '--email',
      'walter@ford.com',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Sawyer',
      '--email',
      'sawyer@hersheys.com',
    )

    const results = await ctx.runJSON<
      Array<{ left: unknown; right: unknown; reasons: string[] }>
    >('dupes', '--type', 'contact', '--format', 'json')
    expect(results).toHaveLength(0)
  })

  test('catches company name with suffix added (Stripe vs Stripe Inc)', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Stripe', '--website', 'stripe.com')
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Stripe Inc',
      '--website',
      'stripe.dev',
    )

    const results = await ctx.runJSON<
      Array<{ left: unknown; right: unknown; reasons: string[] }>
    >('dupes', '--type', 'company', '--format', 'json')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].reasons).toContain('similar name')
  })

  test('catches company abbreviation (Datadog Technologies vs Datadog Tech)', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Datadog Technologies',
      '--website',
      'datadoghq.com',
    )
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Datadog Tech',
      '--website',
      'datadog.io',
    )

    const results = await ctx.runJSON<
      Array<{ left: unknown; right: unknown; reasons: string[] }>
    >('dupes', '--type', 'company', '--format', 'json')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].reasons).toContain('similar name')
  })

  test('catches contact name with middle initial (Sarah Chen vs Sarah A. Chen)', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Sarah Chen',
      '--email',
      'sarah1@example.com',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Sarah A. Chen',
      '--email',
      'sarah2@example.com',
    )

    const results = await ctx.runJSON<
      Array<{ left: unknown; right: unknown; reasons: string[] }>
    >('dupes', '--type', 'contact', '--format', 'json')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].reasons).toContain('similar name')
  })

  test('unrelated company names are not flagged (Salesforce vs Datadog)', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Salesforce',
      '--website',
      'salesforce.com',
    )
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Datadog',
      '--website',
      'datadoghq.com',
    )

    const results = await ctx.runJSON<unknown[]>(
      'dupes',
      '--type',
      'company',
      '--format',
      'json',
    )
    expect(results).toHaveLength(0)
  })

  test('threshold flag filters by similarity score', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Sarah Chen',
      '--email',
      'sarah@stripe.com',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Sarah C',
      '--email',
      'sarah.c@other.com',
    )

    // High threshold should filter out lower-confidence matches
    const high = await ctx.runJSON<unknown[]>(
      'dupes',
      '--type',
      'contact',
      '--threshold',
      '0.9',
      '--format',
      'json',
    )
    const low = await ctx.runJSON<unknown[]>(
      'dupes',
      '--type',
      'contact',
      '--threshold',
      '0.3',
      '--format',
      'json',
    )
    expect(low.length).toBeGreaterThanOrEqual(high.length)
  })

  test('limit flag caps results', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Sarah Chen',
      '--email',
      'sarah1@stripe.com',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Sarah C',
      '--email',
      'sarah2@stripe.com',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Sara Chen',
      '--email',
      'sarah3@stripe.com',
    )

    const results = await ctx.runJSON<unknown[]>(
      'dupes',
      '--type',
      'contact',
      '--limit',
      '1',
      '--format',
      'json',
    )
    expect(results).toHaveLength(1)
  })

  test('dupes with no data returns empty', async () => {
    const ctx = createTestContext()
    const results = await ctx.runJSON<unknown[]>('dupes', '--format', 'json')
    expect(results).toHaveLength(0)
  })

  test('dupes without --type searches both contacts and companies', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Sarah Chen',
      '--email',
      'sarah@stripe.com',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'S. Chen',
      '--email',
      's.chen@gmail.com',
    )
    await ctx.runOK('company', 'add', '--name', 'Ford Motor', '--website', 'ford.com')
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Ford Motors',
      '--website',
      'fordmotors.co',
    )

    const results = await ctx.runJSON<unknown[]>('dupes', '--format', 'json')
    expect(results.length).toBeGreaterThanOrEqual(2)
  })
})
