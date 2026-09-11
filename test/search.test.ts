import { describe, expect, test } from 'bun:test'

import { createTestContext } from './helpers.ts'

describe('search (keyword FTS5)', async () => {
  test('search by name', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Jane Doe',
      '--email',
      'jane@acme.com',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'John Smith',
      '--email',
      'john@globex.com',
    )

    const out = await ctx.runOK('search', 'Jane')
    expect(out).toContain('Jane Doe')
    expect(out).not.toContain('John Smith')
  })

  test('search by email host', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Jane Doe',
      '--email',
      'jane@acme.com',
    )

    const out = await ctx.runOK('search', 'acme.com')
    expect(out).toContain('Jane Doe')
  })

  test('search across entity types', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane Doe', '--company', 'Acme')
    await ctx.runOK('company', 'add', '--name', 'Acme Corp', '--website', 'acme.com')
    await ctx.runOK('deal', 'add', '--title', 'Acme Enterprise Deal')

    const out = await ctx.runOK('search', 'Acme')
    expect(out).toContain('Jane Doe')
    expect(out).toContain('Acme Corp')
    expect(out).toContain('Acme Enterprise Deal')
  })

  test('filter by type', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Acme Person')
    await ctx.runOK('company', 'add', '--name', 'Acme Corp')

    const out = await ctx.runOK('search', 'Acme', '--type', 'contact')
    expect(out).toContain('Acme Person')
    expect(out).not.toContain('Acme Corp')
  })

  test('search in activity notes', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane', '--email', 'jane@acme.com')
    await ctx.runOK(
      'log',
      'note',
      'Discussed the enterprise pricing tier',
      '--contact',
      'jane@acme.com',
    )

    const out = await ctx.runOK('search', 'enterprise pricing')
    expect(out).toContain('enterprise pricing')
  })

  test('no results returns empty array in json', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane Doe')

    const results = await ctx.runJSON<unknown[]>(
      'search',
      'zzzznonexistent',
      '--format',
      'json',
    )
    expect(results).toHaveLength(0)
  })

  test('json format includes type field', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Jane Doe',
      '--email',
      'jane@acme.com',
    )

    const results = await ctx.runJSON<Array<{ type: string }>>(
      'search',
      'Jane',
      '--format',
      'json',
    )
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('contact')
  })
})

describe('find (semantic search)', async () => {
  test('natural language query returns relevant results', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Alice Chen',
      '--company',
      'FinTech London Ltd',
      '--set',
      'title=CTO',
      '--set',
      'location=London',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Bob Wilson',
      '--company',
      'Acme US',
      '--set',
      'title=Engineer',
    )

    const results = await ctx.runJSON<Array<{ name: string }>>(
      'find',
      'fintech CTO from London',
      '--format',
      'json',
    )
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('Alice Chen')
  })

  test('limit results', async () => {
    const ctx = createTestContext()
    for (let i = 0; i < 5; i++) {
      await ctx.runOK(
        'contact',
        'add',
        '--name',
        `Person ${String.fromCharCode(65 + i)}`,
      )
    }

    const results = await ctx.runJSON<unknown[]>(
      'find',
      'person',
      '--limit',
      '2',
      '--format',
      'json',
    )
    expect(results.length).toBeLessThanOrEqual(2)
  })

  test('filter by type', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Acme Alice')
    await ctx.runOK('company', 'add', '--name', 'Acme Corp')

    const results = await ctx.runJSON<Array<{ type: string }>>(
      'find',
      'acme',
      '--type',
      'contact',
      '--format',
      'json',
    )
    for (const r of results) {
      expect(r.type).toBe('contact')
    }
  })

  test('threshold filters low-scoring results', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Alice Chen',
      '--company',
      'FinTech London Ltd',
      '--set',
      'title=CTO',
    )
    await ctx.runOK('contact', 'add', '--name', 'Bob Wilson', '--company', 'Acme')

    const highThreshold = await ctx.runJSON<unknown[]>(
      'find',
      'fintech CTO London',
      '--threshold',
      '0.9',
      '--format',
      'json',
    )
    const lowThreshold = await ctx.runJSON<unknown[]>(
      'find',
      'fintech CTO London',
      '--threshold',
      '0.1',
      '--format',
      'json',
    )
    expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length)
  })
})

describe('index', async () => {
  test('status shows index info', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane')

    const out = await ctx.runOK('index', 'status')
    expect(out).toContain('contacts')
  })

  test('rebuild then search still works', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane')
    await ctx.runOK('index', 'rebuild')

    const out = await ctx.runOK('search', 'Jane')
    expect(out).toContain('Jane')
  })

  test('rebuild preserves company names in contact search', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme Corp')
    await ctx.runOK('contact', 'add', '--name', 'Jane Doe', '--company', 'Acme Corp')

    // Before rebuild, search by company name finds the contact
    const before = await ctx.runJSON<Array<{ type: string; name?: string }>>(
      'search',
      'Acme',
      '--format',
      'json',
    )
    const contactBefore = before.filter((r) => r.type === 'contact')
    expect(contactBefore).toHaveLength(1)
    expect(contactBefore[0].name).toBe('Jane Doe')

    // After rebuild, company name should still be in the contact's search index
    await ctx.runOK('index', 'rebuild')
    const after = await ctx.runJSON<Array<{ type: string; name?: string }>>(
      'search',
      'Acme',
      '--format',
      'json',
    )
    const contactAfter = after.filter((r) => r.type === 'contact')
    expect(contactAfter).toHaveLength(1)
    expect(contactAfter[0].name).toBe('Jane Doe')
  })
})

describe('search edge cases', async () => {
  test('search is case-insensitive', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane Doe')

    const results = await ctx.runJSON<unknown[]>('search', 'jane', '--format', 'json')
    expect(results).toHaveLength(1)
  })

  test('search finds companies', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme Corp')

    const results = await ctx.runJSON<Array<{ type: string }>>(
      'search',
      'Acme',
      '--format',
      'json',
    )
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some((r) => r.type === 'company')).toBe(true)
  })

  test('search finds deals', async () => {
    const ctx = createTestContext()
    await ctx.runOK('deal', 'add', '--title', 'Enterprise License')

    const results = await ctx.runJSON<Array<{ type: string }>>(
      'search',
      'Enterprise',
      '--format',
      'json',
    )
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some((r) => r.type === 'deal')).toBe(true)
  })

  test('search with special characters does not crash', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane')

    // These should not throw — they should either return results or empty
    const r1 = await ctx.runJSON<unknown[]>(
      'search',
      'test@email.com',
      '--format',
      'json',
    )
    expect(Array.isArray(r1)).toBe(true)

    const r2 = await ctx.runJSON<unknown[]>(
      'search',
      'hello world',
      '--format',
      'json',
    )
    expect(Array.isArray(r2)).toBe(true)
  })
})
