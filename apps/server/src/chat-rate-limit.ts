import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { UserRequest } from './auth';

const WINDOW_MS = 60_000; // 统计窗口：1 分钟
const MAX_REQUESTS = 20; // 每个窗口内每个用户最多 20 次聊天请求
const MAX_KEYS = 10_000; // 内存 key 上限，超限时触发一次全量清理

/**
 * AI 聊天入口的简易内存限流守卫。
 *
 * 按用户（取不到会话时按 IP）统计每分钟请求数，超限返回 429 并携带
 * Retry-After 头。用于保护 LiveChatProvider 背后的付费 AI 接口，
 * 防止被刷爆烧钱。
 *
 * 注意：单实例内存实现。多实例部署时请替换为 Redis 等共享存储。
 */
@Injectable()
export class ChatRateLimitGuard implements CanActivate {
  private hits = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<UserRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.demoSession?.userId || (req as Request).ip || 'anonymous';
    const now = Date.now();
    const times = (this.hits.get(key) || []).filter((t) => t > now - WINDOW_MS);
    if (times.length >= MAX_REQUESTS) {
      const retryAfter = Math.max(1, Math.ceil((times[0] + WINDOW_MS - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      throw new HttpException('聊天请求过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
    times.push(now);
    this.hits.set(key, times);
    if (this.hits.size > MAX_KEYS) this.sweep(now);
    return true;
  }

  private sweep(now: number) {
    for (const [key, times] of this.hits) {
      const fresh = times.filter((t) => t > now - WINDOW_MS);
      if (fresh.length === 0) this.hits.delete(key);
      else this.hits.set(key, fresh);
    }
  }
}
