export type UserRole = 'admin' | 'fraud_manager' | 'analyst' | 'data_scientist' | 'auditor'
export type Language = 'uz' | 'ru' | 'en'

export type DecisionType = 'ALLOW' | 'CHALLENGE' | 'BLOCK'
export type RuleStatus = 'draft' | 'shadow' | 'active' | 'disabled'
export type CaseStatus = 'open' | 'in_review' | 'closed'
export type CaseOutcome = 'confirmed_fraud' | 'legitimate' | 'unsure'
export type EventType = 'transfer' | 'login' | 'loan_application' | 'card_payment'
export type ModelStatus = 'draft' | 'shadow' | 'champion' | 'retired'
export type NotificationChannel = 'sms' | 'push' | 'email'
export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'failed'

export interface TeamUser {
  id: string
  email: string
  full_name: string
  role: UserRole
  language: Language
  is_active: boolean
  created_at: string
}

export interface FraudEvent {
  id: string
  request_id: string
  tenant_id: string
  event_type: EventType
  customer_id_hash: string | null
  amount_uzs: number | null
  currency: string
  counterparty_hash: string | null
  card_token: string | null
  device_id_hash: string | null
  ip_address: string | null
  geo_country: string | null
  geo_city: string | null
  channel: string | null
  occurred_at: string
  received_at: string
  customer_ref: string | null
  account_age_days: number | null
  is_new_device: boolean
  os: string | null
  app_version: string | null
  is_rooted: boolean
  failed_logins_last_hour: number
  raw_request: Record<string, unknown> | null
}

export interface Decision {
  id: string
  event_id: string
  request_id: string
  decision: DecisionType
  risk_score: number
  model_version: string | null
  rules_fired: RuleFired[]
  reason_codes: string[]
  feature_snapshot: Record<string, unknown> | null
  degraded: boolean
  latency_ms: number | null
  decided_at: string
  event?: FraudEvent
  case?: FraudCase | null
}

export interface RuleFired {
  id: string
  version: number
}

export interface Rule {
  id: string
  name: string
  version: number
  status: RuleStatus
  definition: RuleDefinition
  action: DecisionType
  reason_code: string | null
  owner: string
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
  created_by_user?: TeamUser | null
  approved_by_user?: TeamUser | null
}

export interface RuleDefinition {
  conditions: {
    all?: RuleCondition[]
    any?: RuleCondition[]
  }
}

export interface RuleCondition {
  feature: string
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'
  value: unknown
}

export interface FraudCase {
  id: string
  decision_id: string
  event_id: string
  priority: number
  status: CaseStatus
  assignee_id: string | null
  sla_due_at: string | null
  outcome: CaseOutcome | null
  analyst_note: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  assignee?: TeamUser | null
  decision?: Decision
  event?: FraudEvent
}

export interface Label {
  id: string
  event_id: string
  label: number
  source: 'analyst' | 'chargeback' | 'customer_report' | 'rule'
  labeled_by: string | null
  labeled_at: string
}

export interface ModelVersion {
  id: string
  version: string
  algorithm: string
  status: ModelStatus
  training_data_size: number | null
  pr_auc: number | null
  recall: number | null
  fpr: number | null
  features_count: number
  notes: string | null
  created_by: string | null
  created_at: string
  activated_at: string | null
}

export interface AuditLogEntry {
  id: number
  actor_id: string | null
  action: string
  entity: string
  entity_id: string | null
  diff: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
  actor?: TeamUser | null
}

export interface Webhook {
  id: string
  tenant_id: string
  url: string
  events: string[]
  secret: string | null
  is_active: boolean
  created_at: string
}

export interface Notification {
  id: string
  case_id: string | null
  decision_id: string | null
  channel: NotificationChannel
  language: Language
  message: string
  status: NotificationStatus
  sent_at: string | null
  created_at: string
}

export interface ScoringRequest {
  request_id: string
  tenant_id: string
  event_type: EventType
  occurred_at: string
  customer: {
    customer_ref: string
    account_age_days: number
  }
  transaction?: {
    amount: number
    currency: string
    counterparty_ref: string
    channel: string
    type: string
  }
  device: {
    device_ref: string
    is_new_device: boolean
    os: string
    app_version: string
    is_rooted: boolean
  }
  network: {
    ip: string
    geo_country: string
    geo_city: string
  }
  session: {
    login_at: string
    failed_logins_last_hour: number
  }
}

export interface ScoringResponse {
  request_id: string
  decision: DecisionType
  risk_score: number
  reason_codes: string[]
  challenge?: {
    type: string
    ttl_seconds: number
  }
  model_version: string
  rules_fired: RuleFired[]
  degraded: boolean
  latency_ms: number
}
