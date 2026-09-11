import { describe, expect, test } from 'bun:test'

import { createTestContext } from './helpers.ts'

describe('company add', async () => {
  test('basic add returns prefixed ID', async () => {
    const ctx = createTestContext()
    const out = await ctx.runOK('company', 'add', '--name', 'Acme Corp')
    expect(out.trim()).toStartWith('co_')
  })

  test('full add stores all fields', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK(
        'company',
        'add',
        '--name',
        'Acme Corp',
        '--website',
        'acme.com/labs',
        '--tag',
        'enterprise',
        '--set',
        'industry=SaaS',
        '--set',
        'size=50-200',
        '--set',
        'founded=2020',
      )).trim()

    const show = await ctx.runOK('company', 'show', id)
    expect(show).toContain('Acme Corp')
    expect(show).toContain('acme.com')
    expect(show).toContain('SaaS')
    expect(show).toContain('50-200')
    expect(show).toContain('enterprise')
    expect(show).toContain('2020')
  })

  test('fails without --name', async () => {
    const ctx = createTestContext()
    const result = await ctx.runFail('company', 'add', '--website', 'acme.com')
    expect(result.stderr).toContain('name')
  })

  test('multiple websites on create', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK(
        'company',
        'add',
        '--name',
        'Acme Corp',
        '--website',
        'acme.com',
        '--website',
        'acme.com/ventures',
      )).trim()

    const show = await ctx.runOK('company', 'show', id)
    expect(show).toContain('acme.com')
    expect(show).toContain('acme.com/ventures')
  })

  test('multiple phones on create', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK(
        'company',
        'add',
        '--name',
        'Acme Corp',
        '--phone',
        '+1-212-555-1234',
        '--phone',
        '+44-20-7946-0958',
      )).trim()

    const show = await ctx.runOK('company', 'show', id)
    expect(show).toContain('(212) 555-1234')
    expect(show).toContain('+44 20 7946 0958')
  })

  test('lookup by any website when company has multiple', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Acme Corp',
      '--website',
      'acme.com',
      '--website',
      'acme.com/ventures',
    )

    const show1 = await ctx.runOK('company', 'show', 'acme.com')
    const show2 = await ctx.runOK('company', 'show', 'acme.com/ventures')
    expect(show1).toContain('Acme Corp')
    expect(show2).toContain('Acme Corp')
  })
})

describe('company show', async () => {
  test('by website', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme Corp', '--website', 'acme.com')
    const out = await ctx.runOK('company', 'show', 'acme.com')
    expect(out).toContain('Acme Corp')
  })

  test('by phone', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Acme Corp',
      '--phone',
      '+1-212-555-1234',
    )
    const out = await ctx.runOK('company', 'show', '+12125551234')
    expect(out).toContain('Acme Corp')
  })

  test('company with phone but no website is lookupable by phone', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Phone Only Corp',
      '--phone',
      '+44-20-7946-0958',
    )
    const out = await ctx.runOK('company', 'show', '+442079460958')
    expect(out).toContain('Phone Only Corp')
  })

  test('shows linked contacts', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme Corp', '--website', 'acme.com')
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'Jane Doe',
      '--email',
      'jane@acme.com',
      '--company',
      'Acme Corp',
    )
    await ctx.runOK(
      'contact',
      'add',
      '--name',
      'John Doe',
      '--email',
      'john@acme.com',
      '--company',
      'Acme Corp',
    )

    const show = await ctx.runOK('company', 'show', 'acme.com')
    expect(show).toContain('Jane Doe')
    expect(show).toContain('John Doe')
  })
})

describe('company list', async () => {
  test('returns all companies', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme Corp', '--set', 'industry=SaaS')
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Globex',
      '--set',
      'industry=Manufacturing',
    )
    await ctx.runOK('company', 'add', '--name', 'Initech', '--set', 'industry=SaaS')

    const companies = await ctx.runJSON<unknown[]>(
      'company',
      'list',
      '--format',
      'json',
    )
    expect(companies).toHaveLength(3)
  })

  test('filter by tag', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme Corp', '--tag', 'enterprise')
    await ctx.runOK('company', 'add', '--name', 'Small Co')

    const companies = await ctx.runJSON<unknown[]>(
      'company',
      'list',
      '--tag',
      'enterprise',
      '--format',
      'json',
    )
    expect(companies).toHaveLength(1)
  })
})

