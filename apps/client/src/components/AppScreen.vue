<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useAppStore } from '../stores/app';
import AppShell from './AppShell.vue';
import AppIcon from './AppIcon.vue';
import { memoryTitle } from '../services/experience';
const props = defineProps<{ page: string; title: string; query?: Record<string, string> }>();
const app = useAppStore();
const loading = ref(!app.bootstrap);
const screenReady = ref(false);
const shellTitle = computed(() => {
  if (props.page === 'create') return props.query?.edit === '1' ? '人物资料' : '添加想念的人';
  if (props.page === 'login' && props.query?.mode === 'recover') return '找回我的萤火';
  if (props.page === 'memories') return '我的记忆';
  if (props.page === 'compose') return props.query?.edit === '1' ? '编辑发布' : '发布纪念';
  if (props.page === 'shares') return '我的发布';
  if (props.page === 'chat' && props.query?.profileId && app.current) return app.current.name;
  return props.title;
});
const hostedPreview = computed(() => Boolean(app.bootstrap?.features?.hostedPreview));
const form = reactive({
  name: '',
  relationship: '',
  nickname: '',
  avatarDataUrl: '',
  accountAvatarDataUrl: '',
  communityName: '',
  removeAvatar: false,
  callMe: '',
  story: '',
  aiConsent: false,
  title: '',
  body: '',
  public: false,
  publicConsent: false,
  recoveryIdentifier: '',
  recoveryPassword: '',
  recoveryPasswordConfirm: '',
  phone: '',
  gender: null as 'male' | 'female' | null,
  birthYear: '',
  feedbackCategory: 'suggestion' as 'problem' | 'suggestion' | 'privacy',
  feedbackBody: '',
  deleteConfirmation: '',
});
const detailsOpen = ref(false);
const customRelationship = ref(false);
const activeChatPanel = ref<'none' | 'tools' | 'emoji' | 'memories'>('none');
const chatInputMode = ref<'text' | 'voice'>('text');
const chatPhotoDraft = ref('');
const chatPhotoProcessing = ref(false);
const pendingChatPhoto = ref('');
const voiceListening = ref(false);
const voiceTranscript = ref('');
const libraryFilter = ref('all');
const localDraftSaved = ref(false);
const localDraftError = ref(false);
const squareSharePickerOpen = ref(false);
const publishProfilePickerOpen = ref(false);
const visibilityPickerOpen = ref(false);
const squareCommentSheetOpen = ref(false);
const activeSquarePostId = ref('');
const lightingStoryId = ref('');
const lightingStoryAction = ref<'light' | 'unlight' | ''>('');
const squareComposerOpening = ref(false);
const replyTarget = ref<{ id: string; name: string } | null>(null);
const storyImages = ref<string[]>([]);
const storyPhotoProcessing = ref(false);
const storyPhotoProgress = reactive({ done: 0, total: 0 });
const avatarCropSource = ref('');
const avatarCropTarget = ref<'profile' | 'account'>('profile');
const preview = ref('');
const chatText = ref('');
const storyCommentText = ref('');
const activeMessageActionId = ref('');
const selectedChatMemories = ref<string[]>([]);
const accountPanelOpen = ref(false);
const chatReplyPending = ref(false);
const pendingChatText = ref('');
const memoryUseForAi = ref(true);
const chatContextInitializedFor = ref('');
const environmentNoticeDismissed = ref(false);
const chatAvailable = computed(() => Boolean(app.bootstrap?.features?.textChat));
const chatConversation = computed(() => props.page === 'chat' && Boolean(props.query?.profileId));
const realChatMessages = computed(() => app.messages.filter((item) => !item.mock));
const safetyCheckActive = computed(() => {
  const last = [...realChatMessages.value].reverse().find((item) => item.role === 'assistant');
  return Boolean(last && /现在安全|正在危险中/.test(last.text));
});
const commonEmojis = [
  '微笑',
  '想念',
  '拥抱',
  '爱心',
  '流泪',
  '开心',
  '晚安',
  '太阳',
  '月亮',
  '鲜花',
  '蛋糕',
  '赞',
] as const;
const emojiCharacters: Record<(typeof commonEmojis)[number], string> = {
  微笑: '🙂',
  想念: '🥺',
  拥抱: '🫂',
  爱心: '❤️',
  流泪: '😢',
  开心: '😊',
  晚安: '🌙',
  太阳: '☀️',
  月亮: '🌕',
  鲜花: '🌷',
  蛋糕: '🎂',
  赞: '👍',
};
const voiceSupported = computed(
  () =>
    typeof window !== 'undefined' &&
    Boolean(
      (window as typeof window & { SpeechRecognition?: unknown }).SpeechRecognition ||
        (window as typeof window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition,
    ),
);
const shellSubtitle = computed(() => '');
const recovering = computed(() => props.page === 'login' && props.query?.mode === 'recover');
const isWeChat = computed(
  () => typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent),
);
const relationshipOptions = ['爸爸', '妈妈', '爷爷', '奶奶', '外公', '外婆', '爱人', '朋友'];
const profileDisplayName = computed(
  () => form.nickname.trim() || form.relationship.trim() || form.name.trim(),
);
const recoveryNeeded = computed(
  () => app.profiles.length > 0 && !app.bootstrap?.recoveryConfigured,
);
const boundPhoneDisplay = computed(() => {
  const value = String(app.bootstrap?.boundPhone || '');
  const lastFour = value.match(/(\d{4})\s*$/)?.[1];
  return lastFour ? `尾号 ${lastFour}` : value || '手机号未绑定';
});
const draftStatus = computed(() => {
  if (app.busy) return '正在保存到空间…';
  if (localDraftError.value) return '本机草稿暂存失败，请先保存内容再离开。';
  if (props.page === 'memory-edit' && form.public)
    return localDraftSaved.value
      ? '草稿已暂存；保存后私密原文会保留，公开副本将提交审核。'
      : '私密原文会保留，公开副本审核通过后才会展示。';
  if (props.page === 'compose' && form.public)
    return localDraftSaved.value
      ? '草稿已暂存到本机，尚未提交审核。'
      : '提交后先审核，通过后才会公开。';
  return localDraftSaved.value ? '草稿已暂存到本机，尚未保存到空间。' : '保存后仅自己可见。';
});
const libraryItems = computed(() => {
  const memories = app.libraryMemories
    .filter((m) => libraryFilter.value === 'all' || m.profileId === libraryFilter.value)
    .map((m) => ({ ...m, source: 'memory' as const }));
  const stories =
    libraryFilter.value === 'all'
      ? app.posts.map((p) => ({ ...p, profileId: '', source: 'story' as const }))
      : [];
  return [...memories, ...stories].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});
const importableMemories = computed(() =>
  app.currentId
    ? app.libraryMemories.filter((m) => m.profileId === app.currentId)
    : app.libraryMemories,
);
const myShares = computed(() => app.posts);
const shareMemory = computed(() => app.memories.find((m) => m.id === props.query?.memoryId));
function profileName(id: string) {
  return app.profiles.find((p) => p.id === id)?.name || '人物记忆';
}
function selectRelationship(value: string) {
  customRelationship.value = false;
  form.relationship = value;
}
function postStatus(post: { visibility: string; moderation: string }) {
  if (post.visibility !== 'public') return '仅自己可见';
  if (post.moderation === 'pending') return '审核中';
  if (post.moderation === 'rejected') return '未通过';
  return '已公开到广场';
}
function openLibraryItem(item: { id: string; profileId: string; source: string }) {
  go(
    item.source === 'memory' ? 'memory' : 'story',
    '?id=' + item.id + (item.profileId ? '&profileId=' + item.profileId : ''),
  );
}
const libraryProfilePickerOpen = ref(false);
function recordFromLibrary() {
  if (app.busy) return;
  if (!app.profiles.length) {
    go('create');
    return;
  }
  libraryProfilePickerOpen.value = true;
}
function recordForProfile(id: string) {
  libraryProfilePickerOpen.value = false;
  if (id !== app.currentId) app.select(id);
  go('compose', '?from=memories&profileId=' + encodeURIComponent(id));
}
function storeDraft(key: string, value: unknown) {
  try {
    uni.setStorageSync(key, value);
    localDraftSaved.value = true;
    localDraftError.value = false;
  } catch {
    localDraftSaved.value = false;
    localDraftError.value = true;
  }
}
let restoringDraft = false;
let profileDraftOwner = '';
let editorDraftReady = false;
let profileFormLoadedFor = '';
const selectedMemory = computed(() => app.memories.find((m) => m.id === props.query?.id));
const selectedPost = computed(() =>
  [...app.posts, ...app.publicPosts].find((p) => p.id === props.query?.id),
);
const selectedStoryComments = computed(() =>
  selectedPost.value ? app.storyComments[selectedPost.value.id] || [] : [],
);
const activeSquarePost = computed(() =>
  app.publicPosts.find((post) => post.id === activeSquarePostId.value),
);
const activeSquareComments = computed(() =>
  activeSquarePostId.value ? app.storyComments[activeSquarePostId.value] || [] : [],
);
const selectedPostIsInteractive = computed(
  () =>
    selectedPost.value?.visibility === 'public' && selectedPost.value?.moderation === 'published',
);
const editing = computed(() => props.query?.edit === '1');
const editingMemory = computed(() => props.page === 'memory-edit' && Boolean(props.query?.id));
const editingStory = computed(() => props.page === 'compose' && props.query?.edit === '1');
const ownsSelectedPost = computed(() =>
  Boolean(selectedPost.value && selectedPost.value.ownerId === app.session.userId),
);
const nextAfterLogin = computed(() =>
  ['home', 'create', 'compose', 'memories', 'memory-edit'].includes(props.query?.next || '')
    ? props.query!.next!
    : 'home',
);
const sampleStories = [
  {
    id: 'sample',
    title: '她把四季都晒在阳台上',
    excerpt:
      '外婆总说，太阳好的时候别浪费。被子、萝卜干，还有我们小时候的衣服，都带着同一种暖暖的味道。',
    body: '外婆总说，太阳好的时候别浪费。被子、萝卜干，还有我们小时候的衣服，都带着同一种暖暖的味道。后来每次闻到晒过太阳的被子，我都会想起她站在阳台上的背影。',
  },
  {
    id: 'sample-dad',
    title: '第一次学会骑自行车',
    excerpt: '我一直以为他还扶着后座，回头才发现他站在很远的地方笑。',
    body: '我一直以为他还扶着后座，回头才发现他站在很远的地方笑。那天的风很大，我第一次知道，原来被放开也是一种守护。',
  },
  {
    id: 'sample-grandma',
    title: '外婆教我的第一道菜',
    excerpt: '她说做菜没有标准答案，尝一口，觉得刚好，就是家的味道。',
    body: '外婆教我做的第一道菜是番茄炒蛋。她从不说放几克盐，只让我尝一口，觉得刚好，就是家的味道。后来每次做这道菜，我都会想起厨房里那盏暖暖的灯。',
  },
];
const selectedSample = computed(() => sampleStories.find((s) => s.id === props.query?.id));
let accountStatusTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [props.page, app.status] as const,
  ([page, status]) => {
    if (accountStatusTimer) clearTimeout(accountStatusTimer);
    accountStatusTimer = undefined;
    if (page !== 'me' || !status) return;
    accountStatusTimer = setTimeout(() => {
      if (props.page === 'me' && app.status === status) app.status = '';
      accountStatusTimer = undefined;
    }, 3200);
  },
);
onBeforeUnmount(() => {
  if (accountStatusTimer) clearTimeout(accountStatusTimer);
});
async function loadScreen() {
  app.error = '';
  app.status = '';
  try {
    if (props.query?.profileId && props.query.profileId !== app.currentId)
      app.select(props.query.profileId);
    loading.value =
      !app.bootstrap ||
      (chatConversation.value && !app.messagesReady) ||
      (props.page === 'memories' && !app.libraryReady) ||
      (['square', 'shares'].includes(props.page) && !screenReady.value) ||
      (!['home', 'login'].includes(props.page) && !screenReady.value);
    const publicPostsPromise = props.page === 'square' ? app.fetchPublicPosts() : null;
    await app.refresh(
      !['home', 'login'].includes(props.page),
      Boolean(props.query?.profileId),
      chatConversation.value,
      ['shares', 'memories', 'compose'].includes(props.page),
    );
    if (props.page === 'login' && app.session.userId && !recovering.value) {
      replace(app.current ? 'home' : 'create');
      return;
    }
    if (props.page === 'space') {
      replace('home', props.query?.saved === '1' ? '?saved=1' : '');
      return;
    }
    if (props.page === 'square' && props.query?.view === 'mine') {
      replace('shares');
      return;
    }
    if (publicPostsPromise) await publicPostsPromise;
    if (props.page === 'shares') await app.fetchOwnPosts();
    if (['memories', 'me'].includes(props.page)) await app.fetchLibrary();
    if (
      ['story', 'compose'].includes(props.page) &&
      props.query?.id &&
      !sampleStories.some((story) => story.id === props.query?.id)
    )
      await app.fetchPost(props.query.id);
    if (props.page === 'story' && selectedPostIsInteractive.value && selectedPost.value)
      await app.fetchStoryComments(selectedPost.value.id);
    if (editingStory.value && !ownsSelectedPost.value)
      throw new Error('这段内容不属于当前空间，无法修改。');
    if (props.page === 'compose' && props.query?.memoryId && !shareMemory.value)
      throw new Error('这条记忆暂时找不到，请返回我的记忆重新选择。');
    if (editingMemory.value && !selectedMemory.value)
      throw new Error('这条记忆暂时找不到，请返回我的记忆重新选择。');
    if (editingMemory.value && selectedMemory.value)
      memoryUseForAi.value = selectedMemory.value.useForAi;
    restoreProfileDraft();
    restoreChatDraft();
    initializeChatMemories();
    restoreEditorDraft();
    if (props.page === 'profile') form.communityName = app.bootstrap?.communityName || '';
    if (
      props.page === 'compose' &&
      props.query?.memoryId &&
      shareMemory.value &&
      !editorDraftReady
    ) {
      if (!form.body) {
        form.title = shareMemory.value.title.slice(0, 60);
        form.body = shareMemory.value.body;
      }
      form.public = Boolean(app.bootstrap?.features?.publicSquare);
      form.publicConsent = false;
    }
    if (
      props.page === 'compose' &&
      props.query?.from === 'square' &&
      !editingStory.value &&
      !form.body &&
      !storyImages.value.length
    ) {
      form.public = true;
      form.publicConsent = true;
    }
    editorDraftReady = true;
    screenReady.value = true;
    if (props.page === 'story' && props.query?.comment === '1') focusStoryComment();
  } catch (error) {
    app.error = error instanceof Error ? error.message : '暂时无法完成，请重试';
  } finally {
    loading.value = false;
  }
}
onShow(() => {
  void loadScreen();
});
function onRetry() {
  loadScreen();
}
watch(
  () => app.current,
  (p) => {
    if (editing.value && p && profileFormLoadedFor !== p.id) {
      Object.assign(form, {
        name: p.name,
        relationship: p.relationship || p.name,
        nickname: p.nickname || '',
        avatarDataUrl: '',
        removeAvatar: false,
        callMe: p.callMe,
        story: p.story,
        aiConsent: p.aiConsent,
      });
      profileFormLoadedFor = p.id;
      detailsOpen.value = true;
    }
  },
  { immediate: true },
);
function go(page: string, query = '') {
  uni.navigateTo({ url: '/pages/' + page + '/index' + query });
}
function replace(page: string, query = '') {
  uni.redirectTo({ url: '/pages/' + page + '/index' + query });
}
function enter(next: 'create' | 'compose') {
  if (app.session.userId) {
    go(next);
    return;
  }
  void app.run(async () => {
    await app.login();
    go(next);
  });
}
function start() {
  enter('create');
}
function openHomePrimary() {
  void app.run(async () => {
    await app.refresh(false);
    if (!app.session.userId) await app.login();
    go(app.current ? 'home' : 'create');
  });
}
function profileQuery() {
  return app.currentId ? '?profileId=' + encodeURIComponent(app.currentId) : '';
}
function needProfile(next: string) {
  if (!app.session.userId) {
    void app.run(async () => {
      await app.login();
      go(app.current ? next : 'create', app.current ? profileQuery() : '');
    });
    return;
  }
  go(app.current ? next : 'create', app.current ? profileQuery() : '');
}
function storyAuthor(post: { authorName?: string; isOfficial?: boolean }) {
  return post.authorName || (post.isOfficial ? '萤火故事馆' : '萤火用户');
}
function squareDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const elapsed = Date.now() - date.getTime();
  if (elapsed >= 0 && elapsed < 60_000) return '刚刚';
  if (elapsed >= 0 && elapsed < 3_600_000)
    return Math.max(1, Math.floor(elapsed / 60_000)) + '分钟前';
  if (elapsed >= 0 && elapsed < 86_400_000)
    return Math.max(1, Math.floor(elapsed / 3_600_000)) + '小时前';
  const now = new Date();
  if (date.getFullYear() === now.getFullYear())
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
function storyMeta(post: { isOfficial?: boolean; createdAt?: string }) {
  const date = squareDate(post.createdAt);
  if (post.isOfficial) return date || '官方内容';
  return date;
}
function storyAvatar(post: { authorName?: string; isOfficial?: boolean }) {
  return post.isOfficial ? '萤' : storyAuthor(post).trim().slice(0, 1) || '光';
}
function storyMemorialLabel(post: { profileRelationship?: string; profileName?: string }) {
  const name = post.profileRelationship || post.profileName;
  return name ? `纪念${name}` : '一段想念';
}
function openStory(id: string, comment = false) {
  go('story', '?id=' + encodeURIComponent(id) + (comment ? '&comment=1' : ''));
}
function toggleStoryLight(post: { id: string; viewerHasLit?: boolean }) {
  if (app.busy || lightingStoryId.value) return;
  const nextActive = !post.viewerHasLit;
  lightingStoryId.value = post.id;
  lightingStoryAction.value = nextActive ? 'light' : 'unlight';
  void app
    .run(async () => {
      await app.setStoryLight(post.id, nextActive);
      app.status = nextActive ? '已为这段故事点亮。' : '已收回这束萤火。';
    })
    .finally(() => {
      lightingStoryId.value = '';
      lightingStoryAction.value = '';
    });
}
function storyLightLabel(post: { id: string; viewerHasLit?: boolean; lightCount?: number }) {
  if (lightingStoryId.value === post.id)
    return lightingStoryAction.value === 'unlight' ? '正在收回…' : '点亮中…';
  return `${post.viewerHasLit ? '已点亮' : '点亮'} ${post.lightCount || 0}`;
}
function chooseSquareMemory(memory: { id: string; profileId: string }) {
  squareSharePickerOpen.value = false;
  const selected = app.libraryMemories.find((item) => item.id === memory.id);
  if (!selected) return;
  if (memory.profileId !== app.currentId) app.select(memory.profileId);
  form.title = selected.title;
  form.body = selected.body;
  app.status = '已带入这段记忆，你可以继续修改后再发布。';
}
function recordFromSquarePicker() {
  squareSharePickerOpen.value = false;
  needProfile('memory-edit');
}
function openSquareSharePicker() {
  if (app.busy) return;
  void app.run(async () => {
    if (!app.session.userId) await app.login();
    if (!app.current && app.profiles[0]) {
      app.select(app.profiles[0].id);
      await app.refresh(true, true);
    }
    if (!app.current) {
      go('create');
      return;
    }
    await app.fetchLibrary();
    squareSharePickerOpen.value = true;
  });
}
function openSquareComposer() {
  if (app.busy || squareComposerOpening.value) return;
  squareComposerOpening.value = true;
  void app
    .run(async () => {
      if (!app.session.userId) await app.login();
      if (!app.current && app.profiles[0]) app.select(app.profiles[0].id);
      if (!app.current) {
        go('create');
        return;
      }
      go('compose', '?from=square&profileId=' + encodeURIComponent(app.currentId));
    })
    .finally(() => {
      squareComposerOpening.value = false;
    });
}
function selectPublishProfile(id: string) {
  if (id !== app.currentId) app.select(id);
  publishProfilePickerOpen.value = false;
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    url.searchParams.set('profileId', id);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }
}
function openSquareComments(id: string) {
  activeSquarePostId.value = id;
  storyCommentText.value = '';
  replyTarget.value = null;
  squareCommentSheetOpen.value = true;
  void app.run(async () => {
    await app.fetchStoryComments(id);
  });
}
function closeSquareComments() {
  squareCommentSheetOpen.value = false;
  storyCommentText.value = '';
  replyTarget.value = null;
}
function chooseReply(comment: { id: string; authorName: string }) {
  replyTarget.value = { id: comment.id, name: comment.authorName };
  void nextTick(() => {
    const field = document.getElementById('square-comment-input') as HTMLInputElement | null;
    field?.focus({ preventScroll: true });
  });
}
function focusStoryComment() {
  void nextTick(() => {
    const field = document.getElementById('story-comment-input') as HTMLTextAreaElement | null;
    field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field?.focus({ preventScroll: true });
  });
}
function submitStoryComment() {
  const text = storyCommentText.value.trim();
  const post = selectedPost.value;
  if (!post || !text || app.busy) return;
  void app.run(async () => {
    await app.addStoryComment(post.id, text, replyTarget.value?.id);
    storyCommentText.value = '';
    replyTarget.value = null;
    const latest = app.storyComments[post.id]?.at(-1);
    app.status = latest?.moderation === 'pending' ? '留言已提交审核。' : '留言已发布。';
  });
}
function submitSquareComment() {
  const text = storyCommentText.value.trim();
  const post = activeSquarePost.value;
  if (!post || !text || app.busy) return;
  void app.run(async () => {
    await app.addStoryComment(post.id, text, replyTarget.value?.id);
    storyCommentText.value = '';
    replyTarget.value = null;
  });
}
function sendSafetyAnswer(text: '现在安全' | '正在危险中') {
  if (app.busy) return;
  performChatSend(text, '');
}
function callEmergencySupport() {
  if (typeof window !== 'undefined') window.location.href = 'tel:12356';
}
function manageComment(comment: {
  id: string;
  storyId: string;
  canDelete?: boolean;
  canHide?: boolean;
  canReport?: boolean;
}) {
  const actions = [
    ...(comment.canDelete || comment.canHide ? ['删除或隐藏'] : []),
    ...(comment.canReport ? ['举报'] : []),
  ];
  if (!actions.length) return;
  uni.showActionSheet({
    itemList: actions,
    success: ({ tapIndex }) => {
      const action = actions[tapIndex];
      void app.run(async () => {
        if (action === '举报') {
          await app.reportStoryComment(comment.storyId, comment.id);
          app.status = '已提交举报，管理员会尽快查看。';
        } else {
          await app.deleteStoryComment(comment.storyId, comment.id);
          app.status = comment.canDelete ? '留言已删除。' : '留言已隐藏。';
        }
      });
    },
  });
}
function saveCommunityName() {
  if (app.busy) return;
  void app.run(async () => {
    await app.updateCommunityName(form.communityName.trim());
    app.status = form.communityName.trim() ? '广场昵称已保存。' : '已恢复默认昵称“萤火朋友”。';
  });
}
function openProfileChat(id: string) {
  if (id !== app.currentId) {
    app.select(id);
    chatText.value = '';
    chatPhotoDraft.value = '';
    activeChatPanel.value = 'none';
  }
  go('chat', '?profileId=' + encodeURIComponent(id));
}
function toggle(key: 'public' | 'publicConsent', e: any) {
  form[key] = e.detail.value.length > 0;
}
function create() {
  void app.run(async () => {
    const displayName = profileDisplayName.value;
    await app.addProfile(
      {
        name: displayName,
        relationship: form.relationship || form.name || displayName,
        nickname: form.nickname,
        callMe: form.callMe,
        story: form.story,
        aiConsent: editing.value && form.aiConsent,
        removeAvatar: editing.value && form.removeAvatar,
        ...(form.avatarDataUrl ? { avatarDataUrl: form.avatarDataUrl } : {}),
      },
      editing.value,
    );
    if (!editing.value && app.session.userId)
      uni.removeStorageSync('yinghuo.profileDraft.' + app.session.userId);
    replace(editing.value ? 'home' : 'chat', editing.value ? '' : profileQuery());
  });
}
function profileInitial(profile: { name: string; relationship?: string; nickname?: string }) {
  return (
    (profile.name || profile.relationship || profile.nickname || '萤').trim().charAt(0) || '萤'
  );
}
function editCurrentProfile() {
  if (!app.currentId) return;
  go('create', '?edit=1&profileId=' + encodeURIComponent(app.currentId));
}
function formInitial() {
  return profileDisplayName.value.charAt(0) || '萤';
}
function loadBrowserImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve(image);
      else reject(new Error('所选图片无法读取，请换一张图片后重试'));
    };
    image.onload = finish;
    image.onerror = () => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      reject(new Error('所选图片无法读取，请换一张图片后重试'));
    };
    image.src = source;
    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) finish();
  });
}

