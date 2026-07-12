/**
 * 告警渠道发送入口 + 飞书 Webhook 实现
 *
 * engine.ts 调用 sendNotification()，本模块负责：
 * 1. 查询所有启用的渠道
 * 2. 分发到具体渠道（当前只有飞书，架构可扩展）
 *
 * 飞书配置格式（AlertChannel.config JSON）：
 * { "webhookUrl": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx", "secret": "签名密钥（可选）" }
 */
import { createHmac } from 'crypto';
import type { AlertChannel, Upstream, UpstreamKey } from '@prisma/client';
import { prisma } from '../../db';

interface IncidentLike {
  id: number;
  upstreamId: number;
  upstreamKeyId?: number | null;
  type: string;
  severity: string;
  message: string;
  metricValue?: number | null;
}

interface FeishuConfig {
  webhookUrl: string;
  secret?: string;
}

/** 发送告警通知到所有启用的渠道 */
export async function sendNotification(
  incident: IncidentLike,
  upstream: Upstream,
  key: UpstreamKey | null,
  isRecovery = false
): Promise<void> {
  const channels = await prisma.alertChannel.findMany({ where: { enabled: true } });
  if (channels.length === 0) {
    console.log('[告警] 无启用的通知渠道，跳过发送:', incident.message);
    return;
  }
  await Promise.allSettled(
    channels.map((ch) => sendToChannel(ch, incident, upstream, key, isRecovery))
  );
}

async function sendToChannel(
  channel: AlertChannel,
  incident: IncidentLike,
  upstream: Upstream,
  key: UpstreamKey | null,
  isRecovery: boolean
): Promise<void> {
  switch (channel.type) {
    case 'feishu':
      await sendFeishu(channel.config as unknown as FeishuConfig, incident, upstream, key, isRecovery);
      break;
    default:
      console.warn(`[告警] 未知渠道类型: ${channel.type}`);
  }
}

/** 发送飞书交互式卡片 */
async function sendFeishu(
  config: FeishuConfig,
  incident: IncidentLike,
  upstream: Upstream,
  key: UpstreamKey | null,
  isRecovery: boolean
): Promise<void> {
  if (!config?.webhookUrl) {
    console.warn('[飞书] webhookUrl 未配置');
    return;
  }

  const color = isRecovery ? 'green' : severityColor(incident.severity);
  const titlePrefix = isRecovery ? '告警恢复' : '监控告警';
  const groupLabel = key ? key.group : '-';

  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: color,
      title: { tag: 'plain_text', content: `${titlePrefix} · ${upstream.name} / ${groupLabel}` },
    },
    elements: [
      {
        tag: 'div',
        fields: [
          { is_short: true, text: { tag: 'lark_md', content: `**上游**\n${upstream.name}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**分组**\n${groupLabel}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**地址**\n${upstream.baseUrl}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**级别**\n${incident.severity}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**类型**\n${formatType(incident.type)}` } },
        ],
      },
      { tag: 'hr' },
      { tag: 'div', text: { tag: 'lark_md', content: `**详情**\n${incident.message}` } },
      {
        tag: 'note',
        elements: [
          { tag: 'plain_text', content: `时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}` },
        ],
      },
    ],
  };

  const body: Record<string, unknown> = { msg_type: 'interactive', card };

  // 飞书签名校验（配置了 secret 时）
  if (config.secret) {
    const timestamp = Math.floor(Date.now() / 1000);
    body.timestamp = String(timestamp);
    body.sign = genSign(timestamp, config.secret);
  }

  const res = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`飞书 Webhook 发送失败: HTTP ${res.status} ${text.slice(0, 200)}`);
  }

  const result = (await res.json().catch(() => ({}))) as { code?: number; msg?: string };
  if (result.code && result.code !== 0) {
    throw new Error(`飞书返回错误: code=${result.code} msg=${result.msg}`);
  }
}

function genSign(timestamp: number, secret: string): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return createHmac('sha256', stringToSign).digest('base64');
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return 'red';
    case 'WARNING': return 'orange';
    case 'INFO': return 'blue';
    default: return 'grey';
  }
}

function formatType(type: string): string {
  const map: Record<string, string> = {
    BALANCE_LOW: '余额不足',
    LATENCY_HIGH: '延迟过高',
    UNAVAILABLE: '不可用',
    AVAILABILITY_LOW: '可用率低',
    TEST_FAILED: '测速失败',
  };
  return map[type] || type;
}
