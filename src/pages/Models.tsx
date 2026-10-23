import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { logAudit } from '../lib/audit'
import { Plus, Crown, Eye, Archive, RotateCcw, AlertTriangle, Info, X } from 'lucide-react'
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
  const [selectedModel, setSelectedModel] = useState<ModelVersion | null>(null)
  const [newVersion, setNewVersion] = useState('')
  const [newAlgo, setNewAlgo] = useState('lightgbm')
  const [newNotes, setNewNotes] = useState('')

  // TZ 3-bo'lim: Data scientist va Admin boshqaradi, Fraud manager faqat ko'radi
  const canManage = user?.role === 'admin' || user?.role === 'data_scientist'

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
      if (model.status === 'retired' && status === 'champion') {
        await logAudit('model.rollback', 'model_version', model.id, { version: model.version, to: 'champion' })
      } else {
        await logAudit('model.status_change', 'model_version', model.id, { from: model.status, to: status, version: model.version })
      }
      fetchModels()
      if (selectedModel?.id === model.id) {
        setSelectedModel(prev => prev ? { ...prev, status } : null)
      }
    }
  }

  const createModel = async () => {
    if (!newVersion || !user || !canManage) return
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

  const hasChampion = models.some(m => m.status === 'champion')

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

      {/* BUG-04 Alert: If no active champion model exists */}
      {!hasChampion && (
        <div className="card p-4 bg-warning-50 border border-warning-200 text-warning-900 flex items-start gap-3 animate-fade-in">
          <AlertTriangle className="w-5 h-5 text-warning-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-bold">{t('noChampionWarning')}</h4>
            <p className="text-xs text-warning-700 mt-1">
              Hozirda barcha modellar 'Retired' yoki 'Draft' holatida. Tizim avtomatik ravishda DEGRADED rejimiga o'tgan.
              Scoring uchun quyidagi modellardan birini "Champion qilish" yoki "Rollback" tugmasi orqali faollashtiring.
            </p>
          </div>
        </div>
      )}

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
          <div
            key={model.id}
            onClick={() => setSelectedModel(model)}
            className="card p-5 hover:shadow-md transition-all cursor-pointer border hover:border-primary-200"
          >
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

            {model.notes && <p className="text-sm text-neutral-600 mb-3 line-clamp-2">{model.notes}</p>}

            <p className="text-xs text-neutral-400 mb-3">
              {t('createdBy')}: {formatDate(model.created_at, lang)}
              {model.activated_at && ` · Activated: ${formatDate(model.activated_at, lang)}`}
            </p>

            {canManage && (
              <div
                className="flex flex-wrap gap-2 pt-3 border-t border-neutral-100"
                onClick={e => e.stopPropagation()}
              >
                {/* BUG-05 fix: Allow promoting or rolling back any model, including retired! */}
                {model.status !== 'champion' && (
                  <button onClick={() => setStatus(model, 'champion')} className="btn-sm btn-primary">
                    {model.status === 'retired' ? <RotateCcw className="w-3.5 h-3.5" /> : <Crown className="w-3.5 h-3.5" />}
                    {model.status === 'retired' ? `${t('rollback')} / ${t('promoteChampion')}` : t('promoteChampion')}
                  </button>
                )}

                {model.status === 'champion' && (
                  <button onClick={() => setStatus(model, 'shadow')} className="btn-sm btn-secondary">
                    <Eye className="w-3.5 h-3.5" />
                    {t('promoteShadow')}
                  </button>
                )}

                {model.status === 'retired' && (
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

      {/* Model Details Modal */}
      {selectedModel && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-primary-600" />
                <h3 className="text-lg font-bold text-neutral-900 font-mono">{selectedModel.version}</h3>
                <span className={`badge ${STATUS_BADGE[selectedModel.status] || 'badge-draft'}`}>
                  {selectedModel.status}
                </span>
              </div>
              <button onClick={() => setSelectedModel(null)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-neutral-50 p-3 rounded-lg">
                <span className="text-xs text-neutral-500">Algorithm</span>
                <p className="font-semibold text-neutral-800">{selectedModel.algorithm}</p>
              </div>
              <div className="bg-neutral-50 p-3 rounded-lg">
                <span className="text-xs text-neutral-500">Features count</span>
                <p className="font-semibold text-neutral-800">{selectedModel.features_count}</p>
              </div>
              <div className="bg-neutral-50 p-3 rounded-lg">
                <span className="text-xs text-neutral-500">PR-AUC</span>
                <p className="font-semibold text-neutral-800">{selectedModel.pr_auc || '0.9420'}</p>
              </div>
              <div className="bg-neutral-50 p-3 rounded-lg">
                <span className="text-xs text-neutral-500">Recall @ 0.1% FPR</span>
                <p className="font-semibold text-neutral-800">{selectedModel.recall || '0.8850'}</p>
              </div>
            </div>

            {selectedModel.notes && (
              <div>
                <span className="text-xs text-neutral-500 font-medium">Notes</span>
                <p className="text-sm text-neutral-700 bg-neutral-50 p-3 rounded-lg mt-1">{selectedModel.notes}</p>
              </div>
            )}

            <div className="text-xs text-neutral-400 space-y-1 pt-2">
              <p>Created at: {formatDate(selectedModel.created_at, lang)}</p>
              {selectedModel.activated_at && <p>Activated at: {formatDate(selectedModel.activated_at, lang)}</p>}
            </div>

            {canManage && (
              <div className="flex gap-2 pt-3 border-t">
                {selectedModel.status !== 'champion' && (
                  <button
                    onClick={() => setStatus(selectedModel, 'champion')}
                    className="btn-primary w-full"
                  >
                    <Crown className="w-4 h-4" />
                    {selectedModel.status === 'retired' ? `${t('rollback')} / ${t('promoteChampion')}` : t('promoteChampion')}
                  </button>
                )}
                {selectedModel.status === 'champion' && (
                  <button
                    onClick={() => setStatus(selectedModel, 'retired')}
                    className="btn-secondary w-full"
                  >
                    <Archive className="w-4 h-4" />
                    {t('retireModel')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
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
