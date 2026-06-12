# Zalo / In-App Browser Email Sign-In — Design

**Date:** 2026-06-11
**Status:** Approved (user picked "Email ngay trong Zalo" option)

## Problem

Google blocks OAuth inside in-app webviews (Zalo, Facebook, Instagram, ...), so Google sign-in fails there. Earlier today the detection regex in `src/components/InAppBrowserSignIn.tsx` gained `Zalo` and `FB_IAB` tokens, but the in-app popup currently dead-ends users: it only tells them to copy the link and open Safari/Chrome. Email-code sign-in is already enabled on both the prod and dev Clerk instances and works fine inside webviews — the popup just never offers it. Net effect of deploying as-is: Zalo users would lose a working sign-in path.

## Goal

Users opening the site inside an in-app browser can sign in with email + code right there. Users who want Google get clear guidance to open Safari/Chrome. Behavior outside webviews is unchanged.

## Behavior

Outside in-app browsers: unchanged — `SignInButton mode="modal"` as today.

Inside in-app browsers, tapping the sign-in button opens the existing popup with new content:

- **Title:** `Đăng nhập trong app`
- **Body:** `Google không cho phép đăng nhập trong trình duyệt của app. Bạn có thể đăng nhập bằng email ngay tại đây, hoặc mở bằng Safari/Chrome để dùng Google.`
- **Primary button** (dark blue, same style as current): `Đăng nhập bằng email` — closes the popup and opens the Clerk sign-in modal with the Google social button and the "or" divider hidden, leaving only the email + code form.
- **Secondary button:** `Mở Safari/Chrome để dùng Google` — current copy-link behavior unchanged (clipboard write + alert `Đã copy link! Mở Safari hoặc Chrome và paste vào thanh địa chỉ nhé.`).
- **Tertiary:** `Đóng`.

## Technical approach

Single file change: `src/components/InAppBrowserSignIn.tsx`.

- Primary button calls `useClerk().openSignIn({ appearance: { elements: { socialButtons: 'hidden', socialButtonsRoot: 'hidden', dividerRow: 'hidden' } } })` after `setShowTip(false)`. `openSignIn(props?: SignInModalProps)` is confirmed present in the installed `@clerk/shared` types (v7 stack); `appearance` is typed as an open registry (`any` until augmented), so element keys are validated visually, not by the compiler. `hidden` is a Tailwind utility class available globally.
- **Fallback (decided at preview verification):** if the appearance element keys don't hide the Google button at runtime, instead set a marker class on `<body>` when in-app is detected and add a scoped global CSS rule hiding `.cl-socialButtons` / `.cl-dividerRow` under that marker. This variant also hides Google on the sign-up form inside the modal.

## Out of scope

- Clerk instance config changes (email code already enabled prod + dev).
- SMS OTP, Zalo OAuth custom provider (possible follow-ups, explicitly deferred by user).
- If the `appearance`-prop path is used: the sign-up form reachable from inside the modal may still show a Google button; it errors as before. Accepted for v1.

## Verification

1. Existing unit test `tests/in-app-browser-detection.test.ts` keeps covering the detection regex (unchanged here).
2. Dev preview: temporarily force in-app mode (uncommitted), screenshot the popup and the Clerk modal without the Google button, exercise the copy-link button, then revert the force.
3. `npm run test:unit` and lint stay green.
4. After deploy: real-device test by opening a shared link from Zalo chat.
