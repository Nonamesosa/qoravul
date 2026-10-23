import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { logAudit } from '../lib/audit'
import { UserPlus, Webhook, ToggleLeft, ToggleRight, Trash2, Plus } from 'lucide-react'
import { formatDate } from '../lib/utils'
import type { TeamUser, Webhook as WebhookType, UserRole, Language } from '../types'
import clsx from 'clsx'

type Tab = 'users' | 'webhooks'

export default function AdminPage() {
  const { t, lang, user } = useAuth()
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<TeamUser[]>([])
  const [webhooks, setWebhooks] = useState<WebhookType[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddUser, setShowAddUser] = useState(false)
  const [showAddWebhook, setShowAddWebhook] = useState(false)
  const [newWebhookUrl, setNewWebhookUrl] = useState('')
  const [newWebhookTenant, setNewWebhookTenant] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [usersRes, webhooksRes] = await Promise.all([
      supabase.from('team_users').select('*').order('created_at', { ascending: false }),
      supabase.from('webhooks').select('*').order('created_at', { ascending: false }),
    ])
    setUsers((usersRes.data || []) as TeamUser[])
    setWebhooks((webhooksRes.data || []) as WebhookType[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleUserActive = async (u: TeamUser) => {
    const { error } = await supabase
      .from('team_users')
      .update({ is_active: !u.is_active })
      .eq('id', u.id)
    if (!error) {
      await logAudit(u.is_active ? 'user.deactivate' : 'user.activate', 'team_users', u.id)
      fetchData()
    }
  }

  const toggleWebhook = async (wh: WebhookType) => {
    const { error } = await supabase
      .from('webhooks')
      .update({ is_active: !wh.is_active })
      .eq('id', wh.id)
    if (!error) fetchData()
  }

  const deleteWebhook = async (wh: WebhookType) => {
    if (!confirm(t('confirmDelete'))) return
    const { error } = await supabase.from('webhooks').delete().eq('id', wh.id)
    if (!error) fetchData()
  }

  const createWebhook = async () => {
    if (!newWebhookUrl || !newWebhookTenant) return
    const { error } = await supabase.from('webhooks').insert({
      url: newWebhookUrl,
      tenant_id: newWebhookTenant,
      is_active: true,
    })
    if (!error) {
      setShowAddWebhook(false)
      setNewWebhookUrl('')
      setNewWebhookTenant('')
      fetchData()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">{t('admin_panel')}</h1>
        <p className="text-neutral-500 text-sm mt-0.5">{t('teamMembers')} · {t('webhooks')}</p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('users')} className={clsx('btn-sm', tab === 'users' ? 'btn-primary' : 'btn-secondary')}>
          {t('teamMembers')}
        </button>
        <button onClick={() => setTab('webhooks')} className={clsx('btn-sm', tab === 'webhooks' ? 'btn-primary' : 'btn-secondary')}>
          {t('webhooks')}
        </button>
      </div>

      {tab === 'users' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">{t('fullName')}</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">{t('email')}</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">{t('role')}</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">{t('language')}</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">{t('isActive')}</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">{t('timestamp')}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium text-neutral-900">{u.full_name}</td>
                  <td className="px-4 py-3 text-neutral-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="badge bg-primary-50 text-primary-700">{t(u.role as any)}</span>
                  </td>
                  <td className="px-4 py-3 text-neutral-600 uppercase">{u.language}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('badge', u.is_active ? 'badge-active' : 'badge-disabled')}>
                      {u.is_active ? t('isActive') : t('disabled')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-400 text-xs">{formatDate(u.created_at, lang)}</td>
                  <td className="px-4 py-3">
                    {u.id !== user?.id && (
                      <button onClick={() => toggleUserActive(u)} className="text-neutral-400 hover:text-neutral-600">
                        {u.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'webhooks' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowAddWebhook(!showAddWebhook)} className="btn-primary">
              <Plus className="w-4 h-4" />
              {t('addWebhook')}
            </button>
          </div>

          {showAddWebhook && (
            <div className="card p-5 space-y-3 animate-fade-in">
              <div>
                <label className="label">Tenant ID</label>
                <input value={newWebhookTenant} onChange={e => setNewWebhookTenant(e.target.value)} className="input" placeholder="bank_xyz" />
              </div>
              <div>
                <label className="label">{t('webhookUrl')}</label>
                <input value={newWebhookUrl} onChange={e => setNewWebhookUrl(e.target.value)} className="input" placeholder="https://bank.uz/webhooks/fraud" />
              </div>
              <div className="flex gap-2">
                <button onClick={createWebhook} className="btn-primary" disabled={!newWebhookUrl || !newWebhookTenant}>{t('save')}</button>
                <button onClick={() => setShowAddWebhook(false)} className="btn-secondary">{t('cancel')}</button>
              </div>
            </div>
          )}

          {webhooks.length === 0 ? (
            <div className="card p-12 text-center">
              <Webhook className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <p className="text-neutral-400">{t('noData')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {webhooks.map(wh => (
                <div key={wh.id} className="card p-4 flex items-center gap-4">
                  <div className={clsx('w-2.5 h-2.5 rounded-full', wh.is_active ? 'bg-success-500' : 'bg-neutral-300')} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">{wh.url}</p>
                    <p className="text-xs text-neutral-500">
                      {wh.tenant_id} · {(wh.events || []).join(', ')} · {formatDate(wh.created_at, lang)}
                    </p>
                  </div>
                  <button onClick={() => toggleWebhook(wh)} className="text-neutral-400 hover:text-neutral-600">
                    {wh.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <button onClick={() => deleteWebhook(wh)} className="text-danger-400 hover:text-danger-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
