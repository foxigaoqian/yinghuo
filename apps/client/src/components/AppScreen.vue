<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
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
  if (props.page === 'create') return props.query?.edit === '1' ? '人物资料' : '留下第一条记忆';
  if (props.page === 'login' && props.query?.mode === 'recover') return '找回我的萤火';
  if (props.page === 'memories') return '我的记忆';
  if (props.page === 'compose' && props.query?.memoryId) return '分享记忆';
  if (props.page === 'chat' && app.current) return '和' + app.current.name + '聊聊';
  return props.title;
});
const hostedPreview = computed(() => Boolean(app.bootstrap?.features?.hostedPreview));
const form = reactive({
  name: '',
  relationship: '',
  nickname: '',
  avatarDataUrl: '',
  removeAvatar: false,
  callMe: '',
  story: '',
  aiConsent: false,
  title: '',
  body: '',
  public: false,
  publicConsent: false,
  familyCode: '',
  recoveryCode: '',
  phone: '',
  gender: null as 'male' | 'female' | null,
  birthYear: '',
  feedbackCategory: 'suggestion' as 'problem' | 'suggestion' | 'privacy',
  feedbackBody: '',
  deleteConfirmation: '',
});
const detailsOpen = ref(false);
const customRelationship = ref(false);
const chatMemoriesOpen = ref(false);
const libraryFilter = ref('all');
const localDraftSaved = ref(false);
const localDraftError = ref(false);
const squareView = ref('精选');
const preview = ref('');
const chatText = ref('');
const chatConsent = ref(false);
const selectedChatMemories = ref<string[]>([]);
const generatedRecoveryCode = ref('');
const recoveryCardDataUrl = ref('');
const recoveryHelpOpen = ref(false);
const phonePanelOpen = ref(false);
const chatReplyPending = ref(false);
const pendingChatText = ref('');
const environmentNoticeDismissed = ref(false);
const chatAvailable = computed(() => Boolean(app.bootstrap?.features?.textChat));
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
const myShares = computed(() => app.posts.filter((p) => p.visibility === 'public'));
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
  if (post.moderation === 'pending') return '等待审核 · 尚未公开';
  if (post.moderation === 'rejected') return '未通过审核 · 尚未公开';
  return '已公开到广场';
}
function openLibraryItem(item: { id: string; profileId: string; source: string }) {
  go(
    item.source === 'memory' ? 'memory' : 'story',
    '?id=' + item.id + (item.profileId ? '&profileId=' + item.profileId : ''),
  );
}
function recordFromLibrary() {
  if (libraryFilter.value !== 'all' && libraryFilter.value !== app.currentId)
    app.select(libraryFilter.value);
  needProfile('memory-edit');
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
    title: '妈妈窗边的那束花',
    excerpt: '小时候，总觉得窗台上的花开得特别慢。后来才明白，是她把平凡的日子照顾得很好。',
    body: '小时候，总觉得窗台上的花开得特别慢。后来才明白，是她把平凡的日子照顾得很好。如今，看到一束小雏菊，我也会记得给生活留一点明亮。',
  },
  {
    id: 'sample-dad',
    title: '爸爸留下的那把旧伞',
    excerpt: '下雨天出门，他总把伞塞到我手里。现在我也会在门口提醒家人带伞。',
    body: '下雨天出门，他总把伞塞到我手里，说天气变得快，别淋着了。后来我有了自己的家，也会在门口提醒家人带伞。那些小小的叮嘱，慢慢成了我的习惯。',
  },
  {
    id: 'sample-grandma',
    title: '外婆教我的第一道菜',
    excerpt: '她说做菜没有标准答案，尝一口，觉得刚好，就是家的味道。',
    body: '外婆教我做的第一道菜是番茄炒蛋。她从不说放几克盐，只让我尝一口，觉得刚好，就是家的味道。后来每次做这道菜，我都会想起厨房里那盏暖暖的灯。',
  },
];
const selectedSample = computed(() => sampleStories.find((s) => s.id === props.query?.id));
async function loadScreen() {
  app.error = '';
  app.status = '';
  try {
    if (props.query?.profileId && props.query.profileId !== app.currentId)
      app.select(props.query.profileId);
    loading.value =
      !app.bootstrap ||
      (props.page === 'chat' && !app.messagesReady) ||
      (props.page === 'memories' && !app.libraryReady) ||
      (props.page === 'square' && !screenReady.value) ||
      (!['home', 'login'].includes(props.page) && !screenReady.value);
    await app.refresh(
      !['home', 'login'].includes(props.page),
      Boolean(props.query?.profileId),
      props.page === 'chat',
      ['square', 'memories', 'compose'].includes(props.page),
    );
    if (props.page === 'login' && app.session.userId && !recovering.value) {
      replace(app.current ? 'home' : 'create');
      return;
    }
    if (props.page === 'space') {
      replace('home', props.query?.saved === '1' ? '?saved=1' : '');
      return;
    }
    if (props.page === 'square') await app.fetchPublicPosts();
    if (props.page === 'memories') await app.fetchLibrary();
    if (
      ['story', 'compose'].includes(props.page) &&
      props.query?.id &&
      !sampleStories.some((story) => story.id === props.query?.id) &&
      !selectedPost.value
    )
      await app.fetchPost(props.query.id);
    if (editingStory.value && !ownsSelectedPost.value)
      throw new Error('这段内容不属于当前空间，无法修改。');
    if (props.page === 'compose' && props.query?.memoryId && !shareMemory.value)
      throw new Error('这条记忆暂时找不到，请返回我的记忆重新选择。');
    if (editingMemory.value && !selectedMemory.value)
      throw new Error('这条记忆暂时找不到，请返回我的记忆重新选择。');
    restoreProfileDraft();
    restoreChatDraft();
    restoreEditorDraft();
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
    editorDraftReady = true;
    screenReady.value = true;
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
    replace('home', editing.value ? '' : '?saved=1');
  });
}
function profileInitial(profile: { name: string; relationship?: string; nickname?: string }) {
  return (
    (profile.nickname || profile.name || profile.relationship || '萤').trim().charAt(0) || '萤'
  );
}
function formInitial() {
  return profileDisplayName.value.charAt(0) || '萤';
}
async function compressAvatar(source: string) {
  const image = new Image();
  image.src = source;
  await image.decode();
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理头像');
  const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
  let quality = 0.78;
  let result = canvas.toDataURL('image/jpeg', quality);
  while (result.length > 80_000 && quality > 0.42) {
    quality -= 0.08;
    result = canvas.toDataURL('image/jpeg', quality);
  }
  if (result.length > 80_000) throw new Error('头像文件太大，请换一张图片');
  return result;
}
function chooseProfileAvatar() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    success: (result) => {
      const source = result.tempFilePaths[0];
      if (!source) return;
      void app.run(async () => {
        form.avatarDataUrl = await compressAvatar(source);
        form.removeAvatar = false;
        app.status = '头像已选好，保存资料后生效。';
      });
    },
  });
}
function removeProfileAvatar() {
  form.avatarDataUrl = '';
  form.removeAvatar = true;
  app.status = '保存资料后将恢复为首字头像。';
}
function switchProfile(id: string) {
  if (id === app.currentId || app.busy) return;
  app.select(id);
  selectedChatMemories.value = [];
  replace(props.page, '?profileId=' + encodeURIComponent(id));
}
function memorySave() {
  void app.run(async () => {
    const input = {
      title: memoryTitle(form.title, form.body),
      body: form.body,
      useForAi: selectedMemory.value?.useForAi || false,
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
function restoreChatDraft() {
  if (props.page !== 'chat' || !chatDraftKey() || chatText.value) return;
  chatText.value = (uni.getStorageSync(chatDraftKey()) as string) || '';
}
watch(chatText, (value) => {
  if (props.page === 'chat' && chatDraftKey() && !chatReplyPending.value) {
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
function useChatPrompt(prompt: string) {
  if (!app.busy) chatText.value = prompt;
}
function shareCurrentMemory() {
  if (selectedMemory.value)
    go(
      'compose',
      '?memoryId=' + selectedMemory.value.id + '&profileId=' + selectedMemory.value.profileId,
    );
}
function sendChat() {
  const text = chatText.value.trim();
  if (!text || !chatConsent.value || app.busy) return;
  pendingChatText.value = text;
  chatReplyPending.value = true;
  chatText.value = '';
  void app.run(async () => {
    try {
      await app.send(text, selectedChatMemories.value);
      uni.removeStorageSync(chatDraftKey());
      localDraftSaved.value = false;
    } catch (error) {
      chatText.value = text;
      throw error;
    } finally {
      pendingChatText.value = '';
      chatReplyPending.value = false;
    }
  });
}

function scrollChatToEnd() {
  if (props.page !== 'chat') return;
  void nextTick(() => {
    const thread = document.getElementById('chat-thread');
    if (thread) thread.scrollTop = thread.scrollHeight;
  });
}
function onChatFocus() {
  scrollChatToEnd();
  requestAnimationFrame(() => requestAnimationFrame(scrollChatToEnd));
}
watch(
  () => [loading.value, app.messages.length, pendingChatText.value, chatReplyPending.value],
  scrollChatToEnd,
  {
    flush: 'post',
  },
);

function clearConversation() {
  uni.showModal({
    title: '开始一段新对话？',
    content: '当前聊天会从页面隐藏并转为历史记录，仍会出现在数据导出中；私密记忆不会被删除。',
    confirmText: '开始新对话',
    cancelText: '取消',
    success: (result) => {
      if (!result.confirm) return;
      void app.run(async () => {
        await app.resetConversation();
        selectedChatMemories.value = [];
        chatConsent.value = false;
        app.status = '已开始一段新对话。';
      });
    },
  });
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
        (props.query?.memoryId
          ? '.profile.' + app.currentId + '.memory.' + props.query.memoryId
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
    | { title?: string; body?: string; public?: boolean; publicConsent?: boolean }
    | undefined;
  if (!draft || typeof draft !== 'object') return;
  form.title = typeof draft.title === 'string' ? draft.title : '';
  form.body = typeof draft.body === 'string' ? draft.body : '';
  if (props.page === 'memory-edit' && !editingMemory.value) {
    form.public = draft.public === true;
    form.publicConsent = draft.publicConsent === true;
  }
  localDraftSaved.value = Boolean(form.title || form.body);
  if (form.title || form.body) app.status = '已恢复你未保存的草稿。';
}

function saveEditorDraft() {
  if (!editorDraftReady || !['memory-edit', 'compose'].includes(props.page)) return;
  const key = props.page === 'memory-edit' ? memoryDraftKey() : storyDraftKey();
  if (!key) return;
  if (!form.title && !form.body) {
    uni.removeStorageSync(key);
    return;
  }
  storeDraft(key, {
    title: form.title,
    body: form.body,
    ...(props.page === 'memory-edit'
      ? { public: form.public, publicConsent: form.publicConsent }
      : {}),
  });
}

watch(
  () => [app.session.userId, app.currentId, form.title, form.body, form.public, form.publicConsent],
  saveEditorDraft,
  {
    flush: 'sync',
  },
);

function publish() {
  const action = () =>
    app.run(async () => {
      const input = {
        title: memoryTitle(form.title, form.body, 60),
        body: form.body,
        visibility: form.public ? 'public' : 'private',
        publicConsent: form.publicConsent,
      };
      if (editingStory.value && selectedPost.value)
        await app.updatePost(selectedPost.value.id, input);
      else if (!form.public && app.current)
        await app.addMemory({
          title: memoryTitle(form.title, form.body),
          body: form.body,
          useForAi: false,
        });
      else await app.publish(input);
      const key = storyDraftKey();
      if (key) uni.removeStorageSync(key);
      replace(form.public ? 'square' : 'memories', form.public ? '?view=mine&saved=1' : '?saved=1');
    });
  if (form.public)
    uni.showModal({
      title: '确认提交到广场？',
      content: '故事将在审核通过后展示。请确认已获得相关人物的分享许可。',
      cancelText: '取消',
      success: (r) => {
        if (r.confirm) void action();
      },
    });
  else void action();
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
        replace('memories');
      });
    },
  });
}
function choosePhoto() {
  uni.chooseImage({
    count: 1,
    success: (r) => {
      preview.value = r.tempFilePaths[0] || '';
      app.status = '仅本机预览，未上传，也未进行 AI 修复。';
    },
  });
}
watch(
  () => props.query?.view,
  (view) => {
    if (props.page === 'square' && view === 'mine') squareView.value = '我的';
  },
  { immediate: true },
);
function info(title: string, content: string) {
  uni.showModal({ title, content, showCancel: false, confirmText: '知道了' });
}
function showPhoneBinding() {
  phonePanelOpen.value = !phonePanelOpen.value;
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
    phonePanelOpen.value = false;
    app.status = '手机号尾号已记录（未验证）。账号找回仍需萤火号和安全恢复码。';
  });
}
function clearPhone() {
  void app.run(async () => {
    await app.clearPhone();
    form.phone = '';
    phonePanelOpen.value = false;
    app.status = '未验证手机号记录已移除。';
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
function createRecoveryCode() {
  const action = () =>
    app.run(async () => {
      const bundle = await app.createRecoveryCode();
      generatedRecoveryCode.value = bundle.recoveryCode;
      recoveryCardDataUrl.value = '';
      app.status = '找回卡信息已生成，请在离开前复制或保存图片。';
    });
  if (!app.bootstrap?.recoveryConfigured) {
    void action();
    return;
  }
  uni.showModal({
    title: '生成新的找回卡？',
    content: '新的安全恢复码只显示这一次；再次生成会让旧找回卡失效。请生成后立即保存图片。',
    confirmText: '生成找回卡',
    cancelText: '取消',
    success: (result) => {
      if (!result.confirm) return;
      void action();
    },
  });
}
function saveRecoveryCard() {
  if (!generatedRecoveryCode.value || !app.session.familyCode) return;
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1440;
  const context = canvas.getContext('2d');
  if (!context) {
    app.error = '当前浏览器暂时无法生成找回卡，请先复制找回信息。';
    return;
  }
  const gradient = context.createLinearGradient(0, 0, 1080, 1440);
  gradient.addColorStop(0, '#fffaf0');
  gradient.addColorStop(1, '#f5e2a7');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#40382f';
  context.textAlign = 'center';
  context.font = '700 76px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  context.fillText('萤火找回卡', 540, 190);
  context.fillStyle = '#756e64';
  context.font = '36px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  context.fillText('换手机或登录失效时，用这两项找回记忆', 540, 270);
  context.fillStyle = '#fffdf9';
  context.strokeStyle = '#dfbd63';
  context.lineWidth = 4;
  context.beginPath();
  context.roundRect(100, 360, 880, 650, 42);
  context.fill();
  context.stroke();
  context.fillStyle = '#756e64';
  context.font = '34px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  context.fillText('萤火号', 540, 480);
  context.fillStyle = '#4e3a14';
  context.font = '700 62px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.fillText(app.session.familyCode, 540, 575);
  context.fillStyle = '#756e64';
  context.font = '34px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  context.fillText('安全恢复码', 540, 720);
  context.fillStyle = '#4e3a14';
  context.font = '700 42px ui-monospace, SFMono-Regular, Menlo, monospace';
  const code = generatedRecoveryCode.value;
  const lines = code.length > 24 ? [code.slice(0, 24), code.slice(24)] : [code];
  lines.forEach((line, index) => context.fillText(line, 540, 815 + index * 64));
  context.fillStyle = '#8a5a28';
  context.font = '32px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  context.fillText('请勿转发给他人，也不要交给客服', 540, 1120);
  context.fillStyle = '#756e64';
  context.font = '28px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  context.fillText('生成日期：' + new Date().toLocaleDateString('zh-CN'), 540, 1195);
  context.fillText('萤火不会通过客服索要安全恢复码', 540, 1250);
  const dataUrl = canvas.toDataURL('image/png');
  recoveryCardDataUrl.value = dataUrl;
  if (isWeChat.value) {
    app.status = '找回卡已生成，请长按下方图片保存到手机。';
    return;
  }
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = '萤火找回卡.png';
  document.body.appendChild(link);
  link.click();
  link.remove();
  app.status = '找回卡图片已保存；也可以长按下方图片再次保存。';
}
function recoverAccount() {
  const familyCode = form.familyCode.trim().toUpperCase();
  const recoveryCode = form.recoveryCode.trim().toUpperCase();
  if (!familyCode || !recoveryCode) {
    app.error = '请输入萤火号和安全恢复码';
    return;
  }
  const action = () =>
    app.run(async () => {
      await app.recover({
        familyCode,
        recoveryCode,
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
    form.public = selectedPost.value.visibility === 'public';
    form.publicConsent = false;
  },
  { immediate: true },
);
function confirmLogout() {
  if (!app.bootstrap?.recoveryConfigured) {
    info(
      '请先保存找回卡',
      '当前空间还没有找回卡。请先生成并妥善保存，否则退出后将无法找回这些记忆。',
    );
    return;
  }
  uni.showModal({
    title: '离开当前空间？',
    content: '退出会清除这台设备的登录。只有保存过找回卡，才能重新找回这个空间。',
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
  <AppShell :page="page" :title="shellTitle">
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
        class="notice"
        role="status"
        >{{ app.status }}</view
      >
      <template v-if="page === 'home'">
        <view v-if="loading" class="loading-state" role="status" aria-label="正在打开你的萤火">
          <view class="loading-line short" /><view class="loading-line" /><view
            class="loading-block"
          />
        </view>
        <template v-else-if="app.current">
          <view class="returning-hero">
            <view
              class="sprite mascot returning-mascot"
              role="img"
              aria-label="一只发光的大萤火虫"
            />
            <view>
              <small>继续留住你们的日常</small>
              <h1>{{ app.current.name }}的萤火</h1>
              <p>想起一句话，就回来记下来。</p>
            </view>
          </view>
          <view class="person-switch-heading">
            <small>切换人物</small>
            <button
              role="button"
              class="text-button"
              @click="go('create', '?edit=1&profileId=' + app.currentId)"
            >
              编辑当前人物
            </button>
          </view>
          <view class="profile-tabs home-profile-tabs" aria-label="切换人物">
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
                v-if="p.avatarUrl"
                class="profile-avatar"
                :src="p.avatarUrl"
                mode="aspectFill"
              /><view v-else class="profile-avatar fallback">{{ profileInitial(p) }}</view
              ><text>{{ p.name }}</text>
            </button>
            <button role="button" class="profile-tab add-person-tab" @click="go('create')">
              <AppIcon name="plus" /><text>添加人物</text>
            </button>
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
              <AppIcon name="plus" />
              <text><strong>记录一件小事</strong><small>默认仅自己可见</small></text>
            </button>
            <button
              role="button"
              v-if="chatAvailable"
              class="home-primary-action secondary"
              :aria-label="'和' + app.current.name + '聊聊'"
              @click="go('chat', profileQuery())"
            >
              <AppIcon name="chat" />
              <text
                ><strong>和{{ app.current.name }}聊聊</strong><small>AI 根据记忆生成</small></text
              >
            </button>
          </view>
          <view v-if="query?.saved === '1'" class="saved-state" role="status"
            >已保存到{{ app.current.name }}的记忆。</view
          >
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
          <view v-else class="notice">还没有留下记忆，今天想到的一句话就可以。</view>
          <view v-if="recoveryNeeded" class="recovery-reminder"
            ><text>内容已保存，跨设备找回还未设置。</text
            ><button role="button" class="text-button" @click="go('me')">设置找回方式</button></view
          >
        </template>
        <view v-else class="hero first-visit">
          <text class="wordmark">萤火</text>
          <h1>把关于 TA 的小事，<br />慢慢留下。</h1>
          <p>写下一句话，保存在自己的记忆空间。<br />以后想起时，可以回来看看。</p>
          <view class="hero-art"
            ><view class="sprite mascot" role="img" aria-label="小萤，萤火记忆伙伴"
          /></view>
          <button
            role="button"
            class="btn"
            :disabled="app.busy || !app.bootstrap"
            @click="openHomePrimary"
            :aria-disabled="app.busy || !app.bootstrap"
          >
            {{ app.busy ? '正在进入…' : '写下第一条记忆' }}
          </button>
          <button role="button" class="text-button" @click="go('square')">先看看故事示例</button>
          <p class="caption">无需先注册，内容默认仅自己可见。</p>
        </view>
        <button
          role="button"
          v-if="!loading"
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
        <h1>{{ recovering ? '找回我的萤火' : '从一句话开始' }}</h1>
        <p class="caption">
          {{
            recovering
              ? '打开以前保存的“萤火找回卡”，输入上面的两项信息。'
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
        <view class="recovery-card">
          <h2 v-if="!recovering">已有记忆？找回原来的空间</h2>
          <label class="field"
            ><text>萤火号</text
            ><input
              v-model="form.familyCode"
              aria-label="萤火号"
              maxlength="24"
              placeholder="输入找回卡上的萤火号"
          /></label>
          <label class="field"
            ><text>安全恢复码</text
            ><input
              v-model="form.recoveryCode"
              aria-label="安全恢复码"
              :password="true"
              maxlength="40"
              placeholder="输入找回卡上的 YH- 开头恢复码"
          /></label>
          <view v-if="app.error" class="notice error" role="alert">{{ app.error }}</view>
          <view v-if="app.status" class="caption" role="status">{{ app.status }}</view>
          <button
            role="button"
            class="btn"
            :disabled="app.busy || !form.familyCode.trim() || !form.recoveryCode.trim()"
            @click="recoverAccount"
            :aria-disabled="app.busy || !form.familyCode.trim() || !form.recoveryCode.trim()"
          >
            {{ app.busy ? '正在找回…' : '找回我的萤火' }}
          </button>
          <small class="block recovery-hint">需要同时填写两项；手机号验证码找回尚未接通。</small>
          <button
            role="button"
            class="disclosure-button"
            :aria-expanded="recoveryHelpOpen"
            @click="recoveryHelpOpen = !recoveryHelpOpen"
          >
            <text>没有保存找回卡怎么办？</text><text>{{ recoveryHelpOpen ? '收起' : '查看' }}</text>
          </button>
          <view v-if="recoveryHelpOpen" class="notice"
            >如果旧设备仍能打开原来的空间，请在那里进入“我的”重新生成并保存找回卡。如果已经失去登录、也没有找回卡，目前无法安全验证账号归属。</view
          >
        </view>
        <button
          role="button"
          v-if="recovering && app.session.userId"
          class="text-button"
          @click="replace('me')"
        >
          返回当前空间
        </button>
      </template>
      <template v-else-if="page === 'create'">
        <h1>{{ editing ? '人物资料' : '为谁留下一条记忆？' }}</h1>
        <p class="caption">
          {{
            editing
              ? '熟悉的称呼与故事，可以慢慢补充。'
              : '选一个称呼，写一句话。其他资料以后再补。'
          }}
        </p>
        <view v-if="!app.session.userId" class="notice"
          ><p>先进入自己的记忆空间。</p>
          <button role="button" class="btn" @click="go('login', '?next=create')">继续</button></view
        >
        <template v-else>
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
            ><text>人物称呼（必填）</text
            ><input
              v-model="form.relationship"
              aria-label="人物称呼"
              maxlength="40"
              placeholder="例如：妈妈、阿明、我的朋友"
          /></label>
          <label class="field"
            ><text>{{ editing ? '关于 TA 的故事（选填）' : '想到的一件小事' }}</text
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
          <view v-if="!editing" class="editor-actions">
            <view v-if="app.error" class="notice error" role="alert"
              >{{ app.error }} 内容还在，可以重试。</view
            >
            <view v-if="app.status" class="caption" role="status">{{ app.status }}</view>
            <small class="draft-status" role="status">{{ draftStatus }}</small>
            <button
              role="button"
              class="btn"
              :disabled="app.busy || !form.relationship.trim() || !form.story.trim()"
              :aria-disabled="app.busy || !form.relationship.trim() || !form.story.trim()"
              @click="create"
            >
              {{ app.busy ? '正在保存…' : '保存第一条记忆' }}
            </button>
            <button
              role="button"
              class="text-button"
              :disabled="app.busy || !form.relationship.trim()"
              :aria-disabled="app.busy || !form.relationship.trim()"
              @click="create"
            >
              先创建空间，稍后再写
            </button>
            <small v-if="!form.relationship.trim()" class="block"
              >先选择人物称呼；列表里没有，可以点“其他”。</small
            >
          </view>
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
            <label class="field"
              ><text>昵称（选填）</text
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
              <image
                v-if="
                  !form.removeAvatar && (form.avatarDataUrl || (editing && app.current?.avatarUrl))
                "
                class="profile-avatar large"
                :src="form.avatarDataUrl || app.current?.avatarUrl || ''"
                mode="aspectFill"
              />
              <view v-else class="profile-avatar large fallback">{{ formInitial() }}</view>
              <view
                ><button role="button" class="avatar-button" @click="chooseProfileAvatar">
                  {{ editing ? '更换头像' : '上传头像' }}</button
                ><button
                  role="button"
                  v-if="
                    form.avatarDataUrl || (editing && app.current?.avatarUrl && !form.removeAvatar)
                  "
                  class="text-button"
                  @click="removeProfileAvatar"
                >
                  移除</button
                ><small>没有头像时，用称呼的第一个字。</small></view
              >
            </view>
          </view>
          <view v-if="editing" class="editor-actions">
            <view v-if="app.error" class="notice error" role="alert"
              >{{ app.error }} 内容还在，可以修改后重试。</view
            >
            <view v-if="app.status" class="caption" role="status">{{ app.status }}</view>
            <small class="draft-status" role="status">{{
              editing ? '修改后请保存，内容仅自己可见。' : draftStatus
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
              {{ app.busy ? '正在保存…' : editing ? '保存资料' : '保存第一条记忆' }}
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
            <small v-if="!form.relationship.trim()" class="block">先选择或填写人物称呼。</small>
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
          <view v-if="recoveryNeeded" class="recovery-reminder"
            ><text>内容已保存，跨设备找回还未设置。</text
            ><button role="button" class="text-button" @click="go('me')">设置找回方式</button></view
          >
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
            补充人物资料 <AppIcon name="arrow" />
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
        <view class="section library-heading"
          ><h1>我的记忆</h1>
          <button
            role="button"
            class="icon-button"
            aria-label="添加记忆"
            @click="recordFromLibrary"
          >
            <AppIcon name="plus" /></button
        ></view>
        <p class="caption">自己留下的内容，都可以从这里找到。</p>
        <view v-if="query?.saved === '1'" class="saved-state" role="status"
          >已保存到我的记忆。</view
        >
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
              ? profileName(item.profileId) + ' · 仅自己可见'
              : (item.visibility === 'public' ? '广场分享' : '历史故事') + ' · ' + postStatus(item)
          }}</small>
          <h3>{{ item.title }}</h3>
          <p>{{ item.body }}</p>
        </button>
        <view v-if="!libraryItems.length" class="empty"
          ><h2>{{ libraryFilter === 'all' ? '还没有留下记忆' : '这位人物还没有记忆' }}</h2>
          <p>一句话、一件小事，都值得留下。</p></view
        >
        <button role="button" class="btn" @click="recordFromLibrary">再记下一件小事</button>
      </template>
      <template v-else-if="page === 'memory-edit'">
        <h1>{{ editingMemory ? '修改这段记忆' : '记下一件小事' }}</h1>
        <template v-if="app.current">
          <p class="caption editor-owner">关于 {{ app.current.name }} · 默认只保存在“我的记忆”</p>
          <view v-if="query?.type" class="notice"
            >照片、声音和视频稍后开放，现在可以先记下一段文字。</view
          >
          <label class="field"
            ><text>你想记住什么？（必填）</text
            ><textarea
              v-model="form.body"
              aria-label="记忆内容"
              maxlength="5000"
              :placeholder="'一句关于' + app.current.name + '的话，或一件小事…'"
            />
          </label>
          <label class="field"
            ><text>标题（选填）</text
            ><input
              v-model="form.title"
              aria-label="记忆标题（选填）"
              maxlength="120"
              placeholder="留空时，用正文开头作为标题"
          /></label>
          <view
            v-if="!editingMemory && app.bootstrap?.features?.publicSquare"
            class="visibility-picker memory-visibility"
          >
            <text>保存后是否同时分享到广场？</text>
            <view class="visibility-options">
              <button
                role="button"
                :class="{ active: !form.public }"
                :aria-pressed="!form.public"
                @click="
                  form.public = false;
                  form.publicConsent = false;
                "
              >
                <strong>仅自己可见</strong><small>默认，更安心</small>
              </button>
              <button
                role="button"
                :class="{ active: form.public }"
                :aria-pressed="form.public"
                @click="form.public = true"
              >
                <strong>同时分享到广场</strong><small>生成独立审核副本</small>
              </button>
            </view>
          </view>
          <checkbox-group
            v-if="!editingMemory && form.public"
            @change="toggle('publicConsent', $event)"
          >
            <label class="check public-consent"
              ><checkbox
                value="yes"
                :checked="form.publicConsent"
              />我确认有权公开这些内容；原记忆仍保持私密。</label
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
          ><text class="badge">{{ app.current?.name }} · 仅自己可见</text>
          <view v-if="query?.saved === '1'" class="saved-state" role="status">{{
            query?.shared === '1'
              ? '记忆已保存；公开副本已提交审核。'
              : query?.shareFailed === '1'
                ? '记忆已保存；公开副本暂未提交。'
                : '记忆已保存到空间。'
          }}</view>
          <view v-if="query?.shareFailed === '1'" class="notice error" role="alert"
            >私密记忆没有丢失，也不会重复保存。网络恢复后，可在下方重新提交公开副本。</view
          >
          <h1>{{ selectedMemory.title }}</h1>
          <p class="prose">{{ selectedMemory.body }}</p>
          <view class="notice"
            >这段记忆只对你可见 ·
            {{ new Date(selectedMemory.createdAt).toLocaleDateString('zh-CN') }}</view
          >
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
            {{ query?.shareFailed === '1' ? '重试分享到广场' : '分享到广场' }}
          </button>
          <view v-if="recoveryNeeded" class="recovery-reminder"
            ><text>跨设备找回还未设置。</text
            ><button role="button" class="text-button" @click="go('me')">保护这些记忆</button></view
          >
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
        <template v-if="chatAvailable && app.current">
          <view class="chat-layout">
            <view id="chat-thread" class="chat-thread">
              <view class="chat-heading">
                <image
                  v-if="app.current.avatarUrl"
                  class="profile-avatar large"
                  :src="app.current.avatarUrl"
                  mode="aspectFill"
                /><view v-else class="profile-avatar large fallback">{{
                  profileInitial(app.current)
                }}</view>
                <view
                  ><h1>和{{ app.current.name }}聊聊 <small>· AI 生成</small></h1>
                  <p :class="{ 'typing-status': chatReplyPending }">
                    {{ chatReplyPending ? '正在组织回复…' : '从你们的记忆慢慢聊起' }}
                  </p></view
                >
              </view>
              <view class="chat-disclosure" role="note">
                <view class="sprite mascot disclosure-mascot" aria-hidden="true" />
                <text
                  >AI 会根据你提供的内容回复，不是{{ app.current.name }}本人，也可能不准确。</text
                >
              </view>
              <view
                v-if="!app.messages.some((item) => !item.mock) && !pendingChatText"
                class="chat-welcome"
              >
                <h2>这次想从哪里聊起？</h2>
                <p class="caption">选一句开场，也可以写自己的话。</p>
                <view class="prompt-list">
                  <button
                    role="button"
                    class="prompt-button"
                    @click="useChatPrompt('我想聊聊关于' + app.current.name + '的一件小事。')"
                  >
                    聊聊一件小事
                  </button>
                  <button
                    role="button"
                    class="prompt-button"
                    @click="useChatPrompt('今天我又想起了' + app.current.name + '，想说一说。')"
                  >
                    今天又想起了 TA
                  </button>
                  <button
                    role="button"
                    class="prompt-button"
                    @click="useChatPrompt('我想把刚想起的一件事整理成记忆。')"
                  >
                    整理一段记忆
                  </button>
                </view>
              </view>
              <view class="chat-list" aria-live="polite">
                <view
                  v-for="message in app.messages.filter((item) => !item.mock)"
                  :key="message.id"
                  class="message-row"
                  :class="{ user: message.role === 'user' }"
                >
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
                  <view class="bubble" :class="{ user: message.role === 'user' }"
                    ><small>{{
                      message.role === 'user' ? '我' : app.current.name + ' · AI 生成'
                    }}</small
                    ><text>{{ message.text }}</text></view
                  >
                </view>
                <view v-if="pendingChatText" class="message-row user pending-message"
                  ><view class="bubble user"
                    ><small>我</small><text>{{ pendingChatText }}</text></view
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
                    ><small>{{ app.current.name }} · AI 正在生成</small
                    ><view class="typing-dots" aria-hidden="true"><text /><text /><text /></view
                  ></view>
                </view>
              </view>
              <button
                role="button"
                v-if="app.messages.some((item) => !item.mock)"
                class="text-button chat-reset"
                :disabled="app.busy"
                @click="clearConversation"
                :aria-disabled="app.busy"
              >
                开始一段新对话
              </button>
              <view id="chat-end" class="chat-end" aria-hidden="true" />
            </view>
            <view class="chat-composer">
              <button
                role="button"
                class="disclosure-button context-toggle"
                :aria-expanded="chatMemoriesOpen"
                @click="chatMemoriesOpen = !chatMemoriesOpen"
              >
                <text>{{
                  selectedChatMemories.length
                    ? '本次引用 ' + selectedChatMemories.length + ' 条记忆'
                    : '本次未引用记忆'
                }}</text
                ><text>{{ chatMemoriesOpen ? '收起' : '选择' }}</text>
              </button>
              <view v-if="chatMemoriesOpen" class="chat-memory-picker">
                <small>只发送你本次选中的内容，最多 5 条。</small>
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
                  还没有保存的记忆，可以直接说说你想聊的事。
                </p>
              </view>
              <checkbox-group @change="chatConsent = $event.detail.value.length > 0"
                ><label class="check chat-consent"
                  ><checkbox
                    value="agree"
                    :checked="chatConsent"
                  />允许使用本次对话和选中的记忆生成回复。</label
                ></checkbox-group
              >
              <view v-if="app.error" class="notice error" role="alert"
                >{{ app.error }} 输入内容已保留，可以重试。</view
              >
              <view v-if="app.status" class="caption" role="status">{{ app.status }}</view>
              <view class="chat-input">
                <input
                  v-model="chatText"
                  :aria-label="'想对' + app.current.name + '说的话'"
                  :disabled="chatReplyPending"
                  maxlength="500"
                  :placeholder="
                    chatReplyPending ? '正在生成回复…' : '想对' + app.current.name + '说点什么…'
                  "
                  @focus="onChatFocus"
                  @confirm="sendChat"
                />
                <button
                  role="button"
                  class="send-button"
                  aria-label="发送消息"
                  :disabled="app.busy || !chatText.trim() || !chatConsent"
                  @click="sendChat"
                  :aria-disabled="app.busy || !chatText.trim() || !chatConsent"
                >
                  {{ chatReplyPending ? '等待' : '发送' }}
                </button>
              </view>
              <small v-if="!chatConsent" class="composer-hint"
                >勾选授权后可发送；未选中的记忆不会发送。</small
              >
              <small v-else-if="localDraftError" class="composer-hint"
                >本机暂存失败，请复制输入内容后再离开。</small
              >
              <small v-else-if="chatText" class="composer-hint"
                >输入内容已暂存本机，尚未发送。</small
              >
            </view>
          </view>
        </template>
        <view v-else class="empty"
          ><h1>记忆对话暂时无法使用</h1>
          <p>可以先留下关于 TA 的记忆，稍后再回来聊。</p>
          <button role="button" class="btn secondary" @click="go('home')">返回首页</button></view
        >
      </template>
      <template v-else-if="page === 'restore'">
        <h1>让旧照片，重新清晰。</h1>
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
        <h1>服务方案</h1>
        <p class="caption">现在可以免费体验文字记忆；付费服务尚未开放。</p>
        <view class="card"
          ><h2>基础空间</h2>
          <text class="price">¥0</text>
          <p>现在可体验：创建 TA、保存私密文字记忆、写故事。</p>
          <small>当前设备登录通常保留 30 天；安全恢复码可用于换设备找回。</small></view
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
        <h1>订单</h1>
        <view class="empty"><p>目前没有可购买的服务。</p></view>
      </template>
      <template v-else-if="page === 'square'">
        <view class="section"
          ><h1>广场</h1>
          <button
            role="button"
            class="text-button"
            :disabled="app.busy && !app.session.userId"
            @click="needProfile('memory-edit')"
            :aria-disabled="app.busy && !app.session.userId"
          >
            记录记忆
          </button></view
        >
        <view class="chips"
          ><button
            role="button"
            v-for="v in ['精选', '我的']"
            :key="v"
            class="chip"
            :class="{ active: squareView === v }"
            @click="squareView = v"
          >
            {{ v === '我的' ? '我的分享' : v }}
          </button></view
        >
        <view v-if="squareView === '精选'">
          <view v-for="story in app.publicPosts" :key="story.id" class="card">
            <text class="badge">用户故事 · 已审核公开</text>
            <h2>{{ story.title }}</h2>
            <p class="prose story-excerpt">{{ story.body }}</p>
            <button role="button" class="text-button" @click="go('story', '?id=' + story.id)">
              读这个故事
            </button>
          </view>
          <view v-if="!app.publicPosts.length" class="notice">
            还没有已公开的用户故事，先看看示例，也可以写下你的第一篇。
          </view>
          <view
            v-for="(story, index) in !app.publicPosts.length ? sampleStories : []"
            :key="story.id"
            class="card"
          >
            <view
              v-if="index === 0"
              class="sprite flowers photo sample-image"
              role="img"
              aria-label="窗边的小雏菊"
            />
            <text class="badge">写作示例 · 非真实用户</text>
            <h2>{{ story.title }}</h2>
            <p class="prose story-excerpt">{{ story.excerpt }}</p>
            <button role="button" class="text-button" @click="go('story', '?id=' + story.id)">
              读这个故事
            </button>
          </view>
        </view>
        <template v-else
          ><button
            role="button"
            v-for="p in myShares"
            :key="p.id"
            class="card memory-card"
            @click="go('story', '?id=' + p.id)"
          >
            <text class="badge">{{ postStatus(p) }}</text>
            <h3>{{ p.title }}</h3>
            <p>{{ p.body }}</p>
            <small v-if="p.moderation === 'rejected' && p.moderationReason">{{
              p.moderationReason
            }}</small></button
          ><view v-if="!myShares.length" class="empty"
            ><p>还没有公开分享。自己的内容保存在“我的记忆”。</p>
            <button role="button" class="text-button" @click="go('memories')">
              从我的记忆选择分享
            </button></view
          ></template
        >
        <view class="notice"
          >这里展示公开故事。自己的内容都在“我的记忆”；申请分享后，审核通过才会在广场展示。</view
        >
      </template>
      <template v-else-if="page === 'story'">
        <view v-if="selectedSample"
          ><view class="sprite flowers photo story-cover" /><text class="badge"
            >写作示例 · 非真实用户</text
          >
          <h1>{{ selectedSample.title }}</h1>
          <p class="prose">{{ selectedSample.body }}</p></view
        >
        <view v-else-if="selectedPost"
          ><text class="badge">{{ postStatus(selectedPost) }}</text>
          <h1>{{ selectedPost.title }}</h1>
          <p class="prose">{{ selectedPost.body }}</p>
          <view
            v-if="selectedPost.moderation === 'rejected' && selectedPost.moderationReason"
            class="notice error"
          >
            {{ selectedPost.moderationReason }}
          </view>
          <template v-if="ownsSelectedPost">
            <button role="button" class="btn" @click="editStory">编辑这个故事</button>
            <button
              role="button"
              class="btn secondary"
              :disabled="app.busy"
              @click="confirmDeleteStory"
              :aria-disabled="app.busy"
            >
              删除这个故事
            </button>
          </template></view
        ><view v-else class="notice">故事不存在或当前账号不可访问。</view>
        <button
          role="button"
          class="btn secondary"
          @click="go(ownsSelectedPost ? 'memories' : 'square')"
        >
          {{ ownsSelectedPost ? '返回我的记忆' : '返回广场' }}
        </button>
      </template>
      <template v-else-if="page === 'compose'">
        <h1>
          {{ editingStory ? '修改这个故事' : query?.memoryId ? '分享一段记忆' : '记下一件小事' }}
        </h1>
        <p class="caption">
          {{
            query?.memoryId
              ? '这是独立的分享副本。原记忆仍然私密，修改或删除原记忆不会自动更新副本。'
              : editingStory
                ? '修改历史内容，或调整它的可见范围。'
                : '关于 ' + (app.current?.name || '重要的人') + '，先写给自己看。'
          }}
        </p>
        <template v-if="app.session.userId">
          <label class="field"
            ><text>正文（必填）</text
            ><textarea
              v-model="form.body"
              aria-label="故事正文"
              maxlength="3000"
              placeholder="一句话、一件小事，都可以。"
            />
          </label>
          <small v-if="form.body.length > 3000" class="danger-text"
            >广场副本最多 3000 字，请缩短这份副本；原记忆不会改变。</small
          >
          <label class="field"
            ><text>标题（选填）</text
            ><input
              v-model="form.title"
              aria-label="故事标题（选填）"
              maxlength="60"
              placeholder="留空时，用正文开头作为标题"
          /></label>
          <view v-if="app.bootstrap?.features?.publicSquare" class="visibility-picker">
            <text>谁可以看到</text>
            <view class="visibility-options">
              <button
                role="button"
                :class="{ active: !form.public }"
                :aria-pressed="!form.public"
                @click="form.public = false"
              >
                <strong>仅自己可见</strong><small>保存在“我的记忆”</small>
              </button>
              <button
                role="button"
                :class="{ active: form.public }"
                :aria-pressed="form.public"
                @click="form.public = true"
              >
                <strong>分享到广场</strong><small>审核通过后所有人可见</small>
              </button>
            </view>
          </view>
          <checkbox-group v-if="form.public" @change="toggle('publicConsent', $event)"
            ><label class="check"
              ><checkbox value="yes" :checked="form.publicConsent" />我确认有权公开这些内容。</label
            ></checkbox-group
          >
          <view class="editor-actions">
            <view v-if="app.error" class="notice error" role="alert"
              >{{ app.error }} 内容已保留，可以重试。</view
            >
            <view v-if="app.status" class="caption" role="status">{{ app.status }}</view>
            <small class="draft-status" role="status">{{ draftStatus }}</small>
            <button
              role="button"
              class="btn"
              :disabled="
                app.busy ||
                !form.body.trim() ||
                form.body.length > 3000 ||
                (form.public && !form.publicConsent) ||
                (!form.public && !editingStory && !app.current)
              "
              @click="publish"
              :aria-disabled="
                app.busy ||
                !form.body.trim() ||
                form.body.length > 3000 ||
                (form.public && !form.publicConsent) ||
                (!form.public && !editingStory && !app.current)
              "
            >
              {{
                app.busy
                  ? '正在保存…'
                  : editingStory
                    ? '保存修改'
                    : form.public
                      ? '确认并申请公开'
                      : '保存到我的记忆'
              }}
            </button>
            <small v-if="form.public && !form.publicConsent" class="block"
              >确认分享授权后，才能申请公开。</small
            >
            <button
              role="button"
              v-if="!form.public && !editingStory && !app.current"
              class="text-button"
              @click="start"
            >
              先选择一位人物，再保存记忆
            </button>
          </view>
        </template>
        <button role="button" v-else class="btn" @click="go('login', '?next=compose')">
          进入自己的记忆空间
        </button>
      </template>
      <template v-else-if="page === 'privacy'">
        <h1>隐私与数据</h1>
        <p class="caption">你可以查看、导出或删除自己在萤火中的数据。</p>
        <view class="card legal-card">
          <h2>我们保存什么</h2>
          <p>你主动填写的人物资料、文字记忆、对话、故事和头像，以及用于保持登录的随机会话标识。</p>
          <p>
            如果填写联系手机号，服务端只保存不可逆摘要和后四位；未经短信验证，不作为可信登录凭据。
          </p>
        </view>
        <view class="card legal-card">
          <h2>AI 如何使用数据</h2>
          <p>
            只有当你主动发送对话时，本次输入和你勾选的最多 5
            条记忆才会用于生成回复。未勾选的记忆不会被带入该次回复。
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
            <input v-model="form.deleteConfirmation" placeholder="输入：永久删除" />
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
        <h1>用户协议与 AI 说明</h1>
        <view class="card legal-card">
          <h2>AI 不是 TA 本人</h2>
          <p>
            萤火是整理记忆和表达想念的辅助工具。AI
            回复由模型根据你授权的内容生成，可能不准确，不代表、不复活、也不冒充任何真实人物。
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
        <p class="caption">
          生效日期：2026年10月5日。运营方：萤火项目团队。如需联系，请在「帮助与反馈」中提交。
        </p>
      </template>
      <template v-else-if="page === 'support'">
        <h1>帮助与反馈</h1>
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
        <h1>我的空间</h1>
        <p class="caption">管理自己的记忆和找回方式。</p>
        <button role="button" class="row" @click="go('memories')">
          查看我的全部记忆 <AppIcon name="arrow" />
        </button>
        <button role="button" v-if="!app.session.userId" class="btn" @click="go('login')">
          开始记录
        </button>
        <view v-if="app.session.userId" class="card account-card">
          <text class="badge">{{
            app.bootstrap?.recoveryConfigured ? '跨设备找回已设置' : '跨设备找回未设置'
          }}</text>
          <h2>保护你的记忆</h2>
          <p class="caption">内容已保存在空间。生成一张找回卡并存到手机，换设备时照着填写即可。</p>
          <small>萤火号</small
          ><button
            role="button"
            class="account-code"
            :aria-label="'复制萤火号 ' + (app.session.familyCode || '')"
            @click="copyText(app.session.familyCode || '', '萤火号')"
          >
            {{ app.session.familyCode || '正在识别…' }}
          </button>
          <template v-if="generatedRecoveryCode">
            <view class="recovery-secret"
              ><small>安全恢复码 · 只显示这一次</small
              ><strong>{{ generatedRecoveryCode }}</strong></view
            >
            <view class="recovery-actions">
              <button
                role="button"
                class="btn secondary"
                @click="
                  copyText(
                    '萤火号：' + app.session.familyCode + '\n安全恢复码：' + generatedRecoveryCode,
                    '萤火号和安全恢复码',
                  )
                "
              >
                复制信息
              </button>
              <button role="button" class="btn" @click="saveRecoveryCard">保存找回卡</button>
            </view>
            <image
              v-if="recoveryCardDataUrl"
              class="recovery-card-preview"
              :src="recoveryCardDataUrl"
              mode="widthFix"
              aria-label="包含萤火号和安全恢复码的找回卡"
            />
            <p class="account-warning">
              {{
                isWeChat
                  ? '微信内请长按找回卡图片保存。'
                  : '请把找回卡存到安全的位置，不要转发给他人。'
              }}
            </p>
          </template>
          <template v-else>
            <view v-if="app.bootstrap?.recoveryConfigured" class="notice"
              >恢复码已生成。请确认你已妥善保存；重新生成会让旧码失效。</view
            >
            <button
              role="button"
              class="btn"
              :class="{ secondary: app.bootstrap?.recoveryConfigured }"
              :disabled="app.busy"
              @click="createRecoveryCode"
              :aria-disabled="app.busy"
            >
              {{
                app.busy
                  ? '正在生成…'
                  : app.bootstrap?.recoveryConfigured
                    ? '重新生成找回卡'
                    : '生成找回卡'
              }}
            </button>
            <p class="account-warning">
              {{
                app.bootstrap?.recoveryConfigured
                  ? '重新生成会让旧找回卡失效；萤火不会通过客服索要恢复码。'
                  : '未设置找回方式时，请保留当前登录；失去登录后可能无法找回。'
              }}
            </p>
          </template>
          <small class="block">设备登录通常保留 30 天，这是登录期限，不是内容保存期限。</small>
          <template v-if="app.bootstrap?.boundPhone">
            <button
              role="button"
              class="disclosure-button"
              :aria-expanded="phonePanelOpen"
              @click="showPhoneBinding"
            >
              <text>旧手机号记录（不能找回）</text
              ><text>{{ phonePanelOpen ? '收起' : '管理' }}</text>
            </button>
            <view v-if="phonePanelOpen" class="notice"
              ><p>尾号 {{ app.bootstrap.boundPhone }} 未经过验证，不能用于找回。</p>
              <button
                role="button"
                class="text-button"
                :disabled="app.busy"
                @click="clearPhone"
                :aria-disabled="app.busy"
              >
                移除旧记录
              </button></view
            >
          </template>
        </view>
        <view class="card">
          <button role="button" class="row" @click="go('square', '?view=mine')">
            我的公开分享 <AppIcon name="arrow" />
          </button>
          <button role="button" class="row" @click="go('login', '?mode=recover')">
            找回或切换已有空间 <AppIcon name="arrow" />
          </button>
          <button role="button" class="row" @click="go('privacy')">
            隐私、备份与数据 <AppIcon name="arrow" />
          </button>
          <button role="button" class="row" @click="go('terms')">
            用户协议与 AI 说明 <AppIcon name="arrow" />
          </button>
          <button role="button" class="row" @click="go('support')">
            帮助与反馈 <AppIcon name="arrow" />
          </button>
        </view>
        <button
          role="button"
          v-if="app.session.userId"
          class="text-button logout-button"
          :disabled="app.busy"
          @click="confirmLogout"
          :aria-disabled="app.busy"
        >
          退出当前空间
        </button>
      </template>
    </template>
  </AppShell>
</template>
