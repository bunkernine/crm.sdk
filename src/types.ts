export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type CustomFields = { [key: string]: JsonValue }

export type ContactId = `ct_${string}`
export type CompanyId = `co_${string}`
export type DealId = `dl_${string}`
export type ActivityId = `ac_${string}`

export type ActivityType = 'note' | 'call' | 'meeting' | 'email'
export type ActivityTypeAll = ActivityType | 'stage-change'

export type EntityType = 'contact' | 'company' | 'deal' | 'activity'

export type PhoneDisplay = 'international' | 'national' | 'e164'
export type ExportFormat = 'json' | 'csv' | 'tsv' | 'ids' | 'table'

export interface Contact {
  id: ContactId
  name: string
  emails: string[]
  phones: string[]
  companies: string[]
  linkedin: string | null
  x: string | null
  bluesky: string | null
  telegram: string | null
  tags: string[]
  custom_fields: CustomFields
  created_at: string
  updated_at: string
}

export interface Company {
  id: CompanyId
  name: string
  websites: string[]
  phones: string[]
  tags: string[]
  custom_fields: CustomFields
  created_at: string
  updated_at: string
}

export interface Deal {
  id: DealId
  title: string
  value: number | null
  stage: string
  contacts: string[]
  company: CompanyId | null
  expected_close: string | null
  probability: number | null
  tags: string[]
  custom_fields: CustomFields
  created_at: string
  updated_at: string
}

export interface Activity {
  id: ActivityId
  type: string
  body: string
  contacts: string[]
  company: CompanyId | null
  deal: DealId | null
  custom_fields: CustomFields
  created_at: string
}

export interface ContactDetail extends Contact {
  _display_phones: string[]
  deals: { id: DealId; title: string; stage: string; value: number | null }[]
}

export interface CompanyDetail extends Company {
  _display_phones: string[]
  contacts: { id: ContactId; name: string; emails: string[] }[]
  deals: { id: DealId; title: string; stage: string; value: number | null }[]
}

export interface DealDetail {
  id: DealId
  title: string
  value: number | null
  stage: string
  contacts: { id: ContactId; name: string; emails: string[] }[]
  company: { id: CompanyId; name: string } | null
  expected_close: string | null
  probability: number | null
  tags: string[]
  custom_fields: CustomFields
  created_at: string
  updated_at: string
  stage_history: { stage: string; at: string }[]
  notes: string[]
}

export interface ListOpts {
  tag?: string
  company?: string
  contact?: string
  stage?: string
  minValue?: number
  maxValue?: number
  sort?: string
  reverse?: boolean
  limit?: number
  offset?: number
  filter?: string
}

export interface ContactAddInput {
  name: string
  email?: string[]
  phone?: string[]
  company?: string[]
  tag?: string[]
  linkedin?: string
  x?: string
  bluesky?: string
  telegram?: string
  set?: string[]
  custom_fields?: CustomFields
}

export interface ContactEditInput {
  name?: string
  addEmail?: string[]
  rmEmail?: string[]
  addPhone?: string[]
  rmPhone?: string[]
  addCompany?: string[]
  rmCompany?: string[]
  addTag?: string[]
  rmTag?: string[]
  linkedin?: string
  x?: string
  bluesky?: string
  telegram?: string
  set?: string[]
  unset?: string[]
  custom_fields?: CustomFields
}

export interface CompanyAddInput {
  name: string
  website?: string[]
  phone?: string[]
  tag?: string[]
  set?: string[]
  custom_fields?: CustomFields
}

export interface CompanyEditInput {
  name?: string
  addWebsite?: string[]
  rmWebsite?: string[]
  addPhone?: string[]
  rmPhone?: string[]
  addTag?: string[]
  rmTag?: string[]
  set?: string[]
  unset?: string[]
}

export interface DealAddInput {
  title: string
  value?: number
  stage?: string
  contact?: string[]
  company?: string
  expectedClose?: string
  probability?: number
  tag?: string[]
  set?: string[]
  custom_fields?: CustomFields
}

export interface DealEditInput {
  title?: string
  value?: number
  company?: string
  expectedClose?: string
  probability?: number
  addContact?: string[]
  rmContact?: string[]
  addTag?: string[]
  rmTag?: string[]
  set?: string[]
  unset?: string[]
}

export interface LogInput {
  type: ActivityType
  body: string
  contact?: string[]
  company?: string
  deal?: string
  at?: string
  set?: string[]
  custom_fields?: CustomFields
}

export interface ActivityListOpts {
  contact?: string
  company?: string
  deal?: string
  type?: string
  since?: string
  sort?: string
  reverse?: boolean
  limit?: number
  offset?: number
}

export interface ImportOpts {
  dryRun?: boolean
  skipErrors?: boolean
  update?: boolean
}

export interface ImportResult {
  imported: number
  skipped: number
  errors: number
  dryRunLines: string[]
}

export interface SearchOpts {
  type?: EntityType
}

export interface FindOpts {
  type?: EntityType
  limit?: number
  threshold?: number
}

export interface DupesOpts {
  type?: 'contact' | 'company'
  threshold?: number
  limit?: number
}

export interface DupeResult {
  left: Contact | Company
  right: Contact | Company
  reasons: string[]
  score: number
}

export interface IndexStatus {
  contacts: number
  companies: number
  deals: number
  indexed: { contact: number; company: number; deal: number }
}

export interface PipelineRow {
  stage: string
  count: number
  value: number
}

export interface TagCount {
  tag: string
  count: number
}

export type HookName =
  | 'pre-contact-add'
  | 'post-contact-add'
  | 'pre-contact-edit'
  | 'post-contact-edit'
  | 'pre-contact-rm'
  | 'post-contact-rm'
  | 'pre-company-add'
  | 'post-company-add'
  | 'pre-company-edit'
  | 'post-company-edit'
  | 'pre-company-rm'
  | 'post-company-rm'
  | 'pre-deal-add'
  | 'post-deal-add'
  | 'pre-deal-edit'
  | 'post-deal-edit'
  | 'pre-deal-rm'
  | 'post-deal-rm'
  | 'pre-deal-stage-change'
  | 'post-deal-stage-change'
  | 'pre-activity-add'
  | 'post-activity-add'

export type HookPayload = { [key: string]: JsonValue }
export type HookFn = (data: HookPayload) => boolean | Promise<boolean>

export interface CRMConfig {
  pipeline: { stages: string[]; won_stage: string; lost_stage: string }
  phone: { default_country?: string; display: PhoneDisplay }
  hooks: Partial<Record<HookName, HookFn>>
  search_limit: number
}

export interface CreateCrmOptions {
  connectionString: string
  schema?: string
  pipeline?: { stages?: string[]; won_stage?: string; lost_stage?: string }
  phone?: { default_country?: string; display?: PhoneDisplay }
  hooks?: Partial<Record<HookName, HookFn>>
  search_limit?: number
}
