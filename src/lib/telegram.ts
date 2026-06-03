// src/lib/telegram.ts
const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

export async function sendTelegram(message: string): Promise<void> {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID!,
      text: message,
      parse_mode: 'HTML',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Telegram send error:', err)
  }
}
