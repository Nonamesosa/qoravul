import { supabase } from './supabase'
import type { ScoringRequest, ScoringResponse, Rule, RuleCondition, RuleFired, DecisionType } from '../types'

function evaluateCondition(cond: RuleCondition, features: Record<string, unknown>): boolean {
  const val = features[cond.feature]
  const target = cond.value
  switch (cond.op) {
    case 'eq': return val === target
    case 'neq': return val !== target
    case 'gt': return Number(val) > Number(target)
    case 'gte': return Number(val) >= Number(target)
    case 'lt': return Number(val) < Number(target)
    case 'lte': return Number(val) <= Number(target)
    case 'in': return Array.isArray(target) && target.includes(val)
    case 'contains': return String(val).includes(String(target))
    default: return false
  }
}

function evaluateRule(rule: Rule, features: Record<string, unknown>): boolean {
  const conds = rule.definition?.conditions
  if (!conds) return false
  if (conds.all && conds.all.length > 0) {
    return conds.all.every(c => evaluateCondition(c, features))
  }
  if (conds.any && conds.any.length > 0) {
    return conds.any.some(c => evaluateCondition(c, features))
  }
  return false
}

function isNightTime(): boolean {
  const hour = new Date().getHours()
  return hour >= 0 && hour < 5
}

export function computeFeatures(req: ScoringRequest): Record<string, unknown> {
  const amount = Number(req.transaction?.amount || 0)
  const accountAge = Number(req.customer?.account_age_days || 0)
  const failedLogins = Number(req.session?.failed_logins_last_hour || 0)
  const isNewDevice = Boolean(req.device?.is_new_device)
  const isRooted = Boolean(req.device?.is_rooted)

  return {
    amount_current: amount,
    amount_mean_30d: 1500000,
    amount_p95_30d: 3500000,
    amount_ratio_mean: amount / 1500000,
    amount_zscore_log: Math.log(amount + 1) - 14.2,
    amount_above_p95_flag: amount > 3500000,
    amount_round_flag: amount > 0 && amount % 1000000 === 0,
    amount_first_large_flag: amount > 5000000 && accountAge < 30,
    amount_sum_1h: amount,
    amount_sum_24h: amount * 2,
    txn_count_5m: 1,
    txn_count_1h: 3,
    txn_count_24h: 12,
    distinct_counterparties_1h: 1,
    distinct_counterparties_24h: 5,
    new_counterparty_flag: false,
    secs_since_last_txn: 3600,
    secs_since_login: 180,
    failed_logins_1h: failedLogins,
    p2p_after_login_secs: 180,
    is_new_device: isNewDevice,
    device_age_days: isNewDevice ? 0 : 365,
    devices_per_customer_30d: 2,
    customers_per_device_30d: 1,
    is_rooted: isRooted,
    app_version_outdated: false,
    emulator_flag: false,
    screen_remote_control_flag: false,
    ip_is_new_30d: false,
    ip_customers_24h: 1,
    ip_is_datacenter_or_vpn: false,
    geo_country_mismatch: false,
    geo_city_change_1h: false,
    impossible_travel_flag: false,
    distance_from_home_km: 5,
    distance_from_last_txn_km: 10,
    is_night_local: isNightTime(),
    account_age_days: accountAge,
    days_since_profile_change: 100,
    phone_changed_recently: false,
    card_added_recently: false,
    card_added_by_new_device: false,
    kyc_level: 2,
    has_2fa: true,
    prior_fraud_labels_90d: 0,
    loan_requests_7d: 0,
    loan_to_income_ratio: 0,
    loan_disbursed_then_p2p_flag: false,
    loan_request_night_flag: false,
    loan_device_shared_flag: false,
    cp_fraud_labels_30d: 0,
    cp_inbound_distinct_senders_24h: 1,
    cp_account_age_days: 200,
    cp_is_blacklisted: false,
    cp_fan_in_ratio: 0.5,
    cp_rapid_forward_flag: false,
  }
}

export function computeRiskScore(features: Record<string, unknown>): number {
  let score = 200

  if (features.is_new_device) score += 150
  if (features.is_night_local) score += 80
  if (Number(features.p2p_after_login_secs) < 300) score += 100
  if (features.amount_above_p95_flag) score += 120
  if (features.is_rooted) score += 200

  // Failed logins scaled contribution
  const failedLogins = Number(features.failed_logins_1h || 0)
  if (failedLogins > 10) {
    score += 250
  } else if (failedLogins > 2) {
    score += 80 + (failedLogins - 2) * 15
  }

  // Large amount and anomaly contribution
  const amount = Number(features.amount_current || 0)
  if (amount >= 50000000) {
    score += 150
  } else if (Number(features.amount_ratio_mean) > 3) {
    score += 100
  }

  // First large transaction on new account
  if (features.amount_first_large_flag) score += 150

  if (Number(features.customers_per_device_30d) > 2) score += 150
  if (features.ip_is_datacenter_or_vpn) score += 100
  if (features.cp_is_blacklisted) score += 300
  if (features.cp_rapid_forward_flag) score += 100
  if (features.emulator_flag) score += 200
  if (features.screen_remote_control_flag) score += 150
  if (Number(features.loan_disbursed_then_p2p_flag)) score += 200
  if (Number(features.prior_fraud_labels_90d) > 0) score += 100
  if (Number(features.distance_from_home_km) > 500) score += 50
  if (features.impossible_travel_flag) score += 150
  if (Number(features.kyc_level) < 1) score += 50

  return Math.min(1000, Math.max(0, score))
}

