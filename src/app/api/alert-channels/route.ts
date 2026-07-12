import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/** 获取所有告警渠道 */
export async function GET() {
  const channels = await prisma.alertChannel.findMany({ orderBy: { id: 'asc' } });
  return NextResponse.json(channels);
}

/** 新建告警渠道 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const channel = await prisma.alertChannel.create({ data: body });
    return NextResponse.json(channel, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: '创建失败: ' + (e as Error).message }, { status: 500 });
  }
}