describe('company edit', async () => {
  test('update fields', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('company', 'add', '--name', 'Acme Corp')).trim()
    await ctx.runOK(
      'company',
      'edit',
      id,
      '--name',
      'Acme Inc',
      '--set',
      'industry=Tech',
    )

    const show = await ctx.runOK('company', 'show', id)
    expect(show).toContain('Acme Inc')
    expect(show).toContain('Tech')
  })

  test('edit by website', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme Corp', '--website', 'acme.com')
    await ctx.runOK('company', 'edit', 'acme.com', '--set', 'industry=Fintech')

    const show = await ctx.runOK('company', 'show', 'acme.com')
    expect(show).toContain('Fintech')
  })

  test('add website to existing company', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('company', 'add', '--name', 'Acme', '--website', 'acme.com')).trim()
    await ctx.runOK('company', 'edit', id, '--add-website', 'acme.com/ventures')

    const show = await ctx.runOK('company', 'show', id)
    expect(show).toContain('acme.com')
    expect(show).toContain('acme.com/ventures')
  })

  test('remove website from company', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK(
        'company',
        'add',
        '--name',
        'Acme',
        '--website',
        'acme.com',
        '--website',
        'old-acme.com',
      )).trim()
    await ctx.runOK('company', 'edit', id, '--rm-website', 'old-acme.com')

    const show = await ctx.runOK('company', 'show', id)
    expect(show).toContain('acme.com')
    expect(show).not.toContain('old-acme.com')
  })

  test('add phone to existing company', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('company', 'add', '--name', 'Acme', '--phone', '+1-212-555-1234')).trim()
    await ctx.runOK('company', 'edit', id, '--add-phone', '+44-20-7946-0958')

    const show = await ctx.runOK('company', 'show', id)
    expect(show).toContain('(212) 555-1234')
    expect(show).toContain('+44 20 7946 0958')
  })

  test('remove phone from company', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK(
        'company',
        'add',
        '--name',
        'Acme',
        '--phone',
        '+1-212-555-1234',
        '--phone',
        '+1-310-555-9876',
      )).trim()
    await ctx.runOK('company', 'edit', id, '--rm-phone', '+1-310-555-9876')

    const show = await ctx.runOK('company', 'show', id)
    expect(show).toContain('(212) 555-1234')
    expect(show).not.toContain('(310) 555-9876')
  })
})

describe('company rm', async () => {
  test('delete company', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('company', 'add', '--name', 'Acme Corp')).trim()
    await ctx.runOK('company', 'rm', id, '--force')
    await ctx.runFail('company', 'show', id)
  })

  test('does not delete linked contacts but unlinks company', async () => {
    const ctx = createTestContext()
    const coID = (await ctx.runOK('company', 'add', '--name', 'Acme Corp')).trim()
    const ctID = (await ctx.runOK(
        'contact',
        'add',
        '--name',
        'Jane',
        '--email',
        'jane@acme.com',
        '--company',
        'Acme Corp',
      )).trim()

    await ctx.runOK('company', 'rm', coID, '--force')
    const show = await ctx.runOK('contact', 'show', ctID)
    expect(show).toContain('Jane')
    expect(show).not.toContain('Acme Corp')
  })
})

