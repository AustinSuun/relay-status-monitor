export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

/** 获取当前登录用户 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, username: session.username, userId: session.userId });
}
