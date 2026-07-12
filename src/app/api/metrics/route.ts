export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * 查询指标数据
 * GET /api/metrics?upstreamKeyId=1&hours=24
 * GET /api/metrics?upstreamId=1&days=7  (该上游所有 key 的数据)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const upstreamKeyId = searchParams.get('upstreamKeyId');
  const upstreamId = searchParams.get('upstreamId');
  const hours = Number(searchParams.get('hours'));
  const days = Number(searchParams.get('days'));
  const limit = Number(searchParams.get('limit') || '2000');

  if (!upstreamKeyId && !upstreamId) {
    return NextResponse.json({ error: '缺少 upstreamKeyId 或 upstreamId 参数' }, { status: 400 });
  }

  let since: Date;
  if (days > 0) since = new Date(Date.now() - days * 86400000);
  else if (hours > 0) since = new Date(Date.now() - hours * 3600000);
  else since = new Date(Date.now() - 24 * 3600000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { recordedAt: { gte: since } };
  if (upstreamKeyId) where.upstreamKeyId = Number(upstreamKeyId);
  else if (upstreamId) where.upstreamId = Number(upstreamId);

  const metrics = await prisma.metric.findMany({
    where,
    orderBy: { recordedAt: 'asc' },
    take: limit,
  });

  return NextResponse.json(metrics);
}

/** 清理过期指标 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Number(searchParams.get('days') || '90');
  const cutoff = new Date(Date.now() - days * 86400000);
  const result = await prisma.metric.deleteMany({ where: { recordedAt: { lt: cutoff } } });
  return NextResponse.json({ deleted: result.count });
}