describe('company website normalization', async () => {
  test('strips protocol and www', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Acme',
      '--website',
      'https://www.acme.com/labs',
    )

    const companies = await ctx.runJSON<Array<{ websites: string[] }>>(
      'company',
      'list',
      '--format',
      'json',
    )
    expect(companies[0].websites[0]).toBe('acme.com/labs')
  })

  test('lowercase normalization', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme', '--website', 'ACME.COM')

    const companies = await ctx.runJSON<Array<{ websites: string[] }>>(
      'company',
      'list',
      '--format',
      'json',
    )
    expect(companies[0].websites[0]).toBe('acme.com')
  })

  test('duplicate website rejected', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme Corp', '--website', 'acme.com')

    const result = await ctx.runFail(
      'company',
      'add',
      '--name',
      'Acme Inc',
      '--website',
      'acme.com',
    )
    expect(result.stderr).toContain('duplicate')
  })

  test('www variant treated as duplicate', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Acme Corp',
      '--website',
      'acme.com/labs',
    )

    const result = await ctx.runFail(
      'company',
      'add',
      '--name',
      'Acme Inc',
      '--website',
      'www.acme.com/labs',
    )
    expect(result.stderr).toContain('duplicate')
  })

  test('subwebsites are NOT duplicates', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Acme US',
      '--website',
      'acme.com/north-america',
    )
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Acme EU',
      '--website',
      'acme.com/europe',
    )

    const companies = await ctx.runJSON<unknown[]>(
      'company',
      'list',
      '--format',
      'json',
    )
    expect(companies).toHaveLength(2)
  })

  test('different paths on same host are NOT duplicates', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme Corp', '--website', 'acme.com')
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Acme UK',
      '--website',
      'acme.com/ventures',
    )

    const companies = await ctx.runJSON<unknown[]>(
      'company',
      'list',
      '--format',
      'json',
    )
    expect(companies).toHaveLength(2)
  })

  test('different paths are NOT duplicates', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Acme Global',
      '--website',
      'acme.com',
    )
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Acme Blog',
      '--website',
      'blog.acme.com',
    )

    const companies = await ctx.runJSON<unknown[]>(
      'company',
      'list',
      '--format',
      'json',
    )
    expect(companies).toHaveLength(2)
  })

  test('lookup works with any format', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme', '--website', 'acme.com')

    const show1 = await ctx.runOK('company', 'show', 'acme.com')
    const show2 = await ctx.runOK('company', 'show', 'https://www.acme.com')
    const show3 = await ctx.runOK('company', 'show', 'ACME.COM')
    expect(show1).toContain('Acme')
    expect(show2).toContain('Acme')
    expect(show3).toContain('Acme')
  })

  test('add-website silently skips duplicate in different format', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('company', 'add', '--name', 'Acme', '--website', 'acme.com')).trim()

    // Same site with protocol and www — should not create a second entry
    await ctx.runOK('company', 'edit', id, '--add-website', 'https://www.acme.com')

    const data = await ctx.runJSON<{ websites: string[] }>(
      'company',
      'show',
      id,
      '--format',
      'json',
    )
    expect(data.websites).toHaveLength(1)
    expect(data.websites[0]).toBe('acme.com')
  })

  test('rm-website matches after normalization', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK(
        'company',
        'add',
        '--name',
        'Acme',
        '--website',
        'acme.com',
        '--website',
        'acme.com/ventures',
      )).trim()

    await ctx.runOK('company', 'edit', id, '--rm-website', 'https://www.acme.com')

    const companies = await ctx.runJSON<Array<{ websites: string[] }>>(
      'company',
      'list',
      '--format',
      'json',
    )
    expect(companies[0].websites).toHaveLength(1)
    expect(companies[0].websites[0]).toBe('acme.com/ventures')
  })

  test('query params stripped during normalization', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Acme',
      '--website',
      'acme.com/pricing?ref=google&utm_source=ads',
    )

    const companies = await ctx.runJSON<Array<{ websites: string[] }>>(
      'company',
      'list',
      '--format',
      'json',
    )
    expect(companies[0].websites[0]).toBe('acme.com/pricing')
  })

  test('hash fragments stripped during normalization', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Acme',
      '--website',
      'acme.com/docs#installation',
    )

    const companies = await ctx.runJSON<Array<{ websites: string[] }>>(
      'company',
      'list',
      '--format',
      'json',
    )
    expect(companies[0].websites[0]).toBe('acme.com/docs')
  })

  test('query params and hash treated as duplicate of clean URL', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Acme Corp',
      '--website',
      'acme.com/pricing',
    )

    const result = await ctx.runFail(
      'company',
      'add',
      '--name',
      'Acme Inc',
      '--website',
      'acme.com/pricing?ref=google#top',
    )
    expect(result.stderr).toContain('duplicate')
  })

  test('lookup works with query params and hash in URL', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme', '--website', 'acme.com')

    const show = await ctx.runOK(
      'company',
      'show',
      'acme.com?utm_source=linkedin#about',
    )
    expect(show).toContain('Acme')
  })

  test('websites stored as normalized in JSON output', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Acme',
      '--website',
      'https://WWW.Acme.COM/labs',
    )

    const companies = await ctx.runJSON<Array<{ websites: string[] }>>(
      'company',
      'list',
      '--format',
      'json',
    )
    expect(companies[0].websites[0]).toBe('acme.com/labs')
  })
})

