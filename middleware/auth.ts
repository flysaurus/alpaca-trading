import { NextResponse } from 'next/server.js'

export function middleware(request: Request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.next()
}
