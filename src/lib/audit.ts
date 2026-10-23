import { supabase } from './supabase'
import type { AuditLogEntry } from '../types'

export async function logAudit(
  action: string,
  entity: string,
  entity_id: string | null = null,
  diff: Record<string, unknown> | null = null
) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('audit_log').insert({
      actor_id: user?.id || null,
      action,
      entity,
      entity_id,
      diff,
    })
  } catch (e) {
    console.error('Failed to write audit log:', e)
  }
}

export type { AuditLogEntry }
