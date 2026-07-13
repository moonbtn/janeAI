export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Giữ project Supabase (free tier) không bị auto-pause sau 7 ngày không hoạt động.
// Vercel Cron gọi route này 1 lần/ngày (xem vercel.json). Mỗi lần chạy 1 query
// siêu nhẹ (head + count, không kéo row) để "chạm" DB, reset đồng hồ inactivity.
export async function GET(request: Request) {
  // Nếu đã đặt CRON_SECRET trên Vercel, chỉ chấp nhận request có đúng bearer.
  // (Vercel Cron tự gửi header `Authorization: Bearer <CRON_SECRET>`.)
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (getSupabaseAdmin() as any)
    .from('jd_history')
    .select('id', { count: 'exact', head: true })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, pinged: 'jd_history', count, at: new Date().toISOString() })
}
