<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useAppStore } from '../stores/app';
import AppShell from './AppShell.vue';
import AppIcon from './AppIcon.vue';
const props = defineProps<{ page: string; title: string; query?: Record<string, string> }>();
const app = useAppStore();
const loading = ref(!app.bootstrap);
const shellTitle = computed(() =>
  props.page === 'create' && props.query?.edit === '1' ? '人物资料' : props.title,
);
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
const createStep = ref(1);
const squareView = ref('精选');
const preview = ref('');
const chatText = ref('');
const chatConsent = ref(false);
const selectedChatMemories = ref<string[]>([]);
const generatedRecoveryCode = ref('');
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
let restoringDraft = false;
let profileDraftOwner = '';
let editorDraftReady = false;
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
  ['create', 'compose', 'memories', 'memory-edit', 'space'].includes(props.query?.next || '')
    ? props.query!.next!
    : 'space',
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
  if (!app.bootstrap) loading.value = true;
  app.error = '';
  app.status = '';
  try {
    if (props.query?.profileId && props.query.profileId !== app.currentId)
      app.select(props.query.profileId);
    await app.refresh(
      !['home', 'login'].includes(props.page),
      Boolean(props.query?.profileId),
      props.page === 'chat',
      props.page === 'square',
    );
    if (props.page === 'login' && app.session.userId && !recovering.value) {
      replace(app.current ? 'space' : 'create');
      return;
    }
    if (props.page === 'square') await app.fetchPublicPosts();
    if (
      props.page === 'story' &&
      props.query?.id &&
      !sampleStories.some((story) => story.id === props.query?.id) &&
      !selectedPost.value
    )
      await app.fetchPost(props.query.id);
    restoreProfileDraft();
    restoreChatDraft();
    restoreEditorDraft();
    editorDraftReady = true;
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
    if (editing.value && p)
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
    go(app.current ? 'space' : 'create');
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
    replace('space', editing.value || app.bootstrap?.recoveryConfigured ? '' : '?protect=1');
  });
}
function nextCreateStep() {
  if (createStep.value === 1 && !form.relationship.trim()) {
    app.error = '请先选择或填写 TA 的身份。';
    return;
  }
  app.error = '';
  createStep.value = Math.min(3, createStep.value + 1);
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
function previousCreateStep() {
  createStep.value = Math.max(1, createStep.value - 1);
}
function memorySave() {
  void app.run(async () => {
    const input = {
      title: form.title,
      body: form.body,
      useForAi: selectedMemory.value?.useForAi || false,
    };
    if (editingMemory.value && selectedMemory.value)
      await app.updateMemory(selectedMemory.value.id, input);
    else await app.addMemory(input);
    const key = memoryDraftKey();
    if (key) uni.removeStorageSync(key);
    replace('memories', profileQuery());
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
  if (props.page === 'chat' && chatDraftKey()) uni.setStorageSync(chatDraftKey(), value);
});
function toggleChatMemory(id: string) {
  selectedChatMemories.value = selectedChatMemories.value.includes(id)
    ? selectedChatMemories.value.filter((current) => current !== id)
    : [...selectedChatMemories.value, id].slice(0, 5);
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
    const anchor = document.getElementById('chat-end');
    anchor?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  });
}
watch(() => [app.messages.length, pendingChatText.value, chatReplyPending.value], scrollChatToEnd, {
  flush: 'post',
});

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
      createStep.value = 1;
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
    createStep.value = 1;
  }
  profileDraftOwner = userId;
  if (form.relationship || form.nickname || form.callMe || form.story) return;
  const draft = uni.getStorageSync('yinghuo.profileDraft.' + userId) as
    | {
        step?: number;
        name?: string;
        relationship?: string;
        nickname?: string;
        callMe?: string;
        story?: string;
      }
    | undefined;
  if (!draft || typeof draft !== 'object') return;
  restoringDraft = true;
  form.name = typeof draft.name === 'string' ? draft.name : '';
  form.relationship = typeof draft.relationship === 'string' ? draft.relationship : form.name;
  form.nickname = typeof draft.nickname === 'string' ? draft.nickname : '';
  form.callMe = typeof draft.callMe === 'string' ? draft.callMe : '';
  form.story = typeof draft.story === 'string' ? draft.story : '';
  createStep.value = Math.min(3, Math.max(1, Number(draft.step) || 1));
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
  if (
    !form.relationship &&
    !form.nickname &&
    !form.callMe &&
    !form.story &&
    createStep.value === 1
  ) {
    uni.removeStorageSync(key);
    return;
  }
  uni.setStorageSync(key, {
    step: createStep.value,
    name: form.name,
    relationship: form.relationship,
    nickname: form.nickname,
    callMe: form.callMe,
    story: form.story,
  });
}

watch(
  () => [
    props.page,
    app.session.userId,
    editing.value,
    createStep.value,
    form.name,
    form.relationship,
    form.nickname,
    form.callMe,
    form.story,
  ],
  saveProfileDraft,
  { flush: 'sync' },
);

