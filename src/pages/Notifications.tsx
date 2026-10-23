import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Bell, Mail, MessageSquare, Smartphone } from 'lucide-react'
import { formatDate } from '../lib/utils'
import type { Notification } from '../types'
import clsx from 'clsx'

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-draft',
  sent: 'badge-active',
  delivered: 'badge-active',
  failed: 'badge-block',
}

const CHANNEL_ICON: Record<string, typeof Bell> = {
  sms: Smartphone,
  push: Bell,
  email: Mail,
}

export default function Notifications() {
  const { t, lang } = useAuth()
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const fetchNotifs = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    setNotifs((data || []) as Notification[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchNotifs() }, [fetchNotifs])

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
        <h1 className="text-2xl font-bold text-neutral-900">{t('notifications')}</h1>
        <p className="text-neutral-500 text-sm mt-0.5">{t('notifList')}</p>
      </div>

      {notifs.length === 0 ? (
        <div className="card p-12 text-center">
          <Bell className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
          <p className="text-neutral-400">{t('noData')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifs.map(n => {
            const Icon = CHANNEL_ICON[n.channel] || Bell
            return (
              <div key={n.id} className="card p-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-600">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-900 truncate">{n.message}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-neutral-400">
                    <span className="uppercase">{n.channel}</span>
                    <span>·</span>
                    <span className="uppercase">{n.language}</span>
                    <span>·</span>
                    <span>{formatDate(n.created_at, lang)}</span>
                  </div>
                </div>
                <span className={clsx('badge', STATUS_BADGE[n.status] || 'badge-draft')}>
                  {n.status === 'sent' ? t('sent') : n.status === 'pending' ? t('pending') : n.status === 'delivered' ? t('delivered') : t('failed')}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
