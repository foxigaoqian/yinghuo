import {
  Injectable,
  Inject,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { DemoStore } from './demo-store';
type Session = { userId: string; csrfToken: string; expires: number };
export type UserRequest = Request & { demoSession: Session; requestId: string };
const cookieName = 'yinghuo_demo_session';
@Injectable()
export class DemoAuth {
  private sessions = new Map<string, Session>();
  constructor(@Inject(DemoStore) private store: DemoStore) {}
  open(req: Request, res: Response) {
    // Keep the current isolated identity when logging in again in this browser.
    const existing = this.read(req);
    const token = randomBytes(32).toString('hex');
    const session = {
      userId: existing?.userId || this.store.id(),
      csrfToken: randomBytes(32).toString('hex'),
      expires: Date.now() + 86400000,
    };
    this.sessions.delete(req.cookies?.[cookieName]);
    this.sessions.set(token, session);
    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
      maxAge: 86400000,
      path: '/',
    });
    return { userId: session.userId, csrfToken: session.csrfToken, mock: true };
  }
  read(req: Request): Session | undefined {
    const token = req.cookies?.[cookieName];
    const s = this.sessions.get(token);
    if (s && s.expires > Date.now()) return s;
    if (token) this.sessions.delete(token);
    return undefined;
  }
  close(req: Request, res: Response) {
    this.sessions.delete(req.cookies?.[cookieName]);
    res.clearCookie(cookieName, { path: '/' });
  }
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(DemoAuth) private auth: DemoAuth) {}
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<UserRequest>();
    const session = this.auth.read(req);
    if (!session) throw new UnauthorizedException('请先进入演示账号');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const csrf = req.header('x-csrf-token') || '';
      const expected = session.csrfToken;
      if (
        csrf.length !== expected.length ||
        !timingSafeEqual(Buffer.from(csrf), Buffer.from(expected))
      )
        throw new ForbiddenException('请求校验失败，请刷新后重试');
    }
    req.demoSession = session;
    return true;
  }
}
