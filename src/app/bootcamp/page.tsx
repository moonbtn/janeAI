import RegistrationForm from './RegistrationForm'

const EARLY_BIRD_DEADLINE = new Date('2025-06-20T23:59:59+07:00')

export default function BootcampPage() {
  const isEarlyBird = new Date() < EARLY_BIRD_DEADLINE
  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #fafaf7; }
        .session-topics li { list-style: none; padding-left: 20px; position: relative; margin-bottom: 8px; font-size: 14px; color: #444; line-height: 1.5; }
        .session-topics li::before { content: '—'; position: absolute; left: 0; color: #aaa; }
        .faq-item { border-top: 1px solid #e5e5e0; padding: 20px 0; }
        .faq-item:last-child { border-bottom: 1px solid #e5e5e0; }
        @media (max-width: 640px) {
          .sessions-grid { flex-direction: column !important; }
          .nav-links { display: none !important; }
          .hero-ctas { flex-direction: column !important; }
          .outcomes-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* HEADER */}
      <header>
        <div style={{
          maxWidth: '900px', margin: '0 auto', padding: '16px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
          borderBottom: '1px solid #e5e5e0', position: 'sticky', top: 0,
          background: '#fafaf7', zIndex: 100,
        }}>
          <a href="#" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e2a47', letterSpacing: '0.05em', textTransform: 'uppercase' }}>OAC Reskilling</span>
            <span style={{ color: '#e5e5e0', fontSize: '16px' }}>×</span>
            <span style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: '16px', fontWeight: 600, color: '#111' }}>
              Harari<span style={{ color: '#2a437c' }}>.ai</span>
            </span>
          </a>
          <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '24px', fontSize: '13px' }}>
            <a href="#chuong-trinh" style={{ color: '#6b6b6b', textDecoration: 'none' }}>Chương trình</a>
            <a href="#giang-vien" style={{ color: '#6b6b6b', textDecoration: 'none' }}>Giảng viên</a>
            <a href="#faq" style={{ color: '#6b6b6b', textDecoration: 'none' }}>FAQ</a>
            <a href="#dang-ky" style={{ background: '#1e2a47', color: '#fff', padding: '8px 18px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', textDecoration: 'none' }}>Đăng ký →</a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section style={{ background: '#1e2a47', color: '#fff', padding: '72px 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          {/* Cobrand badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '24px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            <span style={{ color: '#4a90e2', fontWeight: 700 }}>OAC Reskilling</span>
            <span style={{ color: '#6b8abf' }}>×</span>
            <span style={{ color: '#c0cde0' }}>Harari.ai</span>
          </div>

          {/* Kicker */}
          <p style={{ fontSize: '13px', color: '#7a95bc', letterSpacing: '0.05em', marginBottom: '20px', textTransform: 'uppercase' }}>
            Vibe Product &amp; Coding Bootcamp · Offline TP.HCM · 27–28/6/2025
          </p>

          {/* H1 */}
          <h1 style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 700, lineHeight: 1.2, marginBottom: '20px', maxWidth: '720px' }}>
            2 buổi. 1 sản phẩm thật. Và{' '}
            <em style={{ color: '#4a90e2', fontStyle: 'normal' }}>tư duy để xây cái tiếp theo.</em>
          </h1>

          {/* Sub */}
          <p style={{ fontSize: '16px', color: '#b0c0d8', marginBottom: '40px', maxWidth: '540px', lineHeight: 1.6 }}>
            Không cần biết code. Chỉ cần tò mò — và muốn bắt đầu.
          </p>

          {/* Meta bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', marginBottom: '40px', paddingTop: '24px', borderTop: '1px solid #2e3f60' }}>
            {[
              { label: 'Thời lượng', value: '2 buổi · 6 tiếng' },
              { label: 'Lịch học', value: '27 & 28/6 · 14:00–17:00' },
              {
                label: 'Học phí',
                value: isEarlyBird
                  ? <><s style={{ opacity: 0.6 }}>5.000.000đ</s> <span style={{ color: '#4a90e2', fontWeight: 700 }}>4.000.000đ EARLY BIRD</span></>
                  : '5.000.000đ',
              },
              { label: 'Số lượng', value: 'Tối đa 25 học viên' },
            ].map((item, i) => (
              <div key={i}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b8abf', marginBottom: '4px' }}>{item.label}</div>
                <div style={{ fontSize: '15px', fontWeight: 600 }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="hero-ctas" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <a href="#dang-ky" style={{ background: '#4a90e2', color: '#fff', padding: '14px 28px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.1em', textDecoration: 'none', fontWeight: 600 }}>
              Đăng ký giữ chỗ →
            </a>
            <a href="#chuong-trinh" style={{ border: '1px solid #4a6a9c', color: '#b0c0d8', padding: '14px 28px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.1em', textDecoration: 'none' }}>
              Xem chương trình
            </a>
          </div>
        </div>
      </section>

      {/* WHY */}
      <section style={{ padding: '72px 24px', background: '#fafaf7' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6b6b6b', marginBottom: '24px' }}>
            Bootcamp này dành cho ai
          </p>
          <p style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 'clamp(20px, 3vw, 28px)', color: '#111', lineHeight: 1.5, maxWidth: '680px', marginBottom: '32px' }}>
            Bạn đang tò mò AI đang làm được những gì — nghe người người nhà nhà nói về vibe coding nhưng chưa biết bắt đầu từ đâu?
          </p>
          <div style={{ borderTop: '2px solid #1e2a47', paddingTop: '24px', maxWidth: '600px' }}>
            <p style={{ fontSize: '15px', color: '#444', lineHeight: 1.7, marginBottom: '32px' }}>
              Không cần biết code. Không cần biết design. Bạn hoàn toàn có thể mang những ý tưởng trong đầu ra ngoài — AI đang làm cho việc đó trở nên dễ hơn bao giờ hết.
            </p>
            <blockquote style={{ borderLeft: '3px solid #1e2a47', paddingLeft: '20px' }}>
              <p style={{ fontSize: '15px', fontStyle: 'italic', color: '#333', lineHeight: 1.6, marginBottom: '8px' }}>
                &ldquo;Landing page này là mình tự code trong 2 tiếng.&rdquo;
              </p>
              <cite style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b6b6b', fontStyle: 'normal' }}>
                — Jane, One Arrow Consulting
              </cite>
            </blockquote>
          </div>
        </div>
      </section>

      {/* OUTCOMES */}
      <section style={{ padding: '72px 24px', background: '#f0f0ec' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6b6b6b', marginBottom: '16px' }}>
            Bạn sẽ học được gì
          </p>
          <h2 style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 'clamp(22px, 3.5vw, 32px)', color: '#111', marginBottom: '48px' }}>
            Mang một ý tưởng đến. Về với một sản phẩm thật.
          </h2>
          <div className="outcomes-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
            {[
              {
                num: '01',
                title: 'Tư duy sản phẩm trước khi code',
                desc: 'Framework để biết mình thật sự muốn gì — trước khi mở cursor hay bất kỳ AI tool nào.',
              },
              {
                num: '02',
                title: 'Setup free & AI như một superpower',
                desc: 'Cài đặt môi trường hoàn toàn miễn phí — và học cách để AI làm việc nặng thay bạn.',
              },
              {
                num: '03',
                title: 'Communicate với AI bằng tiếng Việt',
                desc: 'Tư duy và phương thức để nói chuyện với AI — để nó hiểu đúng ý bạn muốn.',
              },
              {
                num: '04',
                title: 'Troubleshoot khi có vấn đề',
                desc: 'Phương thức để đọc lỗi, đặt câu hỏi đúng — và không bị stuck khi mọi thứ không chạy.',
              },
            ].map((item) => (
              <div key={item.num} style={{ paddingTop: '24px', borderTop: '1px solid #d8d8d2' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#aaa', letterSpacing: '0.1em', marginBottom: '10px' }}>{item.num}</div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#111', marginBottom: '8px' }}>{item.title}</div>
                <div style={{ fontSize: '14px', color: '#666', lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INSTRUCTORS */}
      <section id="giang-vien" style={{ padding: '72px 24px', background: '#fafaf7' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6b6b6b', marginBottom: '16px' }}>
            Giảng viên &amp; supporter
          </p>
          <h2 style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 'clamp(22px, 3.5vw, 32px)', color: '#111', marginBottom: '40px' }}>
            Học từ người đang build thật.
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Card 1 */}
            <div style={{ maxWidth: '540px', border: '1px solid #e5e5e0', padding: '28px' }}>
              <div style={{ display: 'inline-block', background: '#2a437c', color: '#fff', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 10px', marginBottom: '16px' }}>
                Giảng viên · Harari.ai &amp; Filum AI
              </div>
              <h3 style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: '22px', fontWeight: 600, color: '#111', marginBottom: '12px' }}>
                Viền Trần
              </h3>
              <p style={{ fontSize: '14px', color: '#555', lineHeight: 1.7 }}>
                Founder của Harari.ai và Filum AI — hai sản phẩm AI được build bằng chính những công cụ sẽ được dạy trong bootcamp này. Viền đã dạy hơn 500 người về AI và product thinking trong 2 năm qua.
              </p>
            </div>
            {/* Card 2 */}
            <div style={{ maxWidth: '540px', border: '1px solid #e5e5e0', padding: '28px', background: '#f0f0ec' }}>
              <div style={{ display: 'inline-block', background: '#f0f0ec', color: '#6b6b6b', border: '1px solid #d8d8d2', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 10px', marginBottom: '16px' }}>
                Supporter · OAC Reskilling
              </div>
              <h3 style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: '22px', fontWeight: 600, color: '#111', marginBottom: '12px' }}>
                Jane Nguyễn
              </h3>
              <p style={{ fontSize: '14px', color: '#555', lineHeight: 1.7 }}>
                Học trò của Viền — và là người đã dùng những gì học được để build các sản phẩm AI trong nội bộ OAC. Landing page này là một trong những thứ Jane tự build. Jane sẽ đồng hành cùng học viên xuyên suốt 2 buổi.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SCHEDULE */}
      <section id="chuong-trinh" style={{ padding: '72px 24px', background: '#1e2a47', color: '#fff' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6b8abf', marginBottom: '16px' }}>
            Chương trình học
          </p>
          <h2 style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 'clamp(22px, 3.5vw, 32px)', color: '#fff', marginBottom: '40px' }}>
            2 buổi · 3 tiếng/buổi · 70% thực hành.
          </h2>
          <div className="sessions-grid" style={{ display: 'flex', gap: '24px' }}>
            {/* Session 1 */}
            <div style={{ flex: 1, border: '1px solid #2e3f60', padding: '28px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4a90e2', marginBottom: '8px' }}>Buổi 01 · 27/6</div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '20px', lineHeight: 1.4 }}>
                Ship sản phẩm đầu tiên + nói cho AI hiểu
              </h3>
              <ul className="session-topics" style={{ paddingLeft: 0 }}>
                <li>Tư duy sản phẩm: bạn đang build gì và cho ai?</li>
                <li>Setup môi trường: Cursor, Claude, GitHub miễn phí</li>
                <li>Prompt cơ bản: nói chuyện với AI bằng tiếng Việt</li>
                <li>Tạo trang web đầu tiên từ một câu mô tả</li>
                <li>Publish lên internet — ai cũng xem được</li>
                <li>Q&amp;A và review sản phẩm theo nhóm</li>
              </ul>
            </div>
            {/* Session 2 */}
            <div style={{ flex: 1, border: '1px solid #2e3f60', padding: '28px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4a90e2', marginBottom: '8px' }}>Buổi 02 · 28/6</div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '20px', lineHeight: 1.4 }}>
                Gỡ rối, shortcut &amp; hoàn thiện product
              </h3>
              <ul className="session-topics" style={{ paddingLeft: 0 }}>
                <li>Troubleshoot: đọc lỗi và hỏi AI đúng cách</li>
                <li>Iteration loop: chỉnh sửa nhanh bằng prompt</li>
                <li>Shortcut và workflow để build nhanh hơn</li>
                <li>Thêm tính năng: form, database, auth cơ bản</li>
                <li>Hoàn thiện và demo sản phẩm của bạn</li>
                <li>Lộ trình tiếp theo: học gì sau bootcamp</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ padding: '72px 24px', background: '#fafaf7' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6b6b6b', marginBottom: '16px' }}>
            FAQ
          </p>
          <h2 style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 'clamp(22px, 3.5vw, 32px)', color: '#111', marginBottom: '40px' }}>
            Câu hỏi thường gặp.
          </h2>
          <div style={{ maxWidth: '680px' }}>
            <div className="faq-item">
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111', marginBottom: '10px' }}>
                Tôi không biết code có học được không?
              </h3>
              <p style={{ fontSize: '14px', color: '#555', lineHeight: 1.7 }}>
                Được. Bạn làm việc bằng cách mô tả bằng ngôn ngữ tự nhiên — AI sẽ viết code cho bạn. Bootcamp này được thiết kế dành riêng cho người chưa từng code.
              </p>
            </div>
            <div className="faq-item">
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111', marginBottom: '10px' }}>
                Cần chuẩn bị gì?
              </h3>
              <p style={{ fontSize: '14px', color: '#555', lineHeight: 1.7 }}>
                Laptop cá nhân (Mac hoặc Windows) và 1 ý tưởng muốn thử build — dù mơ hồ cũng được. Tất cả tool dùng trong bootcamp đều miễn phí.
              </p>
            </div>
            <div className="faq-item">
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111', marginBottom: '10px' }}>
                Học phí và ưu đãi?
              </h3>
              <p style={{ fontSize: '14px', color: '#555', lineHeight: 1.7 }}>
                5.000.000đ / học viên. Early bird 4.000.000đ cho đến hết ngày 20/6. Refund 500.000đ nếu sau buổi 1 bạn cảm thấy không phù hợp.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FORM */}
      <section id="dang-ky">
        {/* Header */}
        <div style={{ background: '#1e2a47', color: '#fff', padding: '56px 24px' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6b8abf', marginBottom: '16px' }}>
              Đăng ký
            </p>
            <h2 style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 'clamp(24px, 4vw, 38px)', color: '#fff', marginBottom: '12px' }}>
              Giữ chỗ của bạn.
            </h2>
            <p style={{ fontSize: '15px', color: '#b0c0d8', maxWidth: '480px', lineHeight: 1.6 }}>
              Điền thông tin — bạn sẽ nhận email với hướng dẫn chuyển khoản ngay sau đó.
            </p>
          </div>
        </div>
        {/* Body */}
        <div style={{ background: '#fafaf7', padding: '48px 24px' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            {isEarlyBird && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#fff3cd', border: '1px solid #ffc107', padding: '8px 16px', fontSize: '13px', color: '#7a5c00', marginBottom: '32px' }}>
                🎁 Early bird trước 20/6: <strong>4.000.000đ</strong> · Sau 20/6: 5.000.000đ
              </div>
            )}
            <div style={{ maxWidth: '520px', border: '1px solid #e5e5e0', padding: '32px', background: '#fff' }}>
              <RegistrationForm />
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
