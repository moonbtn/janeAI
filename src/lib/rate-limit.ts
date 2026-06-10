import { getSupabaseAdmin } from '@/lib/supabase'

const DAILY_LIMITS: Record<string, number> = {
  generate: 10,
  'post-job/generate': 20,
  'recruiting-chat': 50,
  'recruiting-leads': 10,
}

export async function checkRateLimit(
  userId: string,
  endpoint: string
): Promise<{ allowed: boolean; remaining: number }> {
  const limit = DAILY_LIMITS[endpoint] ?? 10
  const supabase = getSupabaseAdmin() as any // eslint-disable-line @typescript-eslint/no-explicit-any

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('api_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .gte('called_at', startOfDay.toISOString())

  const used = count ?? 0
  const allowed = used < limit

  if (allowed) {
    await supabase.from('api_usage').insert({ user_id: userId, endpoint })
  }

  return { allowed, remaining: Math.max(0, limit - used - (allowed ? 1 : 0)) }
}
