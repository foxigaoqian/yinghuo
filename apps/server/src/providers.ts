import type { Memory, Profile } from '@yinghuo/contracts';

export interface ChatProvider {
  reply(input: {
    profile: Profile;
    text: string;
    memories: Memory[];
  }): Promise<{ text: string; mock: boolean }>;
}
export interface SmsProvider {
  send(phone: string): Promise<{ mock: boolean }>;
}
export interface PaymentProvider {
  create(orderId: string): Promise<{ mock: boolean; checkoutUrl: string | null }>;
}
export interface PhotoProvider {
  restore(assetId: string): Promise<{ mock: boolean; outputAssetId: string | null }>;
}
export interface ModerationProvider {
  review(text: string): Promise<'pending' | 'approved' | 'rejected'>;
}
export class MockChatProvider implements ChatProvider {
  async reply(input: { profile: Profile; text: string; memories: Memory[] }) {
    const allowed = input.memories.filter((m) => m.useForAi);
    const context = allowed.length
      ? '你保存的「' + allowed[0].title + '」可以作为记忆线索。'
      : '你可以慢慢补充一些愿意用于对话的记忆。';
    return {
      text:
        '【AI 演示回复，并非本人】我听到你说：“' +
        input.text.slice(0, 80) +
        '”。' +
        context +
        '当前还未连接真实模型。',
      mock: true,
    };
  }
}
// No fake SMS, live payment URL, repaired image or automatic public approval.
export const mockProviders = {
  sms: {
    async send(_phone: string) {
      return { mock: true };
    },
  } satisfies SmsProvider,
  payment: {
    async create(_id: string) {
      return { mock: true, checkoutUrl: null };
    },
  } satisfies PaymentProvider,
  photo: {
    async restore(_id: string) {
      return { mock: true, outputAssetId: null };
    },
  } satisfies PhotoProvider,
  moderation: {
    async review(_text: string) {
      return 'pending' as const;
    },
  } satisfies ModerationProvider,
};
