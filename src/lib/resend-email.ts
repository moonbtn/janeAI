// src/lib/resend-email.ts
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)

const BANK_NAME = process.env.NEXT_PUBLIC_BOOTCAMP_BANK_NAME!
const BANK_ACCOUNT = process.env.NEXT_PUBLIC_BOOTCAMP_BANK_ACCOUNT!
const BANK_HOLDER = process.env.NEXT_PUBLIC_BOOTCAMP_BANK_HOLDER!

const EARLY_BIRD_DEADLINE = new Date('2025-06-20T23:59:59+07:00')

export async function sendBootcampConfirmationEmail(params: {
  to: string
  name: string
}): Promise<void> {
  const { to, name } = params
  const isEarlyBird = new Date() < EARLY_BIRD_DEADLINE
  const price = isEarlyBird ? 4_000_000 : 5_000_000
  const priceLabel = isEarlyBird
    ? '4.000.000đ (early bird trước 20/6)'
    : '5.000.000đ'

  const safeName = name.replace(/[<>&"]/g, '')
  const transferContent = `BOOTCAMP ${safeName.toUpperCase().split(' ').pop() ?? safeName.toUpperCase()}`
  const qrUrl = `https://img.vietqr.io/image/${BANK_NAME}-${BANK_ACCOUNT}-compact2.png?amount=${price}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(BANK_HOLDER)}`

  await resend.emails.send({
    from: 'Jane Nguyễn <jane@oac.vn>',
    to,
    subject: 'Xác nhận đăng ký — Vibe Product & Coding Bootcamp',
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
        <p>Chào <strong>${safeName}</strong>,</p>
        <p>Mình Jane đây — cảm ơn bạn đã đăng ký <strong>Vibe Product & Coding Bootcamp</strong> (27–28/6, 14:00–17:00, TP.HCM)!</p>
        <p>Để giữ chỗ, bạn chuyển khoản về tài khoản bên dưới nhé:</p>
        <div style="background: #f4f6fb; border: 1px solid #c5d4ef; padding: 20px; margin: 20px 0; border-radius: 8px;">
          <p style="margin: 0 0 4px;"><strong>Ngân hàng:</strong> ${BANK_NAME}</p>
          <p style="margin: 0 0 4px;"><strong>Số tài khoản:</strong> ${BANK_ACCOUNT}</p>
          <p style="margin: 0 0 4px;"><strong>Chủ tài khoản:</strong> ${BANK_HOLDER}</p>
          <p style="margin: 0 0 4px;"><strong>Số tiền:</strong> ${priceLabel}</p>
          <p style="margin: 0;"><strong>Nội dung:</strong> ${transferContent}</p>
        </div>
        <p>Hoặc quét QR bên dưới:</p>
        <img src="${qrUrl}" alt="QR chuyển khoản" style="width: 200px; height: 200px;" />
        <p style="margin-top: 24px; color: #6b6b6b; font-size: 14px;">Sau khi chuyển khoản, mình sẽ xác nhận chỗ trong vòng 24h. Có gì cứ nhắn mình nhé!</p>
        <p>— Jane</p>
      </div>
    `,
  })
}
