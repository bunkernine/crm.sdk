import { describe, expect, test } from 'bun:test'

import { createTestContext } from './helpers.ts'

describe('deal add', async () => {
  test('basic add returns prefixed ID', async () => {
    const ctx = createTestContext()
    const out = await ctx.runOK('deal', 'add', '--title', 'Acme Enterprise')
    expect(out.trim()).toStartWith('dl_')
  })

  test('full add stores all fields', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane', '--email', 'jane@acme.com')
    await ctx.runOK('company', 'add', '--name', 'Acme', '--website', 'acme.com')

    const id = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Acme Enterprise',
        '--value',
        '50000',
        '--stage',
        'qualified',
        '--contact',
        'jane@acme.com',
        '--company',
        'acme.com',
        '--expected-close',
        '2026-06-01',
        '--probability',
        '60',
        '--tag',
        'q2',
        '--set',
        'source=outbound',
      )).trim()

    const show = await ctx.runOK('deal', 'show', id)
    expect(show).toContain('Acme Enterprise')
    expect(show).toContain('50000')
    expect(show).toContain('qualified')
    expect(show).toContain('jane@acme.com')
    expect(show).toContain('2026-06-01')
    expect(show).toContain('q2')
  })

  test('supports multiple contacts', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane', '--email', 'jane@acme.com')
    await ctx.runOK('contact', 'add', '--name', 'Bob', '--email', 'bob@acme.com')

    const id = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Multi-Stakeholder Deal',
        '--contact',
        'jane@acme.com',
        '--contact',
        'bob@acme.com',
      )).trim()

    const show = await ctx.runOK('deal', 'show', id)
    expect(show).toContain('jane@acme.com')
    expect(show).toContain('bob@acme.com')
  })

  test('multiple contacts in JSON output', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane', '--email', 'jane@acme.com')
    await ctx.runOK('contact', 'add', '--name', 'Bob', '--email', 'bob@acme.com')

    const id = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Multi Deal',
        '--contact',
        'jane@acme.com',
        '--contact',
        'bob@acme.com',
      )).trim()

    const deal = await ctx.runJSON<{ contacts: Array<{ name: string }> }>(
      'deal',
      'show',
      id,
      '--format',
      'json',
    )
    expect(deal.contacts).toHaveLength(2)
  })

  test('filter deals by any linked contact', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane', '--email', 'jane@acme.com')
    await ctx.runOK('contact', 'add', '--name', 'Bob', '--email', 'bob@acme.com')
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'Deal 1',
      '--contact',
      'jane@acme.com',
      '--contact',
      'bob@acme.com',
    )
    await ctx.runOK('deal', 'add', '--title', 'Deal 2', '--contact', 'bob@acme.com')

    const janeDeals = await ctx.runJSON<unknown[]>(
      'deal',
      'list',
      '--contact',
      'jane@acme.com',
      '--format',
      'json',
    )
    expect(janeDeals).toHaveLength(1)

    const bobDeals = await ctx.runJSON<unknown[]>(
      'deal',
      'list',
      '--contact',
      'bob@acme.com',
      '--format',
      'json',
    )
    expect(bobDeals).toHaveLength(2)
  })

  test('edit deal to add/remove contacts', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane', '--email', 'jane@acme.com')
    await ctx.runOK('contact', 'add', '--name', 'Bob', '--email', 'bob@acme.com')
    await ctx.runOK('contact', 'add', '--name', 'Alice', '--email', 'alice@acme.com')

    const id = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Edit Deal',
        '--contact',
        'jane@acme.com',
      )).trim()
    await ctx.runOK('deal', 'edit', id, '--add-contact', 'bob@acme.com')

    let show = await ctx.runOK('deal', 'show', id)
    expect(show).toContain('jane@acme.com')
    expect(show).toContain('bob@acme.com')

    await ctx.runOK('deal', 'edit', id, '--rm-contact', 'jane@acme.com')
    show = await ctx.runOK('deal', 'show', id)
    expect(show).not.toContain('jane@acme.com')
    expect(show).toContain('bob@acme.com')
  })

  test('fails without --title', async () => {
    const ctx = createTestContext()
    const result = await ctx.runFail('deal', 'add', '--value', '10000')
    expect(result.stderr).toContain('title')
  })

  test('defaults to first pipeline stage', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'New Deal')).trim()
    const show = await ctx.runOK('deal', 'show', id)
    expect(show).toContain('lead')
  })
})

