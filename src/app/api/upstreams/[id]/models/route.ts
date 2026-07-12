import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAdapter } from '@/lib/adapters/registry';
import { tryDecrypt } from '@/lib/crypto';
import { getCollectConfig } from '@/lib/settings';
import type { AdapterContext } from '@/lib/adapters/base';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * 实时拉取上游可用模型列表
 * GET /api/upstreams/[id]/models?keyId=xxx
 * 用指定 key（或第一个 enabled key）的凭证调 /v1/models
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const keyId = searchParams.get('keyId');

  const upstream = await prisma.upstream.findUnique({ where: { id: Number(id) } });
  if (!upstream) {
    return NextResponse.json({ error: '上游不存在' }, { status: 404 });
  }

  // 取指定 key 或第一个有 apiKey 的 enabled key
  let key;
  if (keyId) {
    key = await prisma.upstreamKey.findUnique({ where: { id: Number(keyId) } });
  } else {
    key = await prisma.upstreamKey.findFirst({
      where: { upstreamId: Number(id), enabled: true, apiKeyEnc: { not: null } },
    });
  }

  if (!key || !key.apiKeyEnc) {
    return NextResponse.json({ error: '未找到带 API Key 的分组' }, { status: 400 });
  }

  const apiKey = tryDecrypt(key.apiKeyEnc);
  if (!apiKey) {
    return NextResponse.json({ error: 'API Key 解密失败' }, { status: 500 });
  }

  const config = await getCollectConfig();
  const adapter = getAdapter(upstream.type);
  const ctx: AdapterContext = {
    baseUrl: upstream.baseUrl,
    apiKey,
    accessToken: key.accessTokenEnc ? tryDecrypt(key.accessTokenEnc) || undefined : undefined,
    userId: key.userId || undefined,
    timeoutMs: config.timeoutMs,
    testModel: key.testModel || upstream.testModel || config.testModel,
  };

  const result = await adapter.listModels(ctx);
  if (!result.ok) {
    return NextResponse.json({ error: result.errorMessage || '拉取失败' }, { status: 502 });
  }

  return NextResponse.json({ models: result.models || [] });
}
