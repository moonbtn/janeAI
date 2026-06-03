// src/app/bootcamp/confirmation/page.tsx
const BANK_NAME = process.env.NEXT_PUBLIC_BOOTCAMP_BANK_NAME ?? 'VCB'
const BANK_ACCOUNT = process.env.NEXT_PUBLIC_BOOTCAMP_BANK_ACCOUNT ?? ''
const BANK_HOLDER = process.env.NEXT_PUBLIC_BOOTCAMP_BANK_HOLDER ?? ''
const EARLY_BIRD_DEADLINE = new Date('2025-06-20T23:59:59+07:00')

export default function BootcampConfirmation() {
  const isEarlyBird = new Date() < EARLY_BIRD_DEADLINE
  const price = isEarlyBird ? 4_000_000 : 5_000_000
  const priceLabel = isEarlyBird ? '4.000.000đ' : '5.000.000đ'

  const qrUrl = `https://img.vietqr.io/image/${BANK_NAME}-${BANK_ACCOUNT}-compact2.png?amount=${price}&addInfo=BOOTCAMP&accountName=${encodeURIComponent(BANK_HOLDER)}`

  return (
    <main style={{ fontFamily: 'var(--font-inter, Inter, sans-serif)', background: '#fafaf7', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ maxWidth: '480px', width: '100%' }}>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#2a437c', marginBottom: '12px' }}>
          Đăng ký thành công
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif, "Source Serif 4", Georgia, serif)', fontSize: '28px', fontWeight: 600, lineHeight: 1.2, marginBottom: '16px', color: '#111' }}>
          Cảm ơn bạn đã đăng ký!
        </h1>
        <p style={{ color: '#6b6b6b', fontSize: '15px', lineHeight: 1.7, marginBottom: '32px' }}>
          Mình đã gửi thông tin vào email của bạn. Chuyển khoản để giữ chỗ — chỉ còn 25 slot!
        </p>

        <div style={{ border: '1px solid #e5e5e0', padding: '28px', marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b6b6b' }}>
            Thông tin chuyển khoản
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px', marginBottom: '20px' }}>
            <div><span style={{ color: '#6b6b6b' }}>Ngân hàng: </span><strong>{BANK_NAME}</strong></div>
            <div><span style={{ color: '#6b6b6b' }}>Số tài khoản: </span><strong>{BANK_ACCOUNT}</strong></div>
            <div><span style={{ color: '#6b6b6b' }}>Chủ tài khoản: </span><strong>{BANK_HOLDER}</strong></div>
            <div>
              <span style={{ color: '#6b6b6b' }}>Số tiền: </span>
              <strong>{priceLabel}</strong>
              {isEarlyBird && (
                <span style={{ fontSize: '12px', background: '#4a90e2', color: '#fff', padding: '2px 7px', marginLeft: '4px' }}>EARLY BIRD</span>
              )}
            </div>
            <div><span style={{ color: '#6b6b6b' }}>Nội dung: </span><strong>BOOTCAMP [Họ tên bạn]</strong></div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="QR chuyển khoản" style={{ maxWidth: '180px', height: 'auto' }} />
        </div>

        <p style={{ fontSize: '13px', color: '#6b6b6b', lineHeight: 1.6 }}>
          Sau khi chuyển khoản, bạn sẽ nhận xác nhận trong vòng 24h. Có gì cứ reply email nhé!
        </p>
      </div>
    </main>
  )
}
