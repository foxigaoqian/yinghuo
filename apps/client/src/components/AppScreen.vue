<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useAppStore } from '../stores/app';
import AppShell from './AppShell.vue';
import AppIcon from './AppIcon.vue';
const props = defineProps<{ page: string; title: string; query?: Record<string, string> }>();
const app = useAppStore();
const loading = ref(!app.bootstrap);
const hostedPreview = computed(() => Boolean(app.bootstrap?.features?.hostedPreview));
const form = reactive({
  name: '',
  callMe: '',
  story: '',
  aiConsent: false,
  title: '',
  body: '',
  public: false,
  publicConsent: false,
});
const createStep = ref(1);
const squareView = ref('精选');
const preview = ref('');
let restoringDraft = false;
let profileDraftOwner = '';
const selectedMemory = computed(() => app.memories.find((m) => m.id === props.query?.id));
const selectedPost = computed(() => app.posts.find((p) => p.id === props.query?.id));
const editing = computed(() => props.query?.edit === '1');
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
function loadScreen() {
  if (!app.bootstrap) loading.value = true;
  void app
    .run(async () => {
      await app.refresh();
      restoreProfileDraft();
    })
    .finally(() => {
      loading.value = false;
    });
}
onShow(loadScreen);
function onRetry() {
  loadScreen();
}
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
function needProfile(next: string) {
  if (!app.session.userId) {
    void app.run(async () => {
      await app.login();
      go(app.current ? next : 'create');
    });
    return;
  }
  go(app.current ? next : 'create');
}
function toggle(key: 'public' | 'publicConsent', e: any) {
  form[key] = e.detail.value.length > 0;
}
function create() {
  void app.run(async () => {
    await app.addProfile(
      {
        name: form.name,
        callMe: form.callMe,
        story: form.story,
        aiConsent: editing.value && form.aiConsent,
      },
      editing.value,
    );
    if (!editing.value && app.session.userId)
      uni.removeStorageSync('yinghuo.profileDraft.' + app.session.userId);
    replace('space');
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
    await app.addMemory({ title: form.title, body: form.body, useForAi: false });
    go('memories');
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

function publish() {
  const action = () =>
    app.run(async () => {
      await app.publish({
        title: form.title,
        body: form.body,
        visibility: form.public ? 'public' : 'private',
        publicConsent: form.publicConsent,
      });
      replace('square', '?view=mine');
    });
  if (form.public)
    uni.showModal({
      title: '确认提交到广场？',
      content: '故事将在审核通过后展示。请确认已获得相关人物的分享许可。',
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
watch(
  () => props.query?.view,
  (view) => {
    if (props.page === 'square' && view === 'mine') squareView.value = '我的';
  },
  { immediate: true },
);
function info(title: string, content: string) {
  uni.showModal({ title, content, showCancel: false });
}
function confirmLogout() {
  uni.showModal({
    title: '离开当前空间？',
    content: '退出后，这个临时空间的内容将无法找回。',
    confirmText: '确认退出',
    success: (result) => {
      if (result.confirm)
        void app.run(async () => {
          await app.logout();
          uni.reLaunch({ url: '/pages/home/index' });
        });
    },
  });
}
</script>
<template>
  <AppShell :page="page" :title="title">
    <view v-if="loading" class="loading-state" role="status" aria-label="正在打开萤火">
      <view class="loading-line short" /><view class="loading-line" /><view class="loading-block" />
    </view>
    <view v-else-if="!app.bootstrap" class="empty" role="alert">
      <h2>暂时无法打开萤火</h2>
      <p>{{ app.error || '请检查网络，稍后再试。' }}</p>
      <button class="btn secondary" @click="onRetry">重试</button>
    </view>
    <template v-else>
      <view v-if="app.error" class="notice error" role="alert">{{ app.error }}</view>
      <template v-if="page === 'home'">
        <view class="hero"
          ><text class="wordmark">萤火</text><text class="eyebrow">FIREFLY · 珍藏每一点光</text>
          <h1>让想念，<br />有一个地方安放。</h1>
          <p>无论 TA 是否在身边，都可以从一句话开始，珍藏你们的故事。</p>
          <view class="hero-art"
            ><view class="sprite mascot" role="img" aria-label="小萤，萤火记忆伙伴"
          /></view>
          <button
            class="btn"
            :disabled="app.busy"
            @click="app.current ? go('memory-edit') : start()"
          >
            {{ app.busy ? '正在打开…' : app.current ? '再留下一段记忆' : '为 TA 建立记忆空间' }}
          </button>
          <button class="btn secondary" @click="go('square')">先读一段故事</button>
        </view>
        <view class="grid2"
          ><button class="tile" :disabled="app.busy" @click="needProfile('memories')">
            <AppIcon name="book" /><text>私密记忆</text><small>回看留下的每一件小事</small></button
          ><button class="tile" @click="go('square')">
            <AppIcon name="spark" /><text>广场故事</text><small>先读读别人的珍藏</small>
          </button></view
        >
        <view v-if="app.current" class="section"
          ><h2>最近的萤火</h2>
          <button class="text-button" @click="go('space')">查看全部</button></view
        >
        <view v-if="app.current" class="card"
          ><h3>{{ app.current.name + '的萤火' }}</h3>
          <p class="caption">
            {{ '已经留下 ' + app.memories.length + ' 段私密记忆。' }}
          </p>
          <button class="btn secondary" @click="go('space')">打开记忆空间</button></view
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
          <h1>先从一段故事开始。</h1>
          <p class="caption">先看看萤火如何收藏记忆。</p></view
        >
        <view class="card"
          ><h3>继续体验</h3>
          <p class="caption">当前是临时体验空间，暂时无法跨设备找回。请只使用虚构内容。</p>
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
            ? '记录约 24 小时后自动清除，请勿在这里保存真实家庭资料。'
            : '记录可能无法长期保存，请勿在这里填写真实家庭资料。'
        }}</view>
      </template>
      <template v-else-if="page === 'create'">
        <h1>{{ editing ? '补充 TA 的故事' : '为重要的人，留下一束光' }}</h1>
        <p class="caption">
          {{ editing ? '修改记忆空间资料。' : '不用一次准备齐全，三步就能开始。' }}
        </p>
        <view v-if="!editing" class="notice"
          >当前为限时体验，内容约 24 小时后清除。请用虚构资料体验，不要填写真实私人信息。</view
        >
        <view v-if="!app.session.userId" class="card"
          ><p>先进入体验空间，再继续填写。</p>
          <button class="btn" @click="go('login', '?next=create')">继续体验</button></view
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
          <button class="btn" :disabled="app.busy || !form.name.trim()" @click="create">
            {{ app.busy ? '正在保存…' : '保存资料' }}
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
              ><text>关于 {{ form.name }} 的一件小事</text
              ><textarea
                v-model="form.story"
                maxlength="1000"
                placeholder="例如：每次出门前，TA都会提醒我带伞…"
              />
            </label>
            <view class="step-actions"
              ><button class="btn secondary" @click="previousCreateStep">上一步</button
              ><button class="btn" :disabled="app.busy || !form.name.trim()" @click="create">
                {{ app.busy ? '正在保存…' : '保存并进入 TA 的空间' }}
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
              ><small>条私密记忆</small></view
            ><view
              ><strong>{{ app.profiles.length }}</strong
              ><small>束萤火</small></view
            ></view
          >
          <view v-if="app.memories[0]" class="card first-memory"
            ><text class="badge">{{
              app.memories.length === 1 ? '第一条记忆 · 仅自己可见' : '最近留下的记忆 · 仅自己可见'
            }}</text>
            <h2>{{ app.memories[0].title }}</h2>
            <p class="prose">{{ app.memories[0].body }}</p>
            <button class="text-button" @click="go('memories')">看看全部记忆 →</button></view
          ><view v-else class="card empty"
            ><h2>还没有记忆</h2>
            <p>不用准备很多，先留下一句话就好。</p></view
          >
          <button class="btn" @click="go('memory-edit')">
            再记录一段记忆<AppIcon name="arrow" />
          </button>
          <view class="grid2 section"
            ><button class="tile" @click="go('memories')">
              <AppIcon name="book" /><text>回看记忆</text></button
            ><button class="tile" @click="go('square')">
              <AppIcon name="spark" /><text>看看广场</text>
            </button></view
          >
          <view class="card"
            ><button class="row" @click="go('create', '?edit=1')">人物资料 →</button
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
          <p>为重要的人，先留下一段文字故事。</p>
          <button class="btn" :disabled="app.busy" @click="start">创建 TA 的萤火</button></view
        >
      </template>
      <template v-else-if="page === 'memories'">
        <view class="section"
          ><h1>萤火记忆</h1>
          <button class="icon-button" aria-label="添加记忆" @click="needProfile('memory-edit')">
            <AppIcon name="plus" /></button
        ></view>
        <p class="caption">每一段文字都只属于你的私密空间。</p>
        <button
          v-for="m in app.memories"
          :key="m.id"
          class="card memory-card"
          @click="go('memory', '?id=' + m.id)"
        >
          <h3>{{ m.title }}</h3>
          <p>{{ m.body }}</p>
          <small>仅自己可见</small>
        </button>
        <view v-if="!app.memories.length" class="empty"><p>先留下一句话，或一件小事。</p></view
        ><button class="btn" @click="needProfile('memory-edit')">记录一段记忆</button>
      </template>
      <template v-else-if="page === 'memory-edit'">
        <h1>把这一刻，慢慢留下。</h1>
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
            {{ app.busy ? '正在保存…' : '保存记忆' }}
          </button></template
        >
        <button v-else class="btn" @click="start">先创建 TA 的萤火</button>
      </template>
      <template v-else-if="page === 'memory'">
        <template v-if="selectedMemory"
          ><text class="badge">私密记忆</text>
          <h1>{{ selectedMemory.title }}</h1>
          <p class="prose">{{ selectedMemory.body }}</p>
          <view class="notice">这段记忆只对你可见。</view></template
        ><view v-else class="empty"
          ><h2>这段记忆暂时找不到</h2>
          <button class="btn secondary" @click="go('memories')">返回记忆库</button></view
        >
      </template>
      <template v-else-if="page === 'chat'">
        <view class="empty">
          <view class="sprite mascot large" role="img" aria-label="小萤" />
          <h1>对话功能正在准备</h1>
          <p>现在可以先留下关于 TA 的故事。开放对话前，我们会说明内容如何使用。</p>
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
          <small>当前记录约 24 小时后清除，请勿填写真实私人信息。</small></view
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
          <button class="text-button" :disabled="app.busy" @click="enter('compose')">
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
          <view v-for="(story, index) in sampleStories" :key="story.id" class="card">
            <view
              v-if="index === 0"
              class="sprite flowers photo"
              role="img"
              aria-label="窗边的小雏菊"
            />
            <text class="badge">虚构示例故事</text>
            <h2>{{ story.title }}</h2>
            <p class="prose story-excerpt">{{ story.excerpt }}</p>
            <button class="text-button" @click="go('story', '?id=' + story.id)">
              读这个故事 →
            </button>
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
              p.moderation === 'pending' ? '待审核，尚未公开' : '仅自己'
            }}</text>
            <h3>{{ p.title }}</h3>
            <p>{{ p.body }}</p></button
          ><view v-if="!app.posts.length" class="empty"
            ><p>还没有自己的故事，可以从一句话开始。</p></view
          ></template
        >
        <view class="notice">广场目前展示虚构示例；自己写的故事默认仅自己可见。</view>
      </template>
      <template v-else-if="page === 'story'">
        <view v-if="selectedSample"
          ><view class="sprite flowers photo" /><text class="badge">虚构示例故事</text>
          <h1>{{ selectedSample.title }}</h1>
          <p class="prose">{{ selectedSample.body }}</p></view
        >
        <view v-else-if="selectedPost"
          ><text class="badge">{{
            selectedPost.moderation === 'pending' ? '待审核' : '仅自己'
          }}</text>
          <h1>{{ selectedPost.title }}</h1>
          <p class="prose">{{ selectedPost.body }}</p></view
        ><view v-else class="notice">故事不存在或当前账号不可访问。</view>
        <button class="btn secondary" @click="go('square')">返回广场</button>
      </template>
      <template v-else-if="page === 'compose'">
        <h1>写下一个故事</h1>
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
          <checkbox-group
            v-if="app.bootstrap?.features?.publicSquare"
            @change="toggle('public', $event)"
            ><label class="check"
              ><checkbox
                value="yes"
                :checked="form.public"
              />提交到广场（不勾选则仅自己可见）</label
            ></checkbox-group
          >
          <checkbox-group v-if="form.public" @change="toggle('publicConsent', $event)"
            ><label class="check"
              ><checkbox value="yes" :checked="form.publicConsent" />我确认有权公开这些内容。</label
            ></checkbox-group
          >
          <view v-else class="caption">保存后只会出现在「广场 · 我的」，其他人看不到。</view>
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
            {{ app.busy ? '正在保存…' : form.public ? '确认并提交审核' : '保存给自己' }}
          </button></template
        ><button v-else class="btn" @click="go('login', '?next=compose')">继续体验</button>
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
        <view class="grid2"
          ><button class="tile" @click="needProfile('memories')">
            <AppIcon name="book" /><text>我的记忆</text></button
          ><button class="tile" @click="go('plans')">
            <AppIcon name="spark" /><text>服务方案</text>
          </button></view
        >
        <view class="card"
          ><button class="row" @click="go('square', '?view=mine')">我的广场故事 →</button
          ><button
            class="row"
            @click="
              info(
                '隐私与数据',
                hostedPreview
                  ? '请只填写虚构内容。当前空间的记录约 24 小时后清除，退出后也无法找回。暂不支持跨设备找回。'
                  : '当前空间的记录可能无法长期保存，请只填写虚构内容。',
              )
            "
          >
            隐私与数据 →</button
          ><button
            class="row"
            @click="
              info(
                '帮助与反馈',
                '你可以建立记忆空间、记录文字和写仅自己可见的故事。其他功能开放时会在页面上说明。',
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
          @click="confirmLogout"
        >
          退出体验空间
        </button>
      </template>
    </template>
  </AppShell>
</template>
