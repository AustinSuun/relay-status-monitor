import { NextResponse } from 'next/server';
import { runCollectCycle } from '@/lib/collector';
import { getCronSecret } from '@/lib/settings';

/**
 * 定时采集入口
 * 由外部 crontab 每分钟触发：
 *   * * * * * curl -H "Authorization: Bearer $CRON_SECRET" https://your-monitor.example/api/cron/collect
 *
 * 内部根据当前分钟数自动判断 light / heavy 模式
 */
export async function GET(request: Request) {
  const start = Date.now();
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = await getCronSecret();
    if (!cronSecret) {
      return NextResponse.json({ error: 'CRON_SECRET 未配置' }, { status: 500 });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const result = await runCollectCycle();
    const elapsed = Date.now() - start;
    return NextResponse.json({
      ok: true,
      collected: result.collected,
      mode: result.mode,
      elapsedMs: elapsed,
      time: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
