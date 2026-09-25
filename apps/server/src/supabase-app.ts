import 'reflect-metadata';
import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  PRODUCTS,
  chatInput,
  idParam,
  memoryInput,
  postInput,
  profileInput,
} from '@yinghuo/contracts';
import type { BootstrapState, Memory, Profile } from '@yinghuo/contracts';
import type { UserRequest } from './auth';
import { MockChatProvider } from './providers';
import { SupabaseGuestAuth, SupabaseSessionGuard } from './supabase-auth';
import { SupabaseDataApi } from './supabase-data-api';

const read = <T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> => {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(parsed.error.issues[0]?.message || '请求参数不正确');
  return parsed.data;
};
const uuid = (value: string) => {
  const parsed = idParam.safeParse(value);
  if (!parsed.success) throw new NotFoundException('资源不存在或不可访问');
  return parsed.data;
};
const eq = (value: string) => 'eq.' + value;
const inList = (values: string[]) => 'in.(' + values.join(',') + ')';

type ProfileRow = {
  id: string;
  creator_user_id: string;
  display_name: string;
  relationship: string | null;
  status: string;
  created_at: string;
};
type PreferenceRow = { profile_id: string; call_me: string | null };
type ConsentRow = { profile_id: string; revoked_at: string | null };
type BootstrapUserRow = {
  account_kind: 'guest' | 'bound' | 'merged';
  free_slot_consumed_at: string | null;
};
type ConversationHeadRow = { id: string; profile_id: string; last_message_at: string | null };
type MemoryRow = {
  id: string;
  profile_id: string;
  owner_user_id: string;
  title: string | null;
  body: string;
  use_for_ai: boolean;
  source_type: string;
  created_at: string;
};
type ConversationRow = { id: string; profile_id: string; user_id: string; epoch: number };
type MessageRow = {
  id: string;
  conversation_id: string;
  client_message_id: string | null;
  generation_id: string | null;
  role: 'user' | 'assistant' | 'system';
  text: string | null;
  created_at: string;
};

@Controller()
export class SupabasePublicController {
  constructor(
    @Inject(SupabaseGuestAuth) private readonly auth: SupabaseGuestAuth,
    @Inject(SupabaseDataApi) private readonly db: SupabaseDataApi,
  ) {}

  @Get('health') health() {
    return {
      status: 'ok',
      mode: 'supabase',
      persistence: 'supabase-postgrest',
      liveServices: false,
    };
  }

  @Get('capabilities') capabilities() {
    return {
      mode: 'supabase',
      database: 'supabase',
      auth: 'guest-session',
      chat: 'mock',
      payment: 'disabled',
      sms: 'not-connected',
      storage: 'not-connected',
      restoration: 'not-connected',
      moderation: 'pending-only',
    };
  }

  @Get('bootstrap') async bootstrap(@Req() req: Request): Promise<BootstrapState> {
    const session = await this.auth.read(req);
    if (!session) return this.emptyBootstrap(null);

    const [users, profiles, conversations] = await Promise.all([
      this.db.select<BootstrapUserRow[]>('app_users', {
        select: 'account_kind,free_slot_consumed_at',
        id: eq(session.userId),
        deleted_at: 'is.null',
        limit: 1,
      }),
      this.db.select<ProfileRow[]>('profiles', {
        select: 'id,creator_user_id,display_name,relationship,status,created_at',
        creator_user_id: eq(session.userId),
        deleted_at: 'is.null',
        order: 'created_at.desc',
        limit: 100,
      }),
      this.db.select<ConversationHeadRow[]>('conversations', {
        select: 'id,profile_id,last_message_at',
        user_id: eq(session.userId),
        order: 'last_message_at.desc.nullslast,created_at.desc',
        limit: 1,
      }),
    ]);
    const validConversation =
      conversations[0] && profiles.some((p) => p.id === conversations[0].profile_id)
        ? conversations[0]
        : undefined;
    const user = users[0];
    return {
      ...this.emptyBootstrap(session.csrfToken),
      accountState: user?.account_kind === 'bound' ? 'bound' : 'guest',
      canCreateFreeProfile: Boolean(user && !user.free_slot_consumed_at),
      profileCount: profiles.length,
      recentProfileId: validConversation?.profile_id || profiles[0]?.id || null,
      recentConversationId: validConversation?.id || null,
    };
  }

