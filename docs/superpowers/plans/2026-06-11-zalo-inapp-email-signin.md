# Zalo / In-App Browser Email Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users inside in-app webviews (Zalo, Facebook, Instagram, ...) can sign in with email + code right there; the popup steers Google users to Safari/Chrome instead of dead-ending everyone.

**Architecture:** Single client component change. The existing in-app tip popup in `InAppBrowserSignIn.tsx` gains a primary "Đăng nhập bằng email" button that calls `useClerk().openSignIn()` with an `appearance` that hides the Google social button, keeping the email+code form (already enabled on prod and dev Clerk instances). Copy-link guidance stays as the secondary action. A scoped-CSS fallback exists if appearance element keys don't take effect at runtime.

**Tech Stack:** Next.js 16 (App Router), `@clerk/nextjs` v7 (`useClerk().openSignIn` confirmed in installed types; `appearance` is an open registry typed as `any`), Tailwind CSS v4, Node built-in test runner via tsx.

**Spec:** `docs/superpowers/specs/2026-06-11-zalo-inapp-email-signin-design.md`

**Note on TDD:** The detection regex is already covered by `tests/in-app-browser-detection.test.ts` (source-extracted regex, red-green'd earlier today). The new behavior is modal-opening UI wiring; the repo has no React/jsdom test infra and adding one is out of scope (YAGNI), so this is verified via browser preview (Task 2) instead of a unit test.

---

### Task 1: Rewrite the in-app popup with the email-first flow

**Files:**
- Modify: `src/components/InAppBrowserSignIn.tsx` (whole file below)

- [ ] **Step 1: Replace the component with the new version**

The diff vs current: `useClerk` import added, `emailOnlyAppearance` constant added, popup title/body text changed, and the buttons block becomes primary (open email modal) / secondary (copy link) / close. Detection regex and the non-webview branch are untouched.

```tsx
'use client'

import { SignInButton, useClerk } from '@clerk/nextjs'
import { useEffect, useState } from 'react'

function isInAppBrowser() {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  return /FBAN|FBAV|FB_IAB|Instagram|Line|Twitter|TikTok|Snapchat|LinkedIn|Pinterest|WeChat|MicroMessenger|Zalo/.test(ua)
}

// Google blocks OAuth inside in-app webviews, so the sign-in modal opened from
// the tip popup hides the social buttons and keeps only the email+code form.
// Clerk v7 types appearance as an open registry — keys are verified in preview.
const emailOnlyAppearance = {
  elements: {
    socialButtons: 'hidden',
    socialButtonsRoot: 'hidden',
    dividerRow: 'hidden',
  },
}

interface Props {
  children: React.ReactNode
  className?: string
}

export default function InAppBrowserSignIn({ children, className }: Props) {
  const [inApp, setInApp] = useState(false)
  const [showTip, setShowTip] = useState(false)
  const clerk = useClerk()

  useEffect(() => {
    const timer = setTimeout(() => {
      setInApp(isInAppBrowser())
    }, 0)
    return () => clearTimeout(timer)
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
              Đăng nhập trong app
            </h3>
            <p className="text-center text-gray-500 text-sm leading-relaxed mb-5">
              Google không cho phép đăng nhập trong trình duyệt của app. Bạn có thể đăng nhập bằng <strong>email</strong> ngay tại đây, hoặc mở bằng <strong>Safari</strong>/<strong>Chrome</strong> để dùng Google.
            </p>
            <div className="space-y-2">
              <button
                className="w-full bg-[#1B2B6E] text-white py-3 rounded-full font-medium text-sm"
                onClick={() => {
                  setShowTip(false)
                  clerk.openSignIn({ appearance: emailOnlyAppearance })
                }}
              >
                Đăng nhập bằng email
              </button>
              <button
                className="w-full text-gray-600 py-2 text-sm underline"
                onClick={() => {
                  // copy current URL to clipboard
                  navigator.clipboard?.writeText(window.location.href).catch(() => {})
                  setShowTip(false)
                  alert('Đã copy link! Mở Safari hoặc Chrome và paste vào thanh địa chỉ nhé.')
                }}
              >
                Mở Safari/Chrome để dùng Google
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
```

- [ ] **Step 2: Run unit tests and lint**

Run: `cd "/Users/Macbook/Claude Code/jane-ai" && npm run test:unit && npx eslint src/components/InAppBrowserSignIn.tsx`
Expected: all test suites pass (the regex test extracts the regex from this file's source — it must still find `return /.../.test(ua)`), eslint reports nothing.

---

### Task 2: Verify in browser preview with forced in-app mode

**Files:**
- Modify (TEMPORARY, reverted in this task): `src/components/InAppBrowserSignIn.tsx:6-10`

- [ ] **Step 1: Temporarily force in-app detection**

In `isInAppBrowser`, add a forced return as the first line (do NOT commit):

```tsx
function isInAppBrowser() {
  return true // TEMP: preview verification only
  ...
}
```

- [ ] **Step 2: Start the dev preview and open the page**

Use the preview tools: `preview_start` (runs `npm run dev`), then load the homepage. Expected: page renders, no console errors.

- [ ] **Step 3: Exercise the popup**

Click the sign-in button (`preview_click`), then `preview_snapshot`. Expected: popup shows title "Đăng nhập trong app", body mentioning email + Safari/Chrome, three buttons. Take `preview_screenshot` as proof.

- [ ] **Step 4: Verify the email modal hides Google**

Click "Đăng nhập bằng email". Expected: popup closes, Clerk modal opens. In `preview_snapshot`, the modal must contain the email field and must NOT contain "Continue with Google" / Google social button. Take `preview_screenshot` as proof.

If Google IS still visible → execute Task 3 (fallback), then repeat this step.

- [ ] **Step 5: Verify the copy-link button**

Reload, reopen popup, click "Mở Safari/Chrome để dùng Google". Expected: alert "Đã copy link!...", popup closes (alert may render as native dialog in preview — confirm via console/snapshot that no error occurred).

- [ ] **Step 6: Revert the temporary force**

Remove the `return true // TEMP...` line. Run: `git diff src/components/InAppBrowserSignIn.tsx` and confirm no `TEMP` remains. Re-run `npm run test:unit`. Expected: green.

---

### Task 3 (CONDITIONAL — only if Task 2 Step 4 shows Google still visible): scoped-CSS fallback

**Files:**
- Modify: `src/components/InAppBrowserSignIn.tsx` (useEffect + remove appearance)
- Modify: `src/app/globals.css` (append rule)

- [ ] **Step 1: Mark the body when in-app**

In the component's `useEffect`, after `setInApp(isInAppBrowser())`, add:

```tsx
useEffect(() => {
  const timer = setTimeout(() => {
    const inAppNow = isInAppBrowser()
    setInApp(inAppNow)
    if (inAppNow) document.body.classList.add('inapp-browser')
  }, 0)
  return () => clearTimeout(timer)
}, [])
```

Remove the `emailOnlyAppearance` constant and call `clerk.openSignIn()` with no arguments.

- [ ] **Step 2: Hide Clerk social UI under the marker**

Append to `src/app/globals.css`:

```css
/* Google OAuth is blocked inside in-app webviews (Zalo, FB, ...) — hide it there */
body.inapp-browser .cl-socialButtons,
body.inapp-browser .cl-socialButtonsRoot,
body.inapp-browser .cl-dividerRow {
  display: none;
}
```

- [ ] **Step 3: Re-verify**

Repeat Task 2 Steps 3-4. Expected: Clerk modal shows email form only.

---

### Task 4: Final green + commit

- [ ] **Step 1: Full verification**

Run: `cd "/Users/Macbook/Claude Code/jane-ai" && npm run test:unit && npx eslint src/components/InAppBrowserSignIn.tsx tests/in-app-browser-detection.test.ts && git diff --stat`
Expected: tests pass, lint clean, diff contains only intended files (component, possibly globals.css, spec, plan, regex test from this morning).

- [ ] **Step 2: Commit**

```bash
git add src/components/InAppBrowserSignIn.tsx tests/in-app-browser-detection.test.ts docs/superpowers/specs/2026-06-11-zalo-inapp-email-signin-design.md docs/superpowers/plans/2026-06-11-zalo-inapp-email-signin.md
# plus src/app/globals.css if Task 3 ran
git commit -m "feat: email sign-in inside in-app browsers (Zalo, FB_IAB detection + email-first popup)"
```

Deploy is a separate, user-triggered step (deploy-jane-ai skill).
