/**
 * NEW_API 上游适配器（完整实现）
 *
 * 参考 new-api 项目（https://github.com/QuantumNous/new-api）的接口。
 * new-api 有两套独立的认证体系：
 *
 * 1. 系统访问令牌（accessToken + userId）—— 用于查余额
 *    - GET /api/user/self
 *    - 头：Authorization: Bearer {accessToken} + New-Api-User: {userId}
 *    - 金额 = data.quota / 500000（QuotaPerUnit 常量）
 *    - accessToken 永久有效（非 JWT，无过期），存 users.access_token 字段
 *
 * 2. API Key（sk-xxx）—— 用于测速/延迟
 *    - GET /v1/models、POST /v1/chat/completions
 *    - 完全 OpenAI 兼容
 *
 * 因此一个 new-api 上游需要配置两套凭证。
 */
import type {
  AdapterContext,
  BalanceResult,
  LatencyResult,
  ModelTestResult,
  StreamTestResult,
  KeyMetadataResult,
  UpstreamAdapter,
} from './base';
import { buildBaseUrl, fetchWithTimeout } from './base';

// new-api quota 换算单位（1 美元 = 500000 quota）
const QUOTA_PER_UNIT = 500000;

export class NewApiAdapter implements UpstreamAdapter {
  readonly type = 'NEW_API' as const;

