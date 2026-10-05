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
    text: z.string().trim().min(1).max(2000),
    clientMessageId: z.string().uuid().optional(),
    aiConsent: z.boolean().optional(),
    memoryIds: z.array(z.string().uuid()).max(5).optional(),
  })
  .strict();
export const postInput = z
  .object({
    title: z.string().trim().min(1).max(60),
    body: z.string().trim().min(1).max(3000),
    visibility: z.enum(['private', 'public']).default('private'),
    publicConsent: z.boolean().default(false),
  })
  .strict()
  .refine((x) => x.visibility !== 'public' || x.publicConsent, {
    message: '公开前需要确认分享授权',
    path: ['publicConsent'],
  });
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
  createdAt: string;
  mock: boolean;
};
export type Post = {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  visibility: 'private' | 'public';
  moderation: 'private' | 'pending' | 'published' | 'rejected';
  moderationReason?: string | null;
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
