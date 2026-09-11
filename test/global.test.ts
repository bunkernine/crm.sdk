import { describe, expect, test } from 'bun:test'

import { createTestContext } from './helpers.ts'

describe('sdk client', async () => {
  test('unknown command fails', async () => {
    const ctx = createTestContext()
    const result = await ctx.runFail('notacommand')
    expect(result.stderr).not.toBe('')
  })

  test('createCrm auto-creates the crm schema', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('contact', 'add', '--name', 'Jane')).trim()
    expect(id).toStartWith('ct_')
  })
})
