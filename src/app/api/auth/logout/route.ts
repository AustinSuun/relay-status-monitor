import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';

/** 注销 */
export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
