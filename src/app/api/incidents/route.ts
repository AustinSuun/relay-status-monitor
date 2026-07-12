import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * 告警事件列表
 * GET /api/incidents?resolved=false&upstreamId=1&keyId=2&limit=50
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const resolvedParam = searchParams.get('resolved');
  const limit = Number(searchParams.get('limit') || '50');
  const upstreamId = searchParams.get('upstreamId');
  const keyId = searchParams.get('keyId') || searchParams.get('upstreamKeyId');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (resolvedParam === 'false') where.resolved = false;
  else if (resolvedParam === 'true') where.resolved = true;
  if (upstreamId) where.upstreamId = Number(upstreamId);
  if (keyId) where.upstreamKeyId = Number(keyId);

  const incidents = await prisma.incident.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      upstream: { select: { id: true, name: true, baseUrl: true } },
      upstreamKey: { select: { id: true, group: true } },
    },
  });

  return NextResponse.json(incidents);
}