describe('deal list', async () => {
  test('returns all deals', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'Deal A',
      '--value',
      '10000',
      '--stage',
      'lead',
    )
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'Deal B',
      '--value',
      '50000',
      '--stage',
      'qualified',
    )
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'Deal C',
      '--value',
      '20000',
      '--stage',
      'lead',
    )

    const deals = await ctx.runJSON<unknown[]>('deal', 'list', '--format', 'json')
    expect(deals).toHaveLength(3)
  })

  test('filter by stage', async () => {
    const ctx = createTestContext()
    await ctx.runOK('deal', 'add', '--title', 'Deal A', '--stage', 'lead')
    await ctx.runOK('deal', 'add', '--title', 'Deal B', '--stage', 'qualified')

    const deals = await ctx.runJSON<unknown[]>(
      'deal',
      'list',
      '--stage',
      'lead',
      '--format',
      'json',
    )
    expect(deals).toHaveLength(1)
  })

  test('filter by value range', async () => {
    const ctx = createTestContext()
    await ctx.runOK('deal', 'add', '--title', 'Small', '--value', '5000')
    await ctx.runOK('deal', 'add', '--title', 'Medium', '--value', '25000')
    await ctx.runOK('deal', 'add', '--title', 'Large', '--value', '100000')

    const deals = await ctx.runJSON<unknown[]>(
      'deal',
      'list',
      '--min-value',
      '10000',
      '--max-value',
      '50000',
      '--format',
      'json',
    )
    expect(deals).toHaveLength(1)
  })

  test('filter by linked contact', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane', '--email', 'jane@acme.com')
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      "Jane's Deal",
      '--contact',
      'jane@acme.com',
    )
    await ctx.runOK('deal', 'add', '--title', 'Unlinked Deal')

    const deals = await ctx.runJSON<unknown[]>(
      'deal',
      'list',
      '--contact',
      'jane@acme.com',
      '--format',
      'json',
    )
    expect(deals).toHaveLength(1)
  })

  test('sort by value ascending', async () => {
    const ctx = createTestContext()
    await ctx.runOK('deal', 'add', '--title', 'Small', '--value', '5000')
    await ctx.runOK('deal', 'add', '--title', 'Large', '--value', '100000')
    await ctx.runOK('deal', 'add', '--title', 'Medium', '--value', '25000')

    const deals = await ctx.runJSON<Array<{ value: number }>>(
      'deal',
      'list',
      '--sort',
      'value',
      '--format',
      'json',
    )
    expect(deals[0].value).toBeLessThanOrEqual(deals[1].value)
    expect(deals[1].value).toBeLessThanOrEqual(deals[2].value)
  })
})

