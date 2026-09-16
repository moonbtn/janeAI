# Jane AI — Migrate off Supabase to Neon + Drizzle

**Date:** 2026-09-16
**Goal:** Loại bỏ hoàn toàn rủi ro auto-pause/DNS-chết của Supabase free tier, đồng thời fix luôn vấn đề "migration áp tay vào SQL Editor" đã ghi nhận trước đó — không tốn thêm chi phí hàng tháng.

## Problem

Supabase free tier auto-pause project sau 7 ngày không đủ "activity". Đã có `/api/keepalive` (Vercel Cron daily) để né việc này, nhưng:

- Đã từng bị pause thật 1 lần (14/7) vì commit keepalive chưa deploy kịp — khi pause, `bkluzxfrurwlczsqlyfj.supabase.co` NXDOMAIN toàn bộ, tưởng mất data.
- Supabase tiếp tục gửi email cảnh báo pause định kỳ (15/9) dù project chưa thực sự pause — gây lo lắng lặp lại, và keepalive là cơ chế né-rủi-ro chứ không loại bỏ rủi ro gốc (nếu 1 lần cron miss/không deploy kịp thì lại pause thật).
- Migration hiện tại áp thủ công vào Supabase SQL Editor trên prod (xem `recruiting-migrations-applied-prod` memory) — không có tracking version, dễ áp sai/thiếu.

Chủ (Jane) chọn dứt điểm: chuyển hẳn sang 1 Postgres provider khác (Neon) thay vì tiếp tục vá (fix cron) hoặc trả tiền Supabase Pro.

## Constraints

- **Không tốn thêm chi phí hàng tháng** — Neon free tier.
- App hiện dùng lượng data nhỏ (thấp chục-trăm rows mỗi bảng), traffic thấp (solo/small business tool) → chấp nhận vài phút downtime lúc cutover, không cần zero-downtime.
- Chỉ dùng `getSupabaseAdmin()` (service-role) trong toàn bộ code — không nơi nào dùng anon client/RLS thật sự (đã grep xác nhận: không có `.storage.`, `.channel(`, `supabase.auth`, và `getSupabase()` anon client không được gọi ở đâu ngoài định nghĩa của chính nó).
- `bootcamp` (`/bootcamp`, `/api/bootcamp/*`) là sản phẩm riêng, không dùng `src/lib/supabase.ts` (đã grep xác nhận) → **ngoài phạm vi**, không bị ảnh hưởng bởi migration này.
- Next.js trong repo này có breaking changes so với training data — theo `AGENTS.md`, phải đọc `node_modules/next/dist/docs/` phần liên quan trước khi viết route code trong lúc implement.

## Approach

### Kiến trúc

```
Trước:  Next.js API routes ──(supabase-js)──> Supabase (Postgres + PostgREST + auto-pause free tier)
Sau:    Next.js API routes ──(Drizzle + @neondatabase/serverless)──> Neon Postgres (free tier, auto-suspend nhưng auto-wake, không DNS-chết)
```

- **Neon project mới**, độc lập hoàn toàn với Supabase.
- **Drizzle ORM** thay cho `@supabase/supabase-js`: schema định nghĩa 1 chỗ (`src/lib/db/schema.ts`), migration sinh + track tự động bằng `drizzle-kit` (script `npm run db:migrate`), thay hẳn việc copy-paste SQL vào dashboard.
- Không cần RLS/PostgREST ở DB mới — kết nối thẳng bằng 1 connection string duy nhất (`DATABASE_URL`), vì chỉ có server-side service credential truy cập (giống model service-role hiện tại, chỉ bỏ lớp PostgREST ở giữa).
- Driver: `@neondatabase/serverless` (HTTP-based) — phù hợp Vercel serverless functions, tránh connection pool bị cạn khi nhiều lambda invocation cùng lúc.

### Vì sao Drizzle thay vì raw SQL

Đang phải rewrite toàn bộ 24 file / 30 điểm import dùng Supabase query builder (`.from('table')...`) dù chọn cách nào — chi phí thêm để dùng Drizzle so với raw SQL (`postgres.js`) là nhỏ so với lợi ích: type-safe query (sai tên cột/bảng là lỗi biên dịch, không phải lỗi runtime lúc demo) + migration tracking tự động (fix luôn pain point migration-áp-tay).

### Schema (10 bảng, giữ nguyên cấu trúc dữ liệu)