function memoryDraftKey() {
  return app.session.userId && app.currentId
    ? 'yinghuo.memoryDraft.' + app.session.userId + '.' + app.currentId
    : '';
}

function storyDraftKey() {
  return app.session.userId ? 'yinghuo.storyDraft.' + app.session.userId : '';
}

function restoreEditorDraft() {
  if (editingMemory.value || editingStory.value) return;
  const key =
    props.page === 'memory-edit'
      ? memoryDraftKey()
      : props.page === 'compose'
        ? storyDraftKey()
        : '';
  if (!key || form.title || form.body) return;
  const draft = uni.getStorageSync(key) as { title?: string; body?: string } | undefined;
  if (!draft || typeof draft !== 'object') return;
  form.title = typeof draft.title === 'string' ? draft.title : '';
  form.body = typeof draft.body === 'string' ? draft.body : '';
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
  uni.setStorageSync(key, { title: form.title, body: form.body });
}

watch(() => [app.session.userId, app.currentId, form.title, form.body], saveEditorDraft, {
  flush: 'sync',
});

function publish() {
  const action = () =>
    app.run(async () => {
      const input = {
        title: form.title,
        body: form.body,
        visibility: form.public ? 'public' : 'private',
        publicConsent: form.publicConsent,
      };
      if (editingStory.value && selectedPost.value)
        await app.updatePost(selectedPost.value.id, input);
      else await app.publish(input);
      const key = storyDraftKey();
      if (key) uni.removeStorageSync(key);
      replace('square', '?view=mine');
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
        replace('square', '?view=mine');
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
  uni.showModal({
    title: '生成新的安全恢复码？',
    content: '新的恢复码只显示这一次；再次生成会让旧恢复码失效。请复制后保存在安全的地方。',
    confirmText: '生成恢复码',
    cancelText: '取消',
    success: (result) => {
      if (!result.confirm) return;
      void app.run(async () => {
        const bundle = await app.createRecoveryCode();
        generatedRecoveryCode.value = bundle.recoveryCode;
        app.status = '恢复码已生成，请立即复制保存。';
      });
    },
  });
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
    content: '这个人物、相关记忆和对话内容会被永久清除，其他萤火不受影响。',
    confirmText: '永久删除',
    cancelText: '取消',
    success: (result) => {
      if (!result.confirm) return;
      void app.run(async () => {
        await app.deleteProfile(profileId);
        replace('space');
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
      '请先保存安全恢复码',
      '当前空间还没有安全恢复码。请先生成并妥善保存，否则退出后将无法找回这些记忆。',
    );
    return;
  }
  uni.showModal({
    title: '离开当前空间？',
    content: '退出会清除这台设备的登录。只有保存过安全恢复码，才能重新找回这个空间。',
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
    <view v-else-if="!app.bootstrap && page !== 'home'" class="empty" role="alert">
      <h2>暂时无法打开萤火</h2>
      <p>{{ app.error || '请检查网络，稍后再试。' }}</p>
      <button class="btn secondary" @click="onRetry">重试</button>
    </view>
    <template v-else>
      <view v-if="app.error" class="notice error" role="alert">{{ app.error }}</view>
      <view v-if="app.status" class="notice" role="status">{{ app.status }}</view>
      <template v-if="page === 'home'">
        <view
          v-if="isWeChat && !environmentNoticeDismissed"
          class="notice environment-notice"
          role="status"
        >
          <text
            >微信内置浏览器可能无法下载备份文件；记录内容不受影响，导出时建议用系统浏览器打开。</text
          >
          <button
            class="text-button"
            aria-label="关闭提示"
            @click="environmentNoticeDismissed = true"
          >
            知道了
          </button>
        </view>
        <view class="hero"
          ><text class="wordmark">萤火</text><text class="eyebrow">FIREFLY · 珍藏每一点光</text>
          <h1>让想念，<br />有一个地方安放。</h1>
          <p>无论 TA 是否在身边，都可以从一句话开始，珍藏你们的故事。</p>
          <view class="hero-art"
            ><view class="sprite mascot" role="img" aria-label="小萤，萤火记忆伙伴"
          /></view>
          <button class="btn" :disabled="app.busy || loading" @click="openHomePrimary">
            {{
              loading
                ? '正在找回你的萤火…'
                : app.busy
                  ? '正在进入…'
                  : app.current
                    ? '进入' + app.current.name + '的萤火'
                    : '为 TA 建立记忆空间'
            }}
          </button>
          <button
            class="text-button home-recover"
            :disabled="app.busy || loading"
            @click="go('login', '?mode=recover')"
          >
            找回或切换已有萤火
          </button>
        </view>
        <view class="home-actions">
          <button
            class="home-action"
            :disabled="app.busy || loading"
            @click="needProfile('memory-edit')"
          >
            <AppIcon name="book" />
            <view><strong>记录一段记忆</strong><small>留下一句话或一件小事</small></view>
          </button>
          <button class="home-action" @click="go('square')">
            <AppIcon name="spark" />
            <view><strong>看看广场故事</strong><small>读故事示例和已公开故事</small></view>
          </button>
        </view>
      </template>
      <template v-else-if="page === 'login'">
        <view class="center"
          ><view class="sprite mascot large" role="img" aria-label="小萤" />
          <h1>{{ recovering ? '找回已有萤火' : '先从一段故事开始。' }}</h1>
          <p class="caption">
            {{ recovering ? '找回后，这台设备的新内容可以一并合入。' : '先看看萤火如何收藏记忆。' }}
          </p></view
        >
        <view v-if="!recovering" class="card"
          ><h3>继续体验</h3>
          <p class="caption">无需注册即可开始；创建后可在“我的”保存安全恢复码。</p>
          <button
            class="btn"
            :disabled="app.busy"
            @click="
              app.run(async () => {
                await app.login();
                replace(nextAfterLogin);
              })
            "
          >
            {{ app.busy ? '正在进入…' : '开始体验' }}
          </button></view
        >
        <view class="notice">{{
          hostedPreview
            ? '当前设备登录通常保留 30 天；请在“我的”保存安全恢复码。'
            : '请在“我的”保存安全恢复码，以便更换设备后找回。'
        }}</view>
        <view class="card recovery-card">
          <h3>找回已有空间</h3>
          <p class="caption">填写萤火号，并同时输入安全恢复码。未验证手机号不能用于找回。</p>
          <label class="field"
            ><text>萤火号</text
            ><input v-model="form.familyCode" maxlength="24" placeholder="请输入你的萤火号"
          /></label>
          <label class="field"
            ><text>安全恢复码</text
            ><input
              v-model="form.recoveryCode"
              maxlength="40"
              placeholder="例如：YH-XXXX-XXXX-XXXX-XXXX-XXXX"
          /></label>
          <button class="btn secondary" :disabled="app.busy" @click="recoverAccount">
            {{ app.busy ? '正在找回…' : '找回我的萤火' }}
          </button>
        </view>
        <button
          v-if="recovering && app.session.userId"
          class="btn secondary"
          @click="replace('me')"
        >
          返回当前体验空间
        </button>
      </template>
      <template v-else-if="page === 'create'">
        <h1>{{ editing ? '补充 TA 的故事' : '为重要的人，留下一束光' }}</h1>
        <p class="caption">
          {{ editing ? '修改记忆空间资料。' : '不用一次准备齐全，三步就能开始。' }}
        </p>
        <view v-if="!editing" class="notice"
          >当前设备登录通常保留 30 天。创建后请到“我的”保存安全恢复码。</view
        >
        <view v-if="!app.session.userId" class="card"
          ><p>先进入体验空间，再继续填写。</p>
          <button class="btn" @click="go('login', '?next=create')">继续体验</button></view
        >
        <template v-else-if="editing">
          <view class="avatar-editor">
            <image
              v-if="!form.removeAvatar && (form.avatarDataUrl || app.current?.avatarUrl)"
              class="profile-avatar large"
              :src="form.avatarDataUrl || app.current?.avatarUrl || ''"
              mode="aspectFill"
            />
            <view v-else class="profile-avatar large fallback">{{ formInitial() }}</view>
            <view>
              <button class="avatar-button" @click="chooseProfileAvatar">更换头像</button>
              <button
                v-if="!form.removeAvatar && (form.avatarDataUrl || app.current?.avatarUrl)"
                class="text-button avatar-remove"
                @click="removeProfileAvatar"
              >
                移除头像
              </button>
              <small>不上传时显示昵称或身份的第一个字</small>
            </view>
          </view>
          <label class="field"
            ><text>TA 的身份或关系</text
            ><input v-model="form.relationship" maxlength="40" placeholder="例如：妈妈"
          /></label>
          <label class="field"
            ><text>昵称（选填）</text
            ><input v-model="form.nickname" maxlength="40" placeholder="例如：芳姨、小明"
          /></label>
          <label class="field"
            ><text>TA 怎么称呼你？（选填）</text
            ><input v-model="form.callMe" maxlength="40" placeholder="例如：小雨"
          /></label>
          <label class="field"
            ><text>关于 TA 的故事（选填）</text
            ><textarea
              v-model="form.story"
              maxlength="1000"
              placeholder="TA常说的一句话，或一个小习惯…"
            />
          </label>
          <view class="notice">这段资料同时作为 TA 的第一条记忆；修改后会同步更新该记忆。</view>
          <button class="btn" :disabled="app.busy || !form.relationship.trim()" @click="create">
            {{ app.busy ? '正在保存…' : '保存资料' }}
          </button>
          <button class="btn danger" :disabled="app.busy" @click="confirmDeleteProfile">
            删除这束萤火
          </button>
        </template>
        <template v-else>
          <view class="create-progress">
            <text class="badge">第 {{ createStep }} 步 · 共 3 步</text>
            <view class="progress-track"
              ><view class="progress-value" :style="{ width: (createStep / 3) * 100 + '%' }"
            /></view>
          </view>
          <template v-if="createStep === 1">
            <h2>你想为谁留下这束光？</h2>
            <p class="caption">先选择身份；昵称和头像都可以不填。</p>
            <view class="chips">
              <button
                v-for="r in relationshipOptions"
                :key="r"
                class="chip"
                :class="{ active: form.relationship === r }"
                @click="form.relationship = r"
              >
                {{ r }}
              </button>
            </view>
            <label class="field"
              ><text>身份或关系</text
              ><input v-model="form.relationship" maxlength="40" placeholder="例如：姥姥、叔叔"
            /></label>
            <label class="field"
              ><text>昵称（选填）</text
              ><input v-model="form.nickname" maxlength="40" placeholder="例如：芳姨、小明"
            /></label>
            <view class="avatar-editor">
              <image
                v-if="form.avatarDataUrl"
                class="profile-avatar large"
                :src="form.avatarDataUrl"
                mode="aspectFill"
              />
              <view v-else class="profile-avatar large fallback">{{ formInitial() }}</view>
              <view>
                <button class="avatar-button" @click="chooseProfileAvatar">上传头像（选填）</button>
                <small>不上传时自动显示“{{ formInitial() }}”</small>
              </view>
            </view>
            <button class="btn" :disabled="!form.relationship.trim()" @click="nextCreateStep">
              继续
            </button>
          </template>
          <template v-else-if="createStep === 2">
            <h2>TA 平时怎么称呼你？</h2>
            <p class="caption">先记下这个熟悉的称呼，也可以稍后补充。</p>
            <label class="field"
              ><text>TA 对你的称呼（选填）</text
              ><input v-model="form.callMe" maxlength="40" placeholder="例如：小雨、宝贝"
            /></label>
            <view class="step-actions"
              ><button class="btn secondary" @click="previousCreateStep">上一步</button
              ><button class="btn" @click="nextCreateStep">继续</button></view
            >
          </template>
          <template v-else>
            <h2>分享一点关于 TA 的记忆</h2>
            <p class="caption">
              一句常说的话，或一个小习惯。写下后就是 TA 的第一条私密记忆，也可以稍后再写。
            </p>
            <label class="field"
              ><text>关于 {{ profileDisplayName }} 的一件小事</text
              ><textarea
                v-model="form.story"
                maxlength="1000"
                placeholder="例如：每次出门前，TA都会提醒我带伞…"
              />
            </label>
            <view class="step-actions"
              ><button class="btn secondary" @click="previousCreateStep">上一步</button
              ><button
                class="btn"
                :disabled="app.busy || !form.relationship.trim()"
                @click="create"
              >
                {{ app.busy ? '正在保存…' : '保存并进入 TA 的空间' }}
              </button></view
            >
          </template>
        </template>
      </template>
      <template v-else-if="page === 'space'">
        <template v-if="app.current"
          ><view
            v-if="query?.protect === '1' && !app.bootstrap?.recoveryConfigured"
            class="notice protect-memory"
          >
            <strong>这束萤火已保存。</strong>
            <text>现在生成安全恢复码，换设备或登录过期后才能找回。</text>
            <button class="text-button" @click="go('me')">立即保护这些记忆</button> </view
          ><view v-if="app.profiles.length > 1" class="profile-tabs" aria-label="切换萤火">
            <button
              v-for="p in app.profiles"
              :key="p.id"
              class="profile-tab"
              :class="{ active: app.currentId === p.id }"
              @click="switchProfile(p.id)"
            >
              <image
                v-if="p.avatarUrl"
                class="profile-avatar"
                :src="p.avatarUrl"
                mode="aspectFill"
              />
              <view v-else class="profile-avatar fallback">{{ profileInitial(p) }}</view>
              <text>{{ p.name }}</text>
            </button>
          </view>
          <view class="cover"
            ><view class="sprite flowers" /><text>每一件小事，<br />都值得被记住。</text></view
          ><view class="section"
            ><view class="profile-heading">
              <image
                v-if="app.current.avatarUrl"
                class="profile-avatar large"
                :src="app.current.avatarUrl"
                mode="aspectFill"
              />
              <view v-else class="profile-avatar large fallback">{{
                profileInitial(app.current)
              }}</view>
              <h1>{{ app.current.name }}的萤火</h1>
            </view>
            <text class="badge">私密空间</text></view
          >
          <view class="stats"
            ><view
              ><strong>{{ app.memories.length }}</strong
              ><small>条私密记忆</small></view
            ></view
          >
          <view v-if="app.memories[0]" class="card first-memory"
            ><text class="badge">{{
              app.memories.length === 1 ? '第一条记忆 · 仅自己可见' : '最近留下的记忆 · 仅自己可见'
            }}</text>
            <h2>{{ app.memories[0].title }}</h2>
            <p class="prose">{{ app.memories[0].body }}</p>
            <button class="text-button" @click="go('memories', profileQuery())">
              看看全部记忆
            </button></view
          ><view v-else class="card empty"
            ><h2>还没有记忆</h2>
            <p>不用准备很多，先留下一句话就好。</p>
            <button class="text-button" @click="go('memory-edit', profileQuery())">
              写第一条记忆
            </button></view
          >
          <button v-if="chatAvailable" class="btn" @click="go('chat', profileQuery())">
            和 {{ app.current.name }} 说说话
          </button>
          <button
            class="btn"
            :class="{ secondary: chatAvailable }"
            @click="go('memory-edit', profileQuery())"
          >
            再记录一段记忆
          </button>
          <view class="grid2 section"
            ><button class="tile" @click="go('memories', profileQuery())">
              <AppIcon name="book" /><text>回看记忆</text></button
            ><button class="tile" @click="go('square')">
              <AppIcon name="spark" /><text>看看广场</text>
            </button></view
          >
          <view class="card"
            ><button class="row" @click="go('create', '?edit=1&profileId=' + app.currentId)">
              人物资料</button
            ><button class="row" @click="go('create')">再创建一束萤火</button></view
          > </template
        ><view v-else class="empty"
          ><view class="sprite mascot large" />
          <h1>第一束光，从你开始</h1>
          <p>为重要的人，先留下一段文字故事。</p>
          <button class="btn" :disabled="app.busy" @click="start">创建 TA 的萤火</button></view
        >
      </template>
      <template v-else-if="page === 'memories'">
        <view v-if="app.profiles.length > 1" class="profile-tabs" aria-label="切换萤火">
          <button
            v-for="p in app.profiles"
            :key="p.id"
            class="profile-tab"
            :class="{ active: app.currentId === p.id }"
            @click="switchProfile(p.id)"
          >
            <image v-if="p.avatarUrl" class="profile-avatar" :src="p.avatarUrl" mode="aspectFill" />
            <view v-else class="profile-avatar fallback">{{ profileInitial(p) }}</view>
            <text>{{ p.name }}</text>
          </button>
        </view>
        <view class="section"
          ><h1>{{ app.current ? app.current.name + '的记忆' : '萤火记忆' }}</h1>
          <button class="icon-button" aria-label="添加记忆" @click="needProfile('memory-edit')">
            <AppIcon name="plus" /></button
        ></view>
        <p class="caption">每一段文字都只属于你的私密空间。</p>
        <button
          v-for="m in app.memories"
          :key="m.id"
          class="card memory-card"
          @click="go('memory', '?id=' + m.id + '&profileId=' + app.currentId)"
        >
          <h3>{{ m.title }}</h3>
          <p>{{ m.body }}</p>
          <small>仅自己可见</small>
        </button>
        <view v-if="!app.memories.length" class="empty"
          ><p>{{ app.current ? app.current.name + '还没有记忆。' : '先创建一束萤火。' }}</p></view
        ><button class="btn" @click="needProfile('memory-edit')">记录一段记忆</button>
      </template>
      <template v-else-if="page === 'memory-edit'">
        <h1>{{ editingMemory ? '修改这段记忆' : '把这一刻，慢慢留下。' }}</h1>
        <view v-if="query?.type" class="notice"
          >照片、声音和视频稍后开放。现在可以先记下一段文字。</view
        >
        <template v-if="app.current"
          ><label class="field"
            ><text>记忆标题</text
            ><input v-model="form.title" maxlength="120" placeholder="例如：妈妈的拿手菜" /></label
          ><label class="field"
            ><text>关于这段记忆</text
            ><textarea v-model="form.body" maxlength="5000" placeholder="记录一件关于 TA 的小事…" />
          </label>
          <button
            class="btn"
            :disabled="app.busy || !form.title.trim() || !form.body.trim()"
            @click="memorySave"
          >
            {{ app.busy ? '正在保存…' : editingMemory ? '保存修改' : '保存记忆' }}
          </button></template
        >
        <button v-else class="btn" @click="start">先创建 TA 的萤火</button>
      </template>
      <template v-else-if="page === 'memory'">
        <template v-if="selectedMemory"
          ><text class="badge">私密记忆</text>
          <h1>{{ selectedMemory.title }}</h1>
          <p class="prose">{{ selectedMemory.body }}</p>
          <view class="notice"
            >这段记忆只对你可见 ·
            {{ new Date(selectedMemory.createdAt).toLocaleDateString('zh-CN') }}</view
          >
          <button
            class="btn"
            @click="go('memory-edit', '?id=' + selectedMemory.id + '&profileId=' + app.currentId)"
          >
            编辑这段记忆
          </button>
          <button class="btn secondary" :disabled="app.busy" @click="confirmDeleteMemory">
            {{ app.busy ? '正在删除…' : '删除这段记忆' }}
          </button></template
        ><view v-else class="empty"
          ><h2>这段记忆暂时找不到</h2>
          <button class="btn secondary" @click="go('memories')">返回记忆库</button></view
        >
      </template>
      <template v-else-if="page === 'chat'">
        <template v-if="chatAvailable && app.current">
          <view class="chat-heading">
            <image
              v-if="app.current.avatarUrl"
              class="profile-avatar large"
              :src="app.current.avatarUrl"
              mode="aspectFill"
            />
            <view v-else class="profile-avatar large fallback">{{
              profileInitial(app.current)
            }}</view>
            <view
              ><h1>{{ app.current.name }} <small>· 萤火陪伴</small></h1>
              <p :class="{ 'typing-status': chatReplyPending }">
                {{ chatReplyPending ? '正在输入…' : '聊聊你们留下的故事' }}
              </p></view
            >
          </view>
          <view class="chat-disclosure" role="note">
            回复由 AI 根据你本次授权的对话和记忆生成，不代表 TA 本人。
          </view>
          <view v-if="app.memories.length" class="chat-context">
            <strong>这次想聊哪段记忆？</strong>
            <p>可选，默认不发送记忆。最多选择 5 条。</p>
            <view class="chips">
              <button
                v-for="memory in app.memories"
                :key="memory.id"
                class="chip"
                :class="{ active: selectedChatMemories.includes(memory.id) }"
                @click="toggleChatMemory(memory.id)"
              >
                {{ memory.title }}
              </button>
            </view>
          </view>
          <view
            v-if="!app.messages.some((item) => !item.mock) && !pendingChatText"
            class="empty chat-welcome"
          >
            <p>可以从一句话开始：“我想聊聊那次一起做饭的事。”</p>
          </view>
          <view class="chat-list" aria-live="polite">
            <view
              v-for="message in app.messages.filter((item) => !item.mock)"
              :key="message.id"
              class="message-row"
              :class="{ user: message.role === 'user' }"
            >
              <template v-if="message.role === 'assistant'">
                <image
                  v-if="app.current.avatarUrl"
                  class="profile-avatar chat-avatar"
                  :src="app.current.avatarUrl"
                  mode="aspectFill"
                />
                <view v-else class="profile-avatar fallback chat-avatar">{{
                  profileInitial(app.current)
                }}</view>
              </template>
              <view class="bubble" :class="{ user: message.role === 'user' }">
                <small>{{
                  message.role === 'user' ? '我' : app.current.name + ' · 萤火陪伴'
                }}</small>
                <text>{{ message.text }}</text>
              </view>
            </view>
            <view v-if="pendingChatText" class="message-row user pending-message">
              <view class="bubble user"
                ><small>我</small><text>{{ pendingChatText }}</text></view
              >
            </view>
            <view v-if="chatReplyPending" class="message-row typing-row" role="status">
              <image
                v-if="app.current.avatarUrl"
                class="profile-avatar chat-avatar"
                :src="app.current.avatarUrl"
                mode="aspectFill"
              />
              <view v-else class="profile-avatar fallback chat-avatar">{{
                profileInitial(app.current)
              }}</view>
              <view class="bubble typing-bubble" :aria-label="app.current.name + '正在输入'">
                <small>{{ app.current.name }} · 正在输入</small>
                <view class="typing-dots" aria-hidden="true"> <text /><text /><text /> </view>
              </view>
            </view>
          </view>
          <button
            v-if="app.messages.some((item) => !item.mock)"
            class="text-button chat-reset"
            :disabled="app.busy"
            @click="clearConversation"
          >
            开始一段新对话
          </button>
          <checkbox-group @change="chatConsent = $event.detail.value.length > 0">
            <label class="check chat-consent"
              ><checkbox
                value="agree"
                :checked="chatConsent"
              />我同意使用这次对话和选中的记忆生成回复。</label
            >
          </checkbox-group>
          <view class="chat-input">
            <input
              v-model="chatText"
              maxlength="500"
              placeholder="想说点什么…"
              @confirm="sendChat"
            />
            <button
              class="icon-button"
              aria-label="发送消息"
              :disabled="app.busy || !chatText.trim() || !chatConsent"
              @click="sendChat"
            >
              <AppIcon name="arrow" />
            </button>
          </view>
          <view id="chat-end" class="chat-end" aria-hidden="true" />
        </template>
        <view v-else class="empty">
          <view class="sprite mascot large" role="img" aria-label="小萤" />
          <h1>记忆对话暂时无法使用</h1>
          <p>现在可以先留下关于 TA 的故事，稍后再回来聊聊。</p>
          <button class="btn secondary" @click="go('space')">返回记忆空间</button>
        </view>
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
        <button class="btn secondary" @click="choosePhoto">选择照片 · 仅本机查看</button
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
          ><button class="btn secondary" @click="go('space')">去记录一段文字记忆</button></view
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
            @click="enter('compose')"
          >
            写故事
          </button></view
        >
        <view class="chips"
          ><button
            v-for="v in ['精选', '我的']"
            :key="v"
            class="chip"
            :class="{ active: squareView === v }"
            @click="squareView = v"
          >
            {{ v }}
          </button></view
        >
        <view v-if="squareView === '精选'">
          <view v-for="story in app.publicPosts" :key="story.id" class="card">
            <text class="badge">用户故事 · 已自动检查</text>
            <h2>{{ story.title }}</h2>
            <p class="prose story-excerpt">{{ story.body }}</p>
            <button class="text-button" @click="go('story', '?id=' + story.id)">读这个故事</button>
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
              class="sprite flowers photo"
              role="img"
              aria-label="窗边的小雏菊"
            />
            <text class="badge">写作示例 · 非真实用户</text>
            <h2>{{ story.title }}</h2>
            <p class="prose story-excerpt">{{ story.excerpt }}</p>
            <button class="text-button" @click="go('story', '?id=' + story.id)">读这个故事</button>
          </view>
        </view>
        <template v-else
          ><button
            v-for="p in app.posts"
            :key="p.id"
            class="card memory-card"
            @click="go('story', '?id=' + p.id)"
          >
            <text class="badge">{{
              p.moderation === 'pending'
                ? '正在检查，尚未公开'
                : p.moderation === 'rejected'
                  ? '未通过公开检查'
                  : p.visibility === 'public'
                    ? '已公开'
                    : '仅自己'
            }}</text>
            <h3>{{ p.title }}</h3>
            <p>{{ p.body }}</p>
            <small v-if="p.moderation === 'rejected' && p.moderationReason">{{
              p.moderationReason
            }}</small></button
          ><view v-if="!app.posts.length" class="empty"
            ><p>还没有自己的故事，可以从一句话开始。</p>
            <button class="text-button" @click="enter('compose')">写第一个故事</button></view
          ></template
        >
        <view class="notice"
          >故事默认仅自己可见；选择公开后会经过自动检查和人工审核，审核通过后才会在广场展示。</view
        >
      </template>
      <template v-else-if="page === 'story'">
        <view v-if="selectedSample"
          ><view class="sprite flowers photo" /><text class="badge">写作示例 · 非真实用户</text>
          <h1>{{ selectedSample.title }}</h1>
          <p class="prose">{{ selectedSample.body }}</p></view
        >
        <view v-else-if="selectedPost"
          ><text class="badge">{{
            selectedPost.moderation === 'pending'
              ? '正在检查'
              : selectedPost.moderation === 'rejected'
                ? '未通过公开检查'
                : selectedPost.visibility === 'public'
                  ? '已公开'
                  : '仅自己'
          }}</text>
          <h1>{{ selectedPost.title }}</h1>
          <p class="prose">{{ selectedPost.body }}</p>
          <view
            v-if="selectedPost.moderation === 'rejected' && selectedPost.moderationReason"
            class="notice error"
          >
            {{ selectedPost.moderationReason }}
          </view>
          <template v-if="ownsSelectedPost">
            <button class="btn" @click="editStory">编辑这个故事</button>
            <button class="btn secondary" :disabled="app.busy" @click="confirmDeleteStory">
              删除这个故事
            </button>
          </template></view
        ><view v-else class="notice">故事不存在或当前账号不可访问。</view>
        <button class="btn secondary" @click="go('square')">返回广场</button>
      </template>
      <template v-else-if="page === 'compose'">
        <h1>{{ editingStory ? '修改这个故事' : '写下一个故事' }}</h1>
        <p class="caption">先写给自己看，想说多少都可以。</p>
        <template v-if="app.session.userId">
          <label class="field"
            ><text>故事标题</text
            ><input v-model="form.title" maxlength="60" placeholder="给这段故事起个名字" /></label
          ><label class="field"
            ><text>正文</text
            ><textarea
              v-model="form.body"
              maxlength="3000"
              placeholder="一句话、一件小事，都可以。"
            />
          </label>
          <view v-if="app.bootstrap?.features?.publicSquare" class="visibility-picker">
            <text>谁可以看到</text>
            <view class="visibility-options">
              <button :class="{ active: !form.public }" @click="form.public = false">
                <strong>仅自己可见</strong><small>保存在「广场 · 我的」</small>
              </button>
              <button :class="{ active: form.public }" @click="form.public = true">
                <strong>公开到广场</strong><small>自动检查通过后所有人可见</small>
              </button>
            </view>
          </view>
          <checkbox-group v-if="form.public" @change="toggle('publicConsent', $event)"
            ><label class="check"
              ><checkbox value="yes" :checked="form.publicConsent" />我确认有权公开这些内容。</label
            ></checkbox-group
          >
          <view v-else class="caption">默认仅自己可见，其他人看不到。</view>
          <button
            class="btn"
            :disabled="
              app.busy ||
              !form.title.trim() ||
              !form.body.trim() ||
              (form.public && !form.publicConsent)
            "
            @click="publish"
          >
            {{
              app.busy
                ? '正在保存…'
                : editingStory
                  ? '保存修改'
                  : form.public
                    ? '确认并申请公开'
                    : '保存给自己'
            }}
          </button></template
        ><button v-else class="btn" @click="go('login', '?next=compose')">继续体验</button>
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
          <button class="btn secondary" :disabled="app.busy" @click="downloadAccountExport">
            导出我的全部数据
          </button>
          <label class="field danger-zone">
            <text>清除个人内容并永久删除账号</text>
            <input v-model="form.deleteConfirmation" placeholder="输入：永久删除" />
          </label>
          <button
            class="btn danger"
            :disabled="app.busy || form.deleteConfirmation.trim() !== '永久删除'"
            @click="confirmDeleteAccount"
          >
            永久删除账号
          </button>
        </view>
        <button class="btn secondary" @click="go('terms')">查看用户协议与 AI 说明</button>
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
            class="btn"
            :disabled="app.busy || form.feedbackBody.trim().length < 2"
            @click="submitFeedback"
          >
            {{ app.busy ? '正在提交…' : '提交反馈' }}
          </button>
        </view>
        <button v-else class="btn" @click="go('login')">进入体验空间后反馈</button>
      </template>
      <template v-else-if="page === 'me'">
        <view class="section"
          ><view
            ><h1>{{ app.session.userId ? '你好，记忆收藏家' : '欢迎来到萤火' }}</h1>
            <p class="caption">
              {{ app.session.userId ? '我的体验空间' : '把重要的人，慢慢记住。' }}
            </p></view
          ><view class="sprite mascot mini"
        /></view>
        <button v-if="!app.session.userId" class="btn" @click="go('login')">开始体验</button>
        <view v-if="app.session.userId" class="card account-card">
          <text class="badge">{{
            app.bootstrap?.phoneVerified ? '已验证账号' : '临时匿名账号'
          }}</text>
          <h2>我的萤火号</h2>
          <button
            class="account-code"
            :aria-label="'复制萤火号 ' + (app.session.familyCode || '')"
            @click="copyText(app.session.familyCode || '', '萤火号')"
          >
            {{ app.session.familyCode || '正在识别…' }}
          </button>
          <p class="caption">这是公开识别号，不能单独登录。当前设备登录通常保留 30 天。</p>
          <view
            v-if="app.bootstrap?.recoveryConfigured && !generatedRecoveryCode"
            class="notice recovery-status"
          >
            安全恢复码已设置。只要已经妥善保存，就无需重复生成；重新生成会让旧码失效。
          </view>
          <template v-if="generatedRecoveryCode">
            <view class="recovery-secret">
              <small>安全恢复码 · 只显示这一次</small>
              <strong>{{ generatedRecoveryCode }}</strong>
            </view>
            <button class="btn" @click="copyText(generatedRecoveryCode, '安全恢复码')">
              复制安全恢复码
            </button>
          </template>
          <button v-else class="btn secondary" :disabled="app.busy" @click="createRecoveryCode">
            {{
              app.busy
                ? '正在生成…'
                : app.bootstrap?.recoveryConfigured
                  ? '重新生成安全恢复码'
                  : '生成安全恢复码'
            }}
          </button>
          <p class="account-warning">
            {{
              app.bootstrap?.recoveryConfigured
                ? '请继续妥善保存恢复码；萤火不会通过客服向你索要。'
                : '请先生成并保存恢复码，否则退出或登录过期后将无法找回这个空间。'
            }}
          </p>
          <button class="phone-bind-row" @click="showPhoneBinding">
            <view
              ><strong>手机号尾号（未验证）</strong
              ><small>仅保存摘要和后四位，不能联系或找回</small></view
            >
            <text>{{ app.bootstrap?.boundPhone || '去填写' }}</text>
          </button>
          <view v-if="phonePanelOpen" class="phone-bind-panel">
            <h3>{{ app.bootstrap?.boundPhone ? '修改手机号记录' : '填写手机号记录' }}</h3>
            <p class="caption">
              不发送短信验证码，因此不会将它视为已验证身份。换设备找回必须使用萤火号和安全恢复码。
            </p>
            <label class="field">
              <text>手机号码</text>
              <input
                v-model="form.phone"
                type="number"
                maxlength="11"
                placeholder="请输入 11 位手机号"
              />
            </label>
            <view v-if="!app.bootstrap?.recoveryConfigured" class="notice phone-safety-note">
              绑定后请立即生成并保存安全恢复码，否则手机号不能单独找回空间。
            </view>
            <button class="btn" :disabled="app.busy" @click="bindPhone">
              {{ app.busy ? '正在保存…' : '保存手机号记录' }}
            </button>
            <button
              v-if="app.bootstrap?.boundPhone"
              class="text-button phone-cancel"
              :disabled="app.busy"
              @click="clearPhone"
            >
              移除手机号记录
            </button>
            <button class="text-button phone-cancel" @click="phonePanelOpen = false">
              暂不填写
            </button>
          </view>
        </view>
        <view class="grid2"
          ><button class="tile" @click="needProfile('memories')">
            <AppIcon name="book" /><text>我的记忆</text></button
          ><button class="tile" @click="go('privacy')">
            <AppIcon name="user" /><text>账号与数据</text>
          </button></view
        >
        <view class="card"
          ><button class="row" @click="go('square', '?view=mine')">我的广场故事</button
          ><button class="row" @click="go('login', '?mode=recover')">找回或切换已有空间</button
          ><button class="row" @click="go('privacy')">隐私与数据</button
          ><button class="row" @click="go('terms')">用户协议与 AI 说明</button
          ><button class="row" @click="go('support')">帮助与反馈</button></view
        >
        <button
          v-if="app.session.userId"
          class="btn secondary"
          :disabled="app.busy"
          @click="confirmLogout"
        >
          退出体验空间
        </button>
      </template>
    </template>
  </AppShell>
</template>
