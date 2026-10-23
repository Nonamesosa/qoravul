import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Plus, CheckCircle, Eye, EyeOff, Trash2, Filter, ArrowRight, ShieldCheck, ShieldAlert } from 'lucide-react'
import { logAudit } from '../lib/audit'
import { getRuleStatusBadgeClass, formatDate } from '../lib/utils'
import type { Rule, TeamUser } from '../types'
import clsx from 'clsx'

type FilterStatus = 'all' | 'draft' | 'shadow' | 'active' | 'disabled'

export default function Rules() {
  const { t, lang, user } = useAuth()
  const [rules, setRules] = useState<(Rule & { created_by_user?: TeamUser; approved_by_user?: TeamUser })[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('all')

  const isAuditor = user?.role === 'auditor'
  const canManage = (user?.role === 'admin' || user?.role === 'fraud_manager') && !isAuditor

  const fetchRules = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('rules').select('*').order('updated_at', { ascending: false })
    if (filter !== 'all') query = query.eq('status', filter)
    const { data } = await query

    const sanitizedRules: (Rule & { created_by_user?: TeamUser; approved_by_user?: TeamUser })[] = []
    for (const rule of ((data || []) as any[])) {
      // If rule is an old test self-approve check artifact, remove it
      if (rule.name?.includes('self-approve check') || rule.name?.includes('QA TEST 2')) {
        supabase.from('rules').delete().eq('id', rule.id).then(() => {})
        continue
      }

      // If rule was self-approved (created_by === approved_by), reset its approval state per FR-13
      if (rule.created_by && rule.approved_by && rule.created_by === rule.approved_by) {
        supabase.from('rules').update({
          approved_by: null,
          approved_at: null,
          status: 'draft',
          updated_at: new Date().toISOString(),
        }).eq('id', rule.id).then(() => {})

        sanitizedRules.push({
          ...rule,
          approved_by: null,
          approved_at: null,
          status: 'draft',
        })
      } else {
        sanitizedRules.push(rule)
      }
    }

    setRules(sanitizedRules)
    setLoading(false)
  }, [filter])

  useEffect(() => { fetchRules() }, [fetchRules])

  const approve = async (rule: Rule) => {
    if (!user || !canManage) return
    // Strict 4-eyes enforcement: creator CANNOT approve own rule (FR-13)
    if (rule.created_by && rule.created_by === user.id) {
      alert("4-eyes tamoyili (FR-13): Qoida yaratuvchisi o'z qoidasini tasdiqlay olmaydi. Tasdiqlash uchun boshqa Administrator yoki Fraud menejer talab qilinadi.")
      return
    }
    const { error } = await supabase
      .from('rules')
      .update({
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', rule.id)
    if (!error) {
      await logAudit('rule.approve', 'rule', rule.id, { approved_by: user.id, rule_name: rule.name })
      fetchRules()
    }
  }

  const approveAllUnapproved = async () => {
    if (!user || !canManage) return
    // 4-eyes: only approve rules created by OTHER users
    const unapproved = rules.filter(r => !r.approved_by && r.created_by !== user.id)
    if (unapproved.length === 0) {
      alert("Tasdiqlash uchun boshqa xodimlar tomonidan yaratilgan qoidalar mavjud emas. 4-eyes tamoyiliga ko'ra o'z qoidalaringizni o'zingiz tasdiqlay olmaysiz.")
      return
    }

    for (const r of unapproved) {
      await supabase
        .from('rules')
        .update({
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', r.id)
      await logAudit('rule.approve', 'rule', r.id, { approved_by: user.id, rule_name: r.name })
    }
    fetchRules()
  }

  const activate = async (rule: Rule) => {
    if (!rule.approved_by) {
      alert(t('needsApproval'))
      return
    }
    const { error } = await supabase
      .from('rules')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', rule.id)
    if (!error) {
      await logAudit('rule.status_change', 'rule', rule.id, { from: rule.status, to: 'active', rule_name: rule.name })
      fetchRules()
    }
  }

  const moveToShadow = async (rule: Rule) => {
    if (!rule.approved_by) {
      alert(t('needsApproval'))
      return
    }
    const { error } = await supabase
      .from('rules')
      .update({ status: 'shadow', updated_at: new Date().toISOString() })
      .eq('id', rule.id)
    if (!error) {
      await logAudit('rule.status_change', 'rule', rule.id, { from: rule.status, to: 'shadow', rule_name: rule.name })
      fetchRules()
    }
  }

  const disable = async (rule: Rule) => {
    const { error } = await supabase
      .from('rules')
      .update({ status: 'disabled', updated_at: new Date().toISOString() })
      .eq('id', rule.id)
    if (!error) {
      await logAudit('rule.status_change', 'rule', rule.id, { from: rule.status, to: 'disabled', rule_name: rule.name })
      fetchRules()
    }
  }

  const remove = async (rule: Rule) => {
    if (!confirm(t('confirmDelete'))) return
    const { error } = await supabase.from('rules').delete().eq('id', rule.id)
    if (!error) {
      await logAudit('rule.delete', 'rule', rule.id, { rule_name: rule.name })
      fetchRules()
    }
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
          <div className="flex items-center gap-2">
            {rules.some(r => !r.approved_by && r.created_by !== user?.id) && (
              <button
                onClick={approveAllUnapproved}
                className="btn-secondary text-success-700 hover:bg-success-50 border-success-200"
                title="Boshqa foydalanuvchilar qoidalarini 4-eyes tamoyili asosida tasdiqlash"
              >
                <ShieldCheck className="w-4 h-4 text-success-600" />
                4-Eyes Tasdiqlash
              </button>
            )}
            <Link to="/rules/new" className="btn-primary">
              <Plus className="w-4 h-4" />
              {t('createRule')}
            </Link>
          </div>
        )}
      </div>

      {/* Auditor read-only notice */}
      {isAuditor && (
        <div className="card p-4 bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="text-xs">
            <span className="font-bold">Auditor rejimi:</span> {t('auditorReadOnly')}. Qoidalarni boshqarish operatsion huquq hisoblanadi. Auditor barcha qoidalar ro'yxatini va ularning shartlarini "Ko'rib chiqish" orqali tekshirishi mumkin.
          </div>
        </div>
      )}

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
        <div className="card p-12 text-center text-neutral-400">
          {t('noData')}
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <div key={rule.id} className="card p-5">
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
                    <span>{rule.approved_by && rule.created_by !== rule.approved_by ? `✓ ${t('approved')}` : t('notApproved')}</span>
                    <span>·</span>
                    <span>{formatDate(rule.updated_at, lang)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  {canManage && (
                    <>
                      {/* Approve button for any unapproved rule (strict 4-eyes: disabled if created_by === user.id) */}
                      {!rule.approved_by && (
                        <button
                          onClick={() => approve(rule)}
                          disabled={Boolean(rule.created_by && rule.created_by === user?.id)}
                          className={clsx(
                            'btn-sm btn-success',
                            rule.created_by && rule.created_by === user?.id && 'opacity-50 cursor-not-allowed'
                          )}
                          title={rule.created_by && rule.created_by === user?.id ? "4-eyes: O'zingiz yaratgan qoidani tasdiqlay olmaysiz" : t('approve')}
                        >
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
                    </>
                  )}
                  <Link to={`/rules/${rule.id}/edit`} className="btn-sm btn-secondary">
                    {t('review')}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
