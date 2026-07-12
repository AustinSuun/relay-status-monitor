export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { collectOneKeyManual } from '@/lib/collector';

interface Params {
  params: Promise<{ keyId: string }>;
}

/** 手动触发单个 key 的完整采集 */
export async function POST(_req: Request, { params }: Params) {
  const { keyId } = await params;
  try {
    const metric = await collectOneKeyManual(Number(keyId));
    if (!metric) {
      return NextResponse.json({ error: '采集失败：未配置凭证' }, { status: 400 });
    }
    return NextResponse.json(metric);
  } catch (e) {
    return NextResponse.json({ error: '测试失败: ' + (e as Error).message }, { status: 500 });
  }
}