function readBrowserImageFile(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image/'))
        resolve(reader.result);
      else reject(new Error('所选图片无法读取，请换一张图片后重试'));
    };
    reader.onerror = () => reject(new Error('所选图片无法读取，请换一张图片后重试'));
    reader.readAsDataURL(file);
  });
}

async function selectedImageSource(
  result: { tempFilePaths: string | string[]; tempFiles?: unknown | unknown[] },
  index = 0,
) {
  const files = Array.isArray(result.tempFiles)
    ? result.tempFiles
    : result.tempFiles
      ? [result.tempFiles]
      : [];
  const paths = Array.isArray(result.tempFilePaths)
    ? result.tempFilePaths
    : result.tempFilePaths
      ? [result.tempFilePaths]
      : [];
  const file = files[index];
  if (typeof Blob !== 'undefined' && file instanceof Blob) return readBrowserImageFile(file);
  return paths[index] || '';
}

function selectedImageCount(result: { tempFilePaths: string | string[] }) {
  return Array.isArray(result.tempFilePaths)
    ? result.tempFilePaths.length
    : result.tempFilePaths
      ? 1
      : 0;
}

async function compressAvatar(source: string, focusY = 50) {
  const image = await loadBrowserImage(source);
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理头像');
  const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(
    image,
    (size - width) / 2,
    ((size - height) * Math.max(0, Math.min(100, focusY))) / 100,
    width,
    height,
  );
  let quality = 0.78;
  let result = canvas.toDataURL('image/jpeg', quality);
  while (result.length > 80_000 && quality > 0.42) {
    quality -= 0.08;
    result = canvas.toDataURL('image/jpeg', quality);
  }
  if (result.length > 80_000) throw new Error('头像文件太大，请换一张图片');
  return result;
}
async function compressStoryPhoto(source: string) {
  const image = await loadBrowserImage(source);
  const maxSide = 840;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理照片');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let quality = 0.76;
  let result = canvas.toDataURL('image/jpeg', quality);
  while (result.length > 150_000 && quality > 0.34) {
    quality -= 0.07;
    result = canvas.toDataURL('image/jpeg', quality);
  }
  if (result.length > 150_000) throw new Error('有一张照片太大，请更换或先裁剪');
  return result;
}
function chooseStoryPhotos() {
  const remaining = 9 - storyImages.value.length;
  if (remaining <= 0 || storyPhotoProcessing.value) return;
  uni.chooseImage({
    count: remaining,
    sizeType: ['compressed'],
    success: (result) => {
      void app.run(async () => {
        storyPhotoProcessing.value = true;
        storyPhotoProgress.total = Math.min(remaining, selectedImageCount(result));
        storyPhotoProgress.done = 0;
        try {
          const next = [...storyImages.value];
          for (let index = 0; index < storyPhotoProgress.total; index += 1) {
            const source = await selectedImageSource(result, index);
            if (!source) continue;
            const photo = await compressStoryPhoto(source);
            if ([...next, photo].reduce((sum, item) => sum + item.length, 0) > 1_100_000)
              throw new Error('照片总大小超过限制，请减少一两张后再试');
            next.push(photo);
            storyPhotoProgress.done += 1;
          }
          storyImages.value = next;
        } finally {
          storyPhotoProcessing.value = false;
          storyPhotoProgress.total = 0;
          storyPhotoProgress.done = 0;
        }
      });
    },
  });
}
function removeStoryPhoto(index: number) {
  storyImages.value = storyImages.value.filter((_, current) => current !== index);
  if (app.status.startsWith('已选择')) app.status = '';
}
function chooseProfileAvatar() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    success: (result) => {
      void (async () => {
        const source = await selectedImageSource(result);
        if (!source) return;
        avatarCropSource.value = source;
        avatarCropTarget.value = 'profile';
      })();
    },
  });
}
function removeProfileAvatar() {
  form.avatarDataUrl = '';
  form.removeAvatar = true;
  app.status = '';
}
function chooseAccountAvatar() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    success: (result) => {
      void (async () => {
        const source = await selectedImageSource(result);
        if (!source) return;
        avatarCropSource.value = source;
        avatarCropTarget.value = 'account';
      })();
    },
  });
}
function cancelAvatarCrop() {
  avatarCropSource.value = '';
}
function confirmAvatarCrop() {
  const source = avatarCropSource.value;
  if (!source || app.busy) return;
  void app.run(async () => {
    const result = await compressAvatar(source, 50);
    if (avatarCropTarget.value === 'profile') {
      form.avatarDataUrl = result;
      form.removeAvatar = false;
      app.status = '头像已选好，保存资料后生效。';
    } else {
      form.accountAvatarDataUrl = result;
      await app.updateAccountAvatar({ avatarDataUrl: result });
      form.accountAvatarDataUrl = '';
      app.status = '个人头像已更新，广场发布和留言会使用这个头像。';
    }
    avatarCropSource.value = '';
  });
}
function removeAccountAvatar() {
  void app.run(async () => {
    await app.updateAccountAvatar({ removeAvatar: true });
    form.accountAvatarDataUrl = '';
    app.status = '已恢复为“我”的首字头像。';
  });
}
function switchProfile(id: string) {
  if (id === app.currentId || app.busy) return;
  app.select(id);
  selectedChatMemories.value = [];
  chatText.value = '';
  chatPhotoDraft.value = '';
  activeChatPanel.value = 'none';
  chatContextInitializedFor.value = '';
  replace(props.page, '?profileId=' + encodeURIComponent(id));
}
function memorySave() {
  void app.run(async () => {
    const input = {
      title: memoryTitle(form.title, form.body),
      body: form.body,
      useForAi: memoryUseForAi.value,
    };
    const savedMemory =
      editingMemory.value && selectedMemory.value
        ? await app.updateMemory(selectedMemory.value.id, input)
        : await app.addMemory(input);
    const key = memoryDraftKey();
    if (key) uni.removeStorageSync(key);
    let shareState = '';
    if (!editingMemory.value && form.public) {
      try {
        await app.publish({
          title: memoryTitle(form.title, form.body, 60),
          body: form.body,
          profileId: app.currentId || null,
          media: [],
          visibility: 'public',
          publicConsent: form.publicConsent,
        });
        shareState = '&shared=1';
      } catch {
        shareState = '&shareFailed=1';
      }
    }
    replace(
      'memory',
      '?id=' + savedMemory.id + '&profileId=' + savedMemory.profileId + '&saved=1' + shareState,
    );
  });
}
function confirmDeleteMemory() {
  const memory = selectedMemory.value;
  if (!memory) return;
  uni.showModal({
    title: '删除这段记忆？',
    content: '删除后将无法恢复，也不会再被用于后续对话。',
    confirmText: '确认删除',
    cancelText: '取消',
    success: (result) => {
      if (!result.confirm) return;
      void app.run(async () => {
        await app.deleteMemory(memory.id);
        replace('memories', profileQuery());
      });
    },
  });
}

function chatDraftKey() {
  return app.session.userId && app.currentId
    ? 'yinghuo.chatDraft.' + app.session.userId + '.' + app.currentId
    : '';
}
function initializeChatMemories() {
  if (
    !chatConversation.value ||
    !app.currentId ||
    chatContextInitializedFor.value === app.currentId
  )
    return;
  const explicitlyEnabled = app.memories.filter((memory) => memory.useForAi);
  const defaults = explicitlyEnabled.length ? explicitlyEnabled : app.memories;
  selectedChatMemories.value = defaults.slice(0, 5).map((memory) => memory.id);
  chatContextInitializedFor.value = app.currentId;
}
function restoreChatDraft() {
  if (!chatConversation.value || !chatDraftKey() || chatText.value) return;
  chatText.value = (uni.getStorageSync(chatDraftKey()) as string) || '';
}
watch(chatText, (value) => {
  if (chatConversation.value && chatDraftKey()) {
    if (value) storeDraft(chatDraftKey(), value);
    else {
      uni.removeStorageSync(chatDraftKey());
      localDraftSaved.value = false;
    }
  }
});
function toggleChatMemory(id: string) {
  if (!selectedChatMemories.value.includes(id) && selectedChatMemories.value.length >= 5) {
    app.status = '一次最多引用 5 条记忆；可以先取消一条。';
    return;
  }
  selectedChatMemories.value = selectedChatMemories.value.includes(id)
    ? selectedChatMemories.value.filter((current) => current !== id)
    : [...selectedChatMemories.value, id].slice(0, 5);
}
function toggleChatPanel(panel: 'tools' | 'emoji' | 'memories') {
  activeChatPanel.value = activeChatPanel.value === panel ? 'none' : panel;
  scrollChatToEnd();
}
function appendEmoji(name: (typeof commonEmojis)[number]) {
  chatText.value += emojiCharacters[name];
}
function openChatMemoryPanel() {
  activeChatPanel.value = 'memories';
}