  /**
   * 余额查询：GET /api/user/self
   * 需要系统访问令牌 accessToken + userId（防 IDOR 越权校验）
   */
  async queryBalance(ctx: AdapterContext): Promise<BalanceResult> {
    if (!ctx.accessToken || !ctx.userId) {
      return { ok: false, errorMessage: '未配置 accessToken 或 userId（new-api 查余额需要系统访问令牌）' };
    }

    const url = `${buildBaseUrl(ctx.baseUrl)}/api/user/self`;
    try {
      const res = await fetchWithTimeout(
        url,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ctx.accessToken}`,
            'New-Api-User': ctx.userId,
          },
        },
        ctx.timeoutMs
      );
      if (!res.ok) {
        return { ok: false, errorMessage: `HTTP ${res.status}: ${await safeReadText(res)}` };
      }
      const body = await res.json();

      // new-api 响应：{ success: true, data: { quota, used_quota, group, ... } }
      if (!body.success || !body.data) {
        return { ok: false, errorMessage: body.message || '查询失败', mode: 'new_api' };
      }

      const data = body.data;
      const quota = typeof data.quota === 'number' ? data.quota : undefined;
      const usedQuota = typeof data.used_quota === 'number' ? data.used_quota : undefined;

      if (quota === undefined) {
        return { ok: false, errorMessage: '响应中未找到 quota 字段', mode: 'new_api' };
      }

      return {
        ok: true,
        balance: quota / QUOTA_PER_UNIT,
        used: usedQuota !== undefined ? usedQuota / QUOTA_PER_UNIT : undefined,
        limit: usedQuota !== undefined ? (quota + usedQuota) / QUOTA_PER_UNIT : undefined,
        mode: data.group || 'new_api',
      };
    } catch (e) {
      return { ok: false, errorMessage: errMsg(e) };
    }
  }

  /**
   * 获取 New API Token 元数据。
   * /api/user/self 返回的是用户分组，不能用来标识当前 Token。
   */
  async fetchKeyMetadata(ctx: AdapterContext): Promise<KeyMetadataResult> {
    if (!ctx.apiKey) {
      return { ok: false, errorMessage: '未配置 API Key' };
    }

    const [usage, token] = await Promise.all([
      this.fetchTokenUsageMetadata(ctx),
      ctx.accessToken && ctx.userId
        ? this.fetchTokenMetadata(ctx)
        : Promise.resolve<PartialMetadata>({ errorMessage: '未配置 accessToken 或 userId，无法获取分组' }),
    ]);

    const keyName = token.keyName || usage.keyName;
    const groupName = token.groupName;
    let groupDescription: string | undefined;
    let groupRateMultiplier: number | undefined;
    let groupError: string | undefined;

    if (groupName && ctx.accessToken && ctx.userId) {
      const group = await this.fetchGroupMetadata(ctx, groupName);
      groupDescription = group.groupDescription;
      groupRateMultiplier = group.groupRateMultiplier;
      groupError = group.errorMessage;
    }

    const errors = [usage.errorMessage, token.errorMessage, groupError].filter(Boolean);
    const hasMetadata = Boolean(keyName || groupName || groupDescription || groupRateMultiplier !== undefined);

    return {
      ok: hasMetadata,
      keyName,
      groupName,
      groupDescription,
      groupRateMultiplier,
      remoteKeyId: token.remoteKeyId,
      errorMessage: errors.length > 0 ? errors.join('; ') : undefined,
    };
  }

  private async fetchTokenUsageMetadata(ctx: AdapterContext): Promise<PartialMetadata> {
    const url = `${buildBaseUrl(ctx.baseUrl)}/api/usage/token/`;
    try {
      const res = await fetchWithTimeout(
        url,
        { headers: this.bearerHeaders(ctx.apiKey) },
        ctx.timeoutMs
      );
      if (!res.ok) return { errorMessage: `秘钥信息接口 HTTP ${res.status}` };
      const body = asRecord(await readJson(res));
      const data = asRecord(body?.data);
      if (body?.code !== true || !data) {
        return { errorMessage: asNonEmptyString(body?.message) || '秘钥信息响应无效' };
      }
      return {
        keyName: asNonEmptyString(data.name),
      };
    } catch (e) {
      return { errorMessage: errMsg(e) };
    }
  }

  private async fetchTokenMetadata(ctx: AdapterContext): Promise<PartialMetadata> {
    const url = `${buildBaseUrl(ctx.baseUrl)}/api/token/search?token=${encodeURIComponent(ctx.apiKey)}&p=1&size=1`;
    try {
      const res = await fetchWithTimeout(
        url,
        {
          headers: {
            Authorization: `Bearer ${ctx.accessToken}`,
            'New-Api-User': ctx.userId || '',
            Accept: 'application/json',
          },
        },
        ctx.timeoutMs
      );
      if (!res.ok) return { errorMessage: `Token 分组接口 HTTP ${res.status}` };
      const body = asRecord(await readJson(res));
      if (body?.success !== true) {
        return { errorMessage: asNonEmptyString(body?.message) || 'Token 分组响应无效' };
      }
      const data = body.data;
      const dataRecord = asRecord(data);
      const items = Array.isArray(dataRecord?.items)
        ? dataRecord.items
        : Array.isArray(data)
          ? data
          : [];
      const item = asRecord(items[0]);
      if (!item) return { errorMessage: '未找到对应 Token' };
      return {
        keyName: asNonEmptyString(item.name),
        groupName: asNonEmptyString(item.group),
        remoteKeyId: item.id != null ? String(item.id) : undefined,
      };
    } catch (e) {
      return { errorMessage: errMsg(e) };
    }
  }

  private async fetchGroupMetadata(ctx: AdapterContext, groupName: string): Promise<PartialMetadata> {
    const url = `${buildBaseUrl(ctx.baseUrl)}/api/user/self/groups`;
    try {
      const res = await fetchWithTimeout(
        url,
        {
          headers: {
            Authorization: `Bearer ${ctx.accessToken}`,
            'New-Api-User': ctx.userId || '',
            Accept: 'application/json',
          },
        },
        ctx.timeoutMs
      );
      if (!res.ok) return { errorMessage: `分组配置接口 HTTP ${res.status}` };
      const body = asRecord(await readJson(res));
      if (body?.success !== true) {
        return { errorMessage: asNonEmptyString(body?.message) || '分组配置响应无效' };
      }
      const group = asRecord(asRecord(body.data)?.[groupName]);
      if (!group) return { errorMessage: `未找到分组「${groupName}」的配置` };
      const ratio = asFiniteNumber(group.ratio);
      return {
        groupDescription: asNonEmptyString(group.desc),
        groupRateMultiplier: ratio,
        errorMessage: ratio === undefined && group.ratio != null ? '分组倍率为自动模式' : undefined,
      };
    } catch (e) {
      return { errorMessage: errMsg(e) };
    }
  }

  /** 延迟测试：GET /v1/models（用 API Key） */
  async testLatency(ctx: AdapterContext): Promise<LatencyResult> {
    if (!ctx.apiKey) {
      return { ok: false, errorMessage: '未配置 API Key（测速需要 sk-xxx）' };
    }
    const url = `${buildBaseUrl(ctx.baseUrl)}/v1/models`;
    const start = Date.now();
    try {
      const res = await fetchWithTimeout(
        url,
        { headers: this.bearerHeaders(ctx.apiKey) },
        ctx.timeoutMs
      );
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return { ok: false, errorMessage: `HTTP ${res.status}` };
      }
      const data = await res.json();
      const modelCount = Array.isArray(data.data) ? data.data.length : undefined;
      return { ok: true, latencyMs, modelCount };
    } catch (e) {
      return { ok: false, errorMessage: errMsg(e) };
    }
  }

  /** 拉取可用模型列表：GET /v1/models（用 API Key） */
  async listModels(ctx: AdapterContext): Promise<{ ok: boolean; models?: string[]; errorMessage?: string }> {
    if (!ctx.apiKey) {
      return { ok: false, errorMessage: '未配置 API Key' };
    }
    const url = `${buildBaseUrl(ctx.baseUrl)}/v1/models`;
    try {
      const res = await fetchWithTimeout(
        url,
        { headers: this.bearerHeaders(ctx.apiKey) },
        ctx.timeoutMs
      );
      if (!res.ok) {
        return { ok: false, errorMessage: `HTTP ${res.status}` };
      }
      const data = await res.json();
      const models = Array.isArray(data.data)
        ? data.data.map((m: { id?: string; name?: string }) => m.id || m.name).filter(Boolean)
        : [];
      return { ok: true, models };
    } catch (e) {
      return { ok: false, errorMessage: errMsg(e) };
    }
  }

  /** 模型实测：POST /v1/chat/completions（用 API Key，OpenAI 兼容协议） */
  async testModel(ctx: AdapterContext, model: string): Promise<ModelTestResult> {
    if (!ctx.apiKey) {
      return { ok: false, errorMessage: '未配置 API Key' };
    }
    const url = `${buildBaseUrl(ctx.baseUrl)}/v1/chat/completions`;
    const start = Date.now();
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: this.bearerHeaders(ctx.apiKey),
          body: JSON.stringify({
            model: model || ctx.testModel,
            messages: [{ role: 'user', content: 'Say "ok" in one word.' }],
            max_tokens: 5,
            stream: false,
          }),
        },
        ctx.timeoutMs
      );
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return { ok: false, errorMessage: `HTTP ${res.status}: ${await safeReadText(res)}` };
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      return { ok: true, latencyMs, content: String(content).slice(0, 50) };
    } catch (e) {
      return { ok: false, errorMessage: errMsg(e) };
    }
  }

  /** 流式测速：POST /v1/chat/completions（stream=true，OpenAI 兼容 SSE） */
  async testStream(ctx: AdapterContext, model: string): Promise<StreamTestResult> {
    if (!ctx.apiKey) {
      return { ok: false, errorMessage: '未配置 API Key' };
    }
    const url = `${buildBaseUrl(ctx.baseUrl)}/v1/chat/completions`;
    const start = Date.now();
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: this.bearerHeaders(ctx.apiKey),
          body: JSON.stringify({
            model: model || ctx.testModel,
            messages: [{ role: 'user', content: 'Count from 1 to 20, one number per line.' }],
            max_tokens: 100,
            stream: true,
          }),
        },
        ctx.timeoutMs
      );
      if (!res.ok) {
        return { ok: false, errorMessage: `HTTP ${res.status}: ${await safeReadText(res)}` };
      }
      if (!res.body) {
        return { ok: false, errorMessage: '响应无 body 流' };
      }

      let tokenCount = 0;
      let firstTokenTime: number | null = null;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const content = json.choices?.[0]?.delta?.content ?? '';
            if (content) {
              if (firstTokenTime === null) firstTokenTime = Date.now() - start;
              tokenCount += estimateTokens(content);
            }
            if (json.usage?.completion_tokens) tokenCount = json.usage.completion_tokens;
          } catch {
            /* 单行解析失败忽略 */
          }
        }
      }

      const totalMs = Date.now() - start;
      if (tokenCount === 0) {
        return { ok: false, errorMessage: '流式响应未产生任何 token', totalMs };
      }
      const tps = tokenCount / (totalMs / 1000);
      return {
        ok: true,
        firstTokenLatMs: firstTokenTime ?? undefined,
        totalMs,
        tokenCount,
        tps: Math.round(tps * 10) / 10,
      };
    } catch (e) {
      return { ok: false, errorMessage: errMsg(e) };
    }
  }

  // ============ 私有辅助 ============

  private bearerHeaders(apiKey: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }
}

interface PartialMetadata {
  keyName?: string;
  groupName?: string;
  groupDescription?: string;
  groupRateMultiplier?: number;
  remoteKeyId?: string;
  errorMessage?: string;
}

// ============ 模块级辅助函数 ============

function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const other = text.length - cjk;
  return cjk + Math.ceil(other / 4);
}

function errMsg(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'AbortError') return '请求超时';
    return e.message;
  }
  return String(e);
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '';
  }
}
