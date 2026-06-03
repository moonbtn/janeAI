// src/app/api/bootcamp/casso-webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { sendTelegram } from '@/lib/telegram'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-api-key')
  if (secret !== process.env.CASSO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    data?: Array<{
      amount?: number
      description?: string
      when?: string
    }>
  }

  const transactions = body.data ?? []

  await Promise.all(
    transactions.map((tx) => {
      const amount = (tx.amount ?? 0).toLocaleString('vi-VN')
      const desc = tx.description ?? ''
      const time = tx.when ?? ''
      return sendTelegram(
        `💰 <b>Thanh toán mới!</b>\n💵 ${amount}đ\n📝 ${desc}\n🕐 ${time}`
      )
    })
  )

  return NextResponse.json({ success: true })
}
