import { describe, expect, test } from 'bun:test'

import type { HookName } from '../src/types.ts'
import { createTestContext } from './helpers.ts'

function abortHooks(hookName: HookName) {
  return createTestContext({
    hooks: {
      [hookName]: () => false,
    },
  })
}

function captureHooks(hookName: HookName) {
  let last = ''
  const ctx = createTestContext({
    hooks: {
      [hookName]: (data: Record<string, unknown>) => {
        last = JSON.stringify(data)
        return true
      },
    },
  })
  return {
    ctx,
    payload: () => last,
  }
}

describe('hooks', async () => {
  test('pre-contact-add hook can abort creation', async () => {
    const ctx = abortHooks('pre-contact-add')
    await ctx.runFail('contact', 'add', '--name', 'Jane')
  })

  test('post-contact-add hook receives entity JSON', async () => {
    const { ctx, payload } = captureHooks('post-contact-add')
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Jane',
      '--email',
      'jane@acme.com',
    )
    expect(payload()).toContain('Jane')
    expect(payload()).toContain('jane@acme.com')
  })

  test('pre-contact-edit hook can abort edit', async () => {
    const ctx = abortHooks('pre-contact-edit')
    const id = (await ctx.runOK('contact', 'add', '--name', 'Jane')).trim()
    await ctx.runFail('contact', 'edit', id, '--name', 'Janet')
    const out = await ctx.runOK('--format', 'json', 'contact', 'show', id)
    expect(out).toContain('Jane')
    expect(out).not.toContain('Janet')
  })

  test('post-contact-edit hook receives updated entity', async () => {
    const { ctx, payload } = captureHooks('post-contact-edit')
    const id = (await ctx.runOK('contact', 'add', '--name', 'Jane')).trim()
    await ctx.runOK('contact', 'edit', id, '--name', 'Janet')
    expect(payload()).toContain('Janet')
  })

  test('pre-contact-rm hook can abort deletion', async () => {
    const ctx = abortHooks('pre-contact-rm')
    const id = (await ctx.runOK('contact', 'add', '--name', 'Jane')).trim()
    await ctx.runFail('contact', 'rm', id, '--force')
    await ctx.runOK('contact', 'show', id)
  })

  test('post-contact-rm hook receives deleted entity', async () => {
    const { ctx, payload } = captureHooks('post-contact-rm')
    const id = (await ctx.runOK('contact', 'add', '--name', 'Jane')).trim()
    await ctx.runOK('contact', 'rm', id, '--force')
    expect(payload()).toContain(id)
    expect(payload()).toContain('Jane')
  })

  test('pre-company-add hook can abort creation', async () => {
    const ctx = abortHooks('pre-company-add')
    await ctx.runFail('company', 'add', '--name', 'Acme Corp')
  })

  test('post-company-add hook receives entity JSON', async () => {
    const { ctx, payload } = captureHooks('post-company-add')
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Acme Corp',
      '--website',
      'acme.com',
    )
    expect(payload()).toContain('Acme Corp')
    expect(payload()).toContain('acme.com')
  })

  test('pre-company-edit hook can abort edit', async () => {
    const ctx = abortHooks('pre-company-edit')
    const id = (await ctx.runOK('company', 'add', '--name', 'Acme Corp')).trim()
    await ctx.runFail('company', 'edit', id, '--name', 'Acme Inc')
    const out = await ctx.runOK('--format', 'json', 'company', 'show', id)
    expect(out).toContain('Acme Corp')
    expect(out).not.toContain('Acme Inc')
  })

  test('post-company-edit hook receives updated entity', async () => {
    const { ctx, payload } = captureHooks('post-company-edit')
    const id = (await ctx.runOK('company', 'add', '--name', 'Acme Corp')).trim()
    await ctx.runOK('company', 'edit', id, '--name', 'Acme Inc')
    expect(payload()).toContain('Acme Inc')
  })

  test('pre-company-rm hook can abort deletion', async () => {
    const ctx = abortHooks('pre-company-rm')
    const id = (await ctx.runOK('company', 'add', '--name', 'Acme Corp')).trim()
    await ctx.runFail('company', 'rm', id, '--force')
    await ctx.runOK('company', 'show', id)
  })

  test('post-company-rm hook receives deleted entity', async () => {
    const { ctx, payload } = captureHooks('post-company-rm')
    const id = (await ctx.runOK('company', 'add', '--name', 'Acme Corp')).trim()
    await ctx.runOK('company', 'rm', id, '--force')
    expect(payload()).toContain(id)
    expect(payload()).toContain('Acme Corp')
  })

  test('pre-deal-add hook can abort creation', async () => {
    const ctx = abortHooks('pre-deal-add')
    await ctx.runFail('deal', 'add', '--title', 'Big Deal')
  })

  test('post-deal-add hook receives entity JSON', async () => {
    const { ctx, payload } = captureHooks('post-deal-add')
    await ctx.runOK('deal', 'add', '--title', 'Big Deal', '--value', '50000')
    expect(payload()).toContain('Big Deal')
    expect(payload()).toContain('50000')
  })

  test('pre-deal-edit hook can abort edit', async () => {
    const ctx = abortHooks('pre-deal-edit')
    const id = (await ctx.runOK('deal', 'add', '--title', 'Big Deal')).trim()
    await ctx.runFail('deal', 'edit', id, '--title', 'Huge Deal')
    const out = await ctx.runOK('--format', 'json', 'deal', 'show', id)
    expect(out).toContain('Big Deal')
    expect(out).not.toContain('Huge Deal')
  })

  test('post-deal-edit hook receives updated entity', async () => {
    const { ctx, payload } = captureHooks('post-deal-edit')
    const id = (await ctx.runOK('deal', 'add', '--title', 'Big Deal')).trim()
    await ctx.runOK('deal', 'edit', id, '--title', 'Huge Deal')
    expect(payload()).toContain('Huge Deal')
  })

  test('pre-deal-rm hook can abort deletion', async () => {
    const ctx = abortHooks('pre-deal-rm')
    const id = (await ctx.runOK('deal', 'add', '--title', 'Big Deal')).trim()
    await ctx.runFail('deal', 'rm', id, '--force')
    await ctx.runOK('deal', 'show', id)
  })

  test('post-deal-rm hook receives deleted entity', async () => {
    const { ctx, payload } = captureHooks('post-deal-rm')
    const id = (await ctx.runOK('deal', 'add', '--title', 'Big Deal')).trim()
    await ctx.runOK('deal', 'rm', id, '--force')
    expect(payload()).toContain(id)
    expect(payload()).toContain('Big Deal')
  })

  test('pre-deal-stage-change hook can abort stage move', async () => {
    const ctx = abortHooks('pre-deal-stage-change')
    const id = (
      await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Hook Deal',
        '--stage',
        'lead',
      )
    ).trim()
    await ctx.runFail('deal', 'move', id, '--stage', 'qualified')
    const out = await ctx.runOK('--format', 'json', 'deal', 'show', id)
    expect(out).toContain('"lead"')
  })

  test('post-deal-stage-change hook fires on move', async () => {
    const { ctx, payload } = captureHooks('post-deal-stage-change')
    const id = (
      await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Hook Deal',
        '--stage',
        'lead',
      )
    ).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'qualified')
    expect(payload()).toContain('qualified')
  })

  test('pre-activity-add hook can abort logging', async () => {
    const ctx = abortHooks('pre-activity-add')
    const id = (await ctx.runOK('contact', 'add', '--name', 'Jane')).trim()
    await ctx.runFail('log', 'note', 'Some note', '--contact', id)
  })

  test('post-activity-add hook receives activity data', async () => {
    const { ctx, payload } = captureHooks('post-activity-add')
    const id = (await ctx.runOK('contact', 'add', '--name', 'Jane')).trim()
    await ctx.runOK('log', 'note', 'Great call today', '--contact', id)
    expect(payload()).toContain('note')
    expect(payload()).toContain('Great call today')
  })

  test('no hooks configured still works', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane')
  })
})
