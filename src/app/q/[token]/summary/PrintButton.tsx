'use client'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
    >
      In / Luu PDF
    </button>
  )
}
