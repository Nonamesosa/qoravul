import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  Activity, AlertTriangle, ShieldCheck, Clock, TrendingDown, DollarSign,
  ArrowRight, Zap,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area,
} from 'recharts'
import { formatNumber, formatPercent, formatCurrency, getDecisionBadgeClass, formatTimeAgo } from '../lib/utils'
import type { Decision, FraudEvent } from '../types'
import { Link } from 'react-router-dom'
import { APP_VERSION } from '../version'

interface Stats {
  totalEvents: number
  totalDecisions: number
  allowCount: number
  challengeCount: number
  blockCount: number
  confirmedFraud: number
  falsePositives: number
  p95Latency: number
  savedAmount: number
}

interface TimeSeriesPoint {
  date: string
  allow: number
  challenge: number
  block: number
}

interface RiskBucket {
  range: string
  count: number
}

const DECISION_COLORS: Record<string, string> = {
  ALLOW: '#22c55e',
  CHALLENGE: '#f97316',
  BLOCK: '#ef4444',
}

export default function Dashboard() {
  const { t, lang, user } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([])
  const [riskBuckets, setRiskBuckets] = useState<RiskBucket[]>([])
  const [recent, setRecent] = useState<(Decision & { event?: FraudEvent })[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<7 | 30>(7)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    const now = new Date()
    const from = new Date(now)
    from.setDate(from.getDate() - range)

    const [decisionsRes, eventsRes, casesRes, latencyRes] = await Promise.all([
      supabase
        .from('decisions')
        .select('decision, risk_score, latency_ms, decided_at, event_id, request_id, reason_codes, rules_fired, model_version, degraded')
        .gte('decided_at', from.toISOString())
        .order('decided_at', { ascending: false }),
      supabase
        .from('events')
        .select('id, event_type, amount_uzs, occurred_at')
        .gte('occurred_at', from.toISOString()),
      supabase
        .from('cases')
        .select('outcome, decision_id, event_id')
        .eq('status', 'closed')
        .gte('updated_at', from.toISOString()),
      supabase
        .from('decisions')
        .select('latency_ms')
        .gte('decided_at', from.toISOString())
        .order('latency_ms', { ascending: false }),
    ])

    const decisions = decisionsRes.data || []
    const events = eventsRes.data || []
    const cases = casesRes.data || []

    const allowCount = decisions.filter(d => d.decision === 'ALLOW').length
    const challengeCount = decisions.filter(d => d.decision === 'CHALLENGE').length
    const blockCount = decisions.filter(d => d.decision === 'BLOCK').length
    const confirmedFraud = cases.filter(c => c.outcome === 'confirmed_fraud').length
    const falsePositives = cases.filter(c => c.outcome === 'legitimate').length

    const latencies = (latencyRes.data || []).map(d => d.latency_ms || 0).filter(Boolean)
    latencies.sort((a, b) => a - b)
    const p95Index = Math.floor(latencies.length * 0.95)
    const p95 = latencies[p95Index] || 0

    const blockEvents = decisions.filter(d => d.decision === 'BLOCK').map(d => d.event_id)
    const savedAmount = events
      .filter(e => blockEvents.includes(e.id))
      .reduce((sum, e) => sum + Number(e.amount_uzs || 0), 0)

    setStats({
      totalEvents: events.length,
      totalDecisions: decisions.length,
      allowCount,
      challengeCount,
      blockCount,
      confirmedFraud,
      falsePositives,
      p95Latency: p95,
      savedAmount,
    })

    // Time series
    const days: TimeSeriesPoint[] = []
    for (let i = range - 1; i >= 0; i--) {
      const day = new Date(now)
      day.setDate(day.getDate() - i)
      const dayStr = day.toISOString().slice(0, 10)
      const dayDecisions = decisions.filter(d => d.decided_at.slice(0, 10) === dayStr)
      days.push({
        date: dayStr.slice(5),
        allow: dayDecisions.filter(d => d.decision === 'ALLOW').length,
        challenge: dayDecisions.filter(d => d.decision === 'CHALLENGE').length,
        block: dayDecisions.filter(d => d.decision === 'BLOCK').length,
      })
    }
    setTimeSeries(days)

    // Risk score distribution
    const buckets: { range: string; count: number }[] = [
      { range: '0-199', count: 0 },
      { range: '200-399', count: 0 },
      { range: '400-599', count: 0 },
      { range: '600-799', count: 0 },
      { range: '800-1000', count: 0 },
    ]
    decisions.forEach(d => {
      const s = d.risk_score
      if (s < 200) buckets[0].count++
      else if (s < 400) buckets[1].count++
      else if (s < 600) buckets[2].count++
      else if (s < 800) buckets[3].count++
      else buckets[4].count++
    })
    setRiskBuckets(buckets)

    // Recent decisions with event data
    const recentDecisions = decisions.slice(0, 10)
    const eventIds = recentDecisions.map(d => d.event_id).filter(Boolean)
    const { data: recentEvents } = await supabase
      .from('events')
      .select('*')
      .in('id', eventIds)

    const eventMap = new Map<string, FraudEvent>()
    ;(recentEvents || []).forEach(e => eventMap.set(e.id, e as FraudEvent))

    setRecent(
      recentDecisions.map(d => ({
        ...d,
        event: eventMap.get(d.event_id),
        rules_fired: (d.rules_fired as any) || [],
        reason_codes: (d.reason_codes as any) || [],
      })) as (Decision & { event?: FraudEvent })[]
    )

    setLoading(false)
  }, [range])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    )
  }

  const total = stats.totalDecisions || 1
  const allowPct = (stats.allowCount / total) * 100
  const challengePct = (stats.challengeCount / total) * 100
  const blockPct = (stats.blockCount / total) * 100
  const fraudRate = stats.totalDecisions > 0 ? (stats.confirmedFraud / stats.totalDecisions) * 100 : 0
  const fpr = stats.blockCount > 0 ? (stats.falsePositives / stats.blockCount) * 100 : 0

  const pieData = [
    { name: 'ALLOW', value: stats.allowCount, color: DECISION_COLORS.ALLOW },
    { name: 'CHALLENGE', value: stats.challengeCount, color: DECISION_COLORS.CHALLENGE },
    { name: 'BLOCK', value: stats.blockCount, color: DECISION_COLORS.BLOCK },
  ].filter(d => d.value > 0)

  const statCards = [
    { label: t('totalEvents'), value: formatNumber(stats.totalEvents), icon: Activity, color: 'text-primary-600 bg-primary-50' },
    { label: t('totalDecisions'), value: formatNumber(stats.totalDecisions), icon: Zap, color: 'text-accent-600 bg-accent-50' },
    { label: t('blockRate'), value: formatPercent(blockPct), icon: AlertTriangle, color: 'text-danger-600 bg-danger-50' },
    { label: t('fraudRate'), value: formatPercent(fraudRate), icon: TrendingDown, color: 'text-danger-600 bg-danger-50' },
    { label: t('fpr'), value: formatPercent(fpr), icon: ShieldCheck, color: 'text-warning-600 bg-warning-50' },
    { label: t('p95Latency'), value: `${stats.p95Latency}ms`, icon: Clock, color: 'text-neutral-600 bg-neutral-100' },
    { label: t('savedAmount'), value: `${formatCurrency(stats.savedAmount)} UZS`, icon: DollarSign, color: 'text-success-600 bg-success-50' },
    { label: t('allowRate'), value: formatPercent(allowPct), icon: ShieldCheck, color: 'text-success-600 bg-success-50' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-neutral-900">{t('dashboard')}</h1>
            <span className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 text-xs font-mono font-semibold border border-primary-200">
              v{APP_VERSION}
            </span>
          </div>
          <p className="text-neutral-500 text-sm mt-0.5">
            {range === 7 ? t('last7Days') : t('last30Days')} · {user?.full_name}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setRange(7)}
            className={`btn-sm ${range === 7 ? 'btn-primary' : 'btn-secondary'}`}
          >
            {t('last7Days')}
          </button>
          <button
            onClick={() => setRange(30)}
            className={`btn-sm ${range === 30 ? 'btn-primary' : 'btn-secondary'}`}
          >
            {t('last30Days')}
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon
          return (
            <div key={i} className="card p-4 animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-neutral-500 text-xs font-medium mb-1">{card.label}</p>
                  <p className="text-xl font-bold text-neutral-900">{card.value}</p>
                </div>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${card.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Decision distribution pie */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-neutral-700 mb-4">{t('decisionDistribution')}</h3>
          {pieData.length === 0 ? (
            <p className="text-neutral-400 text-sm text-center py-12">{t('noData')}</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: d.color }} />
                      <span className="text-neutral-600">{d.name}</span>
                    </div>
                    <span className="font-medium text-neutral-900">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Decisions over time */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-neutral-700 mb-4">{t('decisionsOverTime')}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={timeSeries}>
              <defs>
                <linearGradient id="allowGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="challengeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="blockGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
              <RTooltip />
              <Area type="monotone" dataKey="allow" stroke="#22c55e" fill="url(#allowGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="challenge" stroke="#f97316" fill="url(#challengeGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="block" stroke="#ef4444" fill="url(#blockGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Risk score + Recent decisions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-neutral-700 mb-4">{t('riskScoreDistribution')}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={riskBuckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="range" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
              <RTooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {riskBuckets.map((_, i) => (
                  <Cell
                    key={i}
                    fill={i < 3 ? '#22c55e' : i === 3 ? '#f97316' : '#ef4444'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-700">{t('recentDecisions')}</h3>
          </div>
          {recent.length === 0 ? (
            <p className="text-neutral-400 text-sm text-center py-12">{t('noData')}</p>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {recent.map(d => (
                <div key={d.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-neutral-50 transition-colors">
                  <div className={`badge ${getDecisionBadgeClass(d.decision)}`}>
                    {d.decision}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">
                      {d.event?.event_type || '—'} · {d.event?.amount_uzs ? formatCurrency(Number(d.event.amount_uzs)) + ' UZS' : '—'}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {(d.reason_codes as string[])?.slice(0, 2).join(', ') || '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-neutral-900">{d.risk_score}</p>
                    <p className="text-xs text-neutral-400">{formatTimeAgo(d.decided_at, lang)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
