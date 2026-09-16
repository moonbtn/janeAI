import { drizzle } from 'drizzle-orm/neon-serverless'
import * as schema from './schema'

// neon-http (plain HTTP, one query per request) doesn't support transactions
// at all ("No transactions support in neon-http driver") — two of our writes
// need real atomicity (questionnaire submit, recruiting chat message save),
// so this uses neon-serverless (WebSocket-based Pool) instead. It still works
// fine per-request in serverless functions because our connection strings
// point at Neon's pooled endpoint (the "-pooler" host), which is exactly what
// that endpoint is for.
export function createDb(connectionString: string) {
  return drizzle(connectionString, { schema })
}

let _warned = false
function warnIfLocalUsingRemoteDb() {
  if (_warned) return
  if (process.env.NODE_ENV !== 'development') return
  const url = process.env.DATABASE_URL || ''
  const isLocal = url.includes('localhost') || url.includes('127.0.0.1')
  if (url && !isLocal) {
    _warned = true
    const masked = url.replace(/:[^:@/]+@/, ':***@')
    console.warn(
      `\n⚠️  LOCAL DEV đang dùng Neon REMOTE (${masked}).\n` +
      `    Mọi thao tác GHI sẽ đụng DB thật. Cẩn thận khi test/xoá.\n`,
    )
  }
}

let _db: ReturnType<typeof createDb> | null = null
export function getDb() {
  warnIfLocalUsingRemoteDb()
  if (!_db) {
    _db = createDb(process.env.DATABASE_URL!)
  }
  return _db
}
