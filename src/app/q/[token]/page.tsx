import { notFound } from 'next/navigation'
import QuestionnaireWizard from '@/components/QuestionnaireWizard'
import type { Question } from '@/lib/db/types'

export default async function QuestionnairePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/q/${token}`,
    { cache: 'no-store' }
  )

  if (!res.ok) {
    if (res.status === 409) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-md w-full text-center shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Bảng hỏi đã được điền</h2>
            <p className="text-gray-500 text-sm">Anh/chị đã submit rồi. Cảm ơn!</p>
          </div>
        </div>
      )
    }
    if (res.status === 410) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-md w-full text-center shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Link đã hết hạn</h2>
            <p className="text-gray-500 text-sm">Vui lòng liên hệ recruiter để nhận link mới.</p>
          </div>
        </div>
      )
    }
    notFound()
  }

  const data = await res.json() as {
    id: string
    questions: Question[]
    prefilled_answers: Record<string, unknown>
    language: 'vi' | 'en'
    is_resend: boolean
  }

  return (
    <QuestionnaireWizard
      questionnaireId={data.id}
      token={token}
      questions={data.questions}
      prefilledAnswers={data.prefilled_answers}
      language={data.language ?? 'vi'}
      isResend={data.is_resend ?? false}
    />
  )
}