  @Get('products') products() {
    return { items: PRODUCTS, mock: true, pricesFinal: false, purchasable: false };
  }

  @Get('auth/session') async session(@Req() req: Request) {
    const session = await this.auth.read(req);
    return session
      ? this.auth.publicSession(session)
      : { userId: null, accountKind: null, familyCode: null, csrfToken: null, mock: false };
  }

  @Post('auth/guest') guest(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.open(req, res);
  }

  private emptyBootstrap(csrfToken: string | null): BootstrapState {
    return {
      appVersion: '0.1.0',
      phase: 'A',
      features: {
        guestSession: true,
        profiles: true,
        textChat: true,
        manualMemories: true,
        memoryCandidates: false,
        phoneRecovery: false,
        photoUpload: false,
        payment: false,
        publicSquare: false,
      },
      products: [],
      terms: { aiDisclosure: 'ai-disclosure-v1' },
      csrfToken,
      paymentCapabilities: [],
      canCreateFreeProfile: false,
      accountState: null,
      boundPhone: null,
      profileCount: 0,
      recentProfileId: null,
      recentConversationId: null,
      pendingTaskCount: 0,
    };
  }

  @Post('auth/logout')
  @UseGuards(SupabaseSessionGuard)
  async logout(@Req() req: UserRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.close(req, res);
    return { ok: true };
  }
}

@Controller()
@UseGuards(SupabaseSessionGuard)
export class SupabaseProfilesController {
  constructor(
    @Inject(SupabaseDataApi) private readonly db: SupabaseDataApi,
    @Inject(MockChatProvider) private readonly chat: MockChatProvider,
  ) {}

  @Get('profiles') async list(@Req() req: UserRequest) {
    const ownerId = req.demoSession.userId;
    const rows = await this.db.select<ProfileRow[]>('profiles', {
      select: 'id,creator_user_id,display_name,relationship,status,created_at',
      creator_user_id: eq(ownerId),
      deleted_at: 'is.null',
      order: 'created_at.desc',
      limit: 100,
    });
    return { items: await this.hydrateProfiles(rows, ownerId) };
  }

  @Post('profiles') async create(@Req() req: UserRequest, @Body() body: unknown) {
    const data = read(profileInput, body);
    const rows = await this.db.rpc<ProfileRow[]>('yinghuo_create_profile', {
      p_user_id: req.demoSession.userId,
      p_display_name: data.name,
      p_call_me: data.callMe,
      p_story: data.story,
      p_ai_consent: data.aiConsent,
    });
    const row = rows?.[0];
    if (!row?.id) throw new Error('Profile creation did not return a profile');
    return this.loadProfile(req.demoSession.userId, row.id);
  }

  @Get('profiles/:id') async profile(@Req() req: UserRequest, @Param('id') id: string) {
    return this.loadProfile(req.demoSession.userId, uuid(id));
  }

  @Patch('profiles/:id') async update(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const profileId = uuid(id);
    const ownerId = req.demoSession.userId;
    await this.requireProfile(ownerId, profileId);
    const data = read(profileInput, body);
    await this.db.patch<ProfileRow[]>(
      'profiles',
      {
        id: eq(profileId),
        creator_user_id: eq(ownerId),
        deleted_at: 'is.null',
      },
      { display_name: data.name, updated_at: new Date().toISOString() },
    );
    await this.db.upsert<PreferenceRow[]>(
      'profile_preferences',
      {
        profile_id: profileId,
        user_id: ownerId,
        call_me: data.callMe || null,
        updated_at: new Date().toISOString(),
      },
      'profile_id,user_id',
    );
    await this.saveProfileStory(ownerId, profileId, data.story);
    return this.loadProfile(ownerId, profileId);
  }

