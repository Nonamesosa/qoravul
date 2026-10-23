import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

interface RuleCondition {
  feature: string
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'
  value: unknown
}

interface RuleDef {
  conditions: { all?: RuleCondition[]; any?: RuleCondition[] }
}

interface Rule {
  id: string
  name: string
  version: number
  status: string
  definition: RuleDef
  action: 'ALLOW' | 'CHALLENGE' | 'BLOCK'
  reason_code: string | null
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

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
  const conds = rule.definition.conditions
  if (conds.all) return conds.all.every(c => evaluateCondition(c, features))
  if (conds.any) return conds.any.some(c => evaluateCondition(c, features))
  return false
}

function isNightTime(): boolean {
  const hour = new Date().getHours()
  return hour >= 0 && hour < 5
}

function computeFeatures(req: any): Record<string, unknown> {
  const amount = Number(req.transaction?.amount || 0)
  return {
    amount_current: amount,
    amount_mean_30d: 1500000,
    amount_p95_30d: 3500000,
    amount_ratio_mean: amount / 1500000,
    amount_zscore_log: Math.log(amount + 1) - 14.2,
    amount_above_p95_flag: amount > 3500000,
    amount_round_flag: amount % 1000000 === 0,
    amount_first_large_flag: amount > 5000000 && req.customer?.account_age_days < 30,
    amount_sum_1h: amount,
    amount_sum_24h: amount * 2,
    txn_count_5m: 1,
    txn_count_1h: 3,
    txn_count_24h: 12,
    distinct_counterparties_1h: 1,
    distinct_counterparties_24h: 5,
    new_counterparty_flag: Math.random() > 0.7,
    secs_since_last_txn: 3600,
    secs_since_login: 180,
    failed_logins_1h: Number(req.session?.failed_logins_last_hour || 0),
    p2p_after_login_secs: 180,
    is_new_device: req.device?.is_new_device || false,
    device_age_days: req.device?.is_new_device ? 0 : 365,
    devices_per_customer_30d: 2,
    customers_per_device_30d: 1,
    is_rooted: req.device?.is_rooted || false,
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
    account_age_days: Number(req.customer?.account_age_days || 0),
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

function computeRiskScore(features: Record<string, unknown>): number {
  let score = 200

  if (features.is_new_device) score += 150
  if (features.is_night_local) score += 80
  if (Number(features.p2p_after_login_secs) < 300) score += 100
  if (features.amount_above_p95_flag) score += 120
  if (features.is_rooted) score += 200
  if (Number(features.failed_logins_1h) > 2) score += 80
  if (Number(features.amount_ratio_mean) > 3) score += 100
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

function getReasonCodes(features: Record<string, unknown>, score: number): string[] {
  const codes: string[] = []
  if (features.is_new_device && features.is_night_local) codes.push('NEW_DEVICE_NIGHT_TRANSFER')
  if (features.amount_above_p95_flag) codes.push('AMOUNT_ABOVE_CUSTOMER_P95')
  if (Number(features.p2p_after_login_secs) < 300) codes.push('P2P_AFTER_LOGIN_MINUTES')
  if (features.is_rooted) codes.push('ROOTED_DEVICE')
  if (Number(features.failed_logins_1h) > 2) codes.push('MULTIPLE_FAILED_LOGINS')
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const startTime = performance.now()

    if (!body.request_id) {
      return new Response(JSON.stringify({ title: 'INVALID_SCHEMA', detail: 'request_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/problem+json' },
      })
    }

    // Idempotency check
    const { data: existing } = await supabase
      .from('decisions')
      .select('*')
      .eq('request_id', body.request_id)
      .maybeSingle()

    if (existing) {
      return new Response(JSON.stringify({
        request_id: existing.request_id,
        decision: existing.decision,
        risk_score: existing.risk_score,
        reason_codes: existing.reason_codes || [],
        rules_fired: existing.rules_fired || [],
        model_version: existing.model_version,
        degraded: existing.degraded,
        latency_ms: existing.latency_ms,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Compute features
    const features = computeFeatures(body)

    // Fetch active and shadow rules
    const { data: rules } = await supabase
      .from('rules')
      .select('*')
      .in('status', ['active', 'shadow'])

    // Evaluate rules
    const firedRules: { id: string; version: number }[] = []
    const firedReasons: string[] = []
    let ruleDecision: 'ALLOW' | 'CHALLENGE' | 'BLOCK' | null = null

    for (const rule of (rules || []) as Rule[]) {
      if (evaluateRule(rule, features)) {
        firedRules.push({ id: rule.id.slice(0, 8), version: rule.version })
        if (rule.reason_code) firedReasons.push(rule.reason_code)
        if (rule.status === 'active') {
          if (rule.action === 'BLOCK') { ruleDecision = 'BLOCK'; break }
          if (rule.action === 'CHALLENGE' && ruleDecision !== 'BLOCK') ruleDecision = 'CHALLENGE'
        }
      }
    }

    // ML inference (simulated)
    const { data: champion } = await supabase
      .from('model_versions')
      .select('version')
      .eq('status', 'champion')
      .maybeSingle()

    const modelVersion = champion?.version || 'lgbm-2026.10.1'
    const mlScore = computeRiskScore(features)

    // Final decision
    let riskScore = mlScore
    let decision: 'ALLOW' | 'CHALLENGE' | 'BLOCK'

    if (ruleDecision) {
      decision = ruleDecision
    } else {
      if (riskScore < 600) decision = 'ALLOW'
      else if (riskScore < 800) decision = 'CHALLENGE'
      else decision = 'BLOCK'
    }

    const reasonCodes = firedReasons.length > 0
      ? [...new Set([...firedReasons, ...getReasonCodes(features, riskScore)])].slice(0, 3)
      : getReasonCodes(features, riskScore)

    const latencyMs = Math.round(performance.now() - startTime)

    // Insert event
    const { data: eventRow } = await supabase.from('events').insert({
      request_id: body.request_id,
      tenant_id: body.tenant_id || 'default',
      event_type: body.event_type,
      customer_id_hash: body.customer?.customer_ref || null,
      amount_uzs: Number(body.transaction?.amount || 0),
      currency: body.transaction?.currency || 'UZS',
      counterparty_hash: body.transaction?.counterparty_ref || null,
      device_id_hash: body.device?.device_ref || null,
      ip_address: body.network?.ip || null,
      geo_country: body.network?.geo_country || null,
      geo_city: body.network?.geo_city || null,
      channel: body.transaction?.channel || null,
      customer_ref: body.customer?.customer_ref || null,
      account_age_days: Number(body.customer?.account_age_days || 0),
      is_new_device: body.device?.is_new_device || false,
      os: body.device?.os || null,
      app_version: body.device?.app_version || null,
      is_rooted: body.device?.is_rooted || false,
      failed_logins_last_hour: Number(body.session?.failed_logins_last_hour || 0),
      raw_request: body,
      occurred_at: body.occurred_at || new Date().toISOString(),
    }).select('id').maybeSingle()

    // Insert decision
    const { data: decisionRow } = await supabase.from('decisions').insert({
      event_id: eventRow?.id,
      request_id: body.request_id,
      decision,
      risk_score: riskScore,
      model_version: modelVersion,
      rules_fired: firedRules,
      reason_codes: reasonCodes,
      feature_snapshot: features,
      degraded: false,
      latency_ms: latencyMs,
    }).select('id').maybeSingle()

    // Create case for CHALLENGE or BLOCK
    if (decision !== 'ALLOW' && decisionRow?.id && eventRow?.id) {
      const slaHours = decision === 'BLOCK' ? 0.5 : 4
      const slaDue = new Date()
      slaDue.setMinutes(slaDue.getMinutes() + slaHours * 60)

      await supabase.from('cases').insert({
        decision_id: decisionRow.id,
        event_id: eventRow.id,
        priority: Math.min(100, Math.round(riskScore / 10)),
        status: 'open',
        sla_due_at: slaDue.toISOString(),
      })
    }

    const response = {
      request_id: body.request_id,
      decision,
      risk_score: riskScore,
      reason_codes: reasonCodes,
      challenge: decision === 'CHALLENGE' ? { type: 'otp_sms', ttl_seconds: 120 } : undefined,
      model_version: modelVersion,
      rules_fired: firedRules,
      degraded: false,
      latency_ms: latencyMs,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({
      title: 'SERVICE_DEGRADED',
      detail: err instanceof Error ? err.message : 'Unknown error',
      degraded: true,
    }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/problem+json' },
    })
  }
})
