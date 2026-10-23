import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { logAudit } from '../lib/audit'
import { FolderOpen, Filter, UserPlus, AlertCircle, ShieldAlert } from 'lucide-react'
import {
  getCaseStatusBadgeClass, getSlaRemaining, isSlaBreached,
  formatTimeAgo, formatCurrency,
} from '../lib/utils'
import type { FraudCase, Decision, FraudEvent, TeamUser } from '../types'
import clsx from 'clsx'

type FilterStatus = 'all' | 'open' | 'in_review' | 'closed'

export default function Cases() {
  const { t, lang, user } = useAuth()
  const [cases, setCases] = useState<(FraudCase & { decision?: Decision; event?: FraudEvent; assignee?: TeamUser })[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('open')

  const fetchCases = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('cases')
      .select(`
        *,
        decision:decisions(*),
        event:events(*),
        assignee:team_users(id, full_name, email)
      `)
      .order('created_at', { ascending: false })

    if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    const { data, error } = await query.limit(100)
    if (error) {
      console.error('Error fetching cases:', error)
    } else {
      setCases((data || []) as any)
    }
    setLoading(false)
  }, [filter])

  useEffect(() => {
    fetchCases()
  }, [fetchCases])

  const assignToMe = async (caseId: string) => {
    if (!user || user.role === 'auditor') return
    const { error } = await supabase
      .from('cases')
      .update({
        assignee_id: user.id,
        status: 'in_review',
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseId)

    if (!error) {
      await logAudit('case.assign', 'case', caseId, { assignee: user.id, assignee_name: user.full_name })
      fetchCases()
    }
  }

  const filterTabs: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: t('all') },
    { key: 'open', label: t('openCases') },
    { key: 'in_review', label: t('inReview') },
    { key: 'closed', label: t('closed') },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{t('cases')}</h1>
          <p className="text-neutral-500 text-sm mt-0.5">{t('caseQueue')}</p>
        </div>
      </div>

      {/* Auditor read-only notice */}
      {user?.role === 'auditor' && (
        <div className="card p-4 bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="text-xs">
            <span className="font-bold">Auditor rejimi:</span> {t('auditorReadOnly')}. Keyslarni biriktirish ("Meni tayinlash") va yopish operatsion amallar hisoblanadi. Auditor keyslar navbati va ularning qarorlarini faqat ko'rib chiqishi mumkin.
          </div>
        </div>
      )}


      {/* Filter tabs */}
      <div className="flex gap-2">
        {filterTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={clsx(
              'btn-sm',
              filter === tab.key ? 'btn-primary' : 'btn-secondary'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Cases list */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : cases.length === 0 ? (
        <div className="card p-12 text-center">
          <FolderOpen className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
          <p className="text-neutral-400">{t('noCases')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cases.map(c => {
            const breached = isSlaBreached(c.sla_due_at)
            return (
              <Link
                key={c.id}
                to={`/cases/${c.id}`}
                className="card p-4 hover:shadow-md transition-all duration-150 flex items-center gap-4 group"
              >
                {/* Priority indicator */}
                <div
                  className={clsx(
                    'w-1.5 h-12 rounded-full',
                    c.priority >= 80 ? 'bg-danger-500' :
                    c.priority >= 50 ? 'bg-warning-500' : 'bg-neutral-300'
                  )}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`badge ${getCaseStatusBadgeClass(c.status)}`}>
                      {c.status === 'open' ? t('openCases') : c.status === 'in_review' ? t('inReview') : t('closed')}
                    </div>
                    {c.outcome && (
                      <span className="text-xs text-neutral-500">
                        {c.outcome === 'confirmed_fraud' ? t('confirmFraud') :
                         c.outcome === 'legitimate' ? t('legitimate') : t('unsure')}
                      </span>
                    )}
                    <span className="text-xs text-neutral-400">·</span>
                    <span className="text-xs text-neutral-500">
                      {c.event?.event_type || '—'}
                    </span>
                    {c.event?.amount_uzs && (
                      <>
                        <span className="text-xs text-neutral-400">·</span>
                        <span className="text-xs font-medium text-neutral-700">
                          {formatCurrency(Number(c.event.amount_uzs))} UZS
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-neutral-600 truncate">
                    {(c.decision?.reason_codes as string[])?.join(', ') || '—'}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400">
                    <span>{t('riskScore')}: <strong className="text-neutral-700">{c.decision?.risk_score || '—'}</strong></span>
                    <span>·</span>
                    <span>{formatTimeAgo(c.created_at, lang)}</span>
                    {c.assignee && (
                      <>
                        <span>·</span>
                        <span>{c.assignee.full_name}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* SLA */}
                {c.status !== 'closed' && c.sla_due_at && (
                  <div className={clsx(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium',
                    breached ? 'bg-danger-100 text-danger-700' : 'bg-neutral-100 text-neutral-600'
                  )}>
                    <AlertCircle className="w-3.5 h-3.5" />
                    {breached ? t('slaBreached') : `${t('slaRemaining')} ${getSlaRemaining(c.sla_due_at)}`}
                  </div>
                )}

                {/* Assign to me button (hidden for auditor) */}
                {c.status === 'open' && user?.role !== 'auditor' && (
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      assignToMe(c.id)
                    }}
                    className="btn-sm btn-secondary opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {t('assignToMe')}
                  </button>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