  @Get('profiles/:id/memories') async memories(@Req() req: UserRequest, @Param('id') id: string) {
    const profileId = uuid(id);
    const ownerId = req.demoSession.userId;
    await this.requireProfile(ownerId, profileId);
    const rows = await this.db.select<MemoryRow[]>('memories', {
      select: 'id,profile_id,owner_user_id,title,body,use_for_ai,source_type,created_at',
      profile_id: eq(profileId),
      owner_user_id: eq(ownerId),
      deleted_at: 'is.null',
      order: 'created_at.desc',
      limit: 200,
    });
    return { items: rows.map((row) => this.mapMemory(row)) };
  }

  @Post('profiles/:id/memories') async addMemory(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const profileId = uuid(id);
    const ownerId = req.demoSession.userId;
    await this.requireProfile(ownerId, profileId);
    const data = read(memoryInput, body);
    const rows = await this.db.insert<MemoryRow[]>('memories', {
      profile_id: profileId,
      owner_user_id: ownerId,
      title: data.title,
      body: data.body,
      visibility: 'private',
      use_for_ai: data.useForAi,
      source_type: 'manual_input',
      confirmation_state: 'confirmed',
      active_for_basic: true,
    });
    if (!rows?.[0]?.id) throw new Error('Memory creation did not return a memory');
    return this.mapMemory(rows[0]);
  }