describe('deal move', async () => {
  test('changes stage', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Moving Deal', '--stage', 'lead')).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'qualified')

    const show = await ctx.runOK('deal', 'show', id)
    expect(show).toContain('qualified')
  })

  test('rejects invalid stage', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Deal')).trim()
    const result = await ctx.runFail('deal', 'move', id, '--stage', 'nonexistent')
    expect(result.stderr).toContain('stage')
  })

  test('records stage history', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'History Deal', '--stage', 'lead')).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'qualified')
    await ctx.runOK('deal', 'move', id, '--stage', 'proposal')

    const show = await ctx.runOK('deal', 'show', id)
    expect(show).toContain('lead')
    expect(show).toContain('qualified')
    expect(show).toContain('proposal')
  })

  test('with note', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Deal')).trim()
    await ctx.runOK(
      'deal',
      'move',
      id,
      '--stage',
      'closed-won',
      '--note',
      'Signed annual contract',
    )

    const show = await ctx.runOK('deal', 'show', id)
    expect(show).toContain('Signed annual contract')
  })

  test('closed-lost with note', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Lost Deal')).trim()
    await ctx.runOK(
      'deal',
      'move',
      id,
      '--stage',
      'closed-lost',
      '--note',
      'Budget cut',
    )

    const show = await ctx.runOK('deal', 'show', id)
    expect(show).toContain('closed-lost')
    expect(show).toContain('Budget cut')
  })

  test('creates stage-change activity with timestamp', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Tracked Deal', '--stage', 'lead')).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'qualified')

    const activities = await ctx.runJSON<
      Array<{ type: string; body: string; created_at: string }>
    >('activity', 'list', '--deal', id, '--format', 'json')
    const stageChange = activities.find((a) => a.type === 'stage-change')
    expect(stageChange).toBeDefined()
    expect(stageChange!.body).toContain('lead')
    expect(stageChange!.body).toContain('qualified')
    expect(stageChange!.created_at).toBeTruthy()
  })

  test('multiple moves create multiple stage-change activities with timestamps', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Multi Move', '--stage', 'lead')).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'qualified')
    await ctx.runOK('deal', 'move', id, '--stage', 'proposal')
    await ctx.runOK('deal', 'move', id, '--stage', 'closed-won', '--note', 'Signed')

    const activities = await ctx.runJSON<
      Array<{ type: string; body: string; created_at: string }>
    >(
      'activity',
      'list',
      '--deal',
      id,
      '--type',
      'stage-change',
      '--format',
      'json',
    )
    expect(activities).toHaveLength(3)
    // Each activity should have a timestamp
    for (const a of activities) {
      expect(a.created_at).toBeTruthy()
    }
  })

  test('stage-change activity includes note when provided', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Noted Deal', '--stage', 'lead')).trim()
    await ctx.runOK(
      'deal',
      'move',
      id,
      '--stage',
      'closed-won',
      '--note',
      'Annual contract signed',
    )

    const activities = await ctx.runJSON<Array<{ type: string; body: string }>>(
      'activity',
      'list',
      '--deal',
      id,
      '--type',
      'stage-change',
      '--format',
      'json',
    )
    expect(activities).toHaveLength(1)
    expect(activities[0].body).toContain('Annual contract signed')
  })

  test('stage history is reconstructed from activities', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'History Deal', '--stage', 'lead')).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'qualified')
    await ctx.runOK('deal', 'move', id, '--stage', 'proposal')

    // Deal show should include stage history with timestamps from activity log
    const deal = await ctx.runJSON<{
      stage_history: Array<{ stage: string; at: string }>
    }>('deal', 'show', id, '--format', 'json')
    expect(deal.stage_history.length).toBeGreaterThanOrEqual(3) // lead (initial) + qualified + proposal
    for (const entry of deal.stage_history) {
      expect(entry.stage).toBeTruthy()
      expect(entry.at).toBeTruthy()
    }
  })

  test('move to same stage is rejected', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Same Stage', '--stage', 'lead')).trim()
    const result = await ctx.runFail('deal', 'move', id, '--stage', 'lead')
    expect(result.stderr).toContain('already')
  })

  test('move nonexistent deal fails', async () => {
    const ctx = createTestContext()
    const result = await ctx.runFail(
      'deal',
      'move',
      'dl_nonexistent',
      '--stage',
      'qualified',
    )
    expect(result.exitCode).not.toBe(0)
  })
})

