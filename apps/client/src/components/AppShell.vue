<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
const props = defineProps<{
  page: string;
  title: string;
  focused?: boolean;
  subtitle?: string;
  showInfo?: boolean;
  headingActionLabel?: string;
  headingAvatarUrl?: string;
  headingAvatarInitial?: string;
}>();
const emit = defineEmits<{ info: []; heading: [] }>();
const visibleHeight = ref(0);
const visibleOffsetTop = ref(0);
function syncVisibleHeight() {
  visibleHeight.value = window.visualViewport?.height || window.innerHeight;
  visibleOffsetTop.value = window.visualViewport?.offsetTop || 0;
}
let viewportListening = false;
function startViewportSync() {
  if (viewportListening) return;
  viewportListening = true;
  syncVisibleHeight();
  window.visualViewport?.addEventListener('resize', syncVisibleHeight);
  window.visualViewport?.addEventListener('scroll', syncVisibleHeight);
  window.addEventListener('resize', syncVisibleHeight);
}
function stopViewportSync() {
  if (!viewportListening) return;
  viewportListening = false;
  window.visualViewport?.removeEventListener('resize', syncVisibleHeight);
  window.visualViewport?.removeEventListener('scroll', syncVisibleHeight);
  window.removeEventListener('resize', syncVisibleHeight);
}
onMounted(() => {
  if (props.focused) startViewportSync();
});
watch(
  () => props.focused,
  (focused) => (focused ? startViewportSync() : stopViewportSync()),
);
onUnmounted(stopViewportSync);
const tabs = [
  ['home', '首页', 'home'],
  ['chat', '聊天', 'chat'],
  ['square', '广场', 'community'],
  ['me', '我的', 'user'],
];
const focusedPage = computed(
  () =>
    Boolean(props.focused) ||
    ['create', 'memory-edit', 'compose', 'login', 'shares'].includes(props.page),
);
const activeTab = computed(() =>
  ['space', 'memory', 'restore'].includes(props.page)
    ? 'home'
    : ['story'].includes(props.page)
      ? 'square'
      : ['privacy', 'terms', 'support', 'orders', 'plans', 'shares'].includes(props.page)
        ? 'me'
        : props.page,
);
const rootTitle = computed(() =>
  props.page === 'home' ? '萤火' : props.page === 'square' ? '萤火广场' : props.title,
);
function go(page: string) {
  uni.reLaunch({ url: '/pages/' + page + '/index' });
}
function back() {
  const stack = getCurrentPages();
  if (stack.length > 1) uni.navigateBack();
  else
    go(
      ['space', 'memory', 'memory-edit', 'compose'].includes(props.page)
        ? 'memories'
        : props.page === 'shares'
          ? 'me'
          : props.page === 'chat'
            ? 'chat'
            : props.page === 'create'
              ? 'chat'
              : props.page === 'story'
                ? 'square'
                : 'home',
    );
}
</script>
<template>
  <view
    class="app-shell"
    :class="{ 'focused-screen': focusedPage, 'chat-screen': focused }"
    :style="
      focused && visibleHeight
        ? {
            '--chat-viewport-height': visibleHeight + 'px',
            '--chat-viewport-offset': visibleOffsetTop + 'px',
          }
        : undefined
    "
  >
    <view class="topbar" :class="{ 'root-topbar': !focusedPage }">
      <template v-if="focusedPage">
        <button role="button" class="icon-button" aria-label="返回上一页" @click="back">
          <AppIcon name="back" />
        </button>
        <button
          v-if="headingActionLabel"
          role="button"
          class="page-heading-button"
          :aria-label="headingActionLabel"
          @click="emit('heading')"
        >
          <image
            v-if="headingAvatarUrl"
            class="shell-heading-avatar"
            :src="headingAvatarUrl"
            mode="aspectFill"
          />
          <view v-else class="shell-heading-avatar fallback">{{ headingAvatarInitial }}</view>
          <view class="page-heading"
            ><h1 class="page-title">{{ title }}</h1>
            <small v-if="subtitle">{{ subtitle }}</small></view
          >
          <AppIcon name="edit" />
        </button>
        <view v-else class="page-heading"
          ><h1 class="page-title">{{ title }}</h1>
          <small v-if="subtitle">{{ subtitle }}</small></view
        >
        <button
          v-if="showInfo"
          role="button"
          class="icon-button"
          aria-label="查看说明"
          @click="emit('info')"
        >
          <AppIcon name="info" />
        </button>
        <view v-else class="topbar-spacer" />
      </template>
      <template v-else>
        <view class="root-title"
          ><i v-if="page === 'home'" class="brand-dot" /><text>{{ rootTitle }}</text></view
        >
        <button
          v-if="showInfo"
          role="button"
          class="icon-button"
          aria-label="查看说明"
          @click="emit('info')"
        >
          <AppIcon name="info" />
        </button>
        <view v-else class="topbar-spacer" />
      </template>
    </view>
    <view class="content"><slot /></view>
    <view v-if="!focusedPage" class="bottom-nav" role="navigation" aria-label="主导航">
      <button
        v-for="[id, label, icon] in tabs"
        :key="id"
        role="button"
        :class="{ active: activeTab === id }"
        :aria-current="activeTab === id ? 'page' : undefined"
        @click="go(id)"
      >
        <AppIcon :name="icon" /><text>{{ label }}</text>
      </button>
    </view>
  </view>
</template>
