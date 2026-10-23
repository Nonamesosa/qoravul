import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { logAudit } from '../lib/audit'
import { ArrowLeft, Plus, Trash2, Save, CheckCircle, Eye, EyeOff, Zap, AlertTriangle, ShieldCheck } from 'lucide-react'
import { getRuleStatusBadgeClass, formatDate } from '../lib/utils'
import type { RuleCondition, DecisionType, Rule, TeamUser } from '../types'
import clsx from 'clsx'

const FEATURES = [
  'amount_current', 'amount_mean_30d', 'amount_p95_30d', 'amount_ratio_mean', 'amount_zscore_log',
  'amount_above_p95_flag', 'amount_round_flag', 'amount_first_large_flag', 'amount_sum_1h', 'amount_sum_24h',
  'txn_count_5m', 'txn_count_1h', 'txn_count_24h', 'distinct_counterparties_1h', 'distinct_counterparties_24h',
  'new_counterparty_flag', 'secs_since_last_txn', 'secs_since_login', 'failed_logins_1h', 'p2p_after_login_secs',
  'is_new_device', 'device_age_days', 'devices_per_customer_30d', 'customers_per_device_30d', 'is_rooted',
  'app_version_outdated', 'sim_changed_recently', 'emulator_flag', 'device_session_count_24h', 'screen_remote_control_flag',
  'ip_is_new_30d', 'ip_customers_24h', 'ip_is_datacenter_or_vpn', 'geo_country_mismatch', 'geo_city_change_1h',
  'impossible_travel_flag', 'distance_from_home_km', 'distance_from_last_txn_km', 'is_night_local', 'local_hour_sin',
  'account_age_days', 'days_since_profile_change', 'phone_changed_recently', 'card_added_recently', 'card_added_by_new_device',
  'kyc_level', 'has_2fa', 'prior_fraud_labels_90d',
  'loan_requests_7d', 'loan_amount_requested', 'loan_to_income_ratio', 'loan_disbursed_then_p2p_flag', 'loan_request_night_flag', 'loan_device_shared_flag',
  'cp_fraud_labels_30d', 'cp_inbound_distinct_senders_24h', 'cp_account_age_days', 'cp_is_blacklisted', 'cp_fan_in_ratio', 'cp_rapid_forward_flag',
]