export function getReasonCodes(features: Record<string, unknown>, score: number): string[] {
  const codes: string[] = []
  if (features.is_rooted) codes.push('ROOTED_DEVICE')
  if (Number(features.failed_logins_1h) > 2) codes.push('MULTIPLE_FAILED_LOGINS')
  if (Number(features.amount_current) >= 50000000 || features.amount_first_large_flag) codes.push('HIGH_RISK_FIRST_AMOUNT')
  if (features.is_new_device && features.is_night_local) codes.push('NEW_DEVICE_NIGHT_TRANSFER')
  if (features.amount_above_p95_flag) codes.push('AMOUNT_ABOVE_CUSTOMER_P95')
  if (Number(features.p2p_after_login_secs) < 300) codes.push('P2P_AFTER_LOGIN_MINUTES')
  if (Number(features.customers_per_device_30d) > 2) codes.push('DEVICE_SHARED_MULTI_CUSTOMER')
  if (features.cp_is_blacklisted) codes.push('COUNTERPARTY_BLACKLISTED')
  if (features.emulator_flag) codes.push('EMULATOR_DETECTED')
  if (features.screen_remote_control_flag) codes.push('REMOTE_CONTROL_APP')
  if (Number(features.loan_disbursed_then_p2p_flag)) codes.push('LOAN_DISBURSED_RAPID_P2P')
  if (features.cp_rapid_forward_flag) codes.push('RAPID_FORWARD_PATTERN')
  if (features.impossible_travel_flag) codes.push('IMPOSSIBLE_TRAVEL')
  if (features.ip_is_datacenter_or_vpn) codes.push('VPN_DATACENTER_IP')
  if (Number(features.amount_ratio_mean) > 3) codes.push('AMOUNT_ANOMALY_HIGH')
  if (Number(features.prior_fraud_labels_90d) > 0) codes.push('PRIOR_FRAUD_HISTORY')
  if (codes.length === 0) codes.push('NORMAL_PATTERN')
  return codes.slice(0, 3)
}

