import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple in-memory rate limiter for Edge runtime.
// Note: In a true distributed Edge environment (like Vercel), this state is local
// to each edge function instance. For global limits, use @upstash/redis.
const ipStore = new Map<string, { count: number; expires: number }>();

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/analyze')) {
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute

    // Periodic cleanup of expired entries to prevent memory leaks
    if (Math.random() < 0.1) {
      for (const [key, val] of ipStore.entries()) {
        if (now > val.expires) ipStore.delete(key);
      }
    }

    let data = ipStore.get(ip);
    if (!data || data.expires < now) {
      data = { count: 1, expires: now + windowMs };
      ipStore.set(ip, data);
    } else {
      data.count++;
      if (data.count > 3) {
        return new NextResponse(
          JSON.stringify({ error: 'Too Many Requests. Maximum 3 analysis tasks per minute.' }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: '/api/analyze',
};
