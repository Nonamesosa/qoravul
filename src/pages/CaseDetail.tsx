import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { logAudit } from '../lib/audit'
import { ArrowLeft, UserPlus, CheckCircle, XCircle, HelpCircle, Clock } from 'lucide-react'
import {
  getDecisionBadgeClass, getCaseStatusBadgeClass, getSlaRemaining, isSlaBreached,
  formatDate, formatCurrency, getRiskScoreColor,
} from '../lib/utils'
import type { FraudCase, Decision, FraudEvent, TeamUser, Label } from '../types'
import clsx from 'clsx'

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, lang, user } = useAuth()
  const [caseData, setCaseData] = useState<(FraudCase & { decision?: Decision; event?: FraudEvent; assignee?: TeamUser }) | null>(null)
  const [labels, setLabels] = useState<Label[]>([])
  const [customerHistory, setCustomerHistory] = useState<FraudEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [outcome, setOutcome] = useState<'confirmed_fraud' | 'legitimate' | 'unsure'>('legitimate')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCase = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('cases')
      .select(`
        *,
        decision:decisions(*),
        event:events(*),
        assignee:team_users(id, full_name, email)
      `)
      .eq('id', id)
      .maybeSingle()

    if (err || !data) {
      navigate('/cases')
      return
    }

    setCaseData(data as any)

    // Fetch labels for this event
    if (data.event_id) {
      const { data: labelData } = await supabase
        .from('labels')
        .select('*')
        .eq('event_id', data.event_id)
      setLabels((labelData || []) as Label[])

      // Fetch customer history (last 90 days)
      if (data.event?.customer_id_hash) {
        const ninetyDaysAgo = new Date()
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
        const { data: history } = await supabase
          .from('events')
          .select('*')
          .eq('customer_id_hash', data.event.customer_id_hash)
          .gte('occurred_at', ninetyDaysAgo.toISOString())
          .order('occurred_at', { ascending: false })
          .limit(20)
        setCustomerHistory((history || []) as FraudEvent[])
      }
    }
    setLoading(false)
  }, [id, navigate])

  useEffect(() => {
    fetchCase()
  }, [fetchCase])

  const assignToMe = async () => {
    if (!caseData || !user) return
    const { error: err } = await supabase
      .from('cases')
      .update({ assignee_id: user.id, status: 'in_review', updated_at: new Date().toISOString() })
      .eq('id', caseData.id)
    if (err) { setError(err.message); return }
    await logAudit('case.assign', 'case', caseData.id, { assignee: user.id })
    fetchCase()
  }

  const closeCase = async () => {
    if (!caseData || !user) return
    if (outcome === 'confirmed_fraud' && !note.trim()) {
      setError(t('noteRequired'))
      return
    }
    setSubmitting(true)
    setError(null)

    const { error: err } = await supabase
      .from('cases')
      .update({
        status: 'closed',
        outcome,
        analyst_note: note,
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseData.id)

    if (err) { setError(err.message); setSubmitting(false); return }

    // Create label for ML training
    if (caseData.event_id) {
      await supabase.from('labels').insert({
        event_id: caseData.event_id,
        label: outcome === 'confirmed_fraud' ? 1 : 0,
        source: 'analyst',
        labeled_by: user.id,
      })
    }

    await logAudit('case.close', 'case', caseData.id, { outcome, note })
    setSubmitting(false)
    fetchCase()
  }

  if (loading || !caseData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    )
  }

  const breached = isSlaBreached(caseData.sla_due_at)
  const decision = caseData.decision
  const event = caseData.event

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link to="/cases" className="btn-sm btn-secondary">
          <ArrowLeft className="w-4 h-4" />
          {t('back')}
        </Link>
        <h1 className="text-xl font-bold text-neutral-900">{t('caseDetails')}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: event + decision details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Event details */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-neutral-700 mb-4">{t('eventDetails')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <DetailItem label={t('eventType')} value={event?.event_type || '—'} />
              <DetailItem label={t('amount')} value={event?.amount_uzs ? `${formatCurrency(Number(event.amount_uzs))} UZS` : '—'} />
              <DetailItem label={t('channel')} value={event?.channel || '—'} />
              <DetailItem label="IP" value={event?.ip_address || '—'} />
              <DetailItem label={t('location')} value={`${event?.geo_city || '—'}, ${event?.geo_country || '—'}`} />
              <DetailItem label={t('device')} value={`${event?.os || '—'} / ${event?.is_new_device ? 'New' : 'Known'}`} />
              <DetailItem label={t('eventType')} value={formatDate(event?.occurred_at || '', lang)} />
              <DetailItem label="Customer ref" value={event?.customer_ref || '—'} />
            </div>
          </div>

          {/* Decision details */}
          {decision && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-neutral-700 mb-4">{t('decisionDetails')}</h3>
              <div className="flex items-center gap-3 mb-4">
                <div className={`badge ${getDecisionBadgeClass(decision.decision)}`}>
                  {decision.decision}
                </div>
                <div className={clsx('px-3 py-1 rounded-lg text-sm font-bold', getRiskScoreColor(decision.risk_score))}>
                  {t('riskScore')}: {decision.risk_score}
                </div>
                {decision.degraded && (
                  <span className="badge bg-warning-100 text-warning-600">DEGRADED</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <DetailItem label={t('modelVersion')} value={decision.model_version || '—'} />
                <DetailItem label="Latency" value={decision.latency_ms ? `${decision.latency_ms}ms` : '—'} />
              </div>
              <div className="mt-4">
                <p className="text-xs font-medium text-neutral-500 mb-2">{t('reasonCodes')}</p>
                <div className="flex flex-wrap gap-2">
                  {(decision.reason_codes as string[])?.map((code, i) => (
                    <span key={i} className="px-2.5 py-1 bg-neutral-100 text-neutral-700 text-xs rounded-lg font-mono">
                      {code}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <p className="text-xs font-medium text-neutral-500 mb-2">{t('rulesFired')}</p>
                <div className="flex flex-wrap gap-2">
                  {(decision.rules_fired as any[])?.map((r, i) => (
                    <span key={i} className="px-2.5 py-1 bg-primary-50 text-primary-700 text-xs rounded-lg font-mono">
                      {r.id} v{r.version}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Customer history */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-neutral-700 mb-4">{t('customerHistory')}</h3>
            {customerHistory.length === 0 ? (
              <p className="text-neutral-400 text-sm">{t('noData')}</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {customerHistory.map(e => (
                  <div key={e.id} className="flex items-center justify-between py-1.5 px-2 rounded text-sm hover:bg-neutral-50">
                    <span className="text-neutral-600">{e.event_type}</span>
                    <span className="text-neutral-400 text-xs">{formatDate(e.occurred_at, lang)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: case actions */}
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-neutral-700">{t('caseDetails')}</h3>
              <div className={`badge ${getCaseStatusBadgeClass(caseData.status)}`}>
                {caseData.status === 'open' ? t('openCases') : caseData.status === 'in_review' ? t('inReview') : t('closed')}
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">{t('priority')}</span>
                <span className="font-medium text-neutral-900">{caseData.priority}/100</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Assignee</span>
                <span className="font-medium text-neutral-900">{caseData.assignee?.full_name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">{t('sla')}</span>
                <span className={clsx('font-medium', breached ? 'text-danger-600' : 'text-neutral-900')}>
                  {caseData.status === 'closed' ? '—' : breached ? t('slaBreached') : getSlaRemaining(caseData.sla_due_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Created</span>
                <span className="font-medium text-neutral-900">{formatDate(caseData.created_at, lang)}</span>
              </div>
            </div>

            {caseData.status === 'open' && (
              <button onClick={assignToMe} className="btn-primary w-full mt-4">
                <UserPlus className="w-4 h-4" />
                {t('assignToMe')}
              </button>
            )}
          </div>

          {/* Close case form */}
          {caseData.status !== 'closed' && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-neutral-700 mb-4">{t('closeCase')}</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setOutcome('confirmed_fraud')}
                    className={clsx(
                      'flex flex-col items-center gap-1.5 py-3 rounded-lg border-2 transition-all',
                      outcome === 'confirmed_fraud'
                        ? 'border-danger-500 bg-danger-50 text-danger-700'
                        : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'
                    )}
                  >
                    <XCircle className="w-5 h-5" />
                    <span className="text-xs font-medium">{t('confirmFraud')}</span>
                  </button>
                  <button
                    onClick={() => setOutcome('legitimate')}
                    className={clsx(
                      'flex flex-col items-center gap-1.5 py-3 rounded-lg border-2 transition-all',
                      outcome === 'legitimate'
                        ? 'border-success-500 bg-success-50 text-success-700'
                        : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'
                    )}
                  >
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-xs font-medium">{t('legitimate')}</span>
                  </button>
                  <button
                    onClick={() => setOutcome('unsure')}
                    className={clsx(
                      'flex flex-col items-center gap-1.5 py-3 rounded-lg border-2 transition-all',
                      outcome === 'unsure'
                        ? 'border-warning-500 bg-warning-50 text-warning-600'
                        : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'
                    )}
                  >
                    <HelpCircle className="w-5 h-5" />
                    <span className="text-xs font-medium">{t('unsure')}</span>
                  </button>
                </div>

                <div>
                  <label className="label">{t('analystNote')}</label>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="input min-h-[80px] resize-y"
                    placeholder={outcome === 'confirmed_fraud' ? t('noteRequired') : ''}
                  />
                </div>

                {error && (
                  <div className="bg-danger-50 border border-danger-200 text-danger-700 text-sm rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}

                <button
                  onClick={closeCase}
                  disabled={submitting}
                  className="btn-primary w-full"
                >
                  {submitting ? t('loading') : t('closeCase')}
                </button>
              </div>
            </div>
          )}

          {/* Labels */}
          {labels.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-neutral-700 mb-3">Labels</h3>
              <div className="space-y-2">
                {labels.map(l => (
                  <div key={l.id} className="flex items-center justify-between text-sm">
                    <span className={clsx('badge', l.label === 1 ? 'badge-block' : 'badge-allow')}>
                      {l.label === 1 ? 'FRAUD' : 'LEGIT'}
                    </span>
                    <span className="text-xs text-neutral-400">{l.source}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-neutral-900">{value}</p>
    </div>
  )
}
