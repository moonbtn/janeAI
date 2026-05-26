import Image from 'next/image'
import { SignInButton, Show } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function LandingPage() {
  const { userId } = await auth()
  if (userId) redirect('/app')

  return (
    <>
      <Show when="signed-out">
        {/* Nav */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100 px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#1B2B6E] rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-xs">J</span>
            </div>
            <span className="font-semibold text-gray-900 text-sm tracking-tight">Jane AI</span>
          </div>
          <SignInButton mode="modal">
            <button className="flex items-center gap-2 bg-[#1B2B6E] text-white text-sm font-medium px-5 py-2.5 rounded-full hover:bg-[#152258] transition-colors cursor-pointer">
              Dùng thử miễn phí
            </button>
          </SignInButton>
        </nav>

        {/* Hero + Founder */}
        <section className="pt-32 pb-28 px-8 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className="space-y-5">
                <p className="text-xs font-medium text-gray-400 tracking-widest uppercase">
                  Được xây bởi Jane Nguyen · Headhunter 10 năm
                </p>
                <h1 className="font-[family-name:var(--font-playfair)] text-5xl font-black leading-[1.08] text-[#1B2B6E]">
                  Welcome to Jane AI —{' '}
                  <em className="text-[#C9A23A]">
                    tuyển dụng như<br />headhunter lành nghề.
                  </em>
                </h1>
                <p className="text-gray-500 leading-relaxed">
                  Jane AI được xây bởi Jane, một headhunter với hơn 10 năm kinh nghiệm tuyển dụng từ mass recruitment đến C-level, từ Finance, IT đến FMCG, Retail ở Việt Nam và cả SEA. Cộng với hơn 4 năm vận hành Recruitment Academy và 100GB tài liệu thật được đưa vào làm nền tảng, để Jane AI trở thành chuyên gia tuyển dụng trong tay bạn.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <SignInButton mode="modal">
                  <button className="flex items-center gap-2.5 bg-[#1B2B6E] text-white px-7 py-3.5 rounded-full font-medium hover:bg-[#152258] transition-colors cursor-pointer">
                    Đăng nhập với Google
                  </button>
                </SignInButton>
                <span className="text-sm text-gray-400">Miễn phí</span>
              </div>
            </div>

            <div className="relative">
              <div className="aspect-[4/5] rounded-2xl overflow-hidden bg-gray-100 relative">
                <Image
                  src="/jane.jpg"
                  alt="Jane Nguyen"
                  fill
                  className="object-cover object-top"
                  priority
                />
              </div>
              <div className="absolute -bottom-4 -left-4 bg-white border border-gray-200 rounded-2xl px-5 py-4 shadow-sm">
                <p className="font-[family-name:var(--font-playfair)] text-3xl font-black text-[#C9A23A]">10+</p>
                <p className="text-xs text-gray-500 mt-0.5">năm trong nghề</p>
              </div>
            </div>
          </div>
        </section>

        <hr className="border-gray-100 max-w-5xl mx-auto" />

        {/* Training */}
        <section className="py-28 px-8 max-w-5xl mx-auto">
          <p className="text-xs font-medium text-gray-400 tracking-widest uppercase mb-16">Training</p>
          <h2 className="font-[family-name:var(--font-playfair)] text-5xl font-black leading-tight mb-16 max-w-3xl text-[#1B2B6E]">
            Jane AI không học<br />
            từ internet —<br />
            <em className="text-[#C9A23A]">Jane AI học từ<br />10 năm làm nghề của Jane.</em>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { stat: '100+', label: 'GB tài liệu thật', desc: 'JD thật, brief thật, feedback thật từ hiring manager sau hàng trăm vòng phỏng vấn.' },
              { stat: '10', label: 'năm đào tạo team', desc: 'Video, slide, case study từ hàng chục khóa training nội bộ — cách đọc CV, cách hỏi sếp, cách qualify ứng viên.' },
              { stat: '4', label: 'năm Recruitment Academy', desc: 'Chương trình đào tạo recruiter từ cơ bản đến nâng cao — toàn bộ được đưa vào làm nền tảng cho Jane AI.' },
            ].map(({ stat, label, desc }) => (
              <div key={label} className="space-y-3">
                <p className="font-[family-name:var(--font-playfair)] text-5xl font-black text-[#C9A23A] italic">{stat}</p>
                <p className="font-semibold text-gray-800">{label}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="border-gray-100 max-w-5xl mx-auto" />

        {/* Features */}
        <section className="py-28 px-8 max-w-5xl mx-auto">
          <p className="text-xs font-medium text-gray-400 tracking-widest uppercase mb-16">Jane AI làm được gì</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-12">
            {[
              { title: 'AI Chatbot tuyển dụng', desc: 'Hỏi bất cứ điều gì về recruitment — cách viết JD, cách handle offer negotiation, cách shortlist CV. Jane trả lời như một senior headhunter.' },
              { title: 'Job Spec', desc: 'Paste JD hoặc nhập yêu cầu thô — Jane tạo bảng hỏi gửi hiring manager, thu thập đúng yêu cầu, rồi tinh chỉnh JD từ câu trả lời thật.' },
              { title: 'CV Matching', desc: 'Upload CV, Jane so sánh với tiêu chí thật từ sếp — không phải từ JD gốc đã bị đoán mò. Tiết kiệm hàng giờ đọc CV không phù hợp.' },
              { title: 'Qualifying Questions', desc: 'Jane tạo checklist câu hỏi phone screening dựa trên đúng những gì hiring manager cần — không bỏ sót tiêu chí ẩn.' },
            ].map(({ title, desc }) => (
              <div key={title} className="flex gap-5">
                <div className="w-10 h-10 border border-[#D0D8F0] bg-[#EEF0FA] rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                  <div className="w-2 h-2 bg-[#C9A23A] rounded-full" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1.5">{title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <hr className="border-gray-100 max-w-5xl mx-auto" />

        {/* CTA */}
        <section className="py-28 px-8 max-w-5xl mx-auto text-center">
          <p className="text-xs font-medium text-gray-400 tracking-widest uppercase mb-8">Bắt đầu</p>
          <h2 className="font-[family-name:var(--font-playfair)] text-5xl md:text-6xl font-black leading-tight mb-6 text-[#1B2B6E]">
            Làm việc với<br />
            <em className="text-[#C9A23A]">10 năm kinh nghiệm</em><br />
            trong túi.
          </h2>
          <p className="text-gray-500 text-lg font-light mb-12 max-w-md mx-auto">
            Miễn phí. Không cần setup. Đăng nhập và thử ngay.
          </p>
          <SignInButton mode="modal">
            <button className="inline-flex items-center gap-2.5 bg-[#1B2B6E] text-white px-9 py-4 rounded-full font-medium text-base hover:bg-[#152258] transition-colors cursor-pointer">
              Đăng nhập với Google
            </button>
          </SignInButton>
        </section>

        {/* Footer */}
        <footer className="border-t border-gray-100 px-8 py-8">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-[#1B2B6E] rounded-md flex items-center justify-center">
                <span className="text-white font-bold text-xs">J</span>
              </div>
              <span className="text-sm text-gray-400">Jane AI</span>
            </div>
            <p className="text-xs text-gray-300">© 2025 Jane AI. Built by a headhunter, for recruiters.</p>
          </div>
        </footer>
      </Show>
    </>
  )
}
