import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatDate } from '../lib/utils'
import type { AuditLogEntry, TeamUser } from '../types'

export default function AuditLog() {
  const { t, lang } = useAuth()
  const [entries, setEntries] = useState<(AuditLogEntry & { actor?: TeamUser })[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const fetchLog = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('audit_log')
      .select('*, actor:team_users(id, full_name, email)')
      .order('created_at', { ascending: false })
      .limit(200)

    if (search) {
      query = query.or(`action.ilike.%${search}%,entity.ilike.%${search}%`)
    }

    const { data } = await query
    setEntries((data || []) as any)
    setLoading(false)
  }, [search])

  useEffect(() => { fetchLog() }, [fetchLog])

  const exportCsv = () => {
    const rows = entries.map(e => [
      e.created_at, e.actor?.full_name || '—', e.action, e.entity, e.entity_id || '—',
      e.diff ? JSON.stringify(e.diff) : '',
    ])
    const csv = ['timestamp,actor,action,entity,entity_id,diff', ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{t('auditLog')}</h1>
          <p className="text-neutral-500 text-sm mt-0.5">{t('auditTrail')}</p>
        </div>
        <button onClick={exportCsv} className="btn-secondary">
          {t('export')} CSV
        </button>
      </div>

      <div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input max-w-xs"
          placeholder={t('search')}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-neutral-400">{t('noData')}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-neutral-600">{t('timestamp')}</th>
                  <th className="text-left px-4 py-3 font-medium text-neutral-600">{t('actor')}</th>
                  <th className="text-left px-4 py-3 font-medium text-neutral-600">{t('action')}</th>
                  <th className="text-left px-4 py-3 font-medium text-neutral-600">{t('entity')}</th>
                  <th className="text-left px-4 py-3 font-medium text-neutral-600">{t('changes')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="px-4 py-2.5 text-xs text-neutral-400">{formatDate(e.created_at, lang)}</td>
                    <td className="px-4 py-2.5 text-neutral-700">{e.actor?.full_name || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-primary-600">{e.action}</span>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">{e.entity}</td>
                    <td className="px-4 py-2.5 text-xs text-neutral-400 font-mono max-w-xs truncate">
                      {e.diff ? JSON.stringify(e.diff) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