Map 1:1 từ schema Supabase hiện tại (`docs/superpowers/schema.sql` + các file trong `supabase/migrations/`) sang Drizzle schema TS:

`jd_history`, `questionnaires`, `questionnaire_answers`, `recruiting_chat_conversations`, `recruiting_chat_messages`, `recruiting_leads`, `post_campaigns`, `connected_accounts`, `feedback`, `api_usage`.

Giữ nguyên tên bảng/cột, kiểu dữ liệu, default (`gen_random_uuid()`, `now()`), foreign keys, index. **Bỏ** phần RLS policies/grants theo role Supabase (`anon`/`authenticated`/`service_role`) — không còn ý nghĩa khi không có PostgREST/anon key.

`gen_random_uuid()` cần extension `pgcrypto` — Neon hỗ trợ sẵn, chỉ cần `CREATE EXTENSION IF NOT EXISTS pgcrypto;` trong migration đầu tiên.

## Migration / Cutover Plan

1. Tạo Neon project (free tier) — lấy connection string pooled (runtime) + direct (migration/dump-restore).
2. Chạy Drizzle migration đầu tiên trên Neon để tạo schema (10 bảng + extension `pgcrypto`).
3. Dump data từ Supabase: connect Postgres trực tiếp (Supabase hỗ trợ, không chỉ qua PostgREST), `pg_dump --data-only` theo schema `public` (loại trừ Supabase-internal schemas) → file `.sql`.
4. Restore vào Neon: `psql $NEON_DIRECT_URL < dump.sql`.
5. Verify counts: so `select count(*)` mỗi bảng giữa Supabase và Neon phải khớp.
6. Đổi env var trên Vercel: thêm `DATABASE_URL` (Neon). **Giữ tạm** `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (rollback net).
7. Deploy bản code đã swap sang Drizzle.
8. Smoke test trên prod ngay sau deploy: `npm run health` (đã có sẵn từ reliability phase 1) + thử 1 luồng thật (VD: tạo JD mới).
9. Downtime thực tế = khoảng giữa bước 6 (đổi env) và bước 7 (deploy xong) — vài phút, đã được chấp nhận.

## Cleanup sau khi ổn định

- Xoá `/api/keepalive` + cron entry tương ứng trong `vercel.json` — giải phóng slot cron Hobby-duy-nhất cho Phase 2 health-alert (đã lên plan trong `2026-07-27-reliability-phase1`).
- Cập nhật `src/lib/health/check.ts` — đổi check "Supabase" thành check Neon (vẫn nhẹ: 1 query đơn giản).
- Đổi cảnh báo dev `warnIfLocalUsingRemoteDb` (trong `src/lib/supabase.ts`, sẽ đổi tên/nội dung file khi rewrite) từ "đang dùng Supabase remote" sang "đang dùng Neon remote" — giữ nguyên tinh thần cảnh báo local-hits-prod.
- Giữ Supabase project sống thêm ~2 tuần sau cutover làm lưới an toàn trước khi cân nhắc xoá hẳn.
- Update memory: `supabase-keepalive-free-tier`, `local-dev-hits-prod-supabase`, `recruiting-migrations-applied-prod` sau khi xong (không còn đúng nữa).

## Testing

- Trước cutover: unit test cho các hàm data-access mới, chạy chống 1 Neon dev branch (Neon hỗ trợ branch DB riêng cho dev/test, không đụng prod).
- Sau cutover: `npm run health`, thử thủ công 2-3 luồng chính (tạo JD, questionnaire, recruiting chat) trên prod thật.

## Rollback Plan

Supabase project vẫn còn sống ~2 tuần sau cutover → rollback = revert deploy về commit trước (trỏ lại Supabase), không mất data vì chưa xoá gì bên Supabase. Rủi ro ghi-mất-dữ-liệu trong lúc downtime ngắn (vài phút, không traffic ghi) là thấp.

## Out of Scope

- `bootcamp` (`/bootcamp`, `/api/bootcamp/*`) — sản phẩm riêng, không đụng tới.
- Zero-downtime cutover (dual-write/sync) — không cần thiết ở quy mô hiện tại.
- Phase 2 health-alert qua Telegram (đã có plan riêng, không nằm trong scope migration này — chỉ hưởng lợi gián tiếp từ slot cron được giải phóng).

## Rollout Order

Viết spec (xong) → lên plan chi tiết (writing-plans) → implement theo plan, review từng bước → cutover thực tế → cleanup.
