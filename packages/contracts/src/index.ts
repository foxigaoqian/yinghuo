import { z } from 'zod';

const short = z.string().trim().min(1).max(80);
export const profileInput = z
  .object({
    name: short,
    relationship: z.string().trim().max(40).default(''),
    nickname: z.string().trim().max(40).default(''),
    callMe: z.string().trim().max(40).default(''),
    story: z.string().trim().max(1000).default(''),
    aiConsent: z.boolean().default(false),
    removeAvatar: z.boolean().default(false),
    avatarDataUrl: z
      .string()
      .max(90_000)
      .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
      .optional(),
  })
  .strict();
export const memoryInput = z
  .object({
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(5000),
    useForAi: z.boolean().default(false),
  })
  .strict();
export const chatInput = z
  .object({
    text: z.string().trim().max(2000).default(''),
    imageDataUrl: z
      .string()
      .max(65_000)
      .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
      .optional(),
    clientMessageId: z.string().uuid().optional(),
    aiConsent: z.boolean().optional(),
    memoryIds: z.array(z.string().uuid()).max(5).optional(),
  })
  .strict()
  .refine((input) => Boolean(input.text || input.imageDataUrl), {
    message: '请输入消息或选择照片',
    path: ['text'],
  });
export const postInput = z
  .object({
    title: z.string().trim().max(60).default(''),
    body: z.string().trim().max(3000).default(''),
    profileId: z.string().uuid().nullable().optional(),
    media: z
      .array(
        z
          .string()
          .max(160_000)
          .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
      )
      .max(9)
      .default([]),
    visibility: z.enum(['private', 'public']).default('private'),
    publicConsent: z.boolean().default(false),
  })
  .strict()
  .refine((x) => Boolean(x.body || x.media.length), {
    message: '写下一句话或选择一张照片',
    path: ['body'],
  })
  .refine((x) => x.visibility !== 'public' || x.publicConsent, {
    message: '公开前需要确认分享授权',
    path: ['publicConsent'],
  });
export const storyCommentInput = z
  .object({
    body: z.string().trim().min(1, '请先写下留言').max(300, '留言最多 300 字'),
    parentId: z.string().uuid().nullable().optional(),
  })
  .strict();
export const feedbackInput = z
  .object({
    category: z.enum(['problem', 'suggestion', 'privacy']).default('suggestion'),
    body: z.string().trim().min(2).max(2000),
    pageUrl: z.string().trim().max(500).default(''),
    appVersion: z.string().trim().max(40).default(''),
    requestId: z.string().trim().max(80).default(''),
  })
  .strict();
export const orderInput = z
  .object({
    productId: z.enum(['memory-year', 'photo-restore']),
    profileId: z.string().uuid(),
  })
  .strict();
export const phoneBindInput = z
  .object({
    phone: z
      .string()
      .trim()
      .regex(/^1[3-9]\d{9}$/, '请输入正确的 11 位手机号'),
  })
  .strict();
export const recoveryPasswordInput = z
  .object({
    password: z
      .string()
      .trim()
      .min(8, '找回密码至少 8 位')
      .max(64, '找回密码最多 64 位')
      .regex(/^[^\u0000-\u001f\u007f]+$/, '找回密码不能包含控制字符'),
  })
  .strict();
export const accountAvatarInput = z
  .object({
    removeAvatar: z.boolean().default(false),
    avatarDataUrl: z
      .string()
      .max(90_000)
      .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
      .optional(),
  })
  .strict()
  .refine((input) => input.removeAvatar || Boolean(input.avatarDataUrl), {
    message: '请选择头像或移除当前头像',
  });
export const idParam = z.string().uuid();
export type Profile = {
  id: string;
  ownerId: string;
  name: string;
  relationship: string;
  nickname: string;
  avatarUrl: string | null;
  callMe: string;
  story: string;
  aiConsent: boolean;
  createdAt: string;
};
export type Memory = {
  id: string;
  ownerId: string;
  profileId: string;
  title: string;
  body: string;
  useForAi: boolean;
  createdAt: string;
};
export type Message = {
  id: string;
  ownerId: string;
  profileId: string;
  role: 'user' | 'assistant';
  text: string;
  imageUrl?: string;
  createdAt: string;
  mock: boolean;
};
export type Post = {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  profileId?: string | null;
  profileName?: string;
  profileRelationship?: string;
  profileAvatarUrl?: string | null;
  authorAvatarUrl?: string | null;
  media?: string[];
  commentPreview?: StoryComment[];
  visibility: 'private' | 'public';
  moderation: 'private' | 'pending' | 'published' | 'rejected';
  moderationReason?: string | null;
  authorName?: string;
  isOfficial?: boolean;
  lightCount?: number;
  commentCount?: number;
  viewerHasLit?: boolean;
  createdAt: string;
};
export type StoryComment = {
  id: string;
  storyId: string;
  body: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  isMine: boolean;
  parentId?: string | null;
  replyToName?: string | null;
  createdAt: string;
};
export type Product = {
  id: 'memory-year' | 'photo-restore';
  name: string;
  priceFen: number;
  unit: string;
};
export type Order = {
  id: string;
  ownerId: string;
  profileId: string;
  productId: Product['id'];
  priceFen: number;
  status: 'pending_payment' | 'paid' | 'refunded';
  mock: true;
  createdAt: string;
};
export type SessionInfo = {
  userId: string | null;
  accountKind?: 'guest' | 'bound' | 'merged' | null;
  familyCode?: string | null;
  csrfToken: string | null;
  mock: boolean;
};
export type BootstrapState = {
  appVersion: string;
  phase: 'A' | 'B';
  features: Record<string, boolean>;
  products: unknown[];
  terms: Record<string, string>;
  csrfToken: string | null;
  paymentCapabilities: unknown[];
  canCreateFreeProfile: boolean;
  accountState: 'guest' | 'bound' | null;
  boundPhone: string | null;
  phoneVerified: boolean;
  gender: 'male' | 'female' | null;
  birthYear: number | null;
  userAvatarUrl: string | null;
  profileCount: number;
  recentProfileId: string | null;
  recentConversationId: string | null;
  recoveryConfigured: boolean;
  recoveryUpdatedAt: string | null;
  pendingTaskCount: number;
};
export type ApiError = { error: { code: string; message: string }; requestId: string };
export const PRODUCTS: readonly Product[] = [
  { id: 'memory-year', name: '记忆年费', priceFen: 9900, unit: '365天 · 每位TA' },
  { id: 'photo-restore', name: '老照片修复', priceFen: 290, unit: '张 · 演示原价' },
];
