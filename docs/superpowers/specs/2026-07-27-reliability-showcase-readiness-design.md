# Jane AI — Reliability & Showcase-Readiness

**Date:** 2026-07-27
**Goal:** Jane AI phải chạy mượt dù chủ chỉ "lâu lâu mới sờ vào", và không bao giờ lộ lỗi xấu hổ lúc showcase.

## Problem

App bị bỏ dài ngày giữa các lần dùng. Rủi ro tích tụ mà không ai hay đến khi đăng nhập/demo mới lòi ra:

- **Model retirement (rủi ro to nhất):** model Anthropic `claude-opus-4-7` được hardcode ở nhiều nơi. Khi Anthropic gỡ model cũ, *toàn bộ* tính năng AI trả 500 mà app không có đường lui.
- **Bug UI tích tụ:** ví dụ tường reminder che dashboard (đã fix, chờ deploy).
- **Không có tín hiệu sức khỏe:** không có cách nào bấm-1-phát biết app còn sống trước khi demo; lỗi chỉ lộ ra khi đăng nhập.
- **Không cảnh báo chủ động:** lỗi chỉ nằm ở Vercel logs (purge ~1h), chủ không được báo.

## Constraints

- **Không tốn tiền:** ở lại free tier (Supabase free, Vercel Hobby). Vercel Hobby = **1 cron/ngày** (slot đó đang dùng cho `/api/keepalive`).
- **Tái dùng đồ có sẵn:** Vercel Cron, Telegram bot (`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` đã cấu hình).
- **Không rewrite:** fix-forward theo tầng, mỗi phase ship độc lập.
- Prod: `ai.bebetterwithjane.com` (Vercel). Anthropic là provider prod (OpenAI chỉ dev).

## Approach

Chia 3 phase cuốn chiếu. Triển khai bắt đầu từ Phase 1.

### Phase 1 — Demo không vỡ trận

**1.1 Health endpoint `GET /api/health`**
- Kiểm 3 phụ thuộc song song, mỗi cái có timeout riêng, không để 1 cái treo cả request:
  - **Supabase:** query head+count siêu nhẹ trên `jd_history` (tái dùng pattern của `keepalive`).
  - **Anthropic:** 1 call `max_tokens: 1` tới model đang cấu hình → chứng minh cả *key* lẫn *model id* còn sống (đây là tín hiệu thật nhất cho rủi ro model retirement).
  - **Clerk:** 1 call nhẹ tới Clerk (vd JWKS/backend reachable).
- Trả `{ overall: "green"|"red", checks: { supabase, anthropic, clerk }, at }`. Mỗi check có `{ ok, ms, error? }`.
- Không lộ secret. Có thể gọi công khai (thông tin không nhạy cảm) nhưng chấp nhận header `Authorization: Bearer $CRON_SECRET` để cron dùng.

**1.2 Script `npm run health`**
- Gọi `/api/health` trên prod (URL mặc định = prod, cho phép override qua arg/env để test local).
- In 🟢/🔴 cho từng check + tổng thể, exit code ≠ 0 nếu red. Chạy được từ máy bất kỳ, vài giây.

**1.3 Trang `/status`**
- Trang công khai, client fetch `/api/health` và render đèn xanh/đỏ + thời điểm check. Mở nhanh trên điện thoại trước khi demo. Tối giản, không phụ thuộc thư viện ngoài.

**1.4 Model config tập trung + fallback**
- Gom model id đang rải rác về **1 module cấu hình** (`src/lib/ai/model.ts` hoặc gộp vào `recruiting-rag/runtime.ts`):
  - Hiện diện tại: `api/generate` (opus-4-7), `api/questionnaire/generate` (opus-4-7), `api/post-job/generate` (opus-4-7 ×2 + haiku-4-5), `recruiting-rag/runtime.ts` (`ANTHROPIC_DEFAULT_MODEL`).
- Định nghĩa **primary + fallback chain** (vd `claude-opus-4-8` → `claude-opus-4-7` → `claude-haiku-4-5`). Khi call primary lỗi kiểu model-not-found/deprecated → tự thử fallback tiếp theo, log lại.
- Nâng default lên model hiện hành (`claude-opus-4-8`). Giữ cơ chế override qua env (`RECRUITING_CHAT_ANTHROPIC_MODEL`, v.v.).
- Áp cho tất cả route AI (generate, questionnaire, post-job, recruiting-chat).

**1.5 Dọn mìn đã biết**
- Deploy fix tường reminder (`src/app/app/page.tsx`, đã sửa).
- **Chốt chặn dev:** khi chạy local mà `NEXT_PUBLIC_SUPABASE_URL` trỏ prod → in cảnh báo to trong terminal ("⚠️ LOCAL đang dùng DB PROD"). Rẻ, làm luôn ở Phase 1.

> **Ngoài phạm vi:** `bootcamp` (`/bootcamp`, `/api/bootcamp/*`) là sản phẩm riêng, chỉ tình cờ nằm chung repo — KHÔNG thuộc plan reliability của Jane AI. Xử lý riêng (spec/plan riêng) nếu cần.

### Phase 2 — Tự biết khi hỏng

- Mở rộng cron sáng sẵn có (`vercel.json`, `0 8 * * *`): sau bước keepalive, gọi logic health; **check nào red thì gửi Telegram** cho chủ (tái dùng helper Telegram sẵn có trong `api/q/[token]` / `api/bootcamp/register`).
- Giữ 1 cron duy nhất (đúng giới hạn Hobby). Trễ tối đa ~1 ngày — chấp nhận được.
- *Tuỳ chọn về sau:* UptimeRobot (free, 5 phút/lần) trỏ `/api/health` nếu cần cảnh báo realtime — cần tài khoản ngoài, để sau.

### Phase 3 — Polish (làm sau / tuỳ)

- **Không** tách Supabase dev/prod lúc này (tốn công, chỉ lợi cho lúc dev local — mà chủ ít dev local). Đã thay bằng chốt chặn cảnh báo ở 1.5. Revisit khi bắt đầu dev local thường xuyên.
- Nâng cấp trang `/status` (lịch sử, uptime) nếu muốn.

## Testing

- **Health endpoint:** unit test cho hàm tổng hợp trạng thái (green khi tất cả ok; red khi ≥1 fail; timeout → check đó fail chứ không treo). Mock từng dependency.
- **Model fallback:** unit test — primary lỗi model-not-found → fallback được chọn; tất cả lỗi → báo lỗi rõ ràng; thứ tự chain đúng.
- **Script `npm run health`:** exit code phản ánh overall.
- **Smoke thật:** gọi `/api/health` trên local (đã có kỹ thuật mint Clerk token nếu cần cho check Clerk) và xác nhận Telegram alert bắn đúng khi ép 1 check red.

## Out of scope

- Tách DB dev/prod, paid monitoring (Sentry/Datadog), trang status có lịch sử uptime, cảnh báo realtime dưới 1 ngày.
- Bootcamp (`/bootcamp`, `/api/bootcamp/*`) — sản phẩm riêng, xử lý ở effort khác.

## Rollout order

Phase 1 (spec → plan → build → deploy) → Phase 2 → Phase 3 (nếu cần). Mỗi phase là 1 increment deploy được.