async function compressChatPhoto(source: string) {
  const image = await loadBrowserImage(source);
  const longest = Math.max(image.naturalWidth, image.naturalHeight);
  const target = Math.min(640, longest);
  const ratio = longest ? target / longest : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理照片');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let quality = 0.78;
  let result = canvas.toDataURL('image/jpeg', quality);
  while (result.length > 60_000 && quality > 0.38) {
    quality -= 0.08;
    result = canvas.toDataURL('image/jpeg', quality);
  }
  if (result.length > 60_000) {
    const smaller = document.createElement('canvas');
    const resizeRatio = Math.min(1, 420 / Math.max(canvas.width, canvas.height));
    smaller.width = Math.max(1, Math.round(canvas.width * resizeRatio));
    smaller.height = Math.max(1, Math.round(canvas.height * resizeRatio));
    smaller.getContext('2d')?.drawImage(canvas, 0, 0, smaller.width, smaller.height);
    result = smaller.toDataURL('image/jpeg', 0.58);
  }
  if (result.length > 60_000) throw new Error('照片仍然太大，请换一张再试');
  return result;
}

function chooseChatPhoto(sourceType: 'album' | 'camera') {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: [sourceType],
    success: (result) => {
      void (async () => {
        try {
          app.error = '';
          chatPhotoProcessing.value = true;
          const source = await selectedImageSource(result);
          if (!source) return;
          chatPhotoDraft.value = await compressChatPhoto(source);
          activeChatPanel.value = 'none';
          app.status = '照片已选好，可以补充一句说明，也可以直接发送。';
          scrollChatToEnd();
        } catch (error) {
          app.error = error instanceof Error ? error.message : '照片处理失败，请重新选择';
        } finally {
          chatPhotoProcessing.value = false;
        }
      })();
    },
  });
}

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void)
    | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
let speechRecognition: BrowserSpeechRecognition | null = null;
function finishVoiceInput() {
  const recognized = voiceTranscript.value.trim();
  voiceListening.value = false;
  speechRecognition = null;
  if (!recognized) return;
  chatText.value = [chatText.value.trim(), recognized].filter(Boolean).join('');
  chatInputMode.value = 'text';
  app.status = '语音已转成文字，检查后再发送。';
}
function startVoiceInput() {
  if (voiceListening.value || app.busy) return;
  if (!voiceSupported.value) {
    app.status = '当前浏览器暂不支持语音识别，可以继续使用文字输入。';
    return;
  }
  const scope = window as typeof window & {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  const Recognition = scope.SpeechRecognition || scope.webkitSpeechRecognition;
  if (!Recognition) return;
  voiceTranscript.value = '';
  app.error = '';
  const recognition = new Recognition();
  speechRecognition = recognition;
  recognition.lang = 'zh-CN';
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.onresult = (event) => {
    let transcript = '';
    for (let index = 0; index < event.results.length; index += 1)
      transcript += event.results[index]?.[0]?.transcript || '';
    voiceTranscript.value = transcript;
  };
  recognition.onerror = (event) => {
    voiceListening.value = false;
    speechRecognition = null;
    if (event.error !== 'aborted') app.error = '没有听清，请按住后重新说一遍。';
  };
  recognition.onend = finishVoiceInput;
  try {
    recognition.start();
    voiceListening.value = true;
  } catch {
    speechRecognition = null;
    app.error = '麦克风暂时无法使用，请检查浏览器权限。';
  }
}
function stopVoiceInput() {
  if (!voiceListening.value || !speechRecognition) return;
  speechRecognition.stop();
}
function cancelVoiceInput() {
  if (!speechRecognition) return;
  voiceTranscript.value = '';
  speechRecognition.abort();
  speechRecognition = null;
  voiceListening.value = false;
}
function shareCurrentMemory() {
  if (selectedMemory.value)
    go(
      'compose',
      '?memoryId=' + selectedMemory.value.id + '&profileId=' + selectedMemory.value.profileId,
    );
}
function performChatSend(text: string, imageDataUrl = '') {
  if (app.busy) return;
  activeMessageActionId.value = '';
  pendingChatText.value = text;
  pendingChatPhoto.value = imageDataUrl;
  chatReplyPending.value = true;
  chatText.value = '';
  chatPhotoDraft.value = '';
  activeChatPanel.value = 'none';
  void app.run(async () => {
    try {
      await app.send(text, selectedChatMemories.value, imageDataUrl || undefined);
      if (!chatText.value) {
        uni.removeStorageSync(chatDraftKey());
        localDraftSaved.value = false;
      }
    } catch (error) {
      chatText.value = [text, chatText.value].filter(Boolean).join('\n');
      chatPhotoDraft.value = imageDataUrl;
      throw error;
    } finally {
      pendingChatText.value = '';
      pendingChatPhoto.value = '';
      chatReplyPending.value = false;
    }
  });
}

function sendChat() {
  const text = chatText.value.trim();
  if ((!text && !chatPhotoDraft.value) || app.busy) return;
  performChatSend(text, chatPhotoDraft.value);
}

function showContextInfo() {
  if (props.page === 'square') {
    uni.showModal({
      title: '关于萤火广场',
      content:
        '这里只展示用户主动公开并审核通过的记忆副本。私密聊天、未公开草稿和手机号不会出现在这里。',
      showCancel: false,
      confirmText: '我知道了',
    });
    return;
  }
  uni.showModal({
    title: '关于 AI 模拟回应',
    content:
      '这里会根据你主动提供的资料和记忆，以 TA 的口吻生成回应。它不是真人，也不代表 TA 的真实意识；记忆越完整，表达会越接近你熟悉的 TA。',
    showCancel: false,
    confirmText: '我知道了',
  });
}

function scrollChatToEnd() {
  if (!chatConversation.value) return;
  void nextTick(() => {
    const thread = document.getElementById('chat-thread');
    if (thread) thread.scrollTop = thread.scrollHeight;
  });
}
function onChatFocus() {
  activeChatPanel.value = 'none';
  scrollChatToEnd();
  requestAnimationFrame(() => requestAnimationFrame(scrollChatToEnd));
}
watch(
  () => [
    loading.value,
    app.messages.length,
    pendingChatText.value,
    pendingChatPhoto.value,
    chatReplyPending.value,
    activeChatPanel.value,
  ],
  scrollChatToEnd,
  {
    flush: 'post',
  },
);

function chatMessageAlreadySaved(text: string) {
  const normalized = text.trim();
  return Boolean(normalized && app.memories.some((memory) => memory.body.trim() === normalized));
}

function toggleMessageActions(id: string) {
  if (app.busy) return;
  activeMessageActionId.value = activeMessageActionId.value === id ? '' : id;
}

function saveChatMessageAsMemory(text: string) {
  const body = text.trim();
  if (!body || chatMessageAlreadySaved(body) || app.busy) return;
  void app.run(async () => {
    const memory = await app.addMemory({
      title: memoryTitle('', body),
      body,
      useForAi: true,
    });
    if (!selectedChatMemories.value.includes(memory.id) && selectedChatMemories.value.length < 5)
      selectedChatMemories.value = [...selectedChatMemories.value, memory.id];
    app.status = '已保存为人物记忆，之后的回复会参考。';
  });
}

function splitAssistantMessage(text: string) {
  const normalized = text.trim();
  if (!normalized) return [''];
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s*\n\s*/g, '').trim())
    .filter(Boolean);
  const source = paragraphs.length > 1 ? paragraphs : [normalized.replace(/\s*\n\s*/g, '')];
  const segments: string[] = [];
  for (const paragraph of source) {
    if (paragraph.length <= 72) {
      segments.push(paragraph);
      continue;
    }
    const sentences = paragraph.match(/[^。！？!?]+[。！？!?]?/g)?.map((part) => part.trim()) || [];
    if (sentences.length <= 1) {
      for (let start = 0; start < paragraph.length; start += 72)
        segments.push(paragraph.slice(start, start + 72));
      continue;
    }
    let current = '';
    for (const sentence of sentences) {
      if (current && current.length + sentence.length > 72) {
        segments.push(current);
        current = sentence;
      } else current += sentence;
    }
    if (current) segments.push(current);
  }
  return segments.length ? segments : [normalized];
}

