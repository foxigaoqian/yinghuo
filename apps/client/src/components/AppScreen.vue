<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import { useAppStore } from '../stores/app';
import { api, requestKey } from '../services/api';
import AppShell from './AppShell.vue';
import AppIcon from './AppIcon.vue';
const props = defineProps<{ page: string; title: string; query?: Record<string, string> }>();
const app = useAppStore();
const form = reactive({
  name: '',
  callMe: '',
  story: '',
  aiConsent: false,
  title: '',
  body: '',
  useForAi: false,
  public: false,
  publicConsent: false,
});
const chatText = ref('');
const chatClientMessageId = ref('');
const createStep = ref(1);
const squareView = ref('精选');
const preview = ref('');
let restoringDraft = false;
let profileDraftOwner = '';
let chatDraftTimer: ReturnType<typeof setTimeout> | undefined;
const selectedMemory = computed(() => app.memories.find((m) => m.id === props.query?.id));
const selectedPost = computed(() => app.posts.find((p) => p.id === props.query?.id));
const editing = computed(() => props.query?.edit === '1');
onShow(() => {
  void app.run(async () => {
    await app.refresh();
    restoreProfileDraft();
    restoreChatDraft();
  });
});
onHide(() => saveChatDraft());
watch(
  () => app.current,
  (p) => {
    if (editing.value && p)
      Object.assign(form, {
        name: p.name,
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
function start() {
  go(app.session.userId ? 'create' : 'login');
}
function needProfile(next: string) {
  if (!app.session.userId) go('login');
  else if (!app.current) go('create');
  else go(next);
}
function toggle(key: 'aiConsent' | 'useForAi' | 'public' | 'publicConsent', e: any) {
  form[key] = e.detail.value.length > 0;
}
function create() {
  void app.run(async () => {
    await app.addProfile(
      { name: form.name, callMe: form.callMe, story: form.story, aiConsent: form.aiConsent },
      editing.value,
    );
    if (!editing.value && app.session.userId)
      uni.removeStorageSync('yinghuo.profileDraft.' + app.session.userId);
    go(editing.value ? 'space' : 'chat');
  });
}
function nextCreateStep() {
  if (createStep.value === 1 && !form.name.trim()) {
    app.error = '先选择或填写 TA 的称呼。';
    return;
  }
  app.error = '';
  createStep.value = Math.min(3, createStep.value + 1);
}
function previousCreateStep() {
  createStep.value = Math.max(1, createStep.value - 1);
}
function memorySave() {
  void app.run(async () => {
    await app.addMemory({ title: form.title, body: form.body, useForAi: form.useForAi });
    go('memories');
  });
}
function send() {
  if (!chatText.value.trim()) return;
  const text = chatText.value.trim();
  const clientMessageId = chatClientMessageId.value || requestKey();
  void app.run(async () => {
    await app.send(text, clientMessageId);
    chatText.value = '';
    chatClientMessageId.value = '';
    saveChatDraft();
  });
}

function restoreProfileDraft() {
  const userId = app.session.userId;
  if (props.page !== 'create' || editing.value) return;
  if (!userId) {
    if (profileDraftOwner) {
      form.name = '';
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
    form.callMe = '';
    form.story = '';
    form.aiConsent = false;
    createStep.value = 1;
  }
  profileDraftOwner = userId;
  if (form.name || form.callMe || form.story) return;
  const draft = uni.getStorageSync('yinghuo.profileDraft.' + userId) as
    | { step?: number; name?: string; callMe?: string; story?: string }
    | undefined;
  if (!draft || typeof draft !== 'object') return;
  restoringDraft = true;
  form.name = typeof draft.name === 'string' ? draft.name : '';
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
  if (!form.name && !form.callMe && !form.story && createStep.value === 1) {
    uni.removeStorageSync(key);
    return;
  }
  uni.setStorageSync(key, {
    step: createStep.value,
    name: form.name,
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
    form.callMe,
    form.story,
  ],
  saveProfileDraft,
  { flush: 'sync' },
);

function chatDraftKey() {
  return app.session.userId && app.currentId
    ? 'yinghuo.chatDraft.' + app.session.userId + '.' + app.currentId
    : '';
}

function restoreChatDraft() {
  if (props.page !== 'chat' || !app.session.userId || !app.currentId || chatText.value) return;
  const draft = uni.getStorageSync(chatDraftKey()) as
    | { text?: string; clientMessageId?: string }
    | undefined;
  if (!draft || typeof draft.text !== 'string' || !draft.text) return;
  restoringDraft = true;
  chatText.value = draft.text;
  chatClientMessageId.value =
    typeof draft.clientMessageId === 'string' ? draft.clientMessageId : requestKey();
  restoringDraft = false;
  app.status = '已恢复未发送的内容。';
}

function saveChatDraft() {
  if (chatDraftTimer) clearTimeout(chatDraftTimer);
  chatDraftTimer = undefined;
  if (props.page !== 'chat') return;
  const key = chatDraftKey();
  if (!key) return;
  if (!chatText.value.trim()) {
    uni.removeStorageSync(key);
    chatClientMessageId.value = '';
    return;
  }
  if (!chatClientMessageId.value) chatClientMessageId.value = requestKey();
  uni.setStorageSync(key, { text: chatText.value, clientMessageId: chatClientMessageId.value });
}

watch(
  chatText,
  (value, previous) => {
    if (restoringDraft || props.page !== 'chat') return;
    if (value !== previous) chatClientMessageId.value = requestKey();
    if (chatDraftTimer) clearTimeout(chatDraftTimer);
    chatDraftTimer = setTimeout(saveChatDraft, 600);
  },
  { flush: 'sync' },
);
function buy(productId: 'memory-year' | 'photo-restore') {
  if (!app.current) {
    needProfile('plans');
    return;
  }
  void app.run(async () => {
    await app.buy(productId);
    go('orders');
  });
}
function payment(id: string, refund = false) {
  uni.showModal({
    title: refund ? '模拟退款' : '模拟支付',
    content: '仅验证开发流程，不会发生真实扣款或退款。是否继续？',
    success: (r) => {
      if (r.confirm)
        void app.run(async () => {
          await api('/orders/' + id + (refund ? '/dev-refund' : '/dev-pay'), 'POST', {
            confirmMock: true,
          });
          await app.refresh();
        });
    },
  });
}
function publish() {
  const action = () =>
    app.run(async () => {
      await app.publish({
        title: form.title,
        body: form.body,
        visibility: form.public ? 'public' : 'private',
        publicConsent: form.publicConsent,
      });
      go('square');
    });
  if (form.public)
    uni.showModal({
      title: '确认提交到广场？',
      content: '故事将进入待审核；审核服务尚未接入，不会直接公开。请勿提交真实隐私。',
      success: (r) => {
        if (r.confirm) void action();
      },
    });
  else void action();
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
const currency = (fen: number) => (fen / 100).toFixed(2);
function info(title: string, content: string) {
  uni.showModal({ title, content, showCancel: false });
}
</script>
<template>
  <AppShell :page="page" :title="title">
    <view v-if="app.error" class="notice error" role="alert"
      >{{ app.error
      }}<button class="text-button" @click="app.run(app.refresh)">重新连接</button></view
    >
    <view v-if="app.busy" class="notice" role="status">正在处理，请稍候…</view>
    <view v-if="app.status" class="notice" role="status">{{ app.status }}</view>
    <template v-if="page === 'home'">
      <view class="hero"
        ><text class="wordmark">萤火</text><text class="eyebrow">FIREFLY · 珍藏每一点光</text>
        <h1>让想念，<br />有一个地方安放。</h1>
        <p>为重要的人，保存照片、声音和故事。</p>
        <view class="hero-art"
          ><view class="sprite mascot" role="img" aria-label="小萤，萤火记忆伙伴"
        /></view>
        <button class="btn" @click="app.current ? go('chat') : start()">
          {{ app.current ? '和 ' + app.current.name + ' 说说话' : '创建 TA 的萤火' }}
        </button>
        <button class="btn secondary" @click="go('square')">先读一段故事</button>
      </view>
      <view class="grid3"
        ><button class="tile" @click="go('restore')">
          <AppIcon name="photo" /><text>老照片修复</text><small>让瞬间更清晰</small></button
        ><button class="tile" @click="needProfile('memories')">
          <AppIcon name="book" /><text>记忆相册</text><small>珍藏点滴时光</small></button
        ><button class="tile" @click="go('memory-edit', '?type=audio')">
          <AppIcon name="mic" /><text>保存声音</text><small>留住熟悉声音</small>
        </button></view
      >
      <view class="section"
        ><h2>最近的萤火</h2>
        <button class="text-button" @click="go('space')">查看全部</button></view
      >
      <view class="card"
        ><h3>{{ app.current ? app.current.name + '的萤火' : '第一束光，从你开始' }}</h3>
        <p class="caption">不用准备齐全，可以慢慢留下。</p>
        <button class="btn secondary" @click="app.current ? go('space') : start()">
          打开记忆空间
        </button></view
      >
      <view class="section"
        ><h2>广场</h2>
        <button class="text-button" @click="go('square')">读一段故事</button></view
      >
      <view class="card"
        ><view class="sprite flowers photo" role="img" aria-label="窗边的小雏菊" />
        <h3>妈妈窗边的那束花</h3>
        <p class="caption">示例故事 · 每个平凡的日子，都有值得珍藏的光。</p></view
      >
    </template>
    <template v-else-if="page === 'login'">
      <view class="center"
        ><view class="sprite mascot large" role="img" aria-label="小萤" />
        <h1>欢迎，把记忆慢慢留下。</h1>
        <p class="caption">现在可以先用独立演示账号体验。</p></view
      >
      <view class="card"
        ><h3>短信登录待接入</h3>
        <p class="caption">
          你正在申请 API，本阶段不收集手机号、不发送验证码。演示账号仅保存在当前浏览器会话中。
        </p>
        <button
          class="btn"
          :disabled="app.busy"
          @click="
            app.run(async () => {
              await app.login();
              go('space');
            })
          "
        >
          进入演示账号
        </button></view
      >
      <view class="notice"
        >请使用虚构资料。后端重启后需要重新进入，旧演示空间不会自动重新绑定。</view
      >
    </template>
    <template v-else-if="page === 'create'">
      <h1>{{ editing ? '补充 TA 的故事' : '为重要的人，留下一束光' }}</h1>
      <p class="caption">
        {{ editing ? '修改记忆空间资料。' : '不用一次准备齐全，三步就能开始。' }}
      </p>
      <view v-if="!app.session.userId" class="card"
        ><p>请先进入演示账号。</p>
        <button class="btn" @click="go('login')">去登录</button></view
      >
      <template v-else-if="editing">
        <label class="field"
          ><text>你怎么称呼 TA？</text
          ><input v-model="form.name" maxlength="80" placeholder="例如：妈妈"
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
        <checkbox-group @change="toggle('aiConsent', $event)"
          ><label class="check"
            ><checkbox value="yes" :checked="form.aiConsent" />我理解对话由 AI
            生成，不代表本人。</label
          ></checkbox-group
        >
        <button
          class="btn"
          :disabled="app.busy || !form.aiConsent || !form.name.trim()"
          @click="create"
        >
          保存资料
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
          <p class="caption">先选一个称呼，也可以自己填写。</p>
          <view class="chips">
            <button
              v-for="r in ['爸爸', '妈妈', '爷爷', '奶奶', '外公', '外婆', '爱人', '朋友']"
              :key="r"
              class="chip"
              :class="{ active: form.name === r }"
              @click="form.name = r"
            >
              {{ r }}
            </button>
          </view>
          <label class="field"
            ><text>其他称呼</text
            ><input v-model="form.name" maxlength="80" placeholder="例如：姥姥、叔叔"
          /></label>
          <button class="btn" :disabled="!form.name.trim()" @click="nextCreateStep">继续</button>
        </template>
        <template v-else-if="createStep === 2">
          <h2>TA 平时怎么称呼你？</h2>
          <p class="caption">这个称呼会帮助对话更贴近你们的相处方式，可以稍后补充。</p>
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
          <p class="caption">一句常说的话、一个小习惯，或一个你想记住的瞬间。选填。</p>
          <label class="field"
            ><text>关于 {{ form.name }} 的一件小事</text
            ><textarea
              v-model="form.story"
              maxlength="1000"
              placeholder="例如：每次出门前，TA都会提醒我带伞…"
            />
          </label>
          <checkbox-group @change="toggle('aiConsent', $event)"
            ><label class="check"
              ><checkbox value="yes" :checked="form.aiConsent" />我理解对话由 AI
              生成，不代表本人。</label
            ></checkbox-group
          >
          <view class="step-actions"
            ><button class="btn secondary" @click="previousCreateStep">上一步</button
            ><button
              class="btn"
              :disabled="app.busy || !form.aiConsent || !form.name.trim()"
              @click="create"
            >
              创建并开始聊天
            </button></view
          >
        </template>
      </template>
    </template>
    <template v-else-if="page === 'space'">
      <template v-if="app.current"
        ><view class="cover"
          ><view class="sprite flowers" /><text>每一件小事，<br />都值得被记住。</text></view
        ><view class="section"
          ><h1>{{ app.current.name }}的萤火</h1>
          <text class="badge">私密空间</text></view
        >
        <view class="stats"
          ><view
            ><strong>{{ app.memories.length }}</strong
            ><small>条文字记忆</small></view
          ><view
            ><strong>{{ app.messages.filter((m) => m.role === 'user').length }}</strong
            ><small>次演示对话</small></view
          ></view
        >
        <button class="btn" @click="go('chat')">和 TA 说说话<AppIcon name="arrow" /></button>
        <p class="caption center">AI 根据你授权的记忆生成对话 · 当前为模拟</p>
        <view class="grid2 section"
          ><button class="tile" @click="go('memories')">
            <AppIcon name="book" /><text>人生故事</text></button
          ><button class="tile" @click="go('memory-edit', '?type=photo')">
            <AppIcon name="photo" /><text>记忆照片</text></button
          ><button class="tile" @click="go('memory-edit', '?type=audio')">
            <AppIcon name="mic" /><text>原始声音</text></button
          ><button class="tile" @click="go('memory-edit', '?type=video')">
            <AppIcon name="photo" /><text>记忆视频</text>
          </button></view
        >
        <button class="btn secondary" @click="go('memory-edit')">记录一段记忆</button>
        <view class="card"
          ><button class="row" @click="go('create', '?edit=1')">人物资料 →</button
          ><button class="row" @click="go('plans')">价格与权益 →</button
          ><button class="row" @click="go('create')">再创建一束萤火 →</button></view
        >
        <view v-if="app.profiles.length > 1" class="chips"
          ><button
            v-for="p in app.profiles"
            :key="p.id"
            class="chip"
            :class="{ active: app.currentId === p.id }"
            @click="
              app.run(async () => {
                app.select(p.id);
                await app.refresh();
              })
            "
          >
            {{ p.name }}
          </button></view
        > </template
      ><view v-else class="empty"
        ><view class="sprite mascot large" />
        <h1>第一束光，从你开始</h1>
        <p>为重要的人，保存照片、声音和故事。</p>
        <button class="btn" @click="start">创建 TA 的萤火</button></view
      >
    </template>
    <template v-else-if="page === 'memories'">
      <view class="section"
        ><h1>萤火记忆</h1>
        <button class="icon-button" aria-label="添加记忆" @click="needProfile('memory-edit')">
          <AppIcon name="plus" /></button
      ></view>
      <p class="caption">当前已接通文字记录；照片、声音、视频待存储接口。</p>
      <button
        v-for="m in app.memories"
        :key="m.id"
        class="card memory-card"
        @click="go('memory', '?id=' + m.id)"
      >
        <h3>{{ m.title }}</h3>
        <p>{{ m.body }}</p>
        <small>{{ m.useForAi ? '可用于 AI 对话' : '仅保存，不用于 AI' }}</small>
      </button>
      <view v-if="!app.memories.length" class="empty"><p>先留下一句话，或一件小事。</p></view
      ><button class="btn" @click="needProfile('memory-edit')">记录一段记忆</button>
    </template>
    <template v-else-if="page === 'memory-edit'">
      <h1>把这一刻，慢慢留下。</h1>
      <view v-if="query?.type" class="notice"
        >照片、原始声音与视频的上传接口已预留，当前尚未接入。可以先记录文字。</view
      >
      <template v-if="app.current"
        ><label class="field"
          ><text>记忆标题</text
          ><input v-model="form.title" maxlength="120" placeholder="例如：妈妈的拿手菜" /></label
        ><label class="field"
          ><text>关于这段记忆</text
          ><textarea v-model="form.body" maxlength="5000" placeholder="记录一件关于 TA 的小事…" />
        </label>
        <checkbox-group @change="toggle('useForAi', $event)"
          ><label class="check"
            ><checkbox value="yes" :checked="form.useForAi" />允许这段记忆用于 AI
            对话（默认关闭）</label
          ></checkbox-group
        >
        <button
          class="btn"
          :disabled="app.busy || !form.title.trim() || !form.body.trim()"
          @click="memorySave"
        >
          保存记忆
        </button></template
      >
      <button v-else class="btn" @click="start">先创建 TA 的萤火</button>
    </template>
    <template v-else-if="page === 'memory'">
      <template v-if="selectedMemory"
        ><text class="badge">私密记忆</text>
        <h1>{{ selectedMemory.title }}</h1>
        <p class="prose">{{ selectedMemory.body }}</p>
        <view class="notice">{{
          selectedMemory.useForAi ? '已允许用于 AI 对话' : '仅保存，不用于 AI 对话'
        }}</view></template
      ><view v-else class="empty"
        ><h2>这段记忆暂时找不到</h2>
        <button class="btn secondary" @click="go('memories')">返回记忆库</button></view
      >
    </template>
    <template v-else-if="page === 'chat'">
      <view class="notice">AI 记忆对话 · 当前为模拟回复，不代表本人。</view>
      <template v-if="app.current"
        ><h2>{{ app.current.name }}的萤火</h2>
        <view v-if="!app.messages.length" class="empty"
          ><view class="sprite mascot large" />
          <p>想说的话，慢慢说。</p></view
        >
        <view class="chat-list" aria-live="polite"
          ><view
            v-for="m in app.messages"
            :key="m.id"
            class="bubble"
            :class="{ user: m.role === 'user' }"
            >{{ m.text }}</view
          ></view
        >
        <view class="chat-input"
          ><input
            v-model="chatText"
            maxlength="2000"
            placeholder="和 TA 说句话…"
            @confirm="send" /><button
            class="icon-button"
            :disabled="app.busy || !chatText.trim()"
            aria-label="发送消息"
            @click="send"
          >
            <AppIcon name="arrow" /></button></view></template
      ><button v-else class="btn" @click="start">先创建 TA</button>
    </template>
    <template v-else-if="page === 'restore'">
      <h1>让旧照片，重新清晰。</h1>
      <p class="caption">先看看照片，再决定是否修复。</p>
      <image
        v-if="preview"
        :src="preview"
        class="uploaded"
        mode="aspectFit"
        aria-label="本机照片预览"
      /><view v-else class="sprite mother photo" />
      <button class="btn secondary" @click="choosePhoto">选择照片（仅本机预览）</button
      ><view class="notice">修复 API 和云存储待接入。本页不会上传照片，也不会生成修复结果。</view>
      <button class="btn" @click="buy('photo-restore')">体验模拟下单 · ¥2.90</button>
    </template>
    <template v-else-if="page === 'plans'">
      <h1>保存更多记忆</h1>
      <p class="caption">按需要选择，慢慢收藏。</p>
      <view class="card"
        ><h2>基础空间</h2>
        <text class="price">¥0</text>
        <p>1 个免费 TA · 20 条记忆 · 500MB</p>
        <small>规划权益，当前开发模式不提供云空间。</small></view
      >
      <view class="card highlight"
        ><h2>记忆年费</h2>
        <text class="price">¥99<small> / 365天 · 每位TA</small></text
        ><view class="benefits"
          ><p>所选 TA 的 5GB 素材空间</p>
          <p>保存更多照片、声音、视频和故事</p>
          <p>基础文字对话持续使用</p>
          <p>照片修复会员价 ¥1.90 / 张（待实现）</p></view
        ><button class="btn" :disabled="app.busy" @click="buy('memory-year')">
          选择年费 · 模拟下单
        </button></view
      >
      <view class="notice"
        >价格是方案展示价；不自动续费。模拟支付只验证订单状态，不开通真实付费权益。</view
      >
    </template>
    <template v-else-if="page === 'orders'">
      <h1>我的订单</h1>
      <p class="caption">所有金额都是开发演示，不真实扣款。</p>
      <view v-for="o in app.orders" :key="o.id" class="card"
        ><view class="section"
          ><h3>{{ o.productId === 'memory-year' ? '记忆年费' : '老照片修复' }}</h3>
          <text class="badge">{{
            { pending_payment: '待模拟支付', paid: '模拟已支付', refunded: '模拟已退款' }[o.status]
          }}</text></view
        ><text class="price">¥{{ currency(o.priceFen) }}</text
        ><small class="block">订单 {{ o.id.slice(0, 8) }}</small
        ><button
          v-if="o.status === 'pending_payment'"
          class="btn"
          :disabled="app.busy"
          @click="payment(o.id)"
        >
          继续模拟支付</button
        ><button
          v-if="o.status === 'paid'"
          class="btn secondary"
          :disabled="app.busy"
          @click="payment(o.id, true)"
        >
          体验模拟退款
        </button></view
      >
      <view v-if="!app.orders.length" class="empty"
        ><p>还没有订单。</p>
        <button class="btn secondary" @click="go('plans')">了解价格与权益</button></view
      >
    </template>
    <template v-else-if="page === 'square'">
      <view class="section"
        ><h1>广场</h1>
        <button class="text-button" @click="app.session.userId ? go('compose') : go('login')">
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
      <view v-if="squareView === '精选'" class="card"
        ><view class="sprite flowers photo" /><text class="badge">虚构示例故事</text>
        <h2>妈妈窗边的那束花</h2>
        <p class="prose">
          小时候，总觉得窗台上的花开得特别慢。后来才明白，是她把平凡的日子照顾得很好。
        </p>
        <button class="text-button" @click="go('story', '?id=sample')">阅读全文 →</button></view
      >
      <template v-else
        ><button
          v-for="p in app.posts"
          :key="p.id"
          class="card memory-card"
          @click="go('story', '?id=' + p.id)"
        >
          <text class="badge">{{
            p.moderation === 'pending' ? '待审核，尚未公开' : '仅自己'
          }}</text>
          <h3>{{ p.title }}</h3>
          <p>{{ p.body }}</p></button
        ><view v-if="!app.posts.length" class="empty"
          ><p>还没有自己的故事，可以从一句话开始。</p></view
        ></template
      >
      <view class="notice">内容审核尚未接入，公开投稿只进入待审核，不自动展示给其他人。</view>
    </template>
    <template v-else-if="page === 'story'">
      <view v-if="query?.id === 'sample'"
        ><view class="sprite flowers photo" /><text class="badge">虚构示例故事</text>
        <h1>妈妈窗边的那束花</h1>
        <p class="prose">
          小时候，总觉得窗台上的花开得特别慢。后来才明白，是她把平凡的日子照顾得很好。如今，看到一束小雏菊，我也会记得给生活留一点明亮。
        </p></view
      >
      <view v-else-if="selectedPost"
        ><text class="badge">{{
          selectedPost.moderation === 'pending' ? '待审核' : '仅自己'
        }}</text>
        <h1>{{ selectedPost.title }}</h1>
        <p class="prose">{{ selectedPost.body }}</p></view
      ><view v-else class="notice">故事不存在或当前账号不可访问。</view>
      <p class="caption">喜欢、收藏、评论和举报接口将在下一阶段补齐。</p>
    </template>
    <template v-else-if="page === 'compose'">
      <h1>分享一段故事</h1>
      <p class="caption">只分享你愿意让别人看到的部分。</p>
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
        <checkbox-group @change="toggle('public', $event)"
          ><label class="check"
            ><checkbox value="yes" :checked="form.public" />提交到广场（不勾选则仅自己可见）</label
          ></checkbox-group
        >
        <checkbox-group v-if="form.public" @change="toggle('publicConsent', $event)"
          ><label class="check"
            ><checkbox value="yes" :checked="form.publicConsent" />我确认有权公开这些内容。</label
          ></checkbox-group
        >
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
          {{ form.public ? '确认并提交审核' : '保存给自己' }}
        </button></template
      ><button v-else class="btn" @click="go('login')">先进入演示账号</button>
    </template>
    <template v-else-if="page === 'me'">
      <view class="section"
        ><view
          ><h1>{{ app.session.userId ? '你好，记忆收藏家' : '欢迎来到萤火' }}</h1>
          <p class="caption">
            {{ app.session.userId ? '开发演示账号' : '把重要的人，慢慢记住。' }}
          </p></view
        ><view class="sprite mascot mini"
      /></view>
      <button v-if="!app.session.userId" class="btn" @click="go('login')">登录／注册</button>
      <view class="grid3"
        ><button class="tile" @click="needProfile('memories')">
          <AppIcon name="book" /><text>我的记忆</text></button
        ><button class="tile" @click="go('orders')">
          <AppIcon name="card" /><text>我的订单</text></button
        ><button class="tile" @click="go('plans')">
          <AppIcon name="spark" /><text>价格权益</text>
        </button></view
      >
      <view class="card"
        ><button class="row" @click="go('square')">我的广场故事 →</button
        ><button
          class="row"
          @click="
            info(
              '隐私与数据',
              '本版本仅供本地开发。请使用虚构资料；演示数据存储在本地后端 JSON，尚未连接 Supabase。正式的数据导出、删除和隐私条款待实现。',
            )
          "
        >
          隐私与数据 →</button
        ><button
          class="row"
          @click="
            info(
              '帮助与反馈',
              '这是开发框架。短信、支付、AI、图片修复和云存储均未接入，真实服务上线前会单独验收。',
            )
          "
        >
          帮助与反馈 →
        </button></view
      >
      <button
        v-if="app.session.userId"
        class="btn secondary"
        :disabled="app.busy"
        @click="
          app.run(async () => {
            await app.logout();
            go('home');
          })
        "
      >
        退出演示账号
      </button>
    </template>
  </AppShell>
</template>
