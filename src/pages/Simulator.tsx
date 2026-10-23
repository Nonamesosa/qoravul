import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PlayCircle, Send, Loader2, AlertTriangle, ShieldAlert } from 'lucide-react'
import type { ScoringResponse } from '../types'
import { getDecisionBadgeClass, getRiskScoreColor } from '../lib/utils'
import clsx from 'clsx'

const API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/risk-evaluate`

export default function Simulator() {
  const { t, user } = useAuth()
  const isAuditor = user?.role === 'auditor'

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScoringResponse | null>(null)
  const [roundtripMs, setRoundtripMs] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    event_type: 'transfer',
    amount: '2500000',
    currency: 'UZS',
    channel: 'mobile_app',
    customer_ref: 'cust_9f3a',
    account_age_days: '412',
    device_ref: 'dev_1c4e',
    is_new_device: 'true',
    os: 'android',
    app_version: '4.2.1',
    is_rooted: 'false',
    ip: '185.20.100.50',
    geo_country: 'UZ',
    geo_city: 'Tashkent',
    login_at: new Date().toISOString().slice(0, 19) + 'Z',
    failed_logins_last_hour: '0',
    counterparty_ref: 'cp_77ab',
  })

  const setField = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const simulate = async () => {
    if (isAuditor) return
    setLoading(true)
    setError(null)
    setResult(null)
    setRoundtripMs(null)

    const requestId = crypto.randomUUID()
    const body = {
      request_id: requestId,
      tenant_id: 'simulator',
      event_type: form.event_type,
      occurred_at: new Date().toISOString(),
      customer: {
        customer_ref: form.customer_ref,
        account_age_days: Number(form.account_age_days),
      },
      transaction: {
        amount: Number(form.amount),
        currency: form.currency,
        counterparty_ref: form.counterparty_ref,
        channel: form.channel,
        type: form.event_type === 'transfer' ? 'p2p_card' : 'card_payment',
      },
      device: {
        device_ref: form.device_ref,
        is_new_device: form.is_new_device === 'true',
        os: form.os,
        app_version: form.app_version,
        is_rooted: form.is_rooted === 'true',
      },
      network: {
        ip: form.ip,
        geo_country: form.geo_country,
        geo_city: form.geo_city,
      },
      session: {
        login_at: form.login_at,
        failed_logins_last_hour: Number(form.failed_logins_last_hour),
      },
    }

    const netStart = performance.now()

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(body),
      })

      const totalMs = Math.round(performance.now() - netStart)
      setRoundtripMs(totalMs)

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.detail || errBody.error || `HTTP ${res.status}`)
      }

      const data: ScoringResponse = await res.json()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Simulator</h1>
        <p className="text-neutral-500 text-sm mt-0.5">Test scoring API with custom transaction data</p>
      </div>

      {/* BUG-08: Auditor read-only notice */}
      {isAuditor && (
        <div className="card p-4 bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="text-xs">
            <span className="font-bold">Auditor rejimi:</span> {t('auditorReadOnly')}. Tranzaksiya simulyatsiyasi va qarorlar generatsiyasi operatsion amallar hisoblangani uchun auditorlar uchun bloklangan.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="card p-6 space-y-4">
          <h3 className="text-sm font-semibold text-neutral-700">Transaction Input</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Event Type</label>
              <select value={form.event_type} onChange={e => setField('event_type', e.target.value)} className="input" disabled={isAuditor}>
                <option value="transfer">Transfer</option>
                <option value="login">Login</option>
                <option value="loan_application">Loan Application</option>
                <option value="card_payment">Card Payment</option>
              </select>
            </div>
            <div>
              <label className="label">Amount (UZS)</label>
              <input value={form.amount} onChange={e => setField('amount', e.target.value)} className="input" disabled={isAuditor} />
            </div>
            <div>
              <label className="label">Channel</label>
              <select value={form.channel} onChange={e => setField('channel', e.target.value)} className="input" disabled={isAuditor}>
                <option value="mobile_app">Mobile App</option>
                <option value="web">Web</option>
                <option value="atm">ATM</option>
                <option value="pos">POS</option>
              </select>
            </div>
            <div>
              <label className="label">Account Age (days)</label>
              <input value={form.account_age_days} onChange={e => setField('account_age_days', e.target.value)} className="input" disabled={isAuditor} />
            </div>
            <div>
              <label className="label">New Device</label>
              <select value={form.is_new_device} onChange={e => setField('is_new_device', e.target.value)} className="input" disabled={isAuditor}>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <div>
              <label className="label">Rooted</label>
              <select value={form.is_rooted} onChange={e => setField('is_rooted', e.target.value)} className="input" disabled={isAuditor}>
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </div>
            <div>
              <label className="label">Geo Country</label>
              <input value={form.geo_country} onChange={e => setField('geo_country', e.target.value)} className="input" disabled={isAuditor} />
            </div>
            <div>
              <label className="label">Geo City</label>
              <input value={form.geo_city} onChange={e => setField('geo_city', e.target.value)} className="input" disabled={isAuditor} />
            </div>
            <div>
              <label className="label">Failed Logins (1h)</label>
              <input value={form.failed_logins_last_hour} onChange={e => setField('failed_logins_last_hour', e.target.value)} className="input" disabled={isAuditor} />
            </div>
            <div>
              <label className="label">OS</label>
              <select value={form.os} onChange={e => setField('os', e.target.value)} className="input" disabled={isAuditor}>
                <option value="android">Android</option>
                <option value="ios">iOS</option>
                <option value="web">Web</option>
              </select>
            </div>
          </div>

          <button onClick={simulate} disabled={loading || isAuditor} className="btn-primary w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? 'Evaluating...' : 'Evaluate Risk'}
          </button>
        </div>

        {/* Result */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-neutral-700 mb-4">Scoring Result</h3>

          {error && (
            <div className="bg-danger-50 border border-danger-200 text-danger-700 text-sm rounded-lg px-3 py-3 mb-4">
              {error}
            </div>
          )}

          {!result && !error && !loading && (
            <div className="text-center py-12">
              <PlayCircle className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <p className="text-neutral-400 text-sm">Fill the form and click "Evaluate Risk"</p>
            </div>
          )}

          {loading && (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 text-primary-500 mx-auto mb-3 animate-spin" />
              <p className="text-neutral-400 text-sm">Scoring...</p>
            </div>
          )}

          {result && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className={`badge ${getDecisionBadgeClass(result.decision)} text-sm px-4 py-1.5`}>
                  {result.decision}
                </div>
                <div className={clsx('px-3 py-1.5 rounded-lg text-sm font-bold', getRiskScoreColor(result.risk_score))}>
                  Score: {result.risk_score}
                </div>
                {result.degraded && (
                  <span className="badge bg-warning-100 text-warning-700 font-bold">DEGRADED</span>
                )}
              </div>

              {result.degraded && (
                <div className="bg-warning-50 border border-warning-200 rounded-lg p-2.5 text-xs text-warning-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-warning-600" />
                  <span>Faol Champion model yo'q — tizim zaxira qoidalar rejimida (Degraded) baholamoqda.</span>
                </div>
              )}

              {/* Latency breakdown (BUG-06) */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-neutral-50 rounded-lg p-3">
                  <p className="text-xs text-neutral-500">Model Version</p>
                  <p className="font-medium text-neutral-900 font-mono">{result.model_version}</p>
                </div>
                <div className="bg-neutral-50 rounded-lg p-3">
                  <p className="text-xs text-neutral-500">Engine Latency (≤150ms)</p>
                  <p className="font-medium text-neutral-900">{result.latency_ms} ms</p>
                  {roundtripMs !== null && (
                    <p className="text-[10px] text-neutral-400 mt-0.5">HTTP Roundtrip: {roundtripMs} ms</p>
                  )}
                </div>
              </div>

              {result.challenge && (
                <div className="bg-warning-50 border border-warning-200 rounded-lg p-3 text-sm">
                  <p className="font-medium text-warning-700">Challenge: {result.challenge.type}</p>
                  <p className="text-warning-600 text-xs">TTL: {result.challenge.ttl_seconds}s (SMS yuborildi)</p>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-neutral-500 mb-2">Reason Codes</p>
                <div className="flex flex-wrap gap-2">
                  {result.reason_codes.map((code, i) => (
                    <span key={i} className="px-2.5 py-1 bg-neutral-100 text-neutral-700 text-xs rounded-lg font-mono">
                      {code}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-neutral-500 mb-2">Rules Fired (Active Only)</p>
                <div className="flex flex-wrap gap-2">
                  {result.rules_fired.length > 0 ? result.rules_fired.map((r, i) => (
                    <span key={i} className="px-2.5 py-1 bg-primary-50 text-primary-700 text-xs rounded-lg font-mono">
                      {r.id} v{r.version}
                    </span>
                  )) : <span className="text-neutral-400 text-xs">No active rules fired</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
