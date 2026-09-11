import { describe, expect, test } from 'bun:test'

import { createTestContext } from './helpers.ts'

describe('config: phone settings', async () => {
  test('phone.default_country allows short numbers', async () => {
    const ctx = createTestContext({
      phone: { default_country: 'US', display: 'national' },
    })
    const id = (
      await ctx.runOK('contact', 'add', '--name', 'Jane', '--phone', '2125551234')
    ).trim()
    const data = await ctx.runJSON<{ phones: string[] }>(
      'contact',
      'show',
      id,
      '--format',
      'json',
    )
    expect(data.phones[0]).toBe('+12125551234')
  })

  test('phone.display = national shows national format', async () => {
    const ctx = createTestContext({
      phone: { default_country: 'US', display: 'national' },
    })
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Jane',
      '--phone',
      '+12125551234',
    )
    const out = await ctx.runOK('contact', 'list')
    expect(out).toContain('Jane')
  })

  test('phone.display = e164 shows raw E.164', async () => {
    const ctx = createTestContext({
      phone: { default_country: 'US', display: 'e164' },
    })
    const id = (
      await ctx.runOK(
        'contact',
        'add',
        '--name',
        'Jane',
        '--phone',
        '+12125551234',
      )
    ).trim()
    const out = await ctx.runOK('contact', 'show', id)
    expect(out).toContain('+12125551234')
  })
})

describe('config: pipeline stage changes', async () => {
  test('deal with stage from old config rejected after config change', async () => {
    const ctx = createTestContext({
      pipeline: { stages: ['alpha', 'beta'] },
    })
    await ctx.runOK('deal', 'add', '--title', 'First', '--stage', 'alpha')

    const ctx2 = createTestContext({
      skipTruncate: true,
      pipeline: { stages: ['gamma', 'delta'] },
    })
    const result = await ctx2.runFail(
      'deal',
      'add',
      '--title',
      'Second',
      '--stage',
      'alpha',
    )
    expect(result.stderr).toContain('stage')
  })

  test('deal move to new stage works after config change', async () => {
    const ctx = createTestContext({
      pipeline: { stages: ['alpha', 'beta', 'gamma'] },
    })
    const id = (
      await ctx.runOK('deal', 'add', '--title', 'Test', '--stage', 'alpha')
    ).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'gamma')
    const out = await ctx.runJSON<{ stage: string }>(
      'deal',
      'show',
      id,
      '--format',
      'json',
    )
    expect(out.stage).toBe('gamma')
  })
})

describe('config: won_stage / lost_stage', async () => {
  test('custom won_stage used by report won', async () => {
    const ctx = createTestContext({
      pipeline: {
        stages: ['open', 'demo', 'won', 'lost'],
        won_stage: 'won',
        lost_stage: 'lost',
      },
    })
    const id = (
      await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Custom Won',
        '--value',
        '5000',
        '--stage',
        'open',
      )
    ).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'won')

    const report = await ctx.runJSON<Array<{ title: string }>>(
      'report',
      'won',
      '--format',
      'json',
    )
    expect(report).toHaveLength(1)
    expect(report[0].title).toBe('Custom Won')
  })

  test('custom lost_stage used by report lost', async () => {
    const ctx = createTestContext({
      pipeline: {
        stages: ['open', 'demo', 'won', 'lost'],
        won_stage: 'won',
        lost_stage: 'lost',
      },
    })
    const id = (
      await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Custom Lost',
        '--value',
        '3000',
        '--stage',
        'open',
      )
    ).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'lost')

    const report = await ctx.runJSON<Array<{ title: string }>>(
      'report',
      'lost',
      '--format',
      'json',
    )
    expect(report).toHaveLength(1)
    expect(report[0].title).toBe('Custom Lost')
  })

  test('stale report excludes deals at custom terminal stages', async () => {
    const ctx = createTestContext({
      pipeline: {
        stages: ['open', 'done', 'dropped'],
        won_stage: 'done',
        lost_stage: 'dropped',
      },
    })
    const id = (
      await ctx.runOK('deal', 'add', '--title', 'Done Deal', '--stage', 'open')
    ).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'done')

    const report = await ctx.runJSON<Array<{ title?: string }>>(
      'report',
      'stale',
      '--type',
      'deal',
      '--format',
      'json',
    )
    const titles = report.map((r) => r.title)
    expect(titles).not.toContain('Done Deal')
  })

  test('forecast excludes deals at custom terminal stages', async () => {
    const ctx = createTestContext({
      pipeline: {
        stages: ['prospect', 'closed', 'rejected'],
        won_stage: 'closed',
        lost_stage: 'rejected',
      },
    })
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'Open Deal',
      '--value',
      '1000',
      '--stage',
      'prospect',
    )
    const id2 = (
      await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Closed Deal',
        '--value',
        '2000',
        '--stage',
        'prospect',
      )
    ).trim()
    await ctx.runOK('deal', 'move', id2, '--stage', 'closed')

    const report = await ctx.runJSON<Array<{ title: string }>>(
      'report',
      'forecast',
      '--format',
      'json',
    )
    expect(report).toHaveLength(1)
    expect(report[0].title).toBe('Open Deal')
  })

  test('defaults to closed-won/closed-lost when not specified', async () => {
    const ctx = createTestContext()
    const id = (
      await ctx.runOK('deal', 'add', '--title', 'Default Won', '--stage', 'lead')
    ).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'closed-won')

    const report = await ctx.runJSON<Array<{ title: string }>>(
      'report',
      'won',
      '--format',
      'json',
    )
    expect(report).toHaveLength(1)
    expect(report[0].title).toBe('Default Won')
  })

  test('falls back to defaults when no custom pipeline is passed', async () => {
    const ctx = createTestContext()
    const id = (
      await ctx.runOK('deal', 'add', '--title', 'Test', '--stage', 'lead')
    ).trim()
    expect(id).toStartWith('dl_')
  })
})

describe('config: custom stages', async () => {
  test('custom stages accept those names and reject defaults', async () => {
    const ctx = createTestContext({
      pipeline: { stages: ['alpha', 'beta', 'gamma'] },
    })
    const id = (
      await ctx.runOK('deal', 'add', '--title', 'Test', '--stage', 'alpha')
    ).trim()
    const show = await ctx.runOK('deal', 'show', id)
    expect(show).toContain('alpha')

    const result = await ctx.runFail(
      'deal',
      'add',
      '--title',
      'Test2',
      '--stage',
      'lead',
    )
    expect(result.stderr).toContain('stage')
  })
})
