import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

interface Params {
  params: Promise<{ id: string }>;
}

/** 更新告警渠道 */
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const body = await request.json();
    const channel = await prisma.alertChannel.update({
      where: { id: Number(id) },
      data: body,
    });
    return NextResponse.json(channel);
  } catch (e) {
    return NextResponse.json({ error: '更新失败: ' + (e as Error).message }, { status: 500 });
  }
}

/** 删除告警渠道 */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    await prisma.alertChannel.delete({ where: { id: Number(id) } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: '删除失败: ' + (e as Error).message }, { status: 500 });
  }
}
