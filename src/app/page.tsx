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
                  <em className="text-[#E8614D]">
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

              <div className="pt-2">
                <p className="text-xs text-gray-300 uppercase tracking-widest mb-4">Powered by</p>
                <div className="flex items-center gap-6">
                  <a href="https://www.onearw.com/" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
                    <Image src="/logo-oac.png" alt="One Arrow Consulting" width={225} height={225} className="w-24 h-24 object-contain" />
                  </a>
                  <a href="https://www.facebook.com/RecruitmentAcademybyOAC" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
                    <Image src="/logo-recruitment-academy.png" alt="Recruitment Academy by OAC" width={225} height={225} className="w-24 h-24 object-contain" />
                  </a>
                  <a href="https://harari.ai/" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
                    <Image src="/logo-harari.png" alt="Harari.ai" width={153} height={80} className="h-12 w-auto object-contain" />
                  </a>
                </div>
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
                <p className="font-[family-name:var(--font-playfair)] text-3xl font-black text-[#E8614D]">10+</p>
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
            <em className="text-[#E8614D]">Jane AI học từ<br />10 năm làm nghề của Jane.</em>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { stat: '100+', label: 'GB tài liệu thật', desc: 'JD thật, brief thật, feedback thật từ hiring manager sau hàng trăm vòng phỏng vấn.' },
              { stat: '10', label: 'năm đào tạo team', desc: 'Video, slide, case study từ hàng chục khóa training nội bộ — cách đọc CV, cách hỏi sếp, cách qualify ứng viên.' },
              { stat: '4', label: 'năm Recruitment Academy', desc: 'Chương trình đào tạo recruiter từ cơ bản đến nâng cao — toàn bộ được đưa vào làm nền tảng cho Jane AI.' },
            ].map(({ stat, label, desc }) => (
              <div key={label} className="space-y-3">
                <p className="font-[family-name:var(--font-playfair)] text-5xl font-black text-[#E8614D] italic">{stat}</p>
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
                  <div className="w-2 h-2 bg-[#E8614D] rounded-full" />
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
            <em className="text-[#E8614D]">10 năm kinh nghiệm</em><br />
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

        <hr className="border-gray-100 max-w-5xl mx-auto" />

        {/* Connect + Coffee */}
        <section className="py-20 px-8 max-w-5xl mx-auto">
          <div className="flex flex-col items-center gap-6 text-center">

            <p className="text-sm text-gray-500 leading-relaxed">
              Jane AI hoàn toàn miễn phí — nếu bạn thấy hữu ích, mời mình một ly cafe nhé ☕
            </p>

            <div className="flex items-center gap-5">

              {/* QR nhỏ */}
              <Image
                src="/qr-vpbank.png"
                alt="QR VPBank"
                width={64}
                height={64}
                className="w-16 h-16 object-cover rounded-lg border border-gray-100 shrink-0"
              />

              {/* Divider */}
              <div className="w-px h-12 bg-gray-100 shrink-0" />

              {/* Connect */}
              <div className="flex flex-col gap-2 text-left">
                <p className="text-xs text-gray-400 italic">Connect với mình nè</p>
                <a href="https://www.linkedin.com/in/janenguyen4/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-gray-500 hover:text-[#1B2B6E] transition-colors font-medium">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                  LinkedIn
                </a>
                <a href="https://www.facebook.com/moonbtn/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-gray-500 hover:text-[#1B2B6E] transition-colors font-medium">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  Facebook
                </a>
              </div>

              {/* Divider */}
              <div className="w-px h-12 bg-gray-100 shrink-0" />

              {/* Thank you cat */}
              <Image
                src="/thankyou-cat.jpg"
                alt="Thank you!"
                width={64}
                height={64}
                className="w-16 h-16 object-cover rounded-lg shrink-0"
              />

            </div>
          </div>
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
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-300">© 2025 Jane AI. Built by a headhunter, for recruiters. · Powered by</p>
              <Image src="/logo-harari.png" alt="Harari.ai" width={274} height={100} className="h-4 w-auto object-contain opacity-50" />
            </div>
          </div>
        </footer>
      </Show>
    </>
  )
}