describe('company merge', async () => {
  test('merges two companies keeping first', async () => {
    const ctx = createTestContext()
    const id1 = (await ctx.runOK(
        'company',
        'add',
        '--name',
        'Acme Corp',
        '--website',
        'acme.com',
        '--tag',
        'enterprise',
      )).trim()
    const id2 = (await ctx.runOK(
        'company',
        'add',
        '--name',
        'Acme Inc',
        '--website',
        'acme.com/ventures',
        '--tag',
        'uk',
      )).trim()

    await ctx.runOK('company', 'merge', id1, id2)

    const show = await ctx.runOK('company', 'show', id1)
    expect(show).toContain('acme.com')
    expect(show).toContain('acme.com/ventures')
    expect(show).toContain('enterprise')
    expect(show).toContain('uk')

    await ctx.runFail('company', 'show', id2)
  })

  test('merge combines phones', async () => {
    const ctx = createTestContext()
    const id1 = (await ctx.runOK(
        'company',
        'add',
        '--name',
        'Acme Corp',
        '--phone',
        '+1-212-555-1234',
      )).trim()
    const id2 = (await ctx.runOK(
        'company',
        'add',
        '--name',
        'Acme Inc',
        '--phone',
        '+44-20-7946-0958',
      )).trim()

    await ctx.runOK('company', 'merge', id1, id2)

    const companies = await ctx.runJSON<Array<{ phones: string[] }>>(
      'company',
      'list',
      '--format',
      'json',
    )
    expect(companies[0].phones).toHaveLength(2)
  })

  test('merge relinks contacts to surviving company', async () => {
    const ctx = createTestContext()
    const id1 = (await ctx.runOK('company', 'add', '--name', 'Acme Corp', '--website', 'acme.com')).trim()
    const id2 = (await ctx.runOK(
        'company',
        'add',
        '--name',
        'Acme Inc',
        '--website',
        'acme.com/ventures',
      )).trim()
    const contact = (await ctx.runOK(
        'contact',
        'add',
        '--name',
        'John',
        '--email',
        'john@acme.co.uk',
        '--company',
        'Acme Inc',
      )).trim()

    await ctx.runOK('company', 'merge', id1, id2)

    const contactShow = await ctx.runOK('contact', 'show', contact)
    expect(contactShow).toContain('Acme Corp')
    expect(contactShow).not.toContain('Acme Inc')
  })

  test('merge relinks deals to surviving company', async () => {
    const ctx = createTestContext()
    const id1 = (await ctx.runOK('company', 'add', '--name', 'Acme Corp', '--website', 'acme.com')).trim()
    const id2 = (await ctx.runOK(
        'company',
        'add',
        '--name',
        'Acme Inc',
        '--website',
        'acme.com/ventures',
      )).trim()
    const deal = (await ctx.runOK('deal', 'add', '--title', 'Deal B', '--company', id2)).trim()

    await ctx.runOK('company', 'merge', id1, id2)

    const dealShow = await ctx.runOK('deal', 'show', deal)
    expect(dealShow).toContain(id1)
    expect(dealShow).not.toContain(id2)
  })

  test('merge transfers activities to surviving company', async () => {
    const ctx = createTestContext()
    const id1 = (await ctx.runOK('company', 'add', '--name', 'Acme Corp', '--website', 'acme.com')).trim()
    const id2 = (await ctx.runOK(
        'company',
        'add',
        '--name',
        'Acme Inc',
        '--website',
        'acme.com/ventures',
      )).trim()
    await ctx.runOK(
      'log',
      'note',
      'Activity on the old company',
      '--company',
      'acme.com/ventures',
    )

    await ctx.runOK('company', 'merge', id1, id2)

    const activities = await ctx.runJSON<unknown[]>(
      'activity',
      'list',
      '--company',
      'acme.com',
      '--format',
      'json',
    )
    expect(activities).toHaveLength(1)
  })

  test('merge combines custom fields', async () => {
    const ctx = createTestContext()
    const id1 = (await ctx.runOK('company', 'add', '--name', 'Acme Corp', '--set', 'industry=SaaS')).trim()
    const id2 = (await ctx.runOK('company', 'add', '--name', 'Acme Inc', '--set', 'size=50-200')).trim()

    await ctx.runOK('company', 'merge', id1, id2)

    const show = await ctx.runOK('company', 'show', id1)
    expect(show).toContain('SaaS')
    expect(show).toContain('50-200')
  })
})

