import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  BootstrapState,
  SessionInfo,
  Profile,
  Memory,
  Message,
  Order,
  Post,
  Product,
} from '@yinghuo/contracts';
import { api, setCsrf, requestKey } from '../services/api';
export const useAppStore = defineStore('app', () => {
  const session = ref<SessionInfo>({ userId: null, csrfToken: null, mock: true });
  const bootstrap = ref<BootstrapState | null>(null);
  const profiles = ref<Profile[]>([]);
  const memories = ref<Memory[]>([]);
  const messages = ref<Message[]>([]);
  const orders = ref<Order[]>([]);
  const posts = ref<Post[]>([]);
  const products = ref<Product[]>([]);
  const currentId = ref('');
  const current = computed(() => profiles.value.find((p) => p.id === currentId.value));
  const busy = ref(false);
  const error = ref('');
  const status = ref('');
  async function refresh(createGuest = true) {
    const capabilities = await api<{ mode?: string }>('/capabilities');
    let s = await api<SessionInfo>('/auth/session');
    if (!s.userId && createGuest && capabilities.mode === 'supabase') {
      s = await api<SessionInfo>('/auth/guest', 'POST', {});
    }
    session.value = s;
    setCsrf(s.csrfToken);
    bootstrap.value = await api<BootstrapState>('/bootstrap');
    if (bootstrap.value.csrfToken) setCsrf(bootstrap.value.csrfToken);
    products.value = (await api<{ items: Product[] }>('/products')).items;
    if (!s.userId) {
      profiles.value = [];
      memories.value = [];
      messages.value = [];
      orders.value = [];
      posts.value = [];
      return;
    }
    profiles.value = (await api<{ items: Profile[] }>('/profiles')).items;
    const scopedCurrent = uni.getStorageSync('yinghuo.current.' + s.userId) as string;
    const legacyCurrent = uni.getStorageSync('yinghuo.current') as string;
    const preferredCurrent =
      scopedCurrent || (profiles.value.some((p) => p.id === legacyCurrent) ? legacyCurrent : '');
    const restoredId = profiles.value.some((p) => p.id === preferredCurrent)
      ? preferredCurrent
      : bootstrap.value.recentProfileId || profiles.value[0]?.id || '';
    if (restoredId !== currentId.value) select(restoredId);
    const [o, p] = await Promise.all([
      api<{ items: Order[] }>('/orders'),
      api<{ items: Post[] }>('/square?view=mine'),
    ]);
    orders.value = o.items;
    posts.value = p.items;
    if (currentId.value) {
      const [m, c] = await Promise.all([
        api<{ items: Memory[] }>('/profiles/' + currentId.value + '/memories'),
        api<{ items: Message[] }>('/profiles/' + currentId.value + '/messages'),
      ]);
      memories.value = m.items;
      messages.value = c.items;
    } else {
      memories.value = [];
      messages.value = [];
    }
  }
  function select(id: string) {
    currentId.value = id;
    if (session.value.userId) uni.setStorageSync('yinghuo.current.' + session.value.userId, id);
  }
  async function login() {
    const capabilities = await api<{ mode?: string }>('/capabilities');
    const s = await api<SessionInfo>(
      capabilities.mode === 'supabase' ? '/auth/guest' : '/dev/session',
      'POST',
      {},
    );
    session.value = s;
    setCsrf(s.csrfToken);
    await refresh();
  }
  async function logout() {
    await api('/auth/logout', 'POST', {});
    session.value = { userId: null, csrfToken: null, mock: true };
    setCsrf(null);
    await refresh(false);
  }
  async function addProfile(input: unknown, edit = false) {
    const p = await api<Profile>(
      '/profiles' + (edit ? '/' + currentId.value : ''),
      edit ? 'PATCH' : 'POST',
      input,
    );
    select(p.id);
    await refresh();
  }
  async function addMemory(input: unknown) {
    await api('/profiles/' + currentId.value + '/memories', 'POST', input);
    await refresh();
  }
  async function send(text: string, clientMessageId: string = requestKey()) {
    await api('/profiles/' + currentId.value + '/messages', 'POST', {
      text,
      clientMessageId,
    });
    await refresh();
  }
  async function buy(productId: Product['id']) {
    await api(
      '/orders',
      'POST',
      { productId, profileId: currentId.value },
      { 'idempotency-key': requestKey() },
    );
    await refresh();
  }
  async function publish(input: unknown) {
    await api('/square', 'POST', input);
    await refresh();
  }
  async function run(action: () => Promise<void>) {
    if (busy.value) return;
    busy.value = true;
    error.value = '';
    status.value = '';
    try {
      await action();
    } catch (e) {
      error.value = e instanceof Error ? e.message : '暂时无法完成，请重试';
    } finally {
      busy.value = false;
    }
  }
  return {
    session,
    bootstrap,
    profiles,
    memories,
    messages,
    orders,
    posts,
    products,
    currentId,
    current,
    busy,
    error,
    status,
    refresh,
    select,
    login,
    logout,
    addProfile,
    addMemory,
    send,
    buy,
    publish,
    run,
  };
});
