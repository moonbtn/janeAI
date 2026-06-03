import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase'

const ADMIN_EMAIL = 'jane.nguyen@onearw.com'

type FeedbackRow = {
  id: string
  email: string | null
  message: string
  created_at: string
}

export default async function AdminPage() {
  const user = await currentUser()
  const email = user?.emailAddresses?.[0]?.emailAddress

  if (email !== ADMIN_EMAIL) redirect('/app')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (getSupabaseAdmin() as any)
    .from('feedback')
    .select('id, email, message, created_at')
    .order('created_at', { ascending: false })

  const feedbacks: FeedbackRow[] = error ? [] : data

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Feedback</h1>
            <p className="text-sm text-gray-400 mt-1">{feedbacks.length} góp ý</p>
          </div>
          <a href="/app" className="text-sm text-indigo-600 hover:underline">← Về trang chính</a>
        </div>

        {feedbacks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
            Chưa có feedback nào.
          </div>
        ) : (
          <div className="space-y-3">
            {feedbacks.map((fb) => (
              <div key={fb.id} className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-indigo-600">{fb.email ?? 'Ẩn danh'}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(fb.created_at).toLocaleString('vi-VN', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{fb.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
