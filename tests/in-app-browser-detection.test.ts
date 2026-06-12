import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// The component reads navigator.userAgent directly, so the detection regex is
// extracted from the source instead of importing the module (which pulls in
// @clerk/nextjs and needs a browser environment).
const source = readFileSync(new URL('../src/components/InAppBrowserSignIn.tsx', import.meta.url), 'utf8')
const match = source.match(/return \/(.+)\/([a-z]*)\.test\(ua\)/)
if (!match) throw new Error('In-app browser regex not found in InAppBrowserSignIn.tsx')
const inAppBrowserRegex = new RegExp(match[1], match[2])

const IN_APP_USER_AGENTS: Record<string, string> = {
  'Zalo Android': 'Mozilla/5.0 (Linux; Android 14; SM-A155F Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.114 Mobile Safari/537.36 Zalo android/13169 ZaloTheme/light ZaloLanguage/vi',
  'Zalo iOS': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21E236 Zalo iOS/23.04.01',
  'Facebook Android (FB_IAB without FBAN/FBAV)': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBBV/505318080;]',
  'Facebook iOS (FBAN)': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone14,2;FBSN/iOS;FBSV/17.0;FBLC/vi_VN]',
  'Instagram iOS': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21E236 Instagram 325.0.0.0.87 (iPhone14,2; iOS 17_4; vi_VN; vi-VN;)',
}

const REGULAR_USER_AGENTS: Record<string, string> = {
  'Safari iOS': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
  'Chrome Android': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
  'Chrome macOS': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
}

describe('in-app browser detection', () => {
  for (const [name, ua] of Object.entries(IN_APP_USER_AGENTS)) {
    it(`detects ${name}`, () => {
      assert.equal(inAppBrowserRegex.test(ua), true)
    })
  }

  for (const [name, ua] of Object.entries(REGULAR_USER_AGENTS)) {
    it(`does not flag ${name}`, () => {
      assert.equal(inAppBrowserRegex.test(ua), false)
    })
  }
})