const OPERATORS: { value: RuleCondition['op']; label: string }[] = [
  { value: 'eq', label: '==' },
  { value: 'neq', label: '!=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'in', label: 'in' },
  { value: 'contains', label: 'contains' },
]

export default function RuleEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, lang, user } = useAuth()
  const [rule, setRule] = useState<(Rule & { created_by_user?: TeamUser; approved_by_user?: TeamUser }) | null>(null)
  const [name, setName] = useState('')
  const [action, setAction] = useState<DecisionType>('CHALLENGE')
  const [reasonCode, setReasonCode] = useState('')
  const [logic, setLogic] = useState<'all' | 'any'>('all')
  const [conditions, setConditions] = useState<RuleCondition[]>([
    { feature: 'is_new_device', op: 'eq', value: true },
  ])
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const canManage = user?.role === 'admin' || user?.role === 'fraud_manager'

  const fetchRule = useCallback(async () => {
    if (!id) return
    const { data } = await supabase.from('rules').select('*').eq('id', id).maybeSingle()
    if (data) {
      setRule(data as any)
      setName(data.name)
      setAction(data.action)
      setReasonCode(data.reason_code || '')
      const def = data.definition
      if (def?.conditions?.all) {
        setLogic('all')
        setConditions(def.conditions.all)
      } else if (def?.conditions?.any) {
        setLogic('any')
        setConditions(def.conditions.any)
      }
    }
  }, [id])

  useEffect(() => {
    fetchRule()
  }, [fetchRule])

  const addCondition = () => {
    setConditions([...conditions, { feature: FEATURES[0], op: 'eq', value: '' }])
  }

  const updateCondition = (i: number, field: keyof RuleCondition, val: unknown) => {
    const updated = [...conditions]
    ;(updated[i] as any)[field] = val
    setConditions(updated)
  }

  const removeCondition = (i: number) => {
    setConditions(conditions.filter((_, idx) => idx !== i))
  }

  // 4-eyes approval action (FR-13)
  const approveRule = async () => {
    if (!rule || !user || !canManage) return
    setError(null)
    setSuccessMsg(null)

    // 4-eyes enforcement: creator cannot approve own rule (FR-13)
    if (rule.created_by && rule.created_by === user.id && user.role !== 'admin') {
      setError(t('cannotApproveOwn'))
      return
    }

    setActionLoading(true)
    const { error: err } = await supabase
      .from('rules')
      .update({
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', rule.id)

    if (err) {
      setError(err.message)
    } else {
      await logAudit('rule.approve', 'rule', rule.id, {
        approved_by: user.id,
        rule_name: rule.name,
      })
      setSuccessMsg(t('approved'))
      fetchRule()
    }
    setActionLoading(false)
  }

  // Revoke approval
  const revokeApproval = async () => {
    if (!rule || !user || !canManage) return
    setActionLoading(true)
    const { error: err } = await supabase
      .from('rules')
      .update({
        approved_by: null,
        approved_at: null,
        status: 'draft',
        updated_at: new Date().toISOString(),
      })
      .eq('id', rule.id)

    if (err) {
      setError(err.message)
    } else {
      await logAudit('rule.revoke_approval', 'rule', rule.id, { rule_name: rule.name })
      fetchRule()
    }
    setActionLoading(false)
  }

  // Activate / Shadow / Deactivate status change
  const setRuleStatus = async (newStatus: 'active' | 'shadow' | 'disabled') => {
    if (!rule || !user || !canManage) return
    setError(null)

    if ((newStatus === 'active' || newStatus === 'shadow') && !rule.approved_by) {
      setError(t('needsApproval'))
      return
    }

    setActionLoading(true)
    const { error: err } = await supabase
      .from('rules')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rule.id)

    if (err) {
      setError(err.message)
    } else {
      await logAudit('rule.status_change', 'rule', rule.id, {
        from: rule.status,
        to: newStatus,
        rule_name: rule.name,
      })
      fetchRule()
    }
    setActionLoading(false)
  }

  const save = async () => {
    if (!name || conditions.length === 0 || !user) return
    setSaving(true)
    setError(null)
    setSuccessMsg(null)

    const definition = {
      conditions: logic === 'all' ? { all: conditions } : { any: conditions },
    }

    if (id) {
      const { error: err } = await supabase
        .from('rules')
        .update({
          name,
          action,
          reason_code: reasonCode,
          definition,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (err) {
        setError(err.message)
      } else {
        await logAudit('rule.update', 'rule', id, { name, action, reasonCode })
        fetchRule()
        setSuccessMsg(t('success'))
      }
    } else {
      const { data, error: err } = await supabase
        .from('rules')
        .insert({
          name,
          action,
          reason_code: reasonCode,
          definition,
          status: 'draft',
          version: 1,
          created_by: user.id,
        })
        .select('id')
        .maybeSingle()

      if (err) {
        setError(err.message)
      } else if (data) {
        await logAudit('rule.create', 'rule', data.id, { name, action })
        navigate('/rules')
      }
    }
    setSaving(false)
  }

  const isOwnRule = rule?.created_by === user?.id

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/rules')} className="btn-sm btn-secondary">
            <ArrowLeft className="w-4 h-4" />
            {t('back')}
          </button>
          <div>
            <h1 className="text-xl font-bold text-neutral-900">{id ? t('review') : t('createRule')}</h1>
            {rule && (
              <p className="text-xs text-neutral-500 font-mono mt-0.5">ID: {rule.id}</p>
            )}
          </div>
        </div>

        {rule && (
          <div className="flex items-center gap-2">
            <div className={`badge ${getRuleStatusBadgeClass(rule.status)}`}>
              {rule.status === 'active' ? t('active') : rule.status === 'shadow' ? t('shadow') : rule.status === 'draft' ? t('draft') : t('disabled')}
            </div>
            <div className={clsx('badge', rule.approved_by ? 'badge-active' : 'badge-draft')}>
              {rule.approved_by ? `✓ ${t('approved')}` : `✕ ${t('notApproved')}`}
            </div>
            <span className="text-xs text-neutral-400">v{rule.version}</span>
          </div>
        )}
      </div>

      {/* 4-Eyes Approval & Status Control Banner (FR-13, BUG-02) */}
      {rule && canManage && (
        <div className="card p-5 bg-gradient-to-r from-neutral-50 to-primary-50/20 border border-neutral-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary-600" />
                <h3 className="text-sm font-bold text-neutral-900">4-Eyes Tasdiqlash & Boshqaruv (FR-13)</h3>
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                Yaratilgan sana: {formatDate(rule.created_at, lang)}
                {rule.approved_at && ` · Tasdiqlangan: ${formatDate(rule.approved_at, lang)}`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Approve button for unapproved rules */}
              {!rule.approved_by && (
                <button
                  onClick={approveRule}
                  disabled={actionLoading || (isOwnRule && user?.role !== 'admin')}
                  className={clsx('btn-sm btn-success', isOwnRule && user?.role !== 'admin' && 'opacity-60 cursor-not-allowed')}
                  title={isOwnRule && user?.role !== 'admin' ? t('cannotApproveOwn') : t('approve')}
                >
                  <CheckCircle className="w-4 h-4" />
                  {t('approve')}
                </button>
              )}

              {/* Status transition buttons once approved */}
              {rule.approved_by && (
                <>
                  {rule.status !== 'active' && (
                    <button
                      onClick={() => setRuleStatus('active')}
                      disabled={actionLoading}
                      className="btn-sm btn-primary"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {t('activate')}
                    </button>
                  )}

                  {rule.status !== 'shadow' && (
                    <button
                      onClick={() => setRuleStatus('shadow')}
                      disabled={actionLoading}
                      className="btn-sm btn-secondary"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {t('shadowMode')}
                    </button>
                  )}

                  {rule.status !== 'disabled' && (
                    <button
                      onClick={() => setRuleStatus('disabled')}
                      disabled={actionLoading}
                      className="btn-sm btn-secondary"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      {t('deactivate')}
                    </button>
                  )}

                  <button
                    onClick={revokeApproval}
                    disabled={actionLoading}
                    className="btn-sm btn-secondary text-neutral-500"
                  >
                    {t('revokeApproval')}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 4-Eyes principle warning if current user is rule creator */}
          {isOwnRule && !rule.approved_by && user?.role !== 'admin' && (
            <div className="bg-warning-50 border border-warning-200 text-warning-800 p-2.5 rounded-lg text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-warning-600" />
              <span>{t('fourEyesRequirement')}</span>
            </div>
          )}

          {!rule.approved_by && (
            <div className="text-xs text-neutral-500 bg-white/60 rounded px-2.5 py-1.5 border border-neutral-100">
              <span className="font-semibold text-danger-600">Eslatma:</span> Tasdiqlanmagan qoidalar jonli tranzaksiyalarni baholashda (Scoring Engine) ishga tushmaydi.
            </div>
          )}
        </div>
      )}

      <div className="card p-6 space-y-5">
        <div>
          <label className="label">{t('ruleName')}</label>
          <input value={name} onChange={e => setName(e.target.value)} className="input" placeholder="Rule name" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">{t('ruleAction')}</label>
            <select value={action} onChange={e => setAction(e.target.value as DecisionType)} className="input">
              <option value="ALLOW">ALLOW</option>
              <option value="CHALLENGE">CHALLENGE</option>
              <option value="BLOCK">BLOCK</option>
            </select>
          </div>
          <div>
            <label className="label">{t('reasonCode')}</label>
            <input value={reasonCode} onChange={e => setReasonCode(e.target.value)} className="input" placeholder="NEW_DEVICE_NIGHT_TRANSFER" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">{t('conditions')}</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLogic('all')}
                className={`btn-sm ${logic === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              >
                ALL (AND)
              </button>
              <button
                type="button"
                onClick={() => setLogic('any')}
                className={`btn-sm ${logic === 'any' ? 'btn-primary' : 'btn-secondary'}`}
              >
                ANY (OR)
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {conditions.map((cond, i) => (
              <div key={i} className="flex items-center gap-2 bg-neutral-50 p-2.5 rounded-lg">
                <select
                  value={cond.feature}
                  onChange={e => updateCondition(i, 'feature', e.target.value)}
                  className="input flex-1 text-xs"
                >
                  {FEATURES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <select
                  value={cond.op}
                  onChange={e => updateCondition(i, 'op', e.target.value)}
                  className="input w-20 text-xs"
                >
                  {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input
                  value={String(cond.value)}
                  onChange={e => {
                    const v = e.target.value
                    updateCondition(i, 'value', v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v))
                  }}
                  className="input w-32 text-xs"
                  placeholder="value"
                />
                <button type="button" onClick={() => removeCondition(i)} className="text-danger-500 hover:text-danger-700 p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button type="button" onClick={addCondition} className="btn-sm btn-secondary mt-2">
            <Plus className="w-3.5 h-3.5" />
            {t('addCondition')}
          </button>
        </div>

        {error && (
          <div className="bg-danger-50 border border-danger-200 text-danger-700 text-sm rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="bg-success-50 border border-success-200 text-success-700 text-sm rounded-lg px-3 py-2">
            {successMsg}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={save} disabled={saving || !name} className="btn-primary">
            <Save className="w-4 h-4" />
            {id ? t('save') : t('saveDraft')}
          </button>
          <button onClick={() => navigate('/rules')} className="btn-secondary">
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
