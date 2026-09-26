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
    return {
      text:
        '【AI 演示，并非本人】这句话已保存在演示记录中。目前还不能根据记忆生成回复，你可以先在记忆空间继续记录关于' +
        (input.profile.name || 'TA') +
        '的故事。',
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