describe('deal edit', async () => {
  test('update title and value', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Old Title', '--value', '10000')).trim()
    await ctx.runOK('deal', 'edit', id, '--title', 'New Title', '--value', '20000')

    const show = await ctx.runOK('deal', 'show', id)
    expect(show).toContain('New Title')
    expect(show).toContain('20000')
  })

  test('update company', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'OldCo', '--website', 'oldco.com')
    await ctx.runOK('company', 'add', '--name', 'NewCo', '--website', 'newco.com')
    const id = (await ctx.runOK('deal', 'add', '--title', 'Switch Co', '--company', 'oldco.com')).trim()

    await ctx.runOK('deal', 'edit', id, '--company', 'newco.com')

    const deal = await ctx.runJSON<{ company: { id: string; name: string } }>(
      'deal',
      'show',
      id,
      '--format',
      'json',
    )
    expect(deal.company.name).toBe('NewCo')
  })

  test('update expected-close', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Date Deal',
        '--expected-close',
        '2026-06-01',
      )).trim()

    await ctx.runOK('deal', 'edit', id, '--expected-close', '2026-09-15')

    const deal = await ctx.runJSON<{ expected_close: string }>(
      'deal',
      'show',
      id,
      '--format',
      'json',
    )
    expect(deal.expected_close).toBe('2026-09-15')
  })

  test('update probability', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Prob Deal', '--probability', '25')).trim()

    await ctx.runOK('deal', 'edit', id, '--probability', '75')

    const deal = await ctx.runJSON<{ probability: number }>(
      'deal',
      'show',
      id,
      '--format',
      'json',
    )
    expect(deal.probability).toBe(75)
  })

  test('update custom fields via --set and --unset', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'CF Deal', '--set', 'source=inbound')).trim()

    await ctx.runOK(
      'deal',
      'edit',
      id,
      '--set',
      'source=referral',
      '--set',
      'priority=high',
    )

    const deal = await ctx.runJSON<{ custom_fields: Record<string, string> }>(
      'deal',
      'show',
      id,
      '--format',
      'json',
    )
    expect(deal.custom_fields.source).toBe('referral')
    expect(deal.custom_fields.priority).toBe('high')

    await ctx.runOK('deal', 'edit', id, '--unset', 'priority')
    const deal2 = await ctx.runJSON<{ custom_fields: Record<string, string> }>(
      'deal',
      'show',
      id,
      '--format',
      'json',
    )
    expect(deal2.custom_fields.priority).toBeUndefined()
    expect(deal2.custom_fields.source).toBe('referral')
  })

  test('add and remove tags', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Tag Deal', '--tag', 'q2')).trim()

    await ctx.runOK(
      'deal',
      'edit',
      id,
      '--add-tag',
      'enterprise',
      '--add-tag',
      'urgent',
    )

    const deal = await ctx.runJSON<{ tags: string[] }>(
      'deal',
      'show',
      id,
      '--format',
      'json',
    )
    expect(deal.tags).toContain('q2')
    expect(deal.tags).toContain('enterprise')
    expect(deal.tags).toContain('urgent')

    await ctx.runOK('deal', 'edit', id, '--rm-tag', 'q2')
    const deal2 = await ctx.runJSON<{ tags: string[] }>(
      'deal',
      'show',
      id,
      '--format',
      'json',
    )
    expect(deal2.tags).not.toContain('q2')
    expect(deal2.tags).toContain('enterprise')
  })
})

describe('deal edit outputs ID', async () => {
  test('edit prints deal ID', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Out Deal', '--value', '5000')).trim()
    const editOut = (await ctx.runOK('deal', 'edit', id, '--value', '9000')).trim()
    expect(editOut).toBe(id)
  })
})

describe('deal move outputs ID', async () => {
  test('move prints deal ID', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Move Deal', '--stage', 'lead')).trim()
    const moveOut = (await ctx.runOK('deal', 'move', id, '--stage', 'qualified')).trim()
    expect(moveOut).toBe(id)
  })
})

describe('deal rm', async () => {
  test('delete deal', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Delete Me')).trim()
    await ctx.runOK('deal', 'rm', id, '--force')
    await ctx.runFail('deal', 'show', id)
  })
})

describe('pipeline', async () => {
  test('shows pipeline summary', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'A',
      '--value',
      '10000',
      '--stage',
      'lead',
    )
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'B',
      '--value',
      '20000',
      '--stage',
      'lead',
    )
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'C',
      '--value',
      '50000',
      '--stage',
      'qualified',
    )

    const out = await ctx.runOK('pipeline')
    expect(out).toContain('lead')
    expect(out).toContain('qualified')
    expect(out).toContain('Total')
  })

  test('json format', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'A',
      '--value',
      '10000',
      '--stage',
      'lead',
    )

    const pipeline = await ctx.runJSON<
      Array<{ stage: string; count: number; value: number }>
    >('pipeline', '--format', 'json')
    expect(pipeline.length).toBeGreaterThan(0)
    expect(pipeline[0]).toHaveProperty('stage')
    expect(pipeline[0]).toHaveProperty('count')
    expect(pipeline[0]).toHaveProperty('value')
  })
})

