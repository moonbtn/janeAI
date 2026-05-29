'use client'

import { useEffect } from 'react'

export default function PrintTrigger() {
  useEffect(() => {
    // Small delay to let the page render fully before triggering print
    const t = setTimeout(() => window.print(), 500)
    return () => clearTimeout(t)
  }, [])

  return null
}