describe('company phone normalization', async () => {
  test('various formats normalize to same E.164', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Acme Corp',
      '--phone',
      '+1-212-555-1234',
    )

    const show1 = await ctx.runOK('company', 'show', '+12125551234')
    const show2 = await ctx.runOK('company', 'show', '+1-212-555-1234')
    expect(show1).toContain('Acme Corp')
    expect(show2).toContain('Acme Corp')
  })

  test('phones stored as E.164 in JSON output', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Acme Corp',
      '--phone',
      '+44 20 7946 0958',
    )

    const companies = await ctx.runJSON<Array<{ phones: string[] }>>(
      'company',
      'list',
      '--format',
      'json',
    )
    expect(companies[0].phones[0]).toBe('+442079460958')
  })

  test('duplicate detection across formats', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'Acme Corp',
      '--phone',
      '+1-212-555-1234',
    )

    const result = await ctx.runFail(
      'company',
      'add',
      '--name',
      'Other Corp',
      '--phone',
      '(212) 555-1234',
    )
    expect(result.stderr).toContain('duplicate')
  })

  test('invalid phone rejected', async () => {
    const ctx = createTestContext()
    const result = await ctx.runFail(
      'company',
      'add',
      '--name',
      'Acme',
      '--phone',
      'not-a-number',
    )
    expect(result.stderr).toContain('invalid')
  })

  test('rm-phone matches across formats', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK(
        'company',
        'add',
        '--name',
        'Acme',
        '--phone',
        '+1-212-555-1234',
        '--phone',
        '+44-20-7946-0958',
      )).trim()

    await ctx.runOK('company', 'edit', id, '--rm-phone', '+12125551234')

    const companies = await ctx.runJSON<Array<{ phones: string[] }>>(
      'company',
      'list',
      '--format',
      'json',
    )
    expect(companies[0].phones).toHaveLength(1)
    expect(companies[0].phones[0]).toBe('+442079460958')
  })

  test('add-phone silently skips duplicate in different format', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('company', 'add', '--name', 'Acme', '--phone', '+1-212-555-1234')).trim()

    // Same number in national format — should not create a second entry
    await ctx.runOK('company', 'edit', id, '--add-phone', '(212) 555-1234')

    const data = await ctx.runJSON<{ phones: string[] }>(
      'company',
      'show',
      id,
      '--format',
      'json',
    )
    expect(data.phones).toHaveLength(1)
    expect(data.phones[0]).toBe('+12125551234')
  })
})

describe('company auto-creation', async () => {
  test('contact add with --company auto-creates company stub', async () => {
    const ctx = createTestContext()
    await ctx.runOK('contact', 'add', '--name', 'Jane', '--company', 'NewCo')

    const companies = await ctx.runJSON<unknown[]>(
      'company',
      'list',
      '--format',
      'json',
    )
    expect(companies).toHaveLength(1)
  })

  test('deal add with --company auto-creates company stub', async () => {
    const ctx = createTestContext()
    await ctx.runOK('deal', 'add', '--title', 'Big Deal', '--company', 'NewCo')

    const companies = await ctx.runJSON<unknown[]>(
      'company',
      'list',
      '--format',
      'json',
    )
    expect(companies).toHaveLength(1)
  })
})

describe('company list --filter', async () => {
  test('filter by exact name', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme Corp')
    await ctx.runOK('company', 'add', '--name', 'Beta Inc')

    const data = await ctx.runJSON<Array<{ name: string }>>(
      'company',
      'list',
      '--filter',
      'name=Acme Corp',
      '--format',
      'json',
    )
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe('Acme Corp')
  })

  test('filter by custom field', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'SaaSCo', '--set', 'industry=SaaS')
    await ctx.runOK('company', 'add', '--name', 'FinCo', '--set', 'industry=Finance')

    const data = await ctx.runJSON<Array<{ name: string }>>(
      'company',
      'list',
      '--filter',
      'industry=SaaS',
      '--format',
      'json',
    )
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe('SaaSCo')
  })

  test('filter with != operator', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme', '--set', 'industry=SaaS')
    await ctx.runOK('company', 'add', '--name', 'Beta', '--set', 'industry=Finance')
    await ctx.runOK('company', 'add', '--name', 'Gamma', '--set', 'industry=SaaS')

    const data = await ctx.runJSON<Array<{ name: string }>>(
      'company',
      'list',
      '--filter',
      'industry!=SaaS',
      '--format',
      'json',
    )
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe('Beta')
  })

  test('filter with ~= substring match', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme Corp')
    await ctx.runOK('company', 'add', '--name', 'Beta Inc')
    await ctx.runOK('company', 'add', '--name', 'Acme Labs')

    const data = await ctx.runJSON<Array<{ name: string }>>(
      'company',
      'list',
      '--filter',
      'name~=Acme',
      '--format',
      'json',
    )
    expect(data).toHaveLength(2)
  })

  test('filter with OR logic', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'A', '--set', 'tier=gold')
    await ctx.runOK('company', 'add', '--name', 'B', '--set', 'tier=silver')
    await ctx.runOK('company', 'add', '--name', 'C', '--set', 'tier=bronze')

    const data = await ctx.runJSON<unknown[]>(
      'company',
      'list',
      '--filter',
      'tier=gold OR tier=silver',
      '--format',
      'json',
    )
    expect(data).toHaveLength(2)
  })

  test('filter returns empty when no match', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Acme', '--set', 'industry=SaaS')

    const data = await ctx.runJSON<unknown[]>(
      'company',
      'list',
      '--filter',
      'industry=Healthcare',
      '--format',
      'json',
    )
    expect(data).toHaveLength(0)
  })

  test('filter combined with --tag', async () => {
    const ctx = createTestContext()
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'A',
      '--set',
      'industry=SaaS',
      '--tag',
      'vip',
    )
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'B',
      '--set',
      'industry=SaaS',
      '--tag',
      'cold',
    )
    await ctx.runOK(
      'company',
      'add',
      '--name',
      'C',
      '--set',
      'industry=Finance',
      '--tag',
      'vip',
    )

    const data = await ctx.runJSON<unknown[]>(
      'company',
      'list',
      '--filter',
      'industry=SaaS',
      '--tag',
      'vip',
      '--format',
      'json',
    )
    expect(data).toHaveLength(1)
  })
})

