import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { logAudit } from '../lib/audit'
import { Plus, Crown, Eye, Archive, RotateCcw } from 'lucide-react'
import { formatDate } from '../lib/utils'
import type { ModelVersion } from '../types'
import clsx from 'clsx'

const STATUS_BADGE: Record<string, string> = {
  champion: 'badge-active',
  shadow: 'badge-shadow',
  draft: 'badge-draft',
  retired: 'badge-disabled',
}

export default function Models() {
  const { t, lang, user } = useAuth()
  const [models, setModels] = useState<ModelVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newVersion, setNewVersion] = useState('')
  const [newAlgo, setNewAlgo] = useState('lightgbm')
  const [newNotes, setNewNotes] = useState('')
  const canManage = user?.role === 'admin' || user?.role === 'data_scientist' || user?.role === 'fraud_manager'

  const fetchModels = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('model_versions').select('*').order('created_at', { ascending: false })
    setModels((data || []) as ModelVersion[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchModels() }, [fetchModels])

  const setStatus = async (model: ModelVersion, status: 'champion' | 'shadow' | 'retired') => {
    if (status === 'champion') {
      await supabase.from('model_versions').update({ status: 'retired' }).eq('status', 'champion')
    }
    const { error } = await supabase
      .from('model_versions')
      .update({ status, activated_at: status === 'champion' ? new Date().toISOString() : model.activated_at })
      .eq('id', model.id)
    if (!error) {
      await logAudit('model.status_change', 'model_version', model.id, { from: model.status, to: status })
      fetchModels()
    }
  }

  const createModel = async () => {
    if (!newVersion || !user) return
    const { data, error } = await supabase
      .from('model_versions')
      .insert({
        version: newVersion,
        algorithm: newAlgo,
        status: 'draft',
        notes: newNotes,
        created_by: user.id,
      })
      .select('id')
      .maybeSingle()
    if (!error && data) {
      await logAudit('model.create', 'model_version', data.id, { version: newVersion })
      setShowCreate(false)
      setNewVersion('')
      setNewNotes('')
      fetchModels()
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{t('models')}</h1>
          <p className="text-neutral-500 text-sm mt-0.5">{t('modelVersions')}</p>
        </div>
        {canManage && (
          <button onClick={() => setShowCreate(!showCreate)} className="btn-primary">
            <Plus className="w-4 h-4" />
            {t('createModel')}
          </button>
        )}
      </div>

      {showCreate && (
        <div className="card p-5 space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('modelVersions')}</label>
              <input value={newVersion} onChange={e => setNewVersion(e.target.value)} className="input" placeholder="lgbm-2026.10.2" />
            </div>
            <div>
              <label className="label">{t('algorithm')}</label>
              <select value={newAlgo} onChange={e => setNewAlgo(e.target.value)} className="input">
                <option value="lightgbm">LightGBM</option>
                <option value="xgboost">XGBoost</option>
                <option value="isolation_forest">Isolation Forest</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">{t('notes')}</label>
            <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} className="input min-h-[60px]" placeholder="Model notes..." />
          </div>
          <div className="flex gap-2">
            <button onClick={createModel} className="btn-primary" disabled={!newVersion}>{t('save')}</button>
            <button onClick={() => setShowCreate(false)} className="btn-secondary">{t('cancel')}</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {models.map(model => (
          <div key={model.id} className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-neutral-900 font-mono">{model.version}</h3>
                  <span className={`badge ${STATUS_BADGE[model.status] || 'badge-draft'}`}>
                    {model.status === 'champion' ? t('champion') : model.status === 'shadow' ? t('challenger') : model.status === 'retired' ? 'Retired' : t('draft')}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">{model.algorithm} · {model.features_count} features</p>
              </div>
              {model.status === 'champion' && (
                <Crown className="w-5 h-5 text-accent-500" />
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 mb-3">
              <Metric label="PR-AUC" value={model.pr_auc?.toFixed(4) || '—'} />
              <Metric label="Recall" value={model.recall?.toFixed(4) || '—'} />
              <Metric label="FPR" value={model.fpr?.toFixed(4) || '—'} />
            </div>

            {model.notes && <p className="text-sm text-neutral-600 mb-3">{model.notes}</p>}

            <p className="text-xs text-neutral-400 mb-3">
              {t('createdBy')}: {formatDate(model.created_at, lang)}
              {model.activated_at && ` · Activated: ${formatDate(model.activated_at, lang)}`}
            </p>

            {canManage && (
              <div className="flex gap-2 pt-3 border-t border-neutral-100">
                {model.status !== 'champion' && model.status !== 'retired' && (
                  <button onClick={() => setStatus(model, 'champion')} className="btn-sm btn-primary">
                    <Crown className="w-3.5 h-3.5" />
                    {t('promoteChampion')}
                  </button>
                )}
                {model.status === 'champion' && (
                  <button onClick={() => setStatus(model, 'shadow')} className="btn-sm btn-secondary">
                    <Eye className="w-3.5 h-3.5" />
                    {t('promoteShadow')}
                  </button>
                )}
                {model.status !== 'retired' && (
                  <button onClick={() => setStatus(model, 'retired')} className="btn-sm btn-secondary">
                    <Archive className="w-3.5 h-3.5" />
                    {t('retireModel')}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-50 rounded-lg p-2.5">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-sm font-bold text-neutral-900">{value}</p>
    </div>
  )
}
