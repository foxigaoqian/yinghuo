import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { UserRequest } from './auth';
import { SupabaseDataApi } from './supabase-data-api';

const cookieName = 'yinghuo_session';
const sessionDays = 30;
type GuestSessionRow = {
  user_id: string;
  account_kind: 'guest' | 'bound' | 'merged';
  family_code: string | null;
  expires_at: string;
};

export type GuestSession = {
  userId: string;
  accountKind: GuestSessionRow['account_kind'];
  familyCode: string | null;
  csrfToken: string;
  expires: number;
  token: string;
};

export class SupabaseGuestAuth {
  constructor(
    @Inject(SupabaseDataApi) private readonly db: SupabaseDataApi,
    private readonly sessionSecret: string,
    private readonly secureCookie: boolean,
  ) {
    if (sessionSecret.length < 32)
      throw new Error('SESSION_SECRET must contain at least 32 characters');
  }

  async open(req: Request, res: Response) {
    const existing = await this.read(req);
    if (existing) return this.toPublic(existing);

    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + sessionDays * 86400000);
    const rows = await this.db.rpc<Array<{ user_id: string; family_code: string }>>(
      'yinghuo_create_guest_session',
      {
        p_refresh_hash: '\\x' + this.hash(token),
        p_device_label: this.deviceLabel(req),
        p_expires_at: expires.toISOString(),
      },
    );
    const created = rows?.[0];
    if (!created?.user_id) throw new Error('Guest session creation did not return a user');
    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.secureCookie,
      maxAge: sessionDays * 86400000,
      path: '/',
    });
    return {
      userId: created.user_id,
      accountKind: 'guest' as const,
      familyCode: created.family_code,
      csrfToken: this.csrf(token),
      mock: false,
    };
  }

  async read(req: Request): Promise<GuestSession | undefined> {
    const token = req.cookies?.[cookieName];
    if (typeof token !== 'string' || token.length < 32 || token.length > 100) return undefined;
    const rows = await this.db.rpc<GuestSessionRow[]>('yinghuo_get_guest_session', {
      p_refresh_hash: '\\x' + this.hash(token),
    });
    const row = rows?.[0];
    if (!row?.user_id || !row.expires_at) return undefined;
    const expires = Date.parse(row.expires_at);
    if (!Number.isFinite(expires) || expires <= Date.now()) return undefined;
    return {
      userId: row.user_id,
      accountKind: row.account_kind,
      familyCode: row.family_code,
      csrfToken: this.csrf(token),
      expires,
      token,
    };
  }

  async close(req: Request, res: Response) {
    const token = req.cookies?.[cookieName];
    if (typeof token === 'string' && token.length >= 32 && token.length <= 100) {
      await this.db.rpc<boolean>('yinghuo_revoke_guest_session', {
        p_refresh_hash: '\\x' + this.hash(token),
      });
    }
    res.clearCookie(cookieName, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: this.secureCookie,
    });
  }

  publicSession(session: GuestSession) {
    return this.toPublic(session);
  }

  verifyCsrf(session: GuestSession, candidate: string) {
    const expected = Buffer.from(session.csrfToken);
    const actual = Buffer.from(candidate);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private toPublic(session: GuestSession) {
    return {
      userId: session.userId,
      accountKind: session.accountKind,
      familyCode: session.familyCode,
      csrfToken: session.csrfToken,
      mock: false,
    };
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private csrf(token: string) {
    return createHmac('sha256', this.sessionSecret).update(token).digest('hex');
  }

  private deviceLabel(req: Request) {
    const ua = req.header('user-agent') || 'H5';
    return ua.replace(/[\r\n\x00-\x1f]/g, ' ').slice(0, 120);
  }
}

@Injectable()
export class SupabaseSessionGuard implements CanActivate {
  constructor(@Inject(SupabaseGuestAuth) private readonly auth: SupabaseGuestAuth) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<UserRequest>();
    const session = await this.auth.read(req);
    if (!session) throw new UnauthorizedException('会话已失效，请重新进入');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const csrf = req.header('x-csrf-token') || '';
      if (!this.auth.verifyCsrf(session, csrf))
        throw new ForbiddenException('请求校验失败，请刷新后重试');
    }
    req.demoSession = {
      userId: session.userId,
      csrfToken: session.csrfToken,
      expires: session.expires,
    };
    return true;
  }
}