  @Delete('memories/:id') async removeMemory(@Req() req: UserRequest, @Param('id') id: string) {
    const memoryId = uuid(id);
    const rows = await this.db.patch<MemoryRow[]>(
      'memories',
      {
        id: eq(memoryId),
        owner_user_id: eq(req.demoSession.userId),
        deleted_at: 'is.null',
      },
      { deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    );
    if (!rows?.length) throw new NotFoundException('记忆不存在或不可访问');
    return { ok: true };
  }

  @Get('profiles/:id/messages') async messages(@Req() req: UserRequest, @Param('id') id: string) {
    const profileId = uuid(id);
    const ownerId = req.demoSession.userId;
    await this.requireProfile(ownerId, profileId);
    const conversation = await this.findConversation(ownerId, profileId);
    if (!conversation) return { items: [] };
    const rows = await this.db.select<MessageRow[]>('messages', {
      select: 'id,conversation_id,client_message_id,generation_id,role,text,created_at',
      conversation_id: eq(conversation.id),
      order: 'created_at.asc,id.asc',
      limit: 500,
    });
    return { items: rows.map((row) => this.mapMessage(row, ownerId, profileId)) };
  }

  @Post('profiles/:id/messages') async send(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const profileId = uuid(id);
    const ownerId = req.demoSession.userId;
    const profile = await this.loadProfile(ownerId, profileId);
    const data = read(chatInput, body);
    const conversation = await this.ensureConversation(ownerId, profileId);

    if (data.clientMessageId) {
      const previous = await this.db.select<MessageRow[]>('messages', {
        select: 'id,conversation_id,client_message_id,generation_id,role,text,created_at',
        conversation_id: eq(conversation.id),
        client_message_id: eq(data.clientMessageId),
        limit: 1,
      });
      if (previous?.[0]?.generation_id) {
        const pair = await this.db.select<MessageRow[]>('messages', {
          select: 'id,conversation_id,client_message_id,generation_id,role,text,created_at',
          conversation_id: eq(conversation.id),
          generation_id: eq(previous[0].generation_id),
          order: 'created_at.asc,id.asc',
        });
        if (pair.length)
          return { items: pair.map((row) => this.mapMessage(row, ownerId, profileId)) };
      }
    }

    const memories = await this.db.select<MemoryRow[]>('memories', {
      select: 'id,profile_id,owner_user_id,title,body,use_for_ai,source_type,created_at',
      profile_id: eq(profileId),
      owner_user_id: eq(ownerId),
      use_for_ai: 'eq.true',
      confirmation_state: 'eq.confirmed',
      deleted_at: 'is.null',
      limit: 100,
    });
    const result = await this.chat.reply({
      profile,
      text: data.text,
      memories: memories.map((row) => this.mapMemory(row)),
    });
    const generationId = randomUUID();
    const clientMessageId = data.clientMessageId || randomUUID();
    const createdAt = new Date();
    const rows = await this.db.insert<MessageRow[]>('messages', [
      {
        conversation_id: conversation.id,
        client_message_id: clientMessageId,
        generation_id: generationId,
        role: 'user',
        text: data.text,
        status: 'completed',
        epoch: conversation.epoch,
        created_at: createdAt.toISOString(),
      },
      {
        conversation_id: conversation.id,
        generation_id: generationId,
        role: 'assistant',
        text: result.text,
        status: 'completed',
        epoch: conversation.epoch,
        created_at: new Date(createdAt.getTime() + 1).toISOString(),
      },
    ]);
    await this.db.patch(
      'conversations',
      {
        id: eq(conversation.id),
        user_id: eq(ownerId),
      },
      { last_message_at: new Date().toISOString() },
    );
    return { items: rows.map((row) => this.mapMessage(row, ownerId, profileId)) };
  }

  private async requireProfile(ownerId: string, profileId: string) {
    const rows = await this.db.select<ProfileRow[]>('profiles', {
      select: 'id,creator_user_id,display_name,relationship,status,created_at',
      id: eq(profileId),
      creator_user_id: eq(ownerId),
      deleted_at: 'is.null',
      limit: 1,
    });
    if (!rows?.[0] || rows[0].status !== 'active')
      throw new NotFoundException('空间不存在或不可访问');
    return rows[0];
  }

  private async loadProfile(ownerId: string, profileId: string): Promise<Profile> {
    const row = await this.requireProfile(ownerId, profileId);
    return (await this.hydrateProfiles([row], ownerId))[0];
  }

  private async hydrateProfiles(rows: ProfileRow[], ownerId: string): Promise<Profile[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const filter = inList(ids);
    const [preferences, stories, consents] = await Promise.all([
      this.db.select<PreferenceRow[]>('profile_preferences', {
        select: 'profile_id,call_me',
        user_id: eq(ownerId),
        profile_id: filter,
      }),
      this.db.select<MemoryRow[]>('memories', {
        select: 'id,profile_id,owner_user_id,title,body,use_for_ai,source_type,created_at',
        owner_user_id: eq(ownerId),
        profile_id: filter,
        source_type: eq('profile_story'),
        deleted_at: 'is.null',
      }),
      this.db.select<ConsentRow[]>('consents', {
        select: 'profile_id,revoked_at',
        user_id: eq(ownerId),
        profile_id: filter,
        purpose: eq('ai_persona_simulation'),
        revoked_at: 'is.null',
      }),
    ]);
    const prefById = new Map(preferences.map((row) => [row.profile_id, row]));
    const storyById = new Map(stories.map((row) => [row.profile_id, row]));
    const consentIds = new Set(consents.map((row) => row.profile_id));
    return rows.map((row) => ({
      id: row.id,
      ownerId,
      name: row.display_name,
      callMe: prefById.get(row.id)?.call_me || '',
      story: storyById.get(row.id)?.body || '',
      aiConsent: consentIds.has(row.id),
      createdAt: row.created_at,
    }));
  }

  private async saveProfileStory(ownerId: string, profileId: string, story: string) {
    const current = await this.db.select<MemoryRow[]>('memories', {
      select: 'id,profile_id,owner_user_id,title,body,use_for_ai,source_type,created_at',
      profile_id: eq(profileId),
      owner_user_id: eq(ownerId),
      source_type: eq('profile_story'),
      deleted_at: 'is.null',
      limit: 1,
    });
    const now = new Date().toISOString();
    if (!story.trim()) {
      if (current[0])
        await this.db.patch(
          'memories',
          { id: eq(current[0].id), owner_user_id: eq(ownerId) },
          { deleted_at: now, updated_at: now },
        );
      return;
    }
    if (current[0]) {
      await this.db.patch(
        'memories',
        { id: eq(current[0].id), owner_user_id: eq(ownerId) },
        { body: story, updated_at: now },
      );
    } else {
      await this.db.insert('memories', {
        profile_id: profileId,
        owner_user_id: ownerId,
        title: '关于TA',
        body: story,
        visibility: 'private',
        use_for_ai: false,
        source_type: 'profile_story',
        confirmation_state: 'confirmed',
        active_for_basic: true,
      });
    }
  }

  private async findConversation(ownerId: string, profileId: string) {
    const rows = await this.db.select<ConversationRow[]>('conversations', {
      select: 'id,profile_id,user_id,epoch',
      profile_id: eq(profileId),
      user_id: eq(ownerId),
      limit: 1,
    });
    return rows[0];
  }

  private async ensureConversation(ownerId: string, profileId: string) {
    const rows = await this.db.upsert<ConversationRow[]>(
      'conversations',
      {
        profile_id: profileId,
        user_id: ownerId,
        status: 'active',
        epoch: 0,
      },
      'profile_id,user_id',
    );
    if (!rows?.[0]?.id) throw new Error('Conversation creation did not return a conversation');
    return rows[0];
  }

  private mapMemory(row: MemoryRow): Memory {
    return {
      id: row.id,
      profileId: row.profile_id,
      ownerId: row.owner_user_id,
      title: row.title || '一段记忆',
      body: row.body,
      useForAi: row.use_for_ai,
      createdAt: row.created_at,
    };
  }

  private mapMessage(row: MessageRow, ownerId: string, profileId: string) {
    return {
      id: row.id,
      profileId,
      ownerId,
      role: row.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      text: row.text || '',
      createdAt: row.created_at,
      mock: true,
    };
  }
}

@Controller('orders')
@UseGuards(SupabaseSessionGuard)
class SupabaseOrdersUnavailableController {
  @Get() list() {
    return { items: [], purchasable: false };
  }
  @Post() create() {
    throw new ServiceUnavailableException('支付通道尚未完成真实联调，暂不可下单');
  }
  @Post(':id/dev-pay') pay() {
    throw new ServiceUnavailableException('演示支付不会在 Supabase 模式下开放');
  }
  @Post(':id/dev-refund') refund() {
    throw new ServiceUnavailableException('退款通道尚未接入');
  }
}

@Controller('square')
@UseGuards(SupabaseSessionGuard)
class SupabaseSquareUnavailableController {
  @Get() list(@Query('view') _view?: string) {
    return { items: [], available: false };
  }
  @Post() create(@Body() _body: unknown) {
    read(postInput, _body);
    throw new ServiceUnavailableException('广场审核能力尚未接入，内容暂不发布');
  }
}

@Module({
  controllers: [
    SupabasePublicController,
    SupabaseProfilesController,
    SupabaseOrdersUnavailableController,
    SupabaseSquareUnavailableController,
  ],
  providers: [
    SupabaseSessionGuard,
    MockChatProvider,
    {
      provide: SupabaseDataApi,
      useFactory: () =>
        new SupabaseDataApi(process.env.SUPABASE_URL || '', process.env.SUPABASE_SECRET_KEY || ''),
    },
    {
      provide: SupabaseGuestAuth,
      inject: [SupabaseDataApi],
      useFactory: (db: SupabaseDataApi) =>
        new SupabaseGuestAuth(
          db,
          process.env.SESSION_SECRET || '',
          !['development', 'test'].includes(process.env.NODE_ENV || ''),
        ),
    },
  ],
})
export class SupabaseApiModule {}