describe('company list --reverse', async () => {
  test('reverses listing order', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'Alpha Inc')
    await ctx.runOK('company', 'add', '--name', 'Beta Corp')

    const normal = await ctx.runJSON<{ name: string }[]>(
      'company',
      'list',
      '--sort',
      'name',
      '--format',
      'json',
    )
    const reversed = await ctx.runJSON<{ name: string }[]>(
      'company',
      'list',
      '--sort',
      'name',
      '--reverse',
      '--format',
      'json',
    )
    expect(normal[0].name).toBe('Alpha Inc')
    expect(reversed[0].name).toBe('Beta Corp')
  })
})

describe('company list --offset', async () => {
  test('skips first N results', async () => {
    const ctx = createTestContext()
    await ctx.runOK('company', 'add', '--name', 'A')
    await ctx.runOK('company', 'add', '--name', 'B')
    await ctx.runOK('company', 'add', '--name', 'C')

    const data = await ctx.runJSON<unknown[]>(
      'company',
      'list',
      '--sort',
      'name',
      '--offset',
      '2',
      '--format',
      'json',
    )
    expect(data).toHaveLength(1)
  })
})

describe('company rm --force', async () => {
  test('rm without --force fails in non-interactive mode', async () => {
    const ctx = createTestContext()
    const id = (await ctx.runOK('company', 'add', '--name', 'Acme')).trim()
    const result = await ctx.runFail('company', 'rm', id)
    expect(result.stderr).toContain('--force')
  })
})

describe('company rename', async () => {
  test('renaming company does not break contact link', async () => {
    const ctx = createTestContext()
    const coId = (await ctx.runOK('company', 'add', '--name', 'Old Name')).trim()
    const ctId = (await ctx.runOK('contact', 'add', '--name', 'Jane', '--company', 'Old Name')).trim()
    await ctx.runOK('company', 'edit', coId, '--name', 'New Name')

    const show = await ctx.runOK('contact', 'show', ctId)
    expect(show).toContain('New Name')
    expect(show).not.toContain('Old Name')
  })

  test('renaming company does not break deal link', async () => {
    const ctx = createTestContext()
    const coId = (await ctx.runOK('company', 'add', '--name', 'Old Corp')).trim()
    await ctx.runOK('deal', 'add', '--title', 'Big Deal', '--company', 'Old Corp')
    await ctx.runOK('company', 'edit', coId, '--name', 'New Corp')

    const deals = await ctx.runJSON<{ company: string }[]>(
      'deal',
      'list',
      '--format',
      'json',
    )
    expect(deals[0].company).toBe(coId)
  })

  test('renaming contact does not break deal link', async () => {
    const ctx = createTestContext()
    const ctId = (await ctx.runOK('contact', 'add', '--name', 'Old Name')).trim()
    await ctx.runOK('deal', 'add', '--title', 'Deal', '--contact', ctId)
    await ctx.runOK('contact', 'edit', ctId, '--name', 'New Name')

    const deals = await ctx.runJSON<{ contacts: string[] }[]>(
      'deal',
      'list',
      '--format',
      'json',
    )
    expect(deals[0].contacts).toContain(ctId)
  })
})