function chatMessageTimeLabel(index: number) {
  const message = realChatMessages.value[index];
  if (!message) return '';
  const current = new Date(message.createdAt);
  if (Number.isNaN(current.getTime())) return '';
  const previous = index > 0 ? new Date(realChatMessages.value[index - 1]!.createdAt) : null;
  const sameDay =
    previous &&
    current.getFullYear() === previous.getFullYear() &&
    current.getMonth() === previous.getMonth() &&
    current.getDate() === previous.getDate();
  if (sameDay && current.getTime() - previous.getTime() < 5 * 60 * 1000) return '';
  const today = new Date();
  const dateLabel =
    current.getFullYear() === today.getFullYear() &&
    current.getMonth() === today.getMonth() &&
    current.getDate() === today.getDate()
      ? '今天'
      : `${current.getMonth() + 1}月${current.getDate()}日`;
  const timeLabel = current.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${dateLabel} ${timeLabel}`;
}

function restoreProfileDraft() {
  const userId = app.session.userId;
  if (props.page !== 'create' || editing.value) return;
  if (!userId) {
    if (profileDraftOwner) {
      form.name = '';
      form.relationship = '';
      form.nickname = '';
      form.callMe = '';
      form.story = '';
      form.aiConsent = false;
      form.avatarDataUrl = '';
      form.removeAvatar = false;
      customRelationship.value = false;
      detailsOpen.value = false;
    }
    profileDraftOwner = '';
    return;
  }
  if (profileDraftOwner && profileDraftOwner !== userId) {
    form.name = '';
    form.relationship = '';
    form.nickname = '';
    form.callMe = '';
    form.story = '';
    form.aiConsent = false;
    form.avatarDataUrl = '';
    form.removeAvatar = false;
    customRelationship.value = false;
    detailsOpen.value = false;
  }
  profileDraftOwner = userId;
  if (form.relationship || form.nickname || form.callMe || form.story) return;
  const draft = uni.getStorageSync('yinghuo.profileDraft.' + userId) as
    | {
        name?: string;
        relationship?: string;
        nickname?: string;
        callMe?: string;
        story?: string;
        avatarDataUrl?: string;
      }
    | undefined;
  if (!draft || typeof draft !== 'object') return;
  restoringDraft = true;
  form.name = typeof draft.name === 'string' ? draft.name : '';
  form.relationship = typeof draft.relationship === 'string' ? draft.relationship : form.name;
  customRelationship.value = Boolean(
    form.relationship && !relationshipOptions.includes(form.relationship),
  );
  form.nickname = typeof draft.nickname === 'string' ? draft.nickname : '';
  form.callMe = typeof draft.callMe === 'string' ? draft.callMe : '';
  form.story = typeof draft.story === 'string' ? draft.story : '';
  form.avatarDataUrl = typeof draft.avatarDataUrl === 'string' ? draft.avatarDataUrl : '';
  detailsOpen.value = Boolean(form.nickname || form.callMe || form.avatarDataUrl);
  localDraftSaved.value = true;
  restoringDraft = false;
  app.status = '已恢复你刚才填写的内容。';
}

function saveProfileDraft() {
  const userId = app.session.userId;
  if (
    restoringDraft ||
    props.page !== 'create' ||
    editing.value ||
    !userId ||
    profileDraftOwner !== userId
  )
    return;
  const key = 'yinghuo.profileDraft.' + userId;
  if (!form.relationship && !form.nickname && !form.callMe && !form.story && !form.avatarDataUrl) {
    uni.removeStorageSync(key);
    return;
  }
  storeDraft(key, {
    name: form.name,
    relationship: form.relationship,
    nickname: form.nickname,
    callMe: form.callMe,
    story: form.story,
    avatarDataUrl: form.avatarDataUrl,
  });
}

watch(
  () => [
    props.page,
    app.session.userId,
    editing.value,
    form.name,
    form.relationship,
    form.nickname,
    form.callMe,
    form.story,
    form.avatarDataUrl,
  ],
  saveProfileDraft,
  { flush: 'sync' },
);

function memoryDraftKey() {
  return app.session.userId && app.currentId
    ? 'yinghuo.memoryDraft.' +
        app.session.userId +
        '.' +
        app.currentId +
        (editingMemory.value ? '.edit.' + props.query?.id : '')
    : '';
}

function storyDraftKey() {
  return app.session.userId
    ? 'yinghuo.storyDraft.' +
        app.session.userId +
        '.profile.' +
        (app.currentId || 'none') +
        (props.query?.memoryId
          ? '.memory.' + props.query.memoryId
          : editingStory.value
            ? '.edit.' + props.query?.id
            : '')
    : '';
}

function restoreEditorDraft() {
  if (editorDraftReady) return;
  const key =
    props.page === 'memory-edit'
      ? memoryDraftKey()
      : props.page === 'compose'
        ? storyDraftKey()
        : '';
  if (!key || (!editingMemory.value && !editingStory.value && (form.title || form.body))) return;
  const draft = uni.getStorageSync(key) as
    | {
        title?: string;
        body?: string;
        public?: boolean;
        publicConsent?: boolean;
        useForAi?: boolean;
        media?: string[];
      }
    | undefined;
  if (!draft || typeof draft !== 'object') return;
  form.title = typeof draft.title === 'string' ? draft.title : '';
  form.body = typeof draft.body === 'string' ? draft.body : '';
  storyImages.value = Array.isArray(draft.media)
    ? draft.media.filter((item) => typeof item === 'string').slice(0, 9)
    : [];
  if (props.page === 'compose') {
    form.public = draft.public === true;
    form.publicConsent = draft.publicConsent === true;
  }
  if (props.page === 'memory-edit' && !editingMemory.value) {
    form.public = draft.public === true;
    form.publicConsent = draft.publicConsent === true;
    memoryUseForAi.value = draft.useForAi === true;
  }
  localDraftSaved.value = Boolean(form.title || form.body || storyImages.value.length);
  if (form.title || form.body || storyImages.value.length) app.status = '已恢复你未保存的草稿。';
}

function saveEditorDraft() {
  if (!editorDraftReady || !['memory-edit', 'compose'].includes(props.page)) return;
  const key = props.page === 'memory-edit' ? memoryDraftKey() : storyDraftKey();
  if (!key) return;
  if (!form.title && !form.body && !storyImages.value.length) {
    uni.removeStorageSync(key);
    return;
  }
  storeDraft(key, {
    title: form.title,
    body: form.body,
    ...(props.page === 'compose'
      ? {
          public: form.public,
          publicConsent: form.publicConsent,
          media: storyImages.value,
        }
      : {}),
    ...(props.page === 'memory-edit'
      ? {
          public: form.public,
          publicConsent: form.publicConsent,
          useForAi: memoryUseForAi.value,
        }
      : {}),
  });
}

watch(
  () => [
    app.session.userId,
    app.currentId,
    form.title,
    form.body,
    form.public,
    form.publicConsent,
    memoryUseForAi.value,
  ],
  saveEditorDraft,
  {
    flush: 'sync',
  },
);
watch(storyImages, saveEditorDraft, { deep: true });

function publish() {
  void app.run(async () => {
    const input = {
      title: memoryTitle(form.title, form.body, 60),
      body: form.body,
      profileId: app.currentId || null,
      media: storyImages.value,
      visibility: form.public ? 'public' : 'private',
      publicConsent: form.public ? true : form.publicConsent,
    };
    if (editingStory.value && selectedPost.value)
      await app.updatePost(selectedPost.value.id, input);
    else if (!form.public && app.current && !storyImages.value.length)
      await app.addMemory({
        title: memoryTitle(form.title, form.body),
        body: form.body,
        useForAi: false,
      });
    else await app.publish(input);
    const key = storyDraftKey();
    if (key) uni.removeStorageSync(key);
    replace(form.public ? 'shares' : 'memories', '?saved=1');
  });
}
function editStory() {
  if (!selectedPost.value || !ownsSelectedPost.value) return;
  go('compose', '?edit=1&id=' + encodeURIComponent(selectedPost.value.id));
}
function confirmDeleteStory() {
  if (!selectedPost.value || !ownsSelectedPost.value) return;
  const id = selectedPost.value.id;
  uni.showModal({
    title: '删除这个故事？',
    content: '删除后将不再出现在「我的」或公开广场。',
    confirmText: '确认删除',
    cancelText: '取消',
    success: (result) => {
      if (!result.confirm) return;
      void app.run(async () => {
        await app.deletePost(id);
        replace('shares');
      });
    },
  });
}
function choosePhoto() {
  uni.chooseImage({
    count: 1,
    success: (r) => {
      void (async () => {
        preview.value = await selectedImageSource(r);
        app.status = '仅本机预览，未上传，也未进行 AI 修复。';
      })();
    },
  });
}
function info(title: string, content: string) {
  uni.showModal({ title, content, showCancel: false, confirmText: '知道了' });
}
function showPhoneBinding() {
  accountPanelOpen.value = !accountPanelOpen.value;
}
function bindPhone() {
  const phone = form.phone.trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    app.error = '请输入正确的 11 位手机号';
    return;
  }
  void app.run(async () => {
    await app.bindPhone({ phone });
    form.phone = '';
    app.status = '手机号已绑定，可以作为找回账号。';
  });
}
function clearPhone() {
  void app.run(async () => {
    await app.clearPhone();
    form.phone = '';
    app.status = '手机号已移除。';
  });
}
function copyText(value: string, label: string) {
  if (!value) return;
  uni.setClipboardData({
    data: value,
    success: () => {
      app.status = label + '已复制';
    },
  });
}
function setRecoveryPassword() {
  const password = form.recoveryPassword.trim();
  if (password.length < 8) {
    app.error = '找回密码至少 8 位';
    return;
  }
  if (password !== form.recoveryPasswordConfirm.trim()) {
    app.error = '两次输入的找回密码不一致';
    return;
  }
  void app.run(async () => {
    await app.setRecoveryPassword({ password });
    form.recoveryPassword = '';
    form.recoveryPasswordConfirm = '';
    app.status = '找回密码已设置。';
  });
}
function recoverAccount() {
  const identifier = form.recoveryIdentifier.trim();
  const password = form.recoveryPassword.trim();
  if (!identifier || password.length < 8) {
    app.error = '请输入萤火号或手机号，以及至少 8 位找回密码';
    return;
  }
  const action = () =>
    app.run(async () => {
      await app.recover({
        identifier,
        password,
        mergeGuest: Boolean(app.session.userId),
      });
      replace(nextAfterLogin.value);
    });
  if (app.session.userId && (app.profiles.length || app.posts.length)) {
    uni.showModal({
      title: '合并到已有空间？',
      content: '这台设备新建的人物、记忆和故事会合并到找回的空间，不会直接丢失。',
      confirmText: '确认合并',
      cancelText: '取消',
      success: (result) => {
        if (result.confirm) void action();
      },
    });
  } else void action();
}

function confirmDeleteProfile() {
  if (!app.current) return;
  const name = app.current.name;
  const profileId = app.current.id;
  uni.showModal({
    title: '删除' + name + '的萤火？',
    content:
      '这个人物、相关记忆和对话内容会被永久清除。已提交到广场的独立分享副本，请在“我的公开分享”中另行管理。',
    confirmText: '永久删除',
    cancelText: '取消',
    success: (result) => {
      if (!result.confirm) return;
      void app.run(async () => {
        await app.deleteProfile(profileId);
        replace('home');
      });
    },
  });
}

watch(
  () => selectedMemory.value?.id,
  () => {
    if (!editingMemory.value || !selectedMemory.value) return;
    form.title = selectedMemory.value.title;
    form.body = selectedMemory.value.body;
  },
  { immediate: true },
);
watch(
  () => selectedPost.value?.id,
  () => {
    if (!editingStory.value || !selectedPost.value) return;
    form.title = selectedPost.value.title;
    form.body = selectedPost.value.body;
    storyImages.value = selectedPost.value.media || [];
    if (selectedPost.value.profileId && selectedPost.value.profileId !== app.currentId)
      app.select(selectedPost.value.profileId);
    form.public = selectedPost.value.visibility === 'public';
    form.publicConsent = selectedPost.value.visibility === 'public';
  },
  { immediate: true },
);
function confirmLogout() {
  if (!app.bootstrap?.recoveryConfigured) {
    info('请先设置找回密码', '当前空间还没有找回密码。设置后才能在换设备时找回这些记忆。');
    return;
  }
  uni.showModal({
    title: '离开当前空间？',
    content: '退出会清除这台设备的登录。之后可用萤火号或已绑定手机号，配合找回密码重新进入。',
    confirmText: '确认退出',
    cancelText: '取消',
    success: (result) => {
      if (result.confirm)
        void app.run(async () => {
          await app.logout();
          uni.reLaunch({ url: '/pages/home/index' });
        });
    },
  });
}

function downloadAccountExport() {
  void app.run(async () => {
    const data = await app.exportAccount();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'yinghuo-data-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    app.status = '数据已导出为 JSON 文件。';
  });
}
function submitFeedback() {
  const content = form.feedbackBody.trim();
  if (content.length < 2) {
    app.error = '请写下至少 2 个字的反馈';
    return;
  }
  void app.run(async () => {
    await app.submitFeedback({
      category: form.feedbackCategory,
      body: content,
      pageUrl: typeof location === 'undefined' ? '' : location.pathname + location.search,
      appVersion: app.bootstrap?.appVersion || '',
      requestId: app.lastRequestId,
    });
    form.feedbackBody = '';
    app.status = '反馈已收到，感谢你帮助萤火变得更好。';
  });
}
function confirmDeleteAccount() {
  if (form.deleteConfirmation.trim() !== '永久删除') {
    app.error = '请先输入“永久删除”';
    return;
  }
  uni.showModal({
    title: '永久删除账号？',
    content:
      '这会清除人物、记忆、对话、故事、头像和联系方式，并注销所有设备，且无法恢复。为保证系统记录完整，只保留不含个人内容的匿名标记。',
    confirmText: '永久删除',
    cancelText: '取消',
    success: (result) => {
      if (!result.confirm) return;
      void app.run(async () => {
        await app.deleteAccount('永久删除');
        uni.reLaunch({ url: '/pages/home/index' });
      });
    },
  });
}
</script>
<template>
  <AppShell
    :page="page"
    :title="shellTitle"
    :focused="chatConversation"
    :subtitle="shellSubtitle"
    :show-info="chatConversation || page === 'square'"
    :heading-action-label="
      chatConversation && app.current ? '编辑' + app.current.name + '的人物资料' : undefined
    "
    :heading-avatar-url="chatConversation ? app.current?.avatarUrl || undefined : undefined"
    :heading-avatar-initial="
      chatConversation && app.current ? profileInitial(app.current) : undefined
    "
    @info="showContextInfo"
    @heading="editCurrentProfile"
  >
    <view
      v-if="loading && page !== 'home'"
      class="loading-state"
      role="status"
      aria-label="正在打开萤火"
    >
      <view class="loading-line short" /><view class="loading-line" /><view class="loading-block" />
    </view>
    <view v-else-if="!screenReady && page !== 'home'" class="empty" role="alert">
      <h2>暂时无法打开萤火</h2>
      <p>{{ app.error || '请检查网络，稍后再试。' }}</p>
      <button role="button" class="btn secondary" @click="onRetry">重试</button>
    </view>
    <template v-else>
      <view
        v-if="app.error && !['create', 'memory-edit', 'compose', 'chat', 'login'].includes(page)"
        class="notice error"
        role="alert"
        >{{ app.error }}</view
      >
      <view
        v-if="app.status && !['create', 'memory-edit', 'compose', 'chat', 'login'].includes(page)"
        :class="['notice', { 'account-status-toast': page === 'me' }]"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <AppIcon v-if="page === 'me'" name="spark" />
        <text>{{ app.status }}</text>
      </view>
      <view
        v-if="recoveryNeeded && ['memories', 'memory', 'me'].includes(page)"
        class="recovery-reminder recovery-reminder-prominent"
        role="status"
      >
        <view>
          <strong>先设置账号找回，避免换设备后找不到这些记忆</strong>
          <small>当前登录通常保留 30 天；设置找回密码后可用萤火号或手机号恢复。</small>
        </view>
        <button role="button" class="text-button" @click="go('me')">现在设置</button>
      </view>
      <template v-if="page === 'home'">
        <view v-if="loading" class="loading-state" role="status" aria-label="正在打开你的萤火">
          <view class="loading-line short" /><view class="loading-line" /><view
            class="loading-block"
          />
        </view>
        <template v-else-if="app.current">
          <view class="yh-home-hero">
            <view class="yh-hero-copy">
              <small>今天，也有人在等你想起</small>
              <h1>{{ app.current.name }}的萤火</h1>
              <p>想起一句话，就回来记下来。小萤会替你把零散的记忆轻轻收好。</p>
            </view>
            <view class="sprite mascot yh-home-mascot" role="img" aria-label="一只发光的大萤火虫" />
            <i class="yh-spark one" /><i class="yh-spark two" /><i class="yh-spark three" />
          </view>
          <view class="yh-person-strip">
            <image
              v-if="app.current.avatarUrl"
              class="profile-avatar yh-person-avatar"
              :src="app.current.avatarUrl"
              mode="aspectFill"
              :aria-label="app.current.name + '的头像'"
            />
            <view v-else class="profile-avatar fallback yh-person-avatar">{{
              profileInitial(app.current)
            }}</view>
            <view class="yh-person-copy"
              ><strong>{{ app.current.name }}</strong
              ><small>已留下 {{ app.memories.length }} 段记忆</small></view
            >
            <button role="button" class="text-button" @click="go('chat')">切换人物</button>
          </view>
          <view class="home-primary-actions">
            <button
              role="button"
              class="home-primary-action"
              aria-label="记录一件小事"
              :disabled="app.busy"
              @click="needProfile('memory-edit')"
              :aria-disabled="app.busy"
            >
              <text><strong>记录一件小事</strong></text>
            </button>
            <button
              role="button"
              class="home-primary-action secondary"
              :class="{ 'coming-soon': !chatAvailable }"
              :aria-label="
                chatAvailable ? '和' + app.current.name + '聊聊' : '和TA聊聊，功能即将开放'
              "
              @click="go('chat', profileQuery())"
            >
              <text
                ><strong>和{{ app.current.name }}聊聊</strong>
                <small v-if="!chatAvailable">即将开放</small></text
              >
            </button>
          </view>
          <view v-if="query?.saved === '1'" class="saved-state" role="status">
            已保存到{{ app.current.name }}的记忆。
          </view>
          <view class="section">
            <h2>最近的记忆</h2>
            <button role="button" class="text-button" @click="go('memories')">回忆册</button>
          </view>
          <button
            role="button"
            v-if="app.memories[0]"
            class="memory-preview"
            @click="go('memory', '?id=' + app.memories[0].id + '&profileId=' + app.currentId)"
          >
            <h3>{{ app.memories[0].title }}</h3>
            <p>{{ app.memories[0].body }}</p>
          </button>
          <view v-else class="notice">还没有留下记忆，今天想到的一句话就可以。</view>
          <view v-if="recoveryNeeded" class="recovery-reminder">
            <text>内容已保存，跨设备找回还未设置。</text>
            <button role="button" class="text-button" @click="go('me')">设置找回方式</button>
          </view>
          <view v-if="!recoveryNeeded" class="yh-privacy-note"
            ><AppIcon name="lock" /><text>记忆默认只属于你，开启分享才会公开。</text></view
          >
        </template>
        <view v-else class="hero first-visit yh-guest-home">
          <small class="eyebrow">FIREFLY · 珍藏每一点光</small>
          <h1>让想念，<br />有一个地方安放。</h1>
          <p>无论 TA 是否在身边，都可以从一句话开始，珍藏你们的故事。</p>
          <view class="yh-guest-art">
            <view
              class="sprite mascot yh-guest-mascot"
              role="img"
              aria-label="小萤，萤火记忆伙伴"
            />
          </view>
          <button
            role="button"
            class="btn yh-guest-action"
            :disabled="app.busy || !app.bootstrap"
            @click="openHomePrimary"
            :aria-disabled="app.busy || !app.bootstrap"
          >
            {{ app.busy ? '正在进入…' : '为 TA 建立记忆空间' }}
          </button>
          <button role="button" class="text-button" @click="go('square')">先看看广场故事</button>
        </view>
        <button
          role="button"
          v-if="!loading && !app.profiles.length"
          class="text-button home-recover"
          @click="go('login', '?mode=recover')"
        >
          换了设备？找回已有萤火
        </button>
        <button role="button" v-if="app.error" class="btn secondary" @click="onRetry">
          重新打开
        </button>
      </template>
      <template v-else-if="page === 'login'">
        <view class="sprite2 pose-fly login-mascot" role="img" aria-label="小萤" />
        <h1 :class="{ 'sr-only': recovering }">
          {{ recovering ? '找回我的萤火' : '从一句话开始' }}
        </h1>
        <p class="caption">
          {{
            recovering
              ? '用萤火号或已绑定的手机号找回原来的空间。'
              : '无需先注册。留下记忆后，再设置跨设备找回。'
          }}
        </p>
        <view v-if="!recovering" class="card"
          ><h2>先留下第一条记忆</h2>
          <button
            role="button"
            class="btn"
            :disabled="app.busy"
            @click="
              app.run(async () => {
                await app.login();
                replace(nextAfterLogin);
              })
            "
            :aria-disabled="app.busy"
          >
            {{ app.busy ? '正在进入…' : '开始记录' }}
          </button></view
        >
        <view class="recovery-card compact-recovery-card">
          <h2>{{ recovering ? '输入账号信息' : '已有记忆？找回原来的空间' }}</h2>
          <label class="field"
            ><text>萤火号或手机号</text
            ><input
              v-model.trim="form.recoveryIdentifier"
              aria-label="萤火号或手机号"
              maxlength="24"
              autocomplete="username"
              placeholder="输入萤火号或已绑定手机号"
          /></label>
          <label class="field"
            ><text>找回密码</text
            ><input
              v-model="form.recoveryPassword"
              aria-label="找回密码"
              :password="true"
              maxlength="64"
              autocomplete="current-password"
              placeholder="输入找回密码"
          /></label>
          <view v-if="app.error" class="notice error" role="alert">{{ app.error }}</view>
          <view v-if="app.status" class="caption" role="status">{{ app.status }}</view>
          <button
            role="button"
            class="btn"
            :disabled="
              app.busy || !form.recoveryIdentifier.trim() || form.recoveryPassword.trim().length < 8
            "
            @click="recoverAccount"
            :aria-disabled="
              app.busy || !form.recoveryIdentifier.trim() || form.recoveryPassword.trim().length < 8
            "
          >
            {{ app.busy ? '正在找回…' : '找回我的萤火' }}
          </button>
        </view>
      </template>
      <template v-else-if="page === 'create'">
        <h1 v-if="editing" class="sr-only">人物资料</h1>
        <p class="caption">
          {{ editing ? '熟悉的称呼与故事，可以慢慢补充。' : '选一个称呼，写一件最熟悉的小事。' }}
        </p>
        <view v-if="!app.session.userId" class="notice"
          ><p>先进入自己的记忆空间。</p>
          <button role="button" class="btn" @click="go('login', '?next=create')">继续</button></view
        >
        <template v-else>
          <text v-if="!editing" class="field-label">TA 是你的</text>
          <view v-if="!editing" class="chips relationship-choices">
            <button
              role="button"
              v-for="r in relationshipOptions"
              :key="r"
              class="chip"
              :class="{ active: form.relationship === r }"
              :aria-pressed="form.relationship === r"
              @click="selectRelationship(r)"
            >
              {{ r }}
            </button>
            <button
              role="button"
              class="chip"
              :class="{ active: customRelationship }"
              :aria-pressed="customRelationship"
              @click="
                customRelationship = true;
                form.relationship = '';
              "
            >
              其他
            </button>
          </view>
          <label v-if="editing || customRelationship" class="field"
            ><text>TA 与你的关系（必填）</text
            ><input
              v-model="form.relationship"
              aria-label="TA 与你的关系"
              maxlength="40"
              placeholder="例如：老师、阿明"
          /></label>
          <label class="field"
            ><text>{{ editing ? '关于 TA 的故事（选填）' : '想到的一件小事（必填）' }}</text
            ><textarea
              v-model="form.story"
              aria-label="想到的一件小事"
              maxlength="1000"
              placeholder="一句常说的话，一个熟悉的小习惯，都可以。"
            />
          </label>
          <view v-if="editing" class="caption"
            >这段资料也是 TA 的第一条记忆；保存后会同步更新。</view
          >
          <button
            role="button"
            class="disclosure-button"
            :aria-expanded="detailsOpen"
            @click="detailsOpen = !detailsOpen"
          >
            <text>昵称、头像与 TA 对你的称呼（选填）</text
            ><text>{{ detailsOpen ? '收起' : '补充' }}</text>
          </button>
          <view v-if="detailsOpen" class="optional-details">
            <label v-if="!customRelationship" class="field"
              ><text>TA 的昵称（选填）</text
              ><input
                v-model="form.nickname"
                aria-label="昵称"
                maxlength="40"
                placeholder="例如：芳姨、小明"
            /></label>
            <label class="field"
              ><text>TA 对你的称呼（选填）</text
              ><input
                v-model="form.callMe"
                aria-label="TA 对你的称呼"
                maxlength="40"
                placeholder="例如：小雨"
            /></label>
            <view class="avatar-editor">
              <button
                role="button"
                class="avatar-tap"
                @click="chooseProfileAvatar"
                :aria-label="editing ? '更换头像' : '上传头像'"
              >
                <image
                  v-if="
                    !form.removeAvatar &&
                    (form.avatarDataUrl || (editing && app.current?.avatarUrl))
                  "
                  class="profile-avatar large"
                  :src="form.avatarDataUrl || app.current?.avatarUrl || ''"
                  mode="aspectFill"
                />
                <view v-else class="profile-avatar large fallback">{{ formInitial() }}</view>
              </button>
              <view
                ><button
                  role="button"
                  v-if="
                    form.avatarDataUrl || (editing && app.current?.avatarUrl && !form.removeAvatar)
                  "
                  class="text-button"
                  @click="removeProfileAvatar"
                >
                  移除
                </button></view
              >
            </view>
          </view>
          <view v-if="!editing" class="editor-actions create-final-actions">
            <view v-if="app.error" class="notice error" role="alert"
              >{{ app.error }} 内容还在，可以重试。</view
            >
            <small v-if="app.status || app.busy" class="draft-status" role="status">{{
              app.status || '正在创建…'
            }}</small>
            <button
              role="button"
              class="btn"
              :disabled="app.busy || !form.relationship.trim() || !form.story.trim()"
              :aria-disabled="app.busy || !form.relationship.trim() || !form.story.trim()"
              @click="create"
            >
              {{ app.busy ? '正在创建…' : '创建并开始聊天' }}
            </button>
          </view>
          <view v-if="editing" class="editor-actions">
            <view v-if="app.error" class="notice error" role="alert"
              >{{ app.error }} 内容还在，可以修改后重试。</view
            >
            <small v-if="app.status || app.busy" class="draft-status" role="status">{{
              app.status || '正在保存…'
            }}</small>
            <button
              role="button"
              class="btn"
              :disabled="app.busy || !form.relationship.trim() || (!editing && !form.story.trim())"
              @click="create"
              :aria-disabled="
                app.busy || !form.relationship.trim() || (!editing && !form.story.trim())
              "
            >
              {{ app.busy ? '正在保存…' : editing ? '保存资料' : '创建并开始聊天' }}
            </button>
            <button
              role="button"
              v-if="!editing"
              class="text-button"
              :disabled="app.busy || !form.relationship.trim()"
              @click="create"
              :aria-disabled="app.busy || !form.relationship.trim()"
            >
              先创建空间，稍后再写
            </button>
          </view>
          <button
            role="button"
            v-if="editing"
            class="text-button danger-text"
            :disabled="app.busy"
            @click="confirmDeleteProfile"
            :aria-disabled="app.busy"
          >
            删除这束萤火
          </button>
        </template>
      </template>
      <template v-else-if="page === 'space'">
        <template v-if="app.current">
          <view v-if="app.profiles.length > 1" class="profile-tabs" aria-label="切换人物">
            <button
              role="button"
              v-for="p in app.profiles"
              :key="p.id"
              class="profile-tab"
              :class="{ active: app.currentId === p.id }"
              :aria-pressed="app.currentId === p.id"
              @click="switchProfile(p.id)"
            >
              <image
                aria-hidden="true"
                v-if="p.avatarUrl"
                class="profile-avatar"
                :src="p.avatarUrl"
                mode="aspectFill"
              /><view v-else class="profile-avatar fallback">{{ profileInitial(p) }}</view
              ><text>{{ p.name }}</text>
            </button>
          </view>
          <view class="profile-heading space-heading">
            <image
              aria-hidden="true"
              v-if="app.current.avatarUrl"
              class="profile-avatar large"
              :src="app.current.avatarUrl"
              mode="aspectFill"
            /><view v-else class="profile-avatar large fallback">{{
              profileInitial(app.current)
            }}</view>
            <view
              ><h1>{{ app.current.name }}的萤火</h1>
              <small>{{ app.memories.length }} 条记忆 · 仅自己可见</small></view
            >
          </view>
          <button role="button" class="btn" @click="go('memory-edit', profileQuery())">
            再记下一件小事
          </button>
          <button
            role="button"
            v-if="chatAvailable"
            class="btn secondary"
            @click="go('chat', profileQuery())"
          >
            聊聊关于{{ app.current.name }}的记忆
          </button>
          <view v-if="query?.saved === '1'" class="saved-state" role="status">{{
            app.memories.length
              ? '记忆已保存到空间，只有你能看到。'
              : '人物已保存，可以开始留下记忆了。'
          }}</view>
          <view class="section"
            ><h2>最近留下的记忆</h2>
            <button role="button" class="text-button" @click="go('memories')">
              查看全部
            </button></view
          >
          <button
            role="button"
            v-if="app.memories[0]"
            class="memory-preview"
            @click="go('memory', '?id=' + app.memories[0].id + '&profileId=' + app.currentId)"
          >
            <h3>{{ app.memories[0].title }}</h3>
            <p>{{ app.memories[0].body }}</p>
            <small>已保存 · 仅自己可见</small>
          </button>
          <view v-else class="empty"><p>今天想到的一句话，就是第一条记忆。</p></view>
          <view class="section"><h2>人物</h2></view>
          <button
            role="button"
            class="row"
            @click="go('create', '?edit=1&profileId=' + app.currentId)"
          >
            补充人物资料
          </button>
          <button role="button" class="row" @click="go('create')">
            添加另一位重要的人 <AppIcon name="plus" />
          </button>
        </template>
        <view v-else class="empty"
          ><h1>先留下关于 TA 的一句话</h1>
          <p>不用准备完整的故事，想起什么就写什么。</p>
          <button
            role="button"
            class="btn"
            :disabled="app.busy"
            @click="start"
            :aria-disabled="app.busy"
          >
            写下第一条记忆</button
          ><button role="button" class="text-button" @click="go('memories')">
            查看已有内容
          </button></view
        >
      </template>
      <template v-else-if="page === 'memories'">
        <p class="caption library-caption">自己留下的内容，都可以从这里找到。</p>
        <view v-if="query?.saved === '1'" class="save-toast" role="status">已保存到我的记忆。</view>
        <view class="profile-tabs library-filters" aria-label="按人物筛选记忆">
          <button
            role="button"
            class="profile-tab"
            :class="{ active: libraryFilter === 'all' }"
            :aria-pressed="libraryFilter === 'all'"
            @click="libraryFilter = 'all'"
          >
            全部
          </button>
          <button
            role="button"
            v-for="p in app.profiles"
            :key="p.id"
            class="profile-tab"
            :class="{ active: libraryFilter === p.id }"
            :aria-pressed="libraryFilter === p.id"
            @click="libraryFilter = p.id"
          >
            {{ p.name }}
          </button>
        </view>
        <button
          role="button"
          v-for="item in libraryItems"
          :key="item.source + item.id"
          class="memory-preview library-item"
          @click="openLibraryItem(item)"
        >
          <small>{{
            item.source === 'memory'
              ? profileName(item.profileId) +
                ' · ' +
                new Date(item.createdAt).toLocaleDateString('zh-CN')
              : (item.visibility === 'public' ? '广场分享' : '历史故事') + ' · ' + postStatus(item)
          }}</small>
          <h3>{{ item.title }}</h3>
          <p>{{ item.body }}</p>
        </button>
        <view v-if="!libraryItems.length" class="empty"
          ><h2>{{ libraryFilter === 'all' ? '还没有留下记忆' : '这位人物还没有记忆' }}</h2>
          <p>一句话、一件小事，都值得留下。</p></view
        >
        <button
          role="button"
          class="square-fab memory-post-fab"
          :disabled="app.busy"
          :aria-disabled="app.busy"
          @click="recordFromLibrary"
        >
          <AppIcon name="edit" /><text>发布纪念</text>
        </button>
        <view
          v-if="libraryProfilePickerOpen"
          class="square-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="library-profile-title"
          @click.self="libraryProfilePickerOpen = false"
        >
          <view class="publish-choice-sheet">
            <view class="square-sheet-heading">
              <h2 id="library-profile-title">选择你想念的人</h2>
              <button
                role="button"
                class="icon-button"
                aria-label="关闭人物选择"
                @click="libraryProfilePickerOpen = false"
              >
                <AppIcon name="close" />
              </button>
            </view>
            <button
              v-for="profile in app.profiles"
              :key="profile.id"
              role="button"
              class="publish-profile-option"
              @click="recordForProfile(profile.id)"
            >
              <image
                aria-hidden="true"
                v-if="profile.avatarUrl"
                :src="profile.avatarUrl"
                class="profile-avatar"
                mode="aspectFill"
              />
              <view v-else class="profile-avatar fallback">{{ profileInitial(profile) }}</view>
              <view
                ><strong>{{ profile.name }}</strong
                ><small v-if="profile.nickname">{{ profile.relationship }}</small></view
              >
              <i aria-hidden="true" />
            </button>
          </view>
        </view>
      </template>
      <template v-else-if="page === 'memory-edit'">
        <h1 class="sr-only">{{ editingMemory ? '修改这段记忆' : '记录一件小事' }}</h1>
        <template v-if="app.current">
          <p class="caption editor-owner">写给 {{ app.current.name }} 的记忆 · 默认只属于你</p>
          <view class="editor-progress" aria-label="记录步骤"><i class="active" /><i /><i /></view>
          <view v-if="query?.type" class="notice"
            >照片、声音和视频稍后开放，现在可以先记下一段文字。</view
          >
          <label class="field"
            ><text>给这段记忆一个名字（选填）</text
            ><input
              v-model="form.title"
              aria-label="记忆标题（选填）"
              maxlength="120"
              placeholder="留空时，用正文开头作为标题"
          /></label>
          <label class="field"
            ><text>你记得什么？（必填）</text
            ><textarea
              v-model="form.body"
              aria-label="记忆内容"
              maxlength="5000"
              :placeholder="'一句关于' + app.current.name + '的话，或一件小事…'"
            />
          </label>
          <view class="memory-option-row">
            <view
              ><strong>让 TA 在对话中记得</strong
              ><small>用于更贴近 TA 的回应，可随时关闭</small></view
            >
            <button
              role="switch"
              class="yh-switch"
              :class="{ active: memoryUseForAi }"
              :aria-checked="memoryUseForAi"
              aria-label="让 TA 在对话中记得这段记忆"
              @click="memoryUseForAi = !memoryUseForAi"
            />
          </view>
          <view
            v-if="!editingMemory && app.bootstrap?.features?.publicSquare"
            class="memory-option-row"
          >
            <view><strong>分享到萤火广场</strong><small>保存后提交审核，可随时撤回</small></view>
            <button
              role="switch"
              class="yh-switch"
              :class="{ active: form.public }"
              :aria-checked="form.public"
              aria-label="分享到萤火广场"
              @click="
                form.public = !form.public;
                if (!form.public) form.publicConsent = false;
              "
            />
          </view>
          <checkbox-group
            v-if="!editingMemory && form.public"
            @change="toggle('publicConsent', $event)"
          >
            <label class="check public-consent yh-share-consent"
              ><checkbox value="yes" :checked="form.publicConsent" /><text
                >我确认有权公开这些内容。广场只显示公开副本，私密对话和其他记忆不会展示。</text
              ></label
            >
          </checkbox-group>
          <small v-if="!editingMemory && form.public && form.body.length > 3000" class="danger-text"
            >广场副本最多 3000 字；可以缩短内容，或改为仅自己可见后保存完整记忆。</small
          >
          <view class="editor-actions">
            <view v-if="app.error" class="notice error" role="alert"
              >{{ app.error }} 内容还在，可以重试。</view
            >
            <view v-if="app.status" class="caption" role="status">{{ app.status }}</view>
            <small class="draft-status" role="status">{{ draftStatus }}</small>
            <button
              role="button"
              class="btn"
              :disabled="
                app.busy ||
                !form.body.trim() ||
                (!editingMemory && form.public && (!form.publicConsent || form.body.length > 3000))
              "
              @click="memorySave"
              :aria-disabled="
                app.busy ||
                !form.body.trim() ||
                (!editingMemory && form.public && (!form.publicConsent || form.body.length > 3000))
              "
            >
              {{
                app.busy
                  ? '正在保存…'
                  : editingMemory
                    ? '保存修改'
                    : form.public
                      ? '保存并申请公开'
                      : '保存记忆'
              }}
            </button>
          </view>
        </template>
        <button role="button" v-else class="btn" @click="start">先选一位重要的人</button>
      </template>
      <template v-else-if="page === 'memory'">
        <template v-if="selectedMemory"
          ><view class="memory-sheet">
            <text class="badge">{{ app.current?.name }} · 仅自己可见</text>
            <view
              v-if="query?.saved === '1' && (query?.shared === '1' || query?.shareFailed === '1')"
              class="save-toast"
              role="status"
            >
              {{ query?.shared === '1' ? '公开副本已提交审核。' : '公开副本暂未提交。' }}
            </view>
            <view v-if="query?.shareFailed === '1'" class="notice error" role="alert"
              >私密记忆没有丢失，也不会重复保存。网络恢复后，可在下方重新提交公开副本。</view
            >
            <h1>{{ selectedMemory.title }}</h1>
            <p class="prose">{{ selectedMemory.body }}</p>
            <small class="memory-meta">{{
              new Date(selectedMemory.createdAt).toLocaleDateString('zh-CN')
            }}</small>
          </view>
          <button
            role="button"
            class="btn"
            @click="go('memory-edit', '?id=' + selectedMemory.id + '&profileId=' + app.currentId)"
          >
            编辑这段记忆
          </button>
          <button
            role="button"
            v-if="app.bootstrap?.features?.publicSquare"
            class="btn secondary"
            @click="shareCurrentMemory"
          >
            {{ query?.shareFailed === '1' ? '重试公开到广场' : '公开到广场' }}
          </button>
          <button
            role="button"
            class="text-button danger-text"
            :disabled="app.busy"
            @click="confirmDeleteMemory"
            :aria-disabled="app.busy"
          >
            {{ app.busy ? '正在删除…' : '删除这段记忆' }}
          </button></template
        ><view v-else class="empty"
          ><h2>这段记忆暂时找不到</h2>
          <button role="button" class="btn secondary" @click="go('memories')">
            返回记忆库
          </button></view
        >
      </template>
      <template v-else-if="page === 'chat'">
        <template v-if="!chatConversation">
          <view v-if="app.profiles.length" class="chat-root-intro">
            <view
              ><h1>想和谁聊聊？</h1>
              <p>选择你想念的人。进入对话，TA 会一直在这里陪着你。</p></view
            >
          </view>
          <view v-if="app.profiles.length" class="chat-profile-list">
            <view v-for="p in app.profiles" :key="p.id" class="chat-profile-item">
              <button
                role="button"
                class="chat-profile-row"
                :disabled="!chatAvailable"
                :aria-label="'和' + p.name + '聊聊'"
                @click="openProfileChat(p.id)"
              >
                <image
                  v-if="p.avatarUrl"
                  class="profile-avatar chat-profile-avatar"
                  :src="p.avatarUrl"
                  mode="aspectFill"
                  :aria-label="p.name + '的头像'"
                />
                <view v-else class="profile-avatar fallback chat-profile-avatar">{{
                  profileInitial(p)
                }}</view>
                <view class="chat-profile-copy"
                  ><view
                    ><strong>{{ p.name }}</strong
                    ><small>AI 模拟对话</small></view
                  >
                  <p>{{ p.story || '继续你们的对话，或从一件小事慢慢聊起。' }}</p></view
                >
              </button>
              <button
                role="button"
                class="chat-profile-edit"
                :aria-label="'编辑' + p.name + '的人物资料'"
                @click="go('create', '?edit=1&profileId=' + encodeURIComponent(p.id))"
              >
                <AppIcon name="edit" /><text>资料</text>
              </button>
            </view>
            <button role="button" class="chat-profile-row add-profile-row" @click="go('create')">
              <view class="profile-avatar fallback chat-profile-avatar add"
                ><AppIcon name="plus"
              /></view>
              <view class="chat-profile-copy"
                ><strong>添加想念的人</strong>
                <p>创建一段新的萤火空间</p></view
              >
            </button>
          </view>
          <view v-else class="empty chat-root-empty page-empty">
            <view class="sprite mascot empty-mascot" aria-hidden="true" />
            <h2>先添加一位想念的人</h2>
            <p>称呼和一句小事，就能创建新的萤火空间。</p>
            <button role="button" class="btn" @click="go('create')">添加人物</button>
            <p v-if="!chatAvailable" class="chat-root-note">对话功能即将开放</p>
            <p v-else class="chat-root-note">回复会以 TA 的口吻生成</p>
          </view>
        </template>
        <template v-else-if="chatAvailable && app.current">
          <view class="chat-layout conversation-layout">
            <view id="chat-thread" class="chat-thread conversation-thread">
              <button
                v-if="app.messagesHasMore"
                role="button"
                class="chat-load-older"
                :disabled="app.messagesLoadingOlder"
                @click="app.fetchOlderMessages()"
              >
                {{ app.messagesLoadingOlder ? '正在加载…' : '查看更早的对话' }}
              </button>
              <view v-if="!realChatMessages.length" class="chat-day">今天</view>
              <view
                v-if="!realChatMessages.length && !pendingChatText && !pendingChatPhoto"
                class="message-row welcome-message"
              >
                <image
                  v-if="app.current.avatarUrl"
                  class="profile-avatar chat-avatar"
                  :src="app.current.avatarUrl"
                  mode="aspectFill"
                  :aria-label="app.current.name + '的头像'"
                /><view
                  v-else
                  class="profile-avatar fallback chat-avatar"
                  :aria-label="app.current.name + '的头像'"
                  >{{ profileInitial(app.current) }}</view
                >
                <view class="bubble">{{
                  app.current.callMe
                    ? app.current.callMe + '，今天怎么想起我啦？'
                    : '今天怎么想起我啦？慢慢说，我在听。'
                }}</view>
              </view>
              <view class="chat-list" aria-live="polite">
                <template v-for="(message, messageIndex) in realChatMessages" :key="message.id">
                  <view v-if="chatMessageTimeLabel(messageIndex)" class="chat-day message-time">{{
                    chatMessageTimeLabel(messageIndex)
                  }}</view>
                  <view class="message-row" :class="{ user: message.role === 'user' }">
                    <image
                      v-if="message.role === 'assistant' && app.current.avatarUrl"
                      class="profile-avatar chat-avatar"
                      :src="app.current.avatarUrl"
                      mode="aspectFill"
                      :aria-label="app.current.name + '的头像'"
                    /><view
                      v-else-if="message.role === 'assistant'"
                      class="profile-avatar fallback chat-avatar"
                      :aria-label="app.current.name + '的头像'"
                      >{{ profileInitial(app.current) }}</view
                    >
                    <view class="message-content" :class="{ user: message.role === 'user' }">
                      <template v-if="message.role === 'assistant'">
                        <view
                          v-for="(segment, segmentIndex) in splitAssistantMessage(message.text)"
                          :key="message.id + '-segment-' + segmentIndex"
                          class="bubble assistant-segment"
                          ><text>{{ segment }}</text></view
                        >
                      </template>
                      <view
                        v-else
                        class="bubble user"
                        role="button"
                        tabindex="0"
                        :aria-expanded="activeMessageActionId === message.id"
                        :aria-label="
                          (message.imageUrl ? '照片，' : '') +
                          (message.text || '') +
                          '，点按显示消息操作'
                        "
                        @click="toggleMessageActions(message.id)"
                        @longpress="toggleMessageActions(message.id)"
                        @keydown.enter="toggleMessageActions(message.id)"
                      >
                        <image
                          v-if="message.imageUrl"
                          class="chat-message-photo"
                          :src="message.imageUrl"
                          mode="aspectFit"
                          aria-label="聊天中发送的照片"
                        />
                        <text v-if="message.text">{{ message.text }}</text>
                      </view>
                      <button
                        v-if="
                          message.role === 'user' &&
                          message.text &&
                          activeMessageActionId === message.id
                        "
                        role="button"
                        class="chat-memory-save"
                        :disabled="app.busy || chatMessageAlreadySaved(message.text)"
                        :aria-disabled="app.busy || chatMessageAlreadySaved(message.text)"
                        @click.stop="saveChatMessageAsMemory(message.text)"
                      >
                        {{
                          chatMessageAlreadySaved(message.text)
                            ? '已保存为记忆'
                            : '保存这句话为记忆'
                        }}
                      </button>
                    </view>
                  </view>
                </template>
                <view
                  v-if="pendingChatText || pendingChatPhoto"
                  class="message-row user pending-message"
                  ><view class="message-content user"
                    ><view class="bubble user"
                      ><image
                        v-if="pendingChatPhoto"
                        class="chat-message-photo"
                        :src="pendingChatPhoto"
                        mode="aspectFit"
                        aria-label="正在发送的照片"
                      /><text v-if="pendingChatText">{{ pendingChatText }}</text></view
                    ></view
                  ></view
                >
                <view v-if="chatReplyPending" class="message-row typing-row" role="status">
                  <image
                    v-if="app.current.avatarUrl"
                    class="profile-avatar chat-avatar"
                    :src="app.current.avatarUrl"
                    mode="aspectFill"
                    :aria-label="app.current.name + '的头像'"
                  /><view
                    v-else
                    class="profile-avatar fallback chat-avatar"
                    :aria-label="app.current.name + '的头像'"
                    >{{ profileInitial(app.current) }}</view
                  >
                  <view
                    class="bubble typing-bubble"
                    :aria-label="app.current.name + '的回复正在生成'"
                    ><view class="typing-dots" aria-hidden="true"><text /><text /><text /></view
                  ></view>
                </view>
              </view>
              <view
                v-if="safetyCheckActive"
                class="safety-quick-actions"
                role="group"
                aria-label="安全状态快捷回复"
              >
                <button role="button" :disabled="app.busy" @click="sendSafetyAnswer('现在安全')">
                  我现在安全
                </button>
                <button role="button" :disabled="app.busy" @click="sendSafetyAnswer('正在危险中')">
                  我正在危险中
                </button>
                <button role="button" class="support-call" @click="callEmergencySupport">
                  拨打 12356
                </button>
              </view>
              <view id="chat-end" class="chat-end" aria-hidden="true" />
            </view>
            <view class="chat-composer conversation-composer">
              <view v-if="activeChatPanel === 'tools'" class="chat-tools-panel chat-action-panel">
                <view class="chat-action-grid">
                  <button
                    role="button"
                    :disabled="chatPhotoProcessing"
                    @click="chooseChatPhoto('album')"
                  >
                    <view class="chat-action-icon"><AppIcon name="photo" /></view>
                    <text>{{ chatPhotoProcessing ? '处理中…' : '照片' }}</text>
                  </button>
                  <button
                    role="button"
                    :disabled="chatPhotoProcessing"
                    @click="chooseChatPhoto('camera')"
                  >
                    <view class="chat-action-icon"><AppIcon name="camera" /></view>
                    <text>{{ chatPhotoProcessing ? '处理中…' : '拍摄' }}</text>
                  </button>
                  <button role="button" @click="openChatMemoryPanel">
                    <view class="chat-action-icon"><AppIcon name="book" /></view>
                    <text>人物记忆</text>
                  </button>
                </view>
              </view>
              <view v-else-if="activeChatPanel === 'emoji'" class="chat-tools-panel emoji-panel">
                <button
                  v-for="name in commonEmojis"
                  :key="name"
                  role="button"
                  :aria-label="'插入' + name + '表情'"
                  @click="appendEmoji(name)"
                >
                  {{ emojiCharacters[name] }}
                </button>
              </view>
              <view v-else-if="activeChatPanel === 'memories'" class="chat-tools-panel">
                <view class="chat-tools-heading">
                  <view
                    ><strong>本次对话参考</strong
                    ><small>{{
                      selectedChatMemories.length
                        ? '已选择 ' + selectedChatMemories.length + ' 条，最多 5 条'
                        : '没有选择时，回应会更日常'
                    }}</small></view
                  >
                  <button
                    role="button"
                    class="panel-close"
                    aria-label="关闭人物记忆"
                    @click="activeChatPanel = 'none'"
                  >
                    <AppIcon name="close" />
                  </button>
                </view>
                <view class="chips"
                  ><button
                    role="button"
                    v-for="memory in app.memories"
                    :key="memory.id"
                    class="chip"
                    :class="{ active: selectedChatMemories.includes(memory.id) }"
                    :aria-pressed="selectedChatMemories.includes(memory.id)"
                    @click="toggleChatMemory(memory.id)"
                  >
                    {{ memory.title }}
                  </button></view
                >
                <p v-if="!app.memories.length" class="caption">
                  萤火会根据你提供的记忆，慢慢了解 TA。
                </p>
              </view>
              <view v-if="chatPhotoDraft" class="chat-photo-draft">
                <image :src="chatPhotoDraft" mode="aspectFit" aria-label="待发送的照片" />
                <view
                  ><strong>照片已准备好</strong
                  ><small>{{
                    chatText ? '会连同你的说明一起发送' : '可以直接发送，也可以补充一句说明'
                  }}</small></view
                >
                <button
                  role="button"
                  class="panel-close"
                  aria-label="移除待发送照片"
                  @click="chatPhotoDraft = ''"
                >
                  <AppIcon name="close" />
                </button>
              </view>
              <view v-if="app.error" class="notice error" role="alert"
                >{{ app.error }} 输入内容已保留，可以重试。</view
              >
              <view v-if="app.status" class="caption" role="status">{{ app.status }}</view>
              <view class="chat-input">
                <button
                  role="button"
                  class="chat-mode-button"
                  :aria-label="chatInputMode === 'voice' ? '切换到文字输入' : '切换到语音输入'"
                  @click="chatInputMode = chatInputMode === 'voice' ? 'text' : 'voice'"
                >
                  <AppIcon :name="chatInputMode === 'voice' ? 'keyboard' : 'mic'" />
                </button>
                <input
                  v-if="chatInputMode === 'text'"
                  v-model="chatText"
                  :aria-label="'想对' + app.current.name + '说的话'"
                  maxlength="500"
                  :placeholder="
                    chatPhotoDraft ? '补充照片里的故事…' : '想对' + app.current.name + '说点什么…'
                  "
                  @focus="onChatFocus"
                  @confirm="sendChat"
                />
                <button
                  v-else
                  role="button"
                  class="hold-to-talk"
                  :class="{ listening: voiceListening }"
                  :aria-label="voiceListening ? '松开结束语音识别' : '按住进行语音识别'"
                  @mousedown.prevent="startVoiceInput"
                  @mouseup.prevent="stopVoiceInput"
                  @mouseleave="voiceListening && stopVoiceInput()"
                  @touchstart.prevent="startVoiceInput"
                  @touchend.prevent="stopVoiceInput"
                  @touchcancel.prevent="cancelVoiceInput"
                >
                  {{ voiceListening ? voiceTranscript || '正在听…' : '按住 说话' }}
                </button>
                <button
                  role="button"
                  class="chat-emoji-button"
                  :class="{ active: activeChatPanel === 'emoji' }"
                  aria-label="选择表情"
                  :aria-expanded="activeChatPanel === 'emoji'"
                  @click="toggleChatPanel('emoji')"
                >
                  <AppIcon name="smile" />
                </button>
                <button
                  v-if="chatText.trim() || chatPhotoDraft"
                  role="button"
                  class="send-button"
                  aria-label="发送消息"
                  :disabled="app.busy"
                  @click="sendChat"
                  :aria-disabled="app.busy"
                >
                  <AppIcon name="send" />
                </button>
                <button
                  v-else
                  role="button"
                  class="chat-tools-button"
                  :class="{ active: activeChatPanel === 'tools' }"
                  aria-label="更多聊天功能"
                  :aria-expanded="activeChatPanel === 'tools'"
                  @click="toggleChatPanel('tools')"
                >
                  <AppIcon name="plus" />
                </button>
              </view>
              <small v-if="localDraftError" class="composer-hint"
                >本机暂存失败，请复制输入内容后再离开。</small
              >
              <small v-else-if="chatText" class="composer-hint"
                >输入内容已暂存本机，尚未发送。</small
              >
            </view>
          </view>
        </template>
        <view v-else class="empty page-empty"
          ><h2>记忆对话暂时无法使用</h2>
          <p>先留下一条记忆，稍后再来聊。</p>
          <button role="button" class="btn" @click="go('home')">返回首页</button></view
        >
      </template>
      <template v-else-if="page === 'restore'">
        <h1 class="sr-only">让旧照片，重新清晰。</h1>
        <p class="caption">照片修复正在准备。现在只支持在本机预览一张照片。</p>
        <image
          v-if="preview"
          :src="preview"
          class="uploaded"
          mode="aspectFit"
          aria-label="本机照片预览"
        /><view v-else class="sprite mother photo" />
        <button role="button" class="btn secondary" @click="choosePhoto">
          选择照片 · 仅本机查看</button
        ><view class="notice">不会上传照片，也不会生成修复结果或产生费用。</view>
      </template>
      <template v-else-if="page === 'plans'">
        <h1 class="sr-only">服务方案</h1>
        <p class="caption">现在可以免费体验文字记忆；付费服务尚未开放。</p>
        <view class="card"
          ><h2>基础空间</h2>
          <text class="price">¥0</text>
          <p>现在可体验：创建 TA、保存私密文字记忆、写故事。</p>
          <small>当前设备登录通常保留 30 天；设置找回密码后可跨设备找回。</small></view
        >
        <view class="card highlight"
          ><text class="badge">尚未开放</text>
          <h2>记忆年费</h2>
          <text class="price">¥99<small> / 年 · 每位 TA</small></text
          ><view class="benefits"
            ><p>计划提供每位 TA 5GB 素材空间</p>
            <p>计划支持照片、声音和更多家庭故事</p>
            <p>以正式上线时展示的权益与价格为准</p></view
          ><button role="button" class="btn secondary" @click="go('home')">
            去记录一段文字记忆
          </button></view
        >
        <view class="notice"
          >本页展示的是拟定价格，不收款；服务开放时会再次说明最终价格和权益。</view
        >
      </template>
      <template v-else-if="page === 'orders'">
        <h1 class="sr-only">订单</h1>
        <view class="empty"><p>目前没有可购买的服务。</p></view>
      </template>
      <template v-else-if="page === 'square'">
        <view v-if="app.publicPosts.length" class="square-welcome">
          <strong>他们永远在你心里</strong>
          <p>在这里，把想念写下来，让微光彼此照亮。</p>
        </view>
        <view class="square-feed" aria-label="广场动态">
          <view
            v-for="story in app.publicPosts"
            :key="story.id"
            class="square-story"
            :class="{ 'official-story': story.isOfficial }"
          >
            <view class="square-author">
              <view
                v-if="story.isOfficial"
                class="profile-avatar square-ip-avatar"
                role="img"
                aria-label="萤火故事馆 IP 头像"
              />
              <image
                v-else-if="story.authorAvatarUrl"
                :src="story.authorAvatarUrl"
                class="profile-avatar"
                mode="aspectFill"
                :lazy-load="true"
                :aria-label="storyAuthor(story) + '的头像'"
              />
              <view v-else class="profile-avatar fallback">{{ storyAvatar(story) }}</view>
              <view class="square-author-copy">
                <view class="square-author-name">
                  <strong>{{ storyAuthor(story) }}</strong>
                  <text v-if="story.isOfficial" class="square-official-badge">萤火故事</text>
                </view>
                <small>{{ storyMemorialLabel(story) }} · {{ storyMeta(story) }}</small>
              </view>
            </view>
            <button
              role="button"
              class="square-story-open"
              :aria-label="'查看动态：' + story.title"
              @click="openStory(story.id)"
            >
              <p v-if="story.body" class="square-post-body">{{ story.body }}</p>
              <text v-if="story.body.length > 150" class="square-read-more">展开</text>
              <view
                v-if="story.media?.length"
                class="square-media-grid"
                :class="'count-' + Math.min(story.media.length, 4)"
              >
                <image
                  v-for="(photo, photoIndex) in story.media.slice(0, 9)"
                  :key="story.id + '-photo-' + photoIndex"
                  :src="photo"
                  :mode="story.media.length === 1 ? 'widthFix' : 'aspectFit'"
                  :lazy-load="true"
                  :aria-label="`动态照片 ${photoIndex + 1}`"
                />
              </view>
            </button>
            <view v-if="story.commentPreview?.length" class="square-comment-preview">
              <button
                v-for="comment in story.commentPreview"
                :key="comment.id"
                role="button"
                @click="openSquareComments(story.id)"
              >
                <strong>{{ comment.authorName }}</strong>
                <text v-if="comment.replyToName"> 回复 {{ comment.replyToName }}</text>
                <text>：{{ comment.body }}</text>
              </button>
              <button
                v-if="(story.commentCount || 0) > story.commentPreview.length"
                role="button"
                class="square-all-comments"
                @click="openSquareComments(story.id)"
              >
                查看全部 {{ story.commentCount }} 条留言
              </button>
            </view>
            <view class="square-story-actions" aria-label="故事互动">
              <button
                role="button"
                class="square-action"
                :class="{
                  active: story.viewerHasLit,
                  'is-loading': lightingStoryId === story.id,
                }"
                :aria-pressed="story.viewerHasLit"
                :disabled="lightingStoryId === story.id"
                @click="toggleStoryLight(story)"
              >
                <AppIcon name="heart" />
                <text>{{ storyLightLabel(story) }}</text>
              </button>
              <button
                role="button"
                class="square-action"
                :aria-label="'给这条动态留言'"
                @click="openSquareComments(story.id)"
              >
                <AppIcon name="chat" />
                <text>留言 {{ story.commentCount || 0 }}</text>
              </button>
            </view>
          </view>
          <view v-if="!app.publicPosts.length" class="empty square-empty">
            <h2>广场还在等第一束萤火</h2>
            <p>写下一句话或放上一张照片，就能留下第一份想念。</p>
            <button role="button" class="btn" @click="openSquareComposer">发布第一份纪念</button>
          </view>
        </view>
        <button
          v-if="app.publicPosts.length && app.publicPostsHasMore"
          role="button"
          class="btn secondary square-load-more"
          :disabled="app.publicPostsLoadingMore"
          @click="app.fetchPublicPosts(false)"
        >
          {{ app.publicPostsLoadingMore ? '正在加载…' : '查看更多故事' }}
        </button>
        <button
          role="button"
          v-if="app.publicPosts.length"
          class="square-fab"
          :disabled="squareComposerOpening"
          :aria-disabled="squareComposerOpening"
          @click="openSquareComposer"
        >
          <AppIcon name="edit" /><text>{{ squareComposerOpening ? '正在准备' : '发布纪念' }}</text>
        </button>
        <view v-if="app.publicPosts.length" class="square-privacy-note"
          ><AppIcon name="lock" /><text>只展示主动公开并过审的内容。</text></view
        >
        <view
          v-if="squareCommentSheetOpen"
          class="square-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="square-comments-title"
          @click.self="closeSquareComments"
        >
          <view class="square-comment-sheet">
            <view class="square-sheet-heading">
              <view
                ><h2 id="square-comments-title">留言</h2>
                <small>{{ activeSquareComments.length }} 条</small></view
              >
              <button
                role="button"
                class="icon-button"
                aria-label="关闭留言"
                @click="closeSquareComments"
              >
                <AppIcon name="close" />
              </button>
            </view>
            <view v-if="activeSquareComments.length" class="square-sheet-comments">
              <view
                v-for="comment in activeSquareComments"
                :key="comment.id"
                role="button"
                tabindex="0"
                class="square-sheet-comment"
                :aria-label="'回复' + comment.authorName"
                @click="chooseReply(comment)"
                @keydown.enter="chooseReply(comment)"
                @longpress.stop="manageComment(comment)"
              >
                <image
                  v-if="comment.authorAvatarUrl"
                  :src="comment.authorAvatarUrl"
                  class="profile-avatar"
                  mode="aspectFill"
                  :lazy-load="true"
                  :aria-label="comment.authorName + '的头像'"
                />
                <view v-else class="profile-avatar fallback">{{
                  comment.isMine ? '我' : '萤'
                }}</view>
                <view>
                  <strong>{{ comment.authorName }}</strong>
                  <p>
                    <text v-if="comment.replyToName">回复 {{ comment.replyToName }}：</text
                    >{{ comment.body }}
                  </p>
                  <small>{{ squareDate(comment.createdAt) }} · 回复</small>
                  <small v-if="comment.moderation === 'pending'" class="comment-pending"
                    >审核中 · 仅你可见</small
                  >
                  <button
                    v-if="comment.canDelete || comment.canHide || comment.canReport"
                    role="button"
                    class="comment-more"
                    aria-label="留言操作"
                    @click.stop="manageComment(comment)"
                  >
                    操作
                  </button>
                </view>
              </view>
            </view>
            <view v-else-if="app.busy" class="square-sheet-loading">正在打开留言…</view>
            <view v-else class="square-sheet-empty">还没有留言，留下第一句温柔的话吧。</view>
            <view class="square-comment-composer">
              <view v-if="replyTarget" class="square-replying">
                正在回复 {{ replyTarget.name }}
                <button role="button" aria-label="取消回复" @click="replyTarget = null">
                  <AppIcon name="close" />
                </button>
              </view>
              <view class="square-comment-input-row">
                <input
                  id="square-comment-input"
                  v-model="storyCommentText"
                  maxlength="300"
                  :placeholder="replyTarget ? '回复 ' + replyTarget.name : '留下一句理解或祝福'"
                  aria-label="写下留言"
                  confirm-type="send"
                  @confirm="submitSquareComment"
                />
                <button
                  role="button"
                  class="square-comment-send"
                  :disabled="app.busy || !storyCommentText.trim()"
                  :aria-disabled="app.busy || !storyCommentText.trim()"
                  @click="submitSquareComment"
                >
                  发送
                </button>
              </view>
            </view>
          </view>
        </view>
      </template>
      <template v-else-if="page === 'shares'">
        <p class="caption shares-lead">公开、审核中和仅自己可见的内容都在这里管理。</p>
        <view v-if="myShares.length" class="shares-list">
          <button
            v-for="post in myShares"
            :key="post.id"
            role="button"
            class="square-story mine-story"
            @click="go('story', '?id=' + post.id)"
          >
            <view class="square-author">
              <image
                aria-hidden="true"
                v-if="post.authorAvatarUrl"
                :src="post.authorAvatarUrl"
                class="profile-avatar"
                mode="aspectFill"
                :lazy-load="true"
              />
              <view v-else class="profile-avatar fallback">{{
                post.profileRelationship?.slice(0, 1) || '我'
              }}</view>
              <view class="square-author-copy">
                <strong>{{ storyMemorialLabel(post) }}</strong
                ><small>{{ squareDate(post.createdAt) }}</small>
              </view>
            </view>
            <text class="share-status" :class="post.moderation">{{ postStatus(post) }}</text>
            <p v-if="post.body">{{ post.body }}</p>
            <view v-if="post.media?.length" class="square-media-grid count-1">
              <image :src="post.media[0]" mode="widthFix" :lazy-load="true" aria-label="发布照片" />
            </view>
            <small v-if="post.moderation === 'rejected' && post.moderationReason">{{
              post.moderationReason
            }}</small>
          </button>
        </view>
        <view v-else class="empty square-my-empty">
          <h2>还没有发布内容</h2>
          <p>可以直接写一句话，也可以从已有记忆中带入内容。</p>
          <button role="button" class="btn" @click="openSquareComposer">发布第一份纪念</button>
        </view>
      </template>
      <template v-else-if="page === 'story'">
        <view v-if="selectedSample"
          ><view class="sprite flowers photo story-cover" /><text class="badge"
            >写作示例 · 非真实用户</text
          >
          <h1>{{ selectedSample.title }}</h1>
          <p class="prose">{{ selectedSample.body }}</p></view
        >
        <view v-else-if="selectedPost" class="story-detail">
          <view class="story-sheet">
            <view class="story-detail-author">
              <view
                v-if="selectedPost.isOfficial"
                class="profile-avatar square-ip-avatar"
                role="img"
                aria-label="萤火故事馆 IP 头像"
              />
              <image
                v-else-if="selectedPost.authorAvatarUrl"
                :src="selectedPost.authorAvatarUrl"
                class="profile-avatar"
                mode="aspectFill"
                :aria-label="storyAuthor(selectedPost) + '的头像'"
              />
              <view v-else class="profile-avatar fallback">{{ storyAvatar(selectedPost) }}</view>
              <view
                ><strong>{{ storyAuthor(selectedPost) }}</strong
                ><small
                  >{{ storyMemorialLabel(selectedPost) }} · {{ storyMeta(selectedPost) }}</small
                ></view
              >
            </view>
            <text class="badge">{{ postStatus(selectedPost) }}</text>
            <p class="prose story-detail-body">{{ selectedPost.body }}</p>
            <view
              v-if="selectedPost.media?.length"
              class="square-media-grid story-media-grid"
              :class="'count-' + Math.min(selectedPost.media.length, 4)"
            >
              <image
                v-for="(photo, photoIndex) in selectedPost.media"
                :key="selectedPost.id + '-detail-photo-' + photoIndex"
                :src="photo"
                :mode="selectedPost.media.length === 1 ? 'widthFix' : 'aspectFit'"
                :lazy-load="true"
                :aria-label="`纪念照片 ${photoIndex + 1}`"
              />
            </view>
            <view
              v-if="selectedPost.moderation === 'rejected' && selectedPost.moderationReason"
              class="notice error"
            >
              {{ selectedPost.moderationReason }}
            </view>
          </view>
          <template v-if="selectedPostIsInteractive">
            <view class="story-social-bar" aria-label="故事互动">
              <button
                role="button"
                class="square-action"
                :class="{
                  active: selectedPost.viewerHasLit,
                  'is-loading': lightingStoryId === selectedPost.id,
                }"
                :aria-pressed="selectedPost.viewerHasLit"
                :disabled="lightingStoryId === selectedPost.id"
                @click="toggleStoryLight(selectedPost)"
              >
                <AppIcon name="heart" />
                <text>{{ storyLightLabel(selectedPost) }}</text>
              </button>
              <button role="button" class="square-action" @click="focusStoryComment">
                <AppIcon name="chat" />
                <text>留言 {{ selectedPost.commentCount || 0 }}</text>
              </button>
            </view>
            <view class="story-comments">
              <view class="story-comments-title"
                ><h2>大家的留言</h2>
                <small>{{ selectedStoryComments.length }} 条</small></view
              >
              <view v-if="selectedStoryComments.length" class="story-comment-list">
                <view
                  v-for="comment in selectedStoryComments"
                  :key="comment.id"
                  class="story-comment"
                >
                  <image
                    v-if="comment.authorAvatarUrl"
                    :src="comment.authorAvatarUrl"
                    class="profile-avatar"
                    mode="aspectFill"
                    :lazy-load="true"
                    :aria-label="comment.authorName + '的头像'"
                  />
                  <view v-else class="profile-avatar fallback">{{
                    comment.isMine ? '我' : '萤'
                  }}</view>
                  <view
                    ><strong>{{ comment.authorName }}</strong>
                    <small v-if="comment.moderation === 'pending'" class="comment-pending"
                      >审核中 · 仅你可见</small
                    >
                    <p>
                      <text v-if="comment.replyToName">回复 {{ comment.replyToName }}：</text
                      >{{ comment.body }}
                    </p>
                    <button role="button" class="story-reply-button" @click="chooseReply(comment)">
                      回复
                    </button>
                    <button
                      v-if="comment.canDelete || comment.canHide || comment.canReport"
                      role="button"
                      class="story-reply-button"
                      @click="manageComment(comment)"
                    >
                      操作
                    </button></view
                  >
                </view>
              </view>
              <p v-else class="story-comments-empty">还没有留言，留下第一句温柔的话吧。</p>
              <label class="field story-comment-field">
                <text>{{ replyTarget ? '回复 ' + replyTarget.name : '写下留言' }}</text>
                <textarea
                  id="story-comment-input"
                  v-model="storyCommentText"
                  maxlength="300"
                  aria-label="写下故事留言"
                  placeholder="一句共鸣或祝福就很好"
                />
              </label>
              <view class="story-comment-submit">
                <small>{{ storyCommentText.length }}/300</small>
                <button
                  role="button"
                  class="btn"
                  :disabled="app.busy || !storyCommentText.trim()"
                  :aria-disabled="app.busy || !storyCommentText.trim()"
                  @click="submitStoryComment"
                >
                  {{ app.busy ? '正在发布…' : '发布留言' }}
                </button>
              </view>
            </view>
          </template>
          <template v-if="ownsSelectedPost">
            <button role="button" class="btn secondary" @click="editStory">编辑这个故事</button>
            <button
              role="button"
              class="text-button danger-text"
              :disabled="app.busy"
              @click="confirmDeleteStory"
              :aria-disabled="app.busy"
            >
              删除这个故事
            </button>
          </template> </view
        ><view v-else class="notice">故事不存在或当前账号不可访问。</view>
      </template>
      <template v-else-if="page === 'compose'">
        <template v-if="app.session.userId">
          <p class="caption publish-lead">一句话、一张照片，都可以成为被记住的片段。</p>
          <button
            role="button"
            class="publish-person-row"
            :disabled="editingStory"
            :aria-disabled="editingStory"
            @click="publishProfilePickerOpen = !editingStory"
          >
            <image
              aria-hidden="true"
              v-if="app.current?.avatarUrl"
              :src="app.current.avatarUrl"
              class="profile-avatar"
              mode="aspectFill"
            />
            <view v-else class="profile-avatar fallback">{{
              app.current ? profileInitial(app.current) : '萤'
            }}</view>
            <view>
              <small>写给</small>
              <strong>{{ app.current?.name || '选择一位重要的人' }}</strong>
            </view>
            <text v-if="!editingStory">更换人物</text>
          </button>
          <view class="publish-editor">
            <textarea
              v-model="form.body"
              aria-label="纪念正文"
              maxlength="3000"
              placeholder="有什么话想与 Ta 说……"
            />
            <small>{{ form.body.length }}/3000</small>
          </view>
          <view class="publish-photos">
            <view v-if="storyImages.length" class="publish-photo-grid">
              <view
                v-for="(photo, photoIndex) in storyImages"
                :key="'draft-photo-' + photoIndex"
                class="publish-photo-item"
              >
                <image :src="photo" mode="aspectFit" :aria-label="`待发布照片 ${photoIndex + 1}`" />
                <button
                  role="button"
                  :aria-label="`删除第 ${photoIndex + 1} 张照片`"
                  @click="removeStoryPhoto(photoIndex)"
                >
                  <AppIcon name="close" />
                </button>
              </view>
              <button
                v-if="storyImages.length < 9"
                role="button"
                class="publish-photo-add in-grid"
                :disabled="storyPhotoProcessing || app.busy"
                :aria-disabled="storyPhotoProcessing || app.busy"
                @click="chooseStoryPhotos"
              >
                <AppIcon name="plus" />
                <small>{{ storyImages.length }}/9</small>
              </button>
            </view>
            <button
              v-if="!storyImages.length"
              role="button"
              class="publish-photo-add"
              :disabled="storyPhotoProcessing || app.busy"
              :aria-disabled="storyPhotoProcessing || app.busy"
              @click="chooseStoryPhotos"
            >
              <AppIcon name="plus" />
              <text>{{
                storyPhotoProcessing
                  ? '正在处理 ' + storyPhotoProgress.done + '/' + storyPhotoProgress.total
                  : '添加照片'
              }}</text>
              <small>{{ storyImages.length }}/9</small>
            </button>
          </view>
          <button role="button" class="publish-import" @click="openSquareSharePicker">
            <AppIcon name="book" /><text>从已有记忆中带入文字</text>
          </button>
          <view class="publish-settings">
            <button
              v-if="app.bootstrap?.features?.publicSquare"
              role="button"
              @click="visibilityPickerOpen = true"
            >
              <text>可见范围</text><strong>{{ form.public ? '公开' : '仅自己可见' }}</strong>
            </button>
          </view>
          <view v-if="app.error" class="notice error" role="alert"
            >{{ app.error }} 内容已保留，可以重试。</view
          >
          <view v-if="app.status" class="caption" role="status">{{ app.status }}</view>
          <view class="publish-submit-area">
            <button
              role="button"
              class="btn"
              :disabled="
                app.busy ||
                storyPhotoProcessing ||
                (!form.body.trim() && !storyImages.length) ||
                !app.current
              "
              :aria-disabled="
                app.busy ||
                storyPhotoProcessing ||
                (!form.body.trim() && !storyImages.length) ||
                !app.current
              "
              @click="publish"
            >
              {{ app.busy ? '正在发布…' : editingStory ? '保存修改' : '发布纪念' }}
            </button>
            <small v-if="form.public">发布即确认有权分享；审核通过后进入广场。</small>
            <small v-else>仅自己可见，不会出现在广场。</small>
          </view>

          <view
            v-if="visibilityPickerOpen"
            class="square-sheet-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="visibility-title"
            @click.self="visibilityPickerOpen = false"
          >
            <view class="publish-choice-sheet">
              <h2 id="visibility-title">谁可以看到</h2>
              <button
                role="button"
                :class="{ active: form.public }"
                @click="
                  form.public = true;
                  form.publicConsent = true;
                  visibilityPickerOpen = false;
                "
              >
                <strong>公开</strong><small>审核通过后，广场中的用户都能看到</small>
              </button>
              <button
                role="button"
                :class="{ active: !form.public }"
                @click="
                  form.public = false;
                  form.publicConsent = false;
                  visibilityPickerOpen = false;
                "
              >
                <strong>仅自己可见</strong><small>保存在自己的记忆空间</small>
              </button>
              <button
                role="button"
                class="publish-sheet-cancel"
                @click="visibilityPickerOpen = false"
              >
                取消
              </button>
            </view>
          </view>

          <view
            v-if="publishProfilePickerOpen"
            class="square-sheet-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-profile-title"
            @click.self="publishProfilePickerOpen = false"
          >
            <view class="publish-choice-sheet">
              <view class="square-sheet-heading">
                <h2 id="publish-profile-title">选择纪念人物</h2>
                <button
                  role="button"
                  class="icon-button"
                  aria-label="关闭人物选择"
                  @click="publishProfilePickerOpen = false"
                >
                  <AppIcon name="close" />
                </button>
              </view>
              <button
                v-for="profile in app.profiles"
                :key="profile.id"
                role="button"
                class="publish-profile-option"
                :class="{ active: profile.id === app.currentId }"
                @click="selectPublishProfile(profile.id)"
              >
                <image
                  aria-hidden="true"
                  v-if="profile.avatarUrl"
                  :src="profile.avatarUrl"
                  class="profile-avatar"
                  mode="aspectFill"
                />
                <view v-else class="profile-avatar fallback">{{ profileInitial(profile) }}</view>
                <view
                  ><strong>{{ profile.name }}</strong
                  ><small v-if="profile.nickname">{{ profile.relationship }}</small></view
                >
                <i aria-hidden="true" />
              </button>
            </view>
          </view>

          <view
            v-if="squareSharePickerOpen"
            class="square-sheet-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="memory-import-title"
            @click.self="squareSharePickerOpen = false"
          >
            <view class="square-picker-sheet">
              <view class="square-picker-heading">
                <view
                  ><h2 id="memory-import-title">从记忆中带入</h2>
                  <p>
                    {{
                      app.current ? app.current.name + ' 的记忆，只带入文字' : '只带入文字'
                    }}，你仍可继续修改。
                  </p></view
                >
                <button
                  role="button"
                  class="icon-button"
                  aria-label="关闭记忆选择"
                  @click="squareSharePickerOpen = false"
                >
                  <AppIcon name="close" />
                </button>
              </view>
              <view v-if="importableMemories.length" class="square-picker-list">
                <button
                  v-for="memory in importableMemories"
                  :key="memory.id"
                  role="button"
                  class="square-picker-item"
                  @click="chooseSquareMemory(memory)"
                >
                  <small>{{ squareDate(memory.createdAt) }}</small>
                  <strong>{{ memory.title }}</strong>
                  <p>{{ memory.body }}</p>
                  <text>带入这段文字</text>
                </button>
              </view>
              <view v-else class="empty square-picker-empty">
                <h3>{{ app.current ? app.current.name + ' 还没有记忆' : '还没有可带入的记忆' }}</h3>
                <p>可以先直接写下这次想说的话。</p>
                <button role="button" class="btn secondary" @click="squareSharePickerOpen = false">
                  继续直接写
                </button>
              </view>
            </view>
          </view>
        </template>
        <button role="button" v-else class="btn" @click="go('login', '?next=compose')">
          进入自己的记忆空间
        </button>
      </template>
      <template v-else-if="page === 'profile'">
        <p class="caption">管理你的个人头像，以及在广场公开展示的昵称。</p>
        <view class="card profile-settings-card">
          <view class="profile-settings-heading">
            <image
              v-if="app.bootstrap?.userAvatarUrl"
              :src="app.bootstrap.userAvatarUrl"
              class="profile-avatar account-profile-avatar"
              mode="aspectFill"
              aria-label="我的个人头像"
            />
            <view v-else class="profile-avatar fallback account-profile-avatar">我</view>
            <view>
              <strong>个人头像</strong>
              <small>用于广场发布和留言</small>
            </view>
          </view>
          <view class="profile-settings-actions">
            <button
              role="button"
              class="btn secondary"
              :disabled="app.busy"
              @click="chooseAccountAvatar"
            >
              {{ app.bootstrap?.userAvatarUrl ? '更换头像' : '上传头像' }}
            </button>
            <button
              v-if="app.bootstrap?.userAvatarUrl"
              role="button"
              class="text-button"
              :disabled="app.busy"
              @click="removeAccountAvatar"
            >
              移除头像
            </button>
          </view>
        </view>
        <view class="card profile-settings-card">
          <view>
            <strong>广场昵称</strong>
            <small>只用于公开故事和留言，不会使用纪念人物的称呼。</small>
          </view>
          <label class="field profile-nickname-field">
            <text>昵称</text>
            <input
              v-model.trim="form.communityName"
              maxlength="20"
              aria-label="广场昵称"
              placeholder="萤火朋友"
              @confirm="saveCommunityName"
            />
          </label>
          <button
            role="button"
            class="btn"
            :disabled="
              app.busy || form.communityName.trim() === (app.bootstrap?.communityName || '')
            "
            @click="saveCommunityName"
          >
            {{ app.busy ? '正在保存…' : '保存昵称' }}
          </button>
        </view>
        <view v-if="app.status" class="notice" role="status">{{ app.status }}</view>
        <view v-if="app.error" class="notice error" role="alert">{{ app.error }}</view>
      </template>
      <template v-else-if="page === 'privacy'">
        <h1 class="sr-only">隐私与数据</h1>
        <p class="caption">你可以查看、导出或删除自己在萤火中的数据。</p>
        <view class="card legal-card">
          <h2>我们保存什么</h2>
          <p>你主动填写的人物资料、文字记忆、对话、故事和头像，以及用于保持登录的随机会话标识。</p>
          <p>
            如果绑定手机号，服务端只保存不可逆摘要和后四位。手机号只用于识别账号，找回时仍需输入找回密码。
          </p>
        </view>
        <view class="card legal-card">
          <h2>AI 如何使用数据</h2>
          <p>
            只有当你主动发送对话时，本次输入和对话页启用的最多 5
            条记忆才会用于生成模拟回应。系统会优先启用你允许用于对话的记忆，你可以在发送前调整。
          </p>
        </view>
        <view v-if="app.session.userId" class="card legal-card">
          <h2>你的数据权利</h2>
          <view v-if="isWeChat" class="notice"
            >微信内可能无法下载文件，请用系统浏览器打开本页后导出。</view
          >
          <button
            role="button"
            class="btn secondary"
            :disabled="app.busy"
            @click="downloadAccountExport"
            :aria-disabled="app.busy"
          >
            导出我的全部数据
          </button>
          <label class="field danger-zone">
            <text>清除个人内容并永久删除账号</text>
            <input
              v-model="form.deleteConfirmation"
              aria-label="输入永久删除以确认"
              placeholder="输入：永久删除"
            />
          </label>
          <button
            role="button"
            class="btn danger"
            :disabled="app.busy || form.deleteConfirmation.trim() !== '永久删除'"
            @click="confirmDeleteAccount"
            :aria-disabled="app.busy || form.deleteConfirmation.trim() !== '永久删除'"
          >
            永久删除账号
          </button>
        </view>
        <button role="button" class="btn secondary" @click="go('terms')">
          查看用户协议与 AI 说明
        </button>
      </template>
      <template v-else-if="page === 'terms'">
        <h1 class="sr-only">用户协议与 AI 说明</h1>
        <view class="card legal-card">
          <h2>这是 AI 模拟回应</h2>
          <p>
            萤火会根据你主动提供的资料与记忆，以 TA 的称呼和口吻生成回应。它不是真人，不代表 TA
            的真实意识，也无法证明 TA 现在的状态；生成内容可能不准确。
          </p>
        </view>
        <view class="card legal-card">
          <h2>安全边界</h2>
          <p>
            本服务不替代医疗、心理、法律或紧急援助。如果你正在面临伤害自己或他人的紧迫危险，请立即联系
            110、120 或身边可信赖的人；也可拨打全国统一心理援助热线 12356。
          </p>
        </view>
        <view class="card legal-card">
          <h2>公开内容</h2>
          <p>
            故事默认仅自己可见。选择公开时，你需确认拥有分享权限；内容通过自动检查后才会进入广场。
          </p>
        </view>
        <p class="caption legal-foot">2026年10月5日生效 · 萤火项目团队</p>
      </template>
      <template v-else-if="page === 'support'">
        <h1 class="sr-only">帮助与反馈</h1>
        <p class="caption">请描述遇到的问题或期望的改进，内容只用于处理本次反馈。</p>
        <view v-if="app.session.userId" class="card">
          <view class="chips">
            <button
              role="button"
              v-for="item in [
                { id: 'problem', label: '功能问题' },
                { id: 'suggestion', label: '产品建议' },
                { id: 'privacy', label: '隐私与数据' },
              ]"
              :key="item.id"
              class="chip"
              :class="{ active: form.feedbackCategory === item.id }"
              @click="form.feedbackCategory = item.id as typeof form.feedbackCategory"
            >
              {{ item.label }}
            </button>
          </view>
          <label class="field">
            <text>反馈内容</text>
            <textarea
              v-model="form.feedbackBody"
              aria-label="反馈内容"
              maxlength="2000"
              placeholder="发生了什么？你期望怎样改进？"
            />
          </label>
          <button
            role="button"
            class="btn"
            :disabled="app.busy || form.feedbackBody.trim().length < 2"
            @click="submitFeedback"
            :aria-disabled="app.busy || form.feedbackBody.trim().length < 2"
          >
            {{ app.busy ? '正在提交…' : '提交反馈' }}
          </button>
        </view>
        <button role="button" v-else class="btn" @click="go('login')">进入体验空间后反馈</button>
      </template>
      <template v-else-if="page === 'me'">
        <view class="me-profile-hero">
          <view class="me-profile-main">
            <button
              role="button"
              class="me-avatar-button"
              aria-label="上传或更换个人头像"
              @click="chooseAccountAvatar"
            >
              <image
                v-if="app.bootstrap?.userAvatarUrl"
                :src="app.bootstrap.userAvatarUrl"
                class="profile-avatar me-avatar"
                mode="aspectFill"
                aria-label="我的个人头像"
              />
              <view v-else class="profile-avatar fallback me-avatar">我</view>
            </button>
            <view
              ><h1>我的萤火</h1>
              <p>
                已点亮 {{ app.profiles.length }} 束萤火 ·
                {{ app.libraryReady ? app.libraryMemories.length : app.memories.length }} 条记忆
              </p>
              <button role="button" class="me-avatar-text" @click="chooseAccountAvatar">
                {{ app.bootstrap?.userAvatarUrl ? '更换个人头像' : '上传个人头像' }}
              </button></view
            >
          </view>
          <view class="me-firefly-glow" aria-hidden="true" />
          <view class="sprite mascot me-firefly" role="img" aria-label="陪伴记忆的萤火虫" />
        </view>
        <button role="button" v-if="!app.session.userId" class="btn" @click="go('login')">
          开始记录
        </button>
        <template v-if="app.session.userId">
          <view class="phone-protect-card">
            <view class="phone-protect-copy"
              ><strong>账号与找回</strong
              ><small>{{
                '萤火号 ' + (app.session.familyCode || '正在识别…') + ' · ' + boundPhoneDisplay
              }}</small></view
            >
            <button role="button" class="text-button" @click="showPhoneBinding">
              {{ accountPanelOpen ? '收起' : '管理' }}
            </button>
          </view>
          <view v-if="accountPanelOpen" class="phone-bind-panel account-recovery-panel">
            <view class="account-identifier-row">
              <view
                ><small>萤火号</small
                ><strong>{{ app.session.familyCode || '正在识别…' }}</strong></view
              >
              <button
                role="button"
                class="text-button"
                @click="copyText(app.session.familyCode || '', '萤火号')"
              >
                复制
              </button>
            </view>
            <template v-if="!app.bootstrap?.boundPhone">
              <h3>绑定常用手机号</h3>
              <label class="field"
                ><input
                  v-model.trim="form.phone"
                  type="number"
                  maxlength="11"
                  aria-label="手机号"
                  placeholder="请输入 11 位手机号"
              /></label>
              <button
                role="button"
                class="btn"
                :disabled="app.busy || !/^1[3-9]\d{9}$/.test(form.phone.trim())"
                :aria-disabled="app.busy || !/^1[3-9]\d{9}$/.test(form.phone.trim())"
                @click="bindPhone"
              >
                {{ app.busy ? '正在绑定…' : '确认绑定' }}
              </button>
            </template>
            <template v-else>
              <view class="bound-phone-row">
                <small class="bound-phone-label">手机号</small>
                <strong class="bound-phone-value">{{ boundPhoneDisplay }}</strong>
                <button
                  role="button"
                  class="text-button bound-phone-remove"
                  :disabled="app.busy"
                  :aria-disabled="app.busy"
                  @click="clearPhone"
                >
                  移除
                </button>
              </view>
            </template>
            <view class="recovery-password-section">
              <h3>{{ app.bootstrap?.recoveryConfigured ? '修改找回密码' : '设置找回密码' }}</h3>
              <p class="caption">换设备时，用萤火号或已绑定手机号配合密码找回。</p>
              <label class="field"
                ><text>找回密码</text
                ><input
                  v-model="form.recoveryPassword"
                  :password="true"
                  maxlength="64"
                  autocomplete="new-password"
                  aria-label="设置找回密码"
                  placeholder="至少 8 位"
              /></label>
              <label class="field"
                ><text>再输入一次</text
                ><input
                  v-model="form.recoveryPasswordConfirm"
                  :password="true"
                  maxlength="64"
                  autocomplete="new-password"
                  aria-label="确认找回密码"
                  placeholder="再次输入找回密码"
              /></label>
              <button
                role="button"
                class="btn"
                :disabled="
                  app.busy ||
                  form.recoveryPassword.trim().length < 8 ||
                  !form.recoveryPasswordConfirm.trim()
                "
                :aria-disabled="
                  app.busy ||
                  form.recoveryPassword.trim().length < 8 ||
                  !form.recoveryPasswordConfirm.trim()
                "
                @click="setRecoveryPassword"
              >
                {{
                  app.busy
                    ? '正在保存…'
                    : app.bootstrap?.recoveryConfigured
                      ? '保存新密码'
                      : '设置找回密码'
                }}
              </button>
            </view>
            <view v-if="app.status" class="notice success-notice" role="status">{{
              app.status
            }}</view>
            <button
              role="button"
              class="text-button account-switch-link"
              @click="go('login', '?mode=recover')"
            >
              找回其他萤火账号
            </button>
          </view>
          <view v-if="app.error" class="notice error" role="alert">{{ app.error }}</view>
          <view class="me-settings">
            <button role="button" class="me-setting-row" @click="go('profile')">
              <view class="me-setting-icon"><AppIcon name="edit" /></view>
              <view>
                <strong>个人资料</strong>
                <small>管理个人头像与公开身份</small>
              </view>
              <AppIcon name="chevron" class="row-chevron" />
            </button>
            <button role="button" class="me-setting-row" @click="go('chat')">
              <view class="me-setting-icon"><AppIcon name="user" /></view>
              <view
                ><strong>人物与萤火空间</strong
                ><small>管理头像、称呼、人物故事与聊天对象</small></view
              >
              <AppIcon name="chevron" class="row-chevron" />
            </button>
            <button role="button" class="me-setting-row" @click="go('memories')">
              <view class="me-setting-icon"><AppIcon name="book" /></view>
              <view><strong>我的记忆</strong><small>查看、编辑与分享</small></view>
              <AppIcon name="chevron" class="row-chevron" />
            </button>
            <button role="button" class="me-setting-row" @click="go('shares')">
              <view class="me-setting-icon"><AppIcon name="share" /></view>
              <view><strong>我的发布</strong><small>管理公开、审核中与私密内容</small></view>
              <AppIcon name="chevron" class="row-chevron" />
            </button>
            <button role="button" class="me-setting-row" @click="go('privacy')">
              <view class="me-setting-icon"><AppIcon name="shield" /></view>
              <view><strong>隐私与数据</strong><small>公开范围、备份与账号安全</small></view>
              <AppIcon name="chevron" class="row-chevron" />
            </button>
          </view>

          <view class="me-secondary-links">
            <view class="me-foot-links">
              <button role="button" class="row" @click="go('terms')">用户协议与 AI 说明</button>
              <button role="button" class="row" @click="go('support')">帮助与反馈</button>
            </view>
          </view>
          <button
            role="button"
            class="text-button logout-button"
            :disabled="app.busy"
            @click="confirmLogout"
            :aria-disabled="app.busy"
          >
            退出当前空间
          </button>
        </template>
      </template>
    </template>
    <view
      v-if="avatarCropSource"
      class="avatar-crop-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-crop-title"
      @click.self="cancelAvatarCrop"
    >
      <view class="avatar-crop-card">
        <h2 id="avatar-crop-title">预览个人头像</h2>
        <p>头像会自动居中显示在圆形区域内。</p>
        <view class="avatar-crop-preview">
          <image :src="avatarCropSource" mode="aspectFill" aria-label="头像裁剪预览" />
        </view>
        <view class="avatar-crop-actions">
          <button role="button" class="btn secondary" @click="cancelAvatarCrop">取消</button>
          <button role="button" class="btn" :disabled="app.busy" @click="confirmAvatarCrop">
            {{ app.busy ? '正在处理…' : '使用这张头像' }}
          </button>
        </view>
      </view>
    </view>
  </AppShell>
</template>
