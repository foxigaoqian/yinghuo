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
import { api, ApiRequestError, setCsrf, requestKey } from '../services/api';
import {
  mergeLocalAccountData,
  exportLocalDrafts,
  clearLocalAccountData,
} from '../services/local-drafts';
export const useAppStore = defineStore('app', () => {
  const session = ref<SessionInfo>({ userId: null, csrfToken: null, mock: true });
  const bootstrap = ref<BootstrapState | null>(null);
  const profiles = ref<Profile[]>([]);
  const memories = ref<Memory[]>([]);
  const messages = ref<Message[]>([]);
  const orders = ref<Order[]>([]);
  const posts = ref<Post[]>([]);
  const publicPosts = ref<Post[]>([]);
  const libraryMemories = ref<Memory[]>([]);
  const libraryReady = ref(false);
  const products = ref<Product[]>([]);
  const lastUserId = (uni.getStorageSync('yinghuo.lastUserId') as string) || '';
  const currentId = ref(
    lastUserId ? (uni.getStorageSync('yinghuo.current.' + lastUserId) as string) || '' : '',
  );
  const hydrated = ref(false);
  const messagesHydrated = ref(false);
  const messagesProfileId = ref('');
  const postsHydrated = ref(false);
  const current = computed(() => profiles.value.find((p) => p.id === currentId.value));
  const messagesReady = computed(
    () => messagesHydrated.value && messagesProfileId.value === currentId.value,
  );
  const postsReady = computed(() => postsHydrated.value);
  const busy = ref(false);
  const error = ref('');
  const status = ref('');
  const lastRequestId = ref('');
  type AppState = {
    session: SessionInfo;
    bootstrap: BootstrapState;
    products: Product[];
    profiles: Profile[];
    currentProfileId: string | null;
    memories: Memory[];
    messages: Message[];
    orders: Order[];
    posts: Post[];
  };
  let refreshPromise: Promise<void> | null = null;
  let pendingMessage: {
    profileId: string;
    text: string;
    memoryIds: string[];
    clientMessageId: string;
  } | null = null;

  function applyState(state: AppState, includeMessages = false, includePosts = false) {
    const accountChanged = session.value.userId !== state.session.userId;
    const profileChanged = currentId.value !== (state.currentProfileId || '');
    if (accountChanged || profileChanged) {
      messages.value = [];
      messagesHydrated.value = false;
      messagesProfileId.value = '';
      pendingMessage = null;
    }
    if (accountChanged) {
      posts.value = [];
      postsHydrated.value = false;
      libraryMemories.value = [];
      libraryReady.value = false;
    }
    session.value = state.session;
    setCsrf(state.session.csrfToken || state.bootstrap.csrfToken);
    bootstrap.value = state.bootstrap;
    products.value = state.products;
    profiles.value = state.profiles;
    currentId.value = state.currentProfileId || '';
    memories.value = state.memories;
    if (libraryReady.value && state.currentProfileId)
      libraryMemories.value = [
        ...libraryMemories.value.filter((m) => m.profileId !== state.currentProfileId),
        ...state.memories,
      ];
    if (includeMessages) {
      messages.value = state.messages;
      messagesHydrated.value = true;
      messagesProfileId.value = state.currentProfileId || '';
    }
    orders.value = state.orders;
    if (includePosts) {
      posts.value = state.posts;
      postsHydrated.value = true;
    }
    if (state.session.userId && currentId.value)
      uni.setStorageSync('yinghuo.current.' + state.session.userId, currentId.value);
    if (state.session.userId) uni.setStorageSync('yinghuo.lastUserId', state.session.userId);
    hydrated.value = true;
  }

  async function fetchState(includeMessages = false, includePosts = false) {
    const query = new URLSearchParams();
    if (currentId.value) query.set('profileId', currentId.value);
    if (includeMessages) query.set('includeMessages', '1');
    if (includePosts) query.set('includePosts', '1');
    const suffix = query.toString();
    return api<AppState>('/app-state' + (suffix ? '?' + suffix : ''));
  }

  async function refresh(
    createGuest = true,
    force = false,
    includeMessages = false,
    includePosts = false,
  ) {
    const requestedProfileId = currentId.value;
    const hasRequestedMessages =
      !includeMessages || (messagesHydrated.value && messagesProfileId.value === currentId.value);
    const hasRequestedPosts = !includePosts || postsHydrated.value;
    if (!force && hydrated.value && hasRequestedMessages && hasRequestedPosts) return;
    if (refreshPromise) {
      await refreshPromise;
      if (force) currentId.value = requestedProfileId;
      // A concurrent homepage request may not contain chat history or posts.
      // Re-check the requested data instead of treating any refresh as complete.
      return refresh(createGuest, force, includeMessages, includePosts);
    }
    const currentRefresh = (async () => {
      let state = await fetchState(includeMessages, includePosts);
      if (!state.session.userId && createGuest) {
        const nextSession = await api<SessionInfo>('/auth/guest', 'POST', {});
        setCsrf(nextSession.csrfToken);
        state = await fetchState(includeMessages, includePosts);
      }
      applyState(state, includeMessages, includePosts);
    })();
    refreshPromise = currentRefresh;
    try {
      await currentRefresh;
    } finally {
      if (refreshPromise === currentRefresh) refreshPromise = null;
    }
  }
  function select(id: string) {
    currentId.value = id;
    messages.value = [];
    memories.value = [];
    pendingMessage = null;
    messagesHydrated.value = false;
    messagesProfileId.value = '';
    if (session.value.userId) uni.setStorageSync('yinghuo.current.' + session.value.userId, id);
  }
  async function login() {
    const wasHydratedAnonymous = hydrated.value && !session.value.userId;
    const s = await api<SessionInfo>('/auth/guest', 'POST', {});
    session.value = s;
    setCsrf(s.csrfToken);
    if (wasHydratedAnonymous && bootstrap.value) {
      bootstrap.value = {
        ...bootstrap.value,
        csrfToken: s.csrfToken,
        accountState: 'guest',
        canCreateFreeProfile: true,
      };
      uni.setStorageSync('yinghuo.lastUserId', s.userId || '');
      return;
    }
    hydrated.value = false;
    await refresh(true, true);
  }
  async function fetchLibrary() {
    if (libraryReady.value) return;
    const ownerId = session.value.userId;
    const items = await Promise.all(
      profiles.value.map(async (profile) => {
        if (profile.id === currentId.value) return memories.value;
        const result = await api<{ items: Memory[] }>('/profiles/' + profile.id + '/memories');
        return result.items;
      }),
    );
    if (session.value.userId !== ownerId) return;
    libraryMemories.value = items.flat();
    libraryReady.value = true;
  }
  async function logout() {
    await api('/auth/logout', 'POST', {});
    session.value = { userId: null, csrfToken: null, mock: true };
    profiles.value = [];
    memories.value = [];
    messages.value = [];
    posts.value = [];
    libraryMemories.value = [];
    libraryReady.value = false;
    currentId.value = '';
    pendingMessage = null;
    setCsrf(null);
    hydrated.value = false;
    messagesHydrated.value = false;
    postsHydrated.value = false;
    await refresh(false, true);
  }
  async function createRecoveryCode() {
    const bundle = await api<{
      familyCode: string;
      recoveryCode: string;
      recoveryConfigured: boolean;
      recoveryUpdatedAt: string;
    }>('/auth/recovery-code', 'POST', {});
    if (bootstrap.value) {
      bootstrap.value.recoveryConfigured = true;
      bootstrap.value.recoveryUpdatedAt = bundle.recoveryUpdatedAt;
    }
    session.value.familyCode = bundle.familyCode;
    return bundle;
  }
  async function recover(input: {
    familyCode: string;
    recoveryCode: string;
    mergeGuest?: boolean;
  }) {
    const oldUserId = session.value.userId;
    const s = await api<SessionInfo & { merged?: boolean }>('/auth/recover', 'POST', input);
    const conflicts =
      s.merged && oldUserId && s.userId ? mergeLocalAccountData(uni, oldUserId, s.userId) : 0;
    messages.value = [];
    memories.value = [];
    posts.value = [];
    libraryMemories.value = [];
    libraryReady.value = false;
    currentId.value = '';
    messagesHydrated.value = false;
    postsHydrated.value = false;
    pendingMessage = null;
    session.value = s;
    setCsrf(s.csrfToken);
    hydrated.value = false;
    await refresh(false, true);
    if (conflicts) status.value = '已找回空间；同名草稿已保留，可在“导出数据”中查看。';
  }
  async function bindPhone(input: { phone: string }) {
    const result = await api<{
      boundPhone: string;
      phoneVerified: boolean;
      accountState: 'guest';
    }>('/auth/bind-phone', 'POST', input);
    if (bootstrap.value) Object.assign(bootstrap.value, result);
    return result;
  }
  async function clearPhone() {
    const result = await api<{
      boundPhone: null;
      phoneVerified: false;
      accountState: 'guest';
    }>('/auth/bind-phone', 'DELETE', {});
    if (bootstrap.value) Object.assign(bootstrap.value, result);
    return result;
  }
  async function addProfile(input: unknown, edit = false) {
    const p = await api<Profile>(
      '/profiles' + (edit ? '/' + currentId.value : ''),
      edit ? 'PATCH' : 'POST',
      input,
    );
    select(p.id);
    libraryReady.value = false;
    hydrated.value = false;
    await refresh(true, true);
  }
  async function deleteProfile(id: string) {
    await api<{ ok: true }>('/profiles/' + id, 'DELETE', {});
    libraryMemories.value = libraryMemories.value.filter((m) => m.profileId !== id);
    libraryReady.value = false;
    if (session.value.userId) clearLocalAccountData(uni, session.value.userId, id);
    if (currentId.value === id) currentId.value = '';
    hydrated.value = false;
    messagesHydrated.value = false;
    postsHydrated.value = false;
    await refresh(true, true);
  }
  async function addMemory(input: unknown) {
    const memory = await api<Memory>('/profiles/' + currentId.value + '/memories', 'POST', input);
    memories.value = [memory, ...memories.value.filter((item) => item.id !== memory.id)];
    if (libraryReady.value)
      libraryMemories.value = [
        memory,
        ...libraryMemories.value.filter((item) => item.id !== memory.id),
      ];
    return memory;
  }
  async function updateMemory(id: string, input: unknown) {
    const memory = await api<Memory>('/memories/' + id, 'PATCH', input);
    memories.value = memories.value.map((item) => (item.id === id ? memory : item));
    libraryMemories.value = libraryMemories.value.map((item) => (item.id === id ? memory : item));
    return memory;
  }
  async function deleteMemory(id: string) {
    await api<{ ok: true }>('/memories/' + id, 'DELETE', {});
    memories.value = memories.value.filter((item) => item.id !== id);
    libraryMemories.value = libraryMemories.value.filter((item) => item.id !== id);
  }
  async function resetConversation() {
    await api<{ ok: true }>('/profiles/' + currentId.value + '/messages/reset', 'POST', {});
    messages.value = [];
    messagesHydrated.value = true;
    messagesProfileId.value = currentId.value;
    pendingMessage = null;
  }
  async function send(text: string, memoryIds: string[]) {
    const normalizedIds = [...memoryIds];
    const existing =
      pendingMessage &&
      pendingMessage.profileId === currentId.value &&
      pendingMessage.text === text &&
      JSON.stringify(pendingMessage.memoryIds) === JSON.stringify(normalizedIds)
        ? pendingMessage
        : {
            profileId: currentId.value,
            text,
            memoryIds: normalizedIds,
            clientMessageId: requestKey(),
          };
    pendingMessage = existing;
    const response = await api<{ items: Message[] }>(
      '/profiles/' + currentId.value + '/messages',
      'POST',
      {
        text,
        clientMessageId: existing.clientMessageId,
        memoryIds: normalizedIds,
        aiConsent: true,
      },
    );
    const byId = new Map(messages.value.map((item) => [item.id, item]));
    response.items.forEach((item) => byId.set(item.id, item));
    messages.value = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    pendingMessage = null;
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
    const post = await api<Post>('/square', 'POST', input);
    posts.value = [post, ...posts.value.filter((item) => item.id !== post.id)];
  }
  async function fetchPublicPosts() {
    const result = await api<{ items: Post[] }>('/square?view=public');
    publicPosts.value = result.items;
  }
  async function fetchPost(id: string) {
    const post = await api<Post>('/square/' + id);
    const target = post.ownerId === session.value.userId ? posts : publicPosts;
    target.value = [post, ...target.value.filter((item) => item.id !== post.id)];
    return post;
  }
  async function updatePost(id: string, input: unknown) {
    const post = await api<Post>('/square/' + id, 'PATCH', input);
    posts.value = [post, ...posts.value.filter((item) => item.id !== post.id)];
    publicPosts.value = publicPosts.value.filter((item) => item.id !== post.id);
    return post;
  }
  async function deletePost(id: string) {
    await api<{ ok: true }>('/square/' + id, 'DELETE', {});
    posts.value = posts.value.filter((item) => item.id !== id);
    publicPosts.value = publicPosts.value.filter((item) => item.id !== id);
  }
  async function exportAccount() {
    const data = await api<Record<string, unknown>>('/account/export');
    return {
      ...data,
      localDrafts: session.value.userId ? exportLocalDrafts(uni, session.value.userId) : [],
    };
  }
  async function submitFeedback(input: {
    category: 'problem' | 'suggestion' | 'privacy';
    body: string;
    pageUrl?: string;
    appVersion?: string;
    requestId?: string;
  }) {
    await api<{ ok: true }>('/feedback', 'POST', input);
  }
  async function deleteAccount(confirmation: string) {
    await api<{ ok: true }>('/account/delete', 'POST', { confirmation });
    if (session.value.userId) clearLocalAccountData(uni, session.value.userId);
    session.value = { userId: null, csrfToken: null, mock: true };
    setCsrf(null);
    bootstrap.value = null;
    profiles.value = [];
    memories.value = [];
    messages.value = [];
    posts.value = [];
    publicPosts.value = [];
    libraryMemories.value = [];
    libraryReady.value = false;
    hydrated.value = false;
  }
  async function run(action: () => Promise<void>) {
    if (busy.value) return;
    busy.value = true;
    error.value = '';
    status.value = '';
    lastRequestId.value = '';
    try {
      await action();
    } catch (e) {
      error.value = e instanceof Error ? e.message : '暂时无法完成，请重试';
      if (e instanceof ApiRequestError) lastRequestId.value = e.requestId;
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
    publicPosts,
    libraryMemories,
    libraryReady,
    messagesReady,
    postsReady,
    products,
    currentId,
    hydrated,
    current,
    busy,
    error,
    status,
    lastRequestId,
    refresh,
    fetchLibrary,
    select,
    login,
    logout,
    createRecoveryCode,
    recover,
    bindPhone,
    clearPhone,
    addProfile,
    deleteProfile,
    addMemory,
    updateMemory,
    deleteMemory,
    resetConversation,
    send,
    buy,
    publish,
    fetchPublicPosts,
    fetchPost,
    updatePost,
    deletePost,
    exportAccount,
    submitFeedback,
    deleteAccount,
    run,
  };
});
