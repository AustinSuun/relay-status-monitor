import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

interface Params {
  params: Promise<{ id: string }>;
}

/** 标记告警已解决 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = body.resolved !== false;
    const incident = await prisma.incident.update({
      where: { id: Number(id) },
      data: { resolved, resolvedAt: resolved ? new Date() : null },
    });
    return NextResponse.json(incident);
  } catch (e) {
    return NextResponse.json({ error: '更新失败: ' + (e as Error).message }, { status: 500 });
  }
}
