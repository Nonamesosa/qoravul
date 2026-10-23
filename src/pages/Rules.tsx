import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Plus, CheckCircle, Eye, EyeOff, Trash2, Filter, ArrowRight } from 'lucide-react'
import { getRuleStatusBadgeClass, formatDate } from '../lib/utils'
import type { Rule, TeamUser } from '../types'
import clsx from 'clsx'

type FilterStatus = 'all' | 'draft' | 'shadow' | 'active' | 'disabled'

export default function Rules() {
  const { t, lang, user } = useAuth()
  const [rules, setRules] = useState<(Rule & { created_by_user?: TeamUser; approved_by_user?: TeamUser })[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const canManage = user?.role === 'admin' || user?.role === 'fraud_manager'

  const fetchRules = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('rules').select('*').order('updated_at', { ascending: false })
    if (filter !== 'all') query = query.eq('status', filter)
    const { data } = await query
    setRules((data || []) as (Rule & { created_by_user?: TeamUser; approved_by_user?: TeamUser })[])
    setLoading(false)
  }, [filter])

  useEffect(() => { fetchRules() }, [fetchRules])

  const approve = async (rule: Rule) => {
    if (!user || rule.created_by === user.id) return
    const { error } = await supabase
      .from('rules')
      .update({ approved_by: user.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', rule.id)
    if (!error) fetchRules()
  }

  const activate = async (rule: Rule) => {
    if (!rule.approved_by) return
    const { error } = await supabase
      .from('rules')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', rule.id)
    if (!error) fetchRules()
  }

  const moveToShadow = async (rule: Rule) => {
    if (!rule.approved_by) return
    const { error } = await supabase
      .from('rules')
      .update({ status: 'shadow', updated_at: new Date().toISOString() })
      .eq('id', rule.id)
    if (!error) fetchRules()
  }

  const disable = async (rule: Rule) => {
    const { error } = await supabase
      .from('rules')
      .update({ status: 'disabled', updated_at: new Date().toISOString() })
      .eq('id', rule.id)
    if (!error) fetchRules()
  }

  const remove = async (rule: Rule) => {
    if (!confirm(t('confirmDelete'))) return
    const { error } = await supabase.from('rules').delete().eq('id', rule.id)
    if (!error) fetchRules()
  }

  const filters: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: t('all') },
    { key: 'active', label: t('active') },
    { key: 'shadow', label: t('shadow') },
    { key: 'draft', label: t('draft') },
    { key: 'disabled', label: t('disabled') },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{t('rules')}</h1>
          <p className="text-neutral-500 text-sm mt-0.5">{t('rulesList')}</p>
        </div>
        {canManage && (
          <Link to="/rules/new" className="btn-primary">
            <Plus className="w-4 h-4" />
            {t('createRule')}
          </Link>
        )}
      </div>

      <div className="flex gap-2">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={clsx('btn-sm', filter === f.key ? 'btn-primary' : 'btn-secondary')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : rules.length === 0 ? (
        <div className="card p-12 text-center">
          <Filter className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
          <p className="text-neutral-400">{t('noData')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div key={rule.id} className="card p-4 hover:shadow-md transition-all">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`badge ${getRuleStatusBadgeClass(rule.status)}`}>
                      {rule.status === 'active' ? t('active') : rule.status === 'shadow' ? t('shadow') : rule.status === 'draft' ? t('draft') : t('disabled')}
                    </div>
                    <span className={clsx('badge', rule.action === 'BLOCK' ? 'badge-block' : rule.action === 'CHALLENGE' ? 'badge-challenge' : 'badge-allow')}>
                      {rule.action}
                    </span>
                    <span className="text-xs text-neutral-400">v{rule.version}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-neutral-900">{rule.name}</h3>
                  {rule.reason_code && (
                    <p className="text-xs text-neutral-500 font-mono mt-0.5">{rule.reason_code}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-neutral-400">
                    <span>{t('createdBy')}: {rule.created_by ? '✓' : '—'}</span>
                    <span>·</span>
                    <span>{rule.approved_by ? `✓ ${t('approved')}` : t('notApproved')}</span>
                    <span>·</span>
                    <span>{formatDate(rule.updated_at, lang)}</span>
                  </div>
                </div>

                {/* Actions */}
                {canManage && (
                  <div className="flex items-center gap-1.5">
                    {!rule.approved_by && rule.created_by !== user?.id && rule.status === 'draft' && (
                      <button onClick={() => approve(rule)} className="btn-sm btn-success" title={t('approve')}>
                        <CheckCircle className="w-3.5 h-3.5" />
                        {t('approve')}
                      </button>
                    )}
                    {rule.approved_by && rule.status === 'draft' && (
                      <button onClick={() => moveToShadow(rule)} className="btn-sm btn-secondary" title={t('shadowMode')}>
                        <Eye className="w-3.5 h-3.5" />
                        {t('shadow')}
                      </button>
                    )}
                    {rule.approved_by && (rule.status === 'shadow' || rule.status === 'disabled') && (
                      <button onClick={() => activate(rule)} className="btn-sm btn-primary" title={t('activate')}>
                        <ArrowRight className="w-3.5 h-3.5" />
                        {t('activate')}
                      </button>
                    )}
                    {rule.status === 'active' && (
                      <button onClick={() => disable(rule)} className="btn-sm btn-secondary" title={t('deactivate')}>
                        <EyeOff className="w-3.5 h-3.5" />
                        {t('deactivate')}
                      </button>
                    )}
                    {rule.status === 'shadow' && (
                      <button onClick={() => disable(rule)} className="btn-sm btn-secondary" title={t('deactivate')}>
                        <EyeOff className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {user?.role === 'admin' && (
                      <button onClick={() => remove(rule)} className="btn-sm btn-danger" title={t('deleteRule')}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <Link to={`/rules/${rule.id}/edit`} className="btn-sm btn-secondary">
                      {t('review')}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
