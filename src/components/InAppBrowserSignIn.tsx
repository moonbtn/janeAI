'use client'

import { SignInButton } from '@clerk/nextjs'
import { useEffect, useState } from 'react'

function isInAppBrowser() {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  return /FBAN|FBAV|Instagram|Line|Twitter|TikTok|Snapchat|LinkedIn|Pinterest|WeChat|MicroMessenger/.test(ua)
}

interface Props {
  children: React.ReactNode
  className?: string
}

export default function InAppBrowserSignIn({ children, className }: Props) {
  const [inApp, setInApp] = useState(false)
  const [showTip, setShowTip] = useState(false)

  useEffect(() => {
    setInApp(isInAppBrowser())
  }, [])

  if (!inApp) {
    return (
      <SignInButton mode="modal">
        <button className={className}>{children}</button>
      </SignInButton>
    )
  }

  return (
    <div className="relative">
      <button
        className={className}
        onClick={() => setShowTip(true)}
      >
        {children}
      </button>
      {showTip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50" onClick={() => setShowTip(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h3 className="text-center font-semibold text-gray-900 text-lg mb-2">
              Không thể đăng nhập ở đây
            </h3>
            <p className="text-center text-gray-500 text-sm leading-relaxed mb-5">
              Google không cho phép đăng nhập trong trình duyệt của app. Vui lòng mở link này bằng <strong>Safari</strong> hoặc <strong>Chrome</strong>.
            </p>
            <div className="space-y-2">
              <button
                className="w-full bg-[#1B2B6E] text-white py-3 rounded-full font-medium text-sm"
                onClick={() => {
                  // copy current URL to clipboard
                  navigator.clipboard?.writeText(window.location.href).catch(() => {})
                  setShowTip(false)
                  alert('Đã copy link! Mở Safari hoặc Chrome và paste vào thanh địa chỉ nhé.')
                }}
              >
                Copy link để mở trong Safari/Chrome
              </button>
              <button
                className="w-full text-gray-400 py-2 text-sm"
                onClick={() => setShowTip(false)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
