/**
 * 适配器注册表（工厂模式）
 * 根据上游类型返回对应的适配器实例
 */
import type { UpstreamType } from '@prisma/client';
import type { UpstreamAdapter } from './base';
import { Sub2ApiAdapter } from './sub2api';
import { NewApiAdapter } from './newapi';

// 单例缓存
const adapters: Partial<Record<UpstreamType, UpstreamAdapter>> = {};

export function getAdapter(type: UpstreamType): UpstreamAdapter {
  if (!adapters[type]) {
    switch (type) {
      case 'SUB2API':
        adapters[type] = new Sub2ApiAdapter();
        break;
      case 'NEW_API':
        adapters[type] = new NewApiAdapter();
        break;
      default:
        throw new Error(`不支持的上游类型: ${type}`);
    }
  }
  return adapters[type]!;
}
