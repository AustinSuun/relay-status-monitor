export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSession, verifyPassword } from '@/lib/auth';

/** 登录 */
export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    const ok = await verifyPassword(password, user.password);
    if (!ok) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    await createSession({ userId: user.id, username: user.username });
    return NextResponse.json({ ok: true, username: user.username });
  } catch (e) {
    return NextResponse.json({ error: '登录失败: ' + (e as Error).message }, { status: 500 });
  }
}
