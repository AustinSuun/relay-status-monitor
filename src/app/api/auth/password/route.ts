export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, verifyPassword, hashPassword } from '@/lib/auth';

/** 修改密码 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  try {
    const { oldPassword, newPassword } = await request.json();
    if (!oldPassword || !newPassword) {
      return NextResponse.json({ error: '旧密码和新密码不能为空' }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: '新密码至少 6 位' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    const ok = await verifyPassword(oldPassword, user.password);
    if (!ok) {
      return NextResponse.json({ error: '旧密码错误' }, { status: 400 });
    }

    const hash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: '修改失败: ' + (e as Error).message }, { status: 500 });
  }
}