describe('deal auto-create', async () => {
  test('add with nonexistent contact auto-creates contact', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'deal',
      'add',
      '--title',
      'New Deal',
      '--contact',
      'nobody@nowhere.com',
    )

    // Contact should have been auto-created
    const contacts = await ctx.runJSON<Array<{ name: string; emails: string[] }>>(
      'contact',
      'list',
      '--format',
      'json',
    )
    expect(contacts).toHaveLength(1)
    expect(contacts[0].name).toBe('nobody')
    expect(contacts[0].emails).toContain('nobody@nowhere.com')
  })

  test('add with nonexistent company reference fails', async () => {
    const ctx = createTestContext()
    const result = await ctx.runFail(
      'deal',
      'add',
      '--title',
      'Bad Deal',
      '--company',
      'no-such-company.com',
    )
    expect(result.stderr).not.toBe('')
  })

  test('show nonexistent deal fails', async () => {
    const ctx = createTestContext()
    await ctx.runFail('deal', 'show', 'dl_nonexistent')
  })

  test('edit nonexistent deal fails', async () => {
    const ctx = createTestContext()
    await ctx.runFail('deal', 'edit', 'dl_nonexistent', '--title', 'New Title')
  })

  test('rm nonexistent deal fails', async () => {
    const ctx = createTestContext()
    await ctx.runFail('deal', 'rm', 'dl_nonexistent', '--force')
  })

  test('invalid probability rejects', async () => {
    const ctx = createTestContext()
    const result = await ctx.runFail(
      'deal',
      'add',
      '--title',
      'Bad Prob',
      '--probability',
      '150',
    )
    expect(result.stderr).toContain('probability')
  })

  test('negative value rejects', async () => {
    const ctx = createTestContext()
    const result = await ctx.runFail(
      'deal',
      'add',
      '--title',
      'Negative',
      '--value',
      '-1000',
    )
    expect(result.stderr).toContain('value')
  })

  test('invalid expected-close date rejects', async () => {
    const ctx = createTestContext()
    const result = await ctx.runFail(
      'deal',
      'add',
      '--title',
      'Bad Date',
      '--expected-close',
      'not-a-date',
    )
    expect(result.stderr).not.toBe('')
  })

  test('delete contact sets deal contacts to null', async () => {
    const ctx = createTestContext()
    const contactId = (await ctx.runOK('contact', 'add', '--name', 'Jane', '--email', 'jane@acme.com')).trim()
    const dealId = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Orphan Deal',
        '--contact',
        'jane@acme.com',
      )).trim()

    await ctx.runOK('contact', 'rm', contactId, '--force')

    // Deal should still exist but contact reference should be cleared
    const deal = await ctx.runJSON<{ contacts: unknown[] }>(
      'deal',
      'show',
      dealId,
      '--format',
      'json',
    )
    expect(deal.contacts).toHaveLength(0)
  })

  test('delete company sets deal company to null', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme', '--website', 'acme.com')
    const dealId = (await ctx.runOK('deal', 'add', '--title', 'Orphan Deal', '--company', 'acme.com')).trim()

    const companies = await ctx.runJSON<Array<{ id: string }>>(
      'company',
      'list',
      '--format',
      'json',
    )
    await ctx.runOK('company', 'rm', companies[0].id, '--force')

    const deal = await ctx.runJSON<{ company: unknown }>(
      'deal',
      'show',
      dealId,
      '--format',
      'json',
    )
    expect(deal.company).toBeNull()
  })
})

describe('deal show', async () => {
  test('includes linked company', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme', '--website', 'acme.com')
    const id = (await ctx.runOK('deal', 'add', '--title', 'Acme Deal', '--company', 'acme.com')).trim()

    const coShow = await ctx.runOK('company', 'show', 'acme.com')
    expect(coShow).toContain('Acme Deal')

    const dlShow = await ctx.runOK('deal', 'show', id)
    expect(dlShow).toContain('Acme')
  })
})