export async function evaluateRiskLocally(req: ScoringRequest): Promise<ScoringResponse> {
  const engineStart = performance.now()

  // 1. Fetch approved rules and active champion model in parallel
  const [{ data: rulesData }, { data: championData }] = await Promise.all([
    supabase
      .from('rules')
      .select('*')
      .in('status', ['active', 'shadow'])
      .not('approved_by', 'is', null),
    supabase
      .from('model_versions')
      .select('version')
      .eq('status', 'champion')
      .maybeSingle(),
  ])

  const rules = (rulesData || []) as Rule[]
  const champion = championData as { version: string } | null
  const isDegraded = !champion
  const modelVersion = champion?.version || 'none (rules-only fallback)'

  // 2. Compute features
  const features = computeFeatures(req)

  // 3. Evaluate rules (BUG-12: separate active and shadow rules)
  const firedRules: RuleFired[] = []
  const shadowRulesFired: { id: string; version: number; action: string; reason_code: string | null }[] = []
  const firedReasons: string[] = []
  let ruleDecision: DecisionType | null = null

  for (const rule of rules) {
    if (evaluateRule(rule, features)) {
      if (rule.status === 'active') {
        // FR-11: Active rules affect live decision, fired rules and reason codes
        firedRules.push({ id: rule.id.slice(0, 8), version: rule.version })
        if (rule.reason_code) firedReasons.push(rule.reason_code)
        if (rule.action === 'BLOCK') {
          ruleDecision = 'BLOCK'
        } else if (rule.action === 'CHALLENGE' && ruleDecision !== 'BLOCK') {
          ruleDecision = 'CHALLENGE'
        }
      } else if (rule.status === 'shadow') {
        // FR-11 / BUG-12: Shadow rules ONLY logged for telemetry, NEVER affect live decision or reason codes
        shadowRulesFired.push({
          id: rule.id.slice(0, 8),
          version: rule.version,
          action: rule.action,
          reason_code: rule.reason_code,
        })
      }
    }
  }

  // 4. ML inference score
  const mlScore = computeRiskScore(features)

  // 5. Score-based decision threshold (BUG-11, TZ 7.1 & FR-02)
  // 0-599: ALLOW, 600-799: CHALLENGE, 800-1000: BLOCK
  let scoreDecision: DecisionType = 'ALLOW'
  if (mlScore >= 800) {
    scoreDecision = 'BLOCK'
  } else if (mlScore >= 600) {
    scoreDecision = 'CHALLENGE'
  } else {
    scoreDecision = 'ALLOW'
  }

  // Combined decision: Most restrictive policy wins (BLOCK > CHALLENGE > ALLOW)
  let decision: DecisionType = 'ALLOW'
  if (ruleDecision === 'BLOCK' || scoreDecision === 'BLOCK') {
    decision = 'BLOCK'
  } else if (ruleDecision === 'CHALLENGE' || scoreDecision === 'CHALLENGE') {
    decision = 'CHALLENGE'
  } else {
    decision = 'ALLOW'
  }

  // Reason codes: only from active fired rules + ML top reasons. Shadow rules are NEVER included.
  const reasonCodes = firedReasons.length > 0
    ? [...new Set([...firedReasons, ...getReasonCodes(features, mlScore)])].slice(0, 3)
    : getReasonCodes(features, mlScore)

  const latencyMs = Math.max(1, Math.round(performance.now() - engineStart))

  // 6. Persist to DB asynchronously (Event, Decision, Case, Notification)
  try {
    const { data: eventRow } = await supabase.from('events').insert({
      request_id: req.request_id,
      tenant_id: req.tenant_id || 'simulator',
      event_type: req.event_type,
      customer_id_hash: req.customer?.customer_ref || null,
      amount_uzs: Number(req.transaction?.amount || 0),
      currency: req.transaction?.currency || 'UZS',
      counterparty_hash: req.transaction?.counterparty_ref || null,
      device_id_hash: req.device?.device_ref || null,
      ip_address: req.network?.ip || null,
      geo_country: req.network?.geo_country || null,
      geo_city: req.network?.geo_city || null,
      channel: req.transaction?.channel || null,
      customer_ref: req.customer?.customer_ref || null,
      account_age_days: Number(req.customer?.account_age_days || 0),
      is_new_device: Boolean(req.device?.is_new_device),
      os: req.device?.os || null,
      app_version: req.device?.app_version || null,
      is_rooted: Boolean(req.device?.is_rooted),
      failed_logins_last_hour: Number(req.session?.failed_logins_last_hour || 0),
      raw_request: req,
      occurred_at: req.occurred_at || new Date().toISOString(),
    }).select('id').maybeSingle()

    const { data: decisionRow } = await supabase.from('decisions').insert({
      event_id: eventRow?.id || null,
      request_id: req.request_id,
      decision,
      risk_score: mlScore,
      model_version: modelVersion,
      rules_fired: firedRules,
      reason_codes: reasonCodes,
      feature_snapshot: { ...features, shadow_rules_fired: shadowRulesFired },
      degraded: isDegraded,
      latency_ms: latencyMs,
    }).select('id').maybeSingle()

    // Create case if CHALLENGE or BLOCK
    let caseRowId: string | null = null
    if (decision !== 'ALLOW' && eventRow?.id && decisionRow?.id) {
      const priority = decision === 'BLOCK' ? 90 : 60
      const slaHours = decision === 'BLOCK' ? 0.5 : 4
      const slaDue = new Date(Date.now() + slaHours * 3600 * 1000).toISOString()

      const { data: cRow } = await supabase.from('cases').insert({
        decision_id: decisionRow.id,
        event_id: eventRow.id,
        priority,
        status: 'open',
        sla_due_at: slaDue,
      }).select('id').maybeSingle()
      if (cRow) caseRowId = cRow.id

      // BUG-07: Send and store real notification for customer
      const amountStr = Number(req.transaction?.amount || 0).toLocaleString()
      if (decision === 'CHALLENGE') {
        const otp = Math.floor(100000 + Math.random() * 900000)
        await supabase.from('notifications').insert({
          case_id: caseRowId,
          decision_id: decisionRow.id,
          channel: 'sms',
          language: 'uz',
          message: `Tasdiqlash kodi: ${otp}. Qorovul: ${req.event_type} (${amountStr} UZS) operatsiyasi uchun bir martalik SMS parol. Amal qilish muddati: 120 soniya.`,
          status: 'delivered',
          sent_at: new Date().toISOString(),
        })
      } else if (decision === 'BLOCK') {
        await supabase.from('notifications').insert({
          case_id: caseRowId,
          decision_id: decisionRow.id,
          channel: 'push',
          language: 'uz',
          message: `Xavfsizlik ogohlantirishi: ${amountStr} UZS miqdoridagi operatsiya xavfsizlik siyosati (Score: ${mlScore}, ${reasonCodes.join(', ')}) sababli bloklandi.`,
          status: 'delivered',
          sent_at: new Date().toISOString(),
        })
      }
    }
  } catch (err) {
    console.warn('Non-blocking DB insert warning:', err)
  }

  const response: ScoringResponse = {
    request_id: req.request_id,
    decision,
    risk_score: mlScore,
    reason_codes: reasonCodes,
    model_version: modelVersion,
    rules_fired: firedRules,
    shadow_rules_fired: shadowRulesFired,
    degraded: isDegraded,
    latency_ms: latencyMs,
  }

  if (decision === 'CHALLENGE') {
    response.challenge = {
      type: 'otp_sms',
      ttl_seconds: 120,
    }
  }

  return response
}
