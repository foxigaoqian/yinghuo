import 'reflect-metadata';
import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Req,
  Res,
  Headers,
  UseGuards,
  Inject,
  Module,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  profileInput,
  memoryInput,
  chatInput,
  postInput,
  orderInput,
  PRODUCTS,
  idParam,
} from '@yinghuo/contracts';
import { DemoStore } from './demo-store';
import { DemoAuth, SessionGuard, type UserRequest } from './auth';
import { MockChatProvider } from './providers';
const read = <T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> => {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(parsed.error.issues[0]?.message || '请求参数不正确');
  return parsed.data;
};
const uuid = (id: string) => read(idParam, id);
const idem = (key?: string) => {
  if (!key || !/^[a-zA-Z0-9_-]{8,128}$/.test(key))
    throw new BadRequestException('需要 8–128 位 Idempotency-Key');
  return key;
};
@Controller()
export class PublicController {
  constructor(@Inject(DemoAuth) private auth: DemoAuth) {}
  @Get('health') health() {
    return { status: 'ok', mode: 'demo', persistence: 'local-json', liveServices: false };
  }
  @Get('capabilities') capabilities() {
    return {
      mode: 'demo',
      chat: 'mock',
      payment: 'mock',
      sms: 'not-connected',
      storage: 'not-connected',
      restoration: 'not-connected',
      moderation: 'pending-only',
    };
  }
  @Get('products') products() {
    return { items: PRODUCTS, mock: true, pricesFinal: false };
  }
  @Get('auth/session') session(@Req() req: Request) {
    const s = this.auth.read(req);
    return { userId: s?.userId || null, csrfToken: s?.csrfToken || null, mock: true };
  }
  @Post('dev/session') login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.open(req, res);
  }
  @Post('auth/logout')
  @UseGuards(SessionGuard)
  logout(@Req() req: UserRequest, @Res({ passthrough: true }) res: Response) {
    this.auth.close(req, res);
    return { ok: true };
  }
}
@Controller()
@UseGuards(SessionGuard)
export class ProfilesController {
  constructor(
    @Inject(DemoStore) private db: DemoStore,
    @Inject(MockChatProvider) private chat: MockChatProvider,
  ) {}
  @Get('profiles') list(@Req() req: UserRequest) {
    return { items: this.db.state.profiles.filter((p) => p.ownerId === req.demoSession.userId) };
  }
  @Post('profiles') create(@Req() req: UserRequest, @Body() body: unknown) {
    const data = read(profileInput, body);
    const p = {
      id: this.db.id(),
      ownerId: req.demoSession.userId,
      ...data,
      createdAt: this.db.now(),
    };
    this.db.state.profiles.push(p);
    this.db.save();
    return p;
  }
  @Get('profiles/:id') profile(@Req() req: UserRequest, @Param('id') id: string) {
    return this.db.profile(req.demoSession.userId, uuid(id));
  }
  @Patch('profiles/:id') update(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const p = this.db.profile(req.demoSession.userId, uuid(id));
    Object.assign(p, read(profileInput, body));
    this.db.save();
    return p;
  }
  @Get('profiles/:id/memories') memories(@Req() req: UserRequest, @Param('id') id: string) {
    this.db.profile(req.demoSession.userId, uuid(id));
    return {
      items: this.db.state.memories.filter(
        (m) => m.profileId === id && m.ownerId === req.demoSession.userId,
      ),
    };
  }
  @Post('profiles/:id/memories') addMemory(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.db.profile(req.demoSession.userId, uuid(id));
    const data = read(memoryInput, body);
    const m = {
      id: this.db.id(),
      profileId: id,
      ownerId: req.demoSession.userId,
      ...data,
      createdAt: this.db.now(),
    };
    this.db.state.memories.unshift(m);
    this.db.save();
    return m;
  }
  @Delete('memories/:id') removeMemory(@Req() req: UserRequest, @Param('id') id: string) {
    uuid(id);
    const index = this.db.state.memories.findIndex(
      (m) => m.id === id && m.ownerId === req.demoSession.userId,
    );
    if (index < 0) throw new NotFoundException('记忆不存在或不可访问');
    this.db.state.memories.splice(index, 1);
    this.db.save();
    return { ok: true };
  }
  @Get('profiles/:id/messages') messages(@Req() req: UserRequest, @Param('id') id: string) {
    this.db.profile(req.demoSession.userId, uuid(id));
    return {
      items: this.db.state.messages.filter(
        (m) => m.profileId === id && m.ownerId === req.demoSession.userId,
      ),
    };
  }
  @Post('profiles/:id/messages') async send(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const p = this.db.profile(req.demoSession.userId, uuid(id));
    const data = read(chatInput, body);
    const result = await this.chat.reply({
      profile: p,
      text: data.text,
      memories: this.db.state.memories.filter((m) => m.profileId === id && m.ownerId === p.ownerId),
    });
    const base = { profileId: id, ownerId: p.ownerId, createdAt: this.db.now(), mock: true };
    const user = { ...base, id: this.db.id(), role: 'user' as const, text: data.text };
    const assistant = { ...base, id: this.db.id(), role: 'assistant' as const, text: result.text };
    this.db.state.messages.push(user, assistant);
    this.db.save();
    return { items: [user, assistant] };
  }
}
@Controller('orders')
@UseGuards(SessionGuard)
export class OrdersController {
  constructor(@Inject(DemoStore) private db: DemoStore) {}
  @Get() list(@Req() req: UserRequest) {
    return { items: this.db.state.orders.filter((o) => o.ownerId === req.demoSession.userId) };
  }
  @Post() create(
    @Req() req: UserRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    const input = read(orderInput, body);
    const k = idem(key);
    const owner = req.demoSession.userId;
    this.db.profile(owner, input.profileId);
    const fingerprint = JSON.stringify(input);
    const replay = this.db.replay(owner, 'order', k, fingerprint);
    if (replay) return this.db.order(owner, replay);
    const product = PRODUCTS.find((x) => x.id === input.productId)!;
    const order = {
      id: this.db.id(),
      ownerId: owner,
      ...input,
      priceFen: product.priceFen,
      status: 'pending_payment' as const,
      mock: true as const,
      createdAt: this.db.now(),
    };
    this.db.state.orders.unshift(order);
    this.db.remember(owner, 'order', k, fingerprint, order.id);
    this.db.save();
    return order;
  }
  @Post(':id/dev-pay') pay(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    read(z.object({ confirmMock: z.literal(true) }).strict(), body);
    const o = this.db.order(req.demoSession.userId, uuid(id));
    if (o.status === 'refunded') throw new ConflictException('已退款的订单不能再支付');
    o.status = 'paid';
    this.db.save();
    return o;
  }
  @Post(':id/dev-refund') refund(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    read(z.object({ confirmMock: z.literal(true) }).strict(), body);
    const o = this.db.order(req.demoSession.userId, uuid(id));
    if (o.status === 'pending_payment') throw new ConflictException('尚未付款，不能退款');
    o.status = 'refunded';
    this.db.save();
    return o;
  }
}
@Controller('square')
@UseGuards(SessionGuard)
export class SquareController {
  constructor(@Inject(DemoStore) private db: DemoStore) {}
  @Get() list(@Req() req: UserRequest, @Query('view') view?: string) {
    // No public user-generated feed until a real moderation integration is available.
    return {
      items:
        view === 'mine'
          ? this.db.state.posts.filter((p) => p.ownerId === req.demoSession.userId)
          : [],
      mock: true,
    };
  }
  @Post() create(@Req() req: UserRequest, @Body() body: unknown) {
    const data = read(postInput, body);
    const p = {
      id: this.db.id(),
      ownerId: req.demoSession.userId,
      title: data.title,
      body: data.body,
      visibility: data.visibility,
      moderation: data.visibility === 'public' ? ('pending' as const) : ('private' as const),
      createdAt: this.db.now(),
    };
    this.db.state.posts.unshift(p);
    this.db.save();
    return p;
  }
}
@Controller('dev/admin')
export class AdminController {
  constructor(@Inject(DemoStore) private db: DemoStore) {}
  @Get('overview') overview(@Headers('authorization') authorization?: string) {
    const token = process.env.DEV_ADMIN_TOKEN;
    if (!token || token.length < 24 || authorization !== 'Bearer ' + token)
      throw new ForbiddenException('请配置至少24位开发管理令牌；此接口不是正式后台认证');
    return {
      mock: true,
      profiles: this.db.state.profiles.length,
      memories: this.db.state.memories.length,
      orders: this.db.state.orders.length,
      pendingModeration: this.db.state.posts.filter((p) => p.moderation === 'pending').length,
      integrations: {
        sms: '待接入',
        ai: '模拟回复',
        payment: '模拟订单',
        storage: '待接入',
        photo: '待接入',
      },
    };
  }
}
@Module({
  controllers: [
    PublicController,
    ProfilesController,
    OrdersController,
    SquareController,
    AdminController,
  ],
  providers: [DemoStore, DemoAuth, SessionGuard, MockChatProvider],
})
export class AppModule {}
