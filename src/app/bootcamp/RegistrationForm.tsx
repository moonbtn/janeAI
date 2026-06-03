'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RegistrationForm() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/bootcamp/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Đăng ký thất bại, thử lại nhé!')
      router.push('/bootcamp/confirmation')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: '1px solid #e5e5e0',
    background: '#fafaf7',
    color: '#111',
    padding: '10px 14px',
    fontSize: '14px',
    fontFamily: 'var(--font-inter, Inter, sans-serif)',
    outline: 'none',
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b6b6b',
    display: 'block',
    marginBottom: '6px',
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Họ và tên *</label>
        <input style={inputStyle} type="text" placeholder="Nguyễn Văn A" required
          value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Email *</label>
        <input style={inputStyle} type="email" placeholder="hello@email.com" required
          value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Số điện thoại *</label>
        <input style={inputStyle} type="tel" placeholder="0901 234 567" required
          value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
      </div>
      {error && <p style={{ fontSize: '13px', color: '#b5351c', marginBottom: '12px' }}>{error}</p>}
      <button
        type="submit"
        disabled={loading}
        style={{
          display: 'block',
          width: '100%',
          background: loading ? '#4a6a9c' : '#1e2a47',
          color: '#fff',
          border: 'none',
          padding: '14px',
          fontSize: '13px',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontFamily: 'var(--font-inter, Inter, sans-serif)',
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          marginTop: '8px',
        }}
      >
        {loading ? 'Đang xử lý...' : 'Đăng ký giữ chỗ →'}
      </button>
      <p style={{ fontSize: '12px', color: '#6b6b6b', marginTop: '12px', lineHeight: 1.5 }}>
        Sau khi submit, bạn sẽ nhận email với hướng dẫn chuyển khoản để giữ chỗ.
      </p>
    </form>
  )
}
