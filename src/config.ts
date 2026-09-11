import type { CRMConfig, CreateCrmOptions, HookFn, HookName } from './types'

const DEFAULT_STAGES = [
  'lead',
  'qualified',
  'proposal',
  'negotiation',
  'closed-won',
  'closed-lost',
]

export function defaultConfig(): CRMConfig {
  return {
    pipeline: {
      stages: [...DEFAULT_STAGES],
      won_stage: 'closed-won',
      lost_stage: 'closed-lost',
    },
    phone: { display: 'international' },
    hooks: {},
    search_limit: 20,
  }
}

export function resolveConfig(opts: CreateCrmOptions): CRMConfig {
  const base = defaultConfig()
  if (opts.pipeline) {
    if (opts.pipeline.stages) {
      base.pipeline.stages = opts.pipeline.stages
    }
    if (opts.pipeline.won_stage) {
      base.pipeline.won_stage = opts.pipeline.won_stage
    }
    if (opts.pipeline.lost_stage) {
      base.pipeline.lost_stage = opts.pipeline.lost_stage
    }
  }
  if (opts.phone) {
    if (opts.phone.default_country) {
      base.phone.default_country = opts.phone.default_country
    }
    if (opts.phone.display) {
      base.phone.display = opts.phone.display
    }
  }
  if (opts.hooks) {
    base.hooks = { ...opts.hooks }
  }
  if (opts.search_limit !== undefined) {
    base.search_limit = opts.search_limit
  }
  return base
}

export type { CRMConfig, HookFn, HookName }
