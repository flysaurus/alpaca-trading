'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export function usePendingBaskets() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    checkPending()
    const interval = setInterval(checkPending, 30000)
    return () => clearInterval(interval)
  }, [])

  async function checkPending() {
    try {
      const { data, error } = await supabase
        .from('baskets')
        .select('id', { count: 'exact' })
        .eq('status', 'draft')

      if (!error) {
        setCount(data?.length || 0)
      }
    } catch {
      // Supabase not configured yet — ignore
    }
  }

  return count
}
