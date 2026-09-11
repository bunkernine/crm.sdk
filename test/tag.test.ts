import { describe, expect, test } from 'bun:test'

import { createTestContext } from './helpers.ts'

describe('tag', async () => {
  test('tag contact by ID', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('contact', 'add', '--name', 'Jane', '--email', 'jane@acme.com')).trim()
    await ctx.runOK('tag', id, 'hot-lead', 'enterprise')

    const show = await ctx.runOK('contact', 'show', id)
    expect(show).toContain('hot-lead')
    expect(show).toContain('enterprise')
  })

  test('tag company by website', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme', '--website', 'acme.com')
    await ctx.runOK('tag', 'acme.com', 'target-account')

    const show = await ctx.runOK('company', 'show', 'acme.com')
    expect(show).toContain('target-account')
  })

  test('tag deal', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Big Deal')).trim()
    await ctx.runOK('tag', id, 'q2', 'priority')

    const show = await ctx.runOK('deal', 'show', id)
    expect(show).toContain('q2')
    expect(show).toContain('priority')
  })

  test('tag contact by email', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane', '--email', 'jane@acme.com')
    await ctx.runOK('tag', 'jane@acme.com', 'vip')

    const show = await ctx.runOK('contact', 'show', 'jane@acme.com')
    expect(show).toContain('vip')
  })

  test('tagging is idempotent', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('contact', 'add', '--name', 'Jane', '--tag', 'vip')).trim()
    await ctx.runOK('tag', id, 'vip')

    const contacts = await ctx.runJSON<unknown[]>(
      'contact',
      'list',
      '--tag',
      'vip',
      '--format',
      'json',
    )
    expect(contacts).toHaveLength(1)
  })
})

describe('untag', async () => {
  test('removes tag', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK(
        'contact',
        'add',
        '--name',
        'Jane',
        '--tag',
        'vip',
        '--tag',
        'cold',
      )).trim()
    await ctx.runOK('untag', id, 'cold')

    const show = await ctx.runOK('contact', 'show', id)
    expect(show).toContain('vip')
    expect(show).not.toContain('cold')
  })
})

describe('tag list', async () => {
  test('shows all tags with counts', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Alice',
      '--tag',
      'vip',
      '--tag',
      'hot-lead',
    )
    await ctx.runOK('contact', 'add', '--name', 'Bob', '--tag', 'vip')
    await ctx.runOK('company', 'add', '--name', 'Acme', '--tag', 'enterprise')

    const out = await ctx.runOK('tag', 'list')
    expect(out).toContain('vip')
    expect(out).toContain('hot-lead')
    expect(out).toContain('enterprise')
  })

  test('filter by entity type', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Alice', '--tag', 'person-tag')
    await ctx.runOK('company', 'add', '--name', 'Acme', '--tag', 'company-tag')

    const out = await ctx.runOK('tag', 'list', '--type', 'contact')
    expect(out).toContain('person-tag')
    expect(out).not.toContain('company-tag')
  })
})
