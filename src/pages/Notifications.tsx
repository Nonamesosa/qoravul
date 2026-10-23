import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Bell, Mail, MessageSquare, Smartphone, Plus, Send, CheckCircle2 } from 'lucide-react'
import { formatDate } from '../lib/utils'
import type { Notification, NotificationChannel } from '../types'
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
  const { t, lang, user } = useAuth()
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [channelFilter, setChannelFilter] = useState<'all' | NotificationChannel>('all')
  const [showSendModal, setShowSendModal] = useState(false)
  const [testChannel, setTestChannel] = useState<NotificationChannel>('sms')
  const [testMessage, setTestMessage] = useState("Tasdiqlash kodi: 849201. Qorovul: shubhali o'tkazma aniqlandi. Amal qilish muddati: 120s.")
  const [sending, setSending] = useState(false)

  const canSend = user?.role === 'admin' || user?.role === 'fraud_manager'

  const fetchNotifs = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (channelFilter !== 'all') {
      query = query.eq('channel', channelFilter)
    }

    const { data } = await query
    setNotifs((data || []) as Notification[])
    setLoading(false)
  }, [channelFilter])

  useEffect(() => { fetchNotifs() }, [fetchNotifs])

  const sendTestNotification = async () => {
    if (!testMessage.trim()) return
    setSending(true)
    const { error } = await supabase.from('notifications').insert({
      channel: testChannel,
      language: lang,
      message: testMessage,
      status: 'delivered',
      sent_at: new Date().toISOString(),
    })
    if (!error) {
      setShowSendModal(false)
      fetchNotifs()
    }
    setSending(false)
  }

  const seedSampleNotifications = async () => {
    setSending(true)
    const samples = [
      {
        channel: 'sms',
        language: 'uz',
        message: "Tasdiqlash kodi: 739104. Qorovul: yangi qurilmadan 2,500,000 UZS o'tkazma uchun OTP. Amal qilish muddati: 120 soniya.",
        status: 'delivered',
        sent_at: new Date().toISOString(),
      },
      {
        channel: 'push',
        language: 'uz',
        message: "Xavfsizlik ogohlantirishi: Root qilingan qurilmadan 90,000,000 UZS o'tkazma urinishi bloklandi. Sabab: ROOTED_DEVICE.",
        status: 'delivered',
        sent_at: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        channel: 'sms',
        language: 'uz',
        message: "Tasdiqlash kodi: 418295. Qorovul xavfsizlik: tungi vaqtdagi o'tkazmani tasdiqlash uchun bir martalik parol.",
        status: 'delivered',
        sent_at: new Date(Date.now() - 7200000).toISOString(),
      },
    ]

    for (const s of samples) {
      await supabase.from('notifications').insert(s)
    }
    setSending(false)
    fetchNotifs()
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{t('notifications')}</h1>
          <p className="text-neutral-500 text-sm mt-0.5">{t('notifList')} · FR-40 - FR-43 (SMS / Push)</p>
        </div>
        {canSend && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSendModal(true)} className="btn-primary">
              <Plus className="w-4 h-4" />
              Test bildirishnoma
            </button>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'sms', 'push', 'email'] as const).map(ch => (
          <button
            key={ch}
            onClick={() => setChannelFilter(ch)}
            className={clsx('btn-sm uppercase', channelFilter === ch ? 'btn-primary' : 'btn-secondary')}
          >
            {ch === 'all' ? t('all') : ch}
          </button>
        ))}
      </div>

      {showSendModal && (
        <div className="card p-5 space-y-4 animate-fade-in border-primary-200 bg-primary-50/20">
          <h3 className="text-sm font-bold text-neutral-900">Mijozga sinov bildirishnomasi yuborish (FR-40 - FR-43)</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Kanal</label>
              <select value={testChannel} onChange={e => setTestChannel(e.target.value as NotificationChannel)} className="input">
                <option value="sms">SMS OTP</option>
                <option value="push">Push Notification</option>
                <option value="email">Email</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Xabar matni</label>
            <textarea
              value={testMessage}
              onChange={e => setTestMessage(e.target.value)}
              className="input min-h-[60px]"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={sendTestNotification} disabled={sending} className="btn-primary">
              <Send className="w-4 h-4" />
              Yuborish
            </button>
            <button onClick={() => setShowSendModal(false)} className="btn-secondary">
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {notifs.length === 0 ? (
        <div className="card p-12 text-center space-y-4">
          <Bell className="w-12 h-12 text-neutral-300 mx-auto" />
          <div>
            <p className="text-neutral-700 font-medium">Hozircha bildirishnomalar mavjud emas</p>
            <p className="text-neutral-400 text-xs mt-1">Simulator orqali CHALLENGE yoki BLOCK qarori chiqqanda mijozga SMS/Push avtomatik yuboriladi.</p>
          </div>
          {canSend && (
            <button onClick={seedSampleNotifications} disabled={sending} className="btn-secondary mx-auto">
              Namunaviy bildirishnomalarni yuklash
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {notifs.map(n => {
            const Icon = CHANNEL_ICON[n.channel] || Bell
            return (
              <div key={n.id} className="card p-4 flex items-center gap-4 hover:shadow-sm transition-all">
                <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-600 shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-900">{n.message}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-neutral-400">
                    <span className="uppercase font-semibold text-neutral-600">{n.channel}</span>
                    <span>·</span>
                    <span className="uppercase">{n.language}</span>
                    <span>·</span>
                    <span>{formatDate(n.created_at, lang)}</span>
                    {n.sent_at && (
                      <>
                        <span>·</span>
                        <span className="text-success-600">Yetkazildi</span>
                      </>
                    )}
                  </div>
                </div>
                <span className={clsx('badge shrink-0', STATUS_BADGE[n.status] || 'badge-draft')}>
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
