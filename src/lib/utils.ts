import { formatDistanceToNow, format, type Locale } from 'date-fns'
import { uz, ru, enUS } from 'date-fns/locale'
import type { Language } from '../types'

const locales: Record<Language, Locale> = {
  uz: uz,
  ru: ru,
  en: enUS,
}

export function formatTimeAgo(date: string, lang: Language = 'en') {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: locales[lang] })
}

export function formatDate(date: string, lang: Language = 'en') {
  return format(new Date(date), 'dd MMM yyyy, HH:mm', { locale: locales[lang] })
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatPercent(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`
}

export function getRiskScoreColor(score: number): string {
  if (score < 600) return 'text-success-600 bg-success-100'
  if (score < 800) return 'text-warning-600 bg-warning-100'
  return 'text-danger-700 bg-danger-100'
}

export function getDecisionBadgeClass(decision: string): string {
  switch (decision) {
    case 'ALLOW': return 'badge-allow'
    case 'CHALLENGE': return 'badge-challenge'
    case 'BLOCK': return 'badge-block'
    default: return 'badge-draft'
  }
}

export function getRuleStatusBadgeClass(status: string): string {
  switch (status) {
    case 'active': return 'badge-active'
    case 'shadow': return 'badge-shadow'
    case 'draft': return 'badge-draft'
    case 'disabled': return 'badge-disabled'
    default: return 'badge-draft'
  }
}

export function getCaseStatusBadgeClass(status: string): string {
  switch (status) {
    case 'open': return 'badge-open'
    case 'in_review': return 'badge-in-review'
    case 'closed': return 'badge-closed'
    default: return 'badge-draft'
  }
}

export function isSlaBreached(slaDueAt: string | null): boolean {
  if (!slaDueAt) return false
  return new Date(slaDueAt).getTime() < Date.now()
}

export function getSlaRemaining(slaDueAt: string | null): string {
  if (!slaDueAt) return '—'
  const diff = new Date(slaDueAt).getTime() - Date.now()
  if (diff < 0) return '0m'
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}
