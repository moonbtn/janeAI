import { countUsageSince, insertUsage } from '@/lib/db/api-usage'

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

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  // Intentional fail-open: if the DB is unreachable, don't block the user's
  // request over a rate-limit check they can't control. Previously this was
  // an accidental side effect of an unchecked Supabase error; now it's a
  // logged, deliberate decision.
  let used = 0
  try {
    used = await countUsageSince(userId, endpoint, startOfDay)
  } catch (err) {
    console.error('checkRateLimit: countUsageSince failed, failing open:', err)
  }

  const allowed = used < limit

  if (allowed) {
    try {
      await insertUsage(userId, endpoint)
    } catch (err) {
      console.error('checkRateLimit: insertUsage failed:', err)
    }
  }

  return { allowed, remaining: Math.max(0, limit - used - (allowed ? 1 : 0)) }
}