describe('deal move notes', async () => {
  test('note appears in stage-change activity body', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'D', '--stage', 'lead')).trim()
    await ctx.runOK(
      'deal',
      'move',
      id,
      '--stage',
      'closed-lost',
      '--note',
      'Too slow',
    )

    const activities = await ctx.runJSON<Array<{ type: string; body: string }>>(
      'activity',
      'list',
      '--deal',
      id,
      '--format',
      'json',
    )
    const sc = activities.find((a) => a.type === 'stage-change')
    expect(sc).toBeDefined()
    expect(sc!.body).toContain('Too slow')
    expect(sc!.body).toContain('closed-lost')
  })

  test('stage-change body contains from and to stages', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'D', '--stage', 'lead')).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'qualified')

    const activities = await ctx.runJSON<Array<{ type: string; body: string }>>(
      'activity',
      'list',
      '--deal',
      id,
      '--format',
      'json',
    )
    const sc = activities.find((a) => a.type === 'stage-change')
    expect(sc!.body).toMatch(/from lead to qualified/)
  })

  test('backward stage move is allowed', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Regress', '--stage', 'qualified')).trim()
    await ctx.runOK('deal', 'move', id, '--stage', 'lead')

    const data = await ctx.runJSON<{ stage: string }>(
      'deal',
      'show',
      id,
      '--format',
      'json',
    )
    expect(data.stage).toBe('lead')
  })
})

describe('deal probability edge cases', async () => {
  test('probability 0 is allowed', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Zero Prob',
        '--value',
        '1000',
        '--probability',
        '0',
      )).trim()
    const data = await ctx.runJSON<{ probability: number }>(
      'deal',
      'show',
      id,
      '--format',
      'json',
    )
    expect(data.probability).toBe(0)
  })

  test('probability 100 is allowed', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK(
        'deal',
        'add',
        '--title',
        'Sure Thing',
        '--value',
        '5000',
        '--probability',
        '100',
      )).trim()
    const data = await ctx.runJSON<{ probability: number }>(
      'deal',
      'show',
      id,
      '--format',
      'json',
    )
    expect(data.probability).toBe(100)
  })
})

describe('deal list --reverse', async () => {
  test('reverses listing order', async () => {
    const ctx = createTestContext()
    await ctx.runOK('deal', 'add', '--title', 'Alpha', '--value', '100')
    await ctx.runOK('deal', 'add', '--title', 'Beta', '--value', '200')

    const normal = await ctx.runJSON<{ title: string }[]>(
      'deal',
      'list',
      '--sort',
      'title',
      '--format',
      'json',
    )
    const reversed = await ctx.runJSON<{ title: string }[]>(
      'deal',
      'list',
      '--sort',
      'title',
      '--reverse',
      '--format',
      'json',
    )
    expect(normal[0].title).toBe('Alpha')
    expect(reversed[0].title).toBe('Beta')
  })
})

describe('deal list --offset', async () => {
  test('skips first N results', async () => {
    const ctx = createTestContext()
    await ctx.runOK('deal', 'add', '--title', 'A')
    await ctx.runOK('deal', 'add', '--title', 'B')
    await ctx.runOK('deal', 'add', '--title', 'C')

    const data = await ctx.runJSON<unknown[]>(
      'deal',
      'list',
      '--sort',
      'title',
      '--offset',
      '2',
      '--format',
      'json',
    )
    expect(data).toHaveLength(1)
  })
})

describe('deal rm --force', async () => {
  test('rm without --force fails in non-interactive mode', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'Test')).trim()
    const result = await ctx.runFail('deal', 'rm', id)
    expect(result.stderr).toContain('--force')
  })
})

describe('deal move --note on any stage', async () => {
  test('note is stored for any stage move', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('deal', 'add', '--title', 'D', '--stage', 'lead')).trim()
    await ctx.runOK(
      'deal',
      'move',
      id,
      '--stage',
      'qualified',
      '--note',
      'Strong fit',
    )

    const activities = await ctx.runJSON<{ body: string }[]>(
      'activity',
      'list',
      '--deal',
      id,
      '--format',
      'json',
    )
    expect(activities.some((a) => a.body.includes('Strong fit'))).toBe(true)
  })
})
