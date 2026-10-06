<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import AppIcon from './AppIcon.vue';
const props = defineProps<{ page: string; title: string }>();
const visibleHeight = ref(0);
function syncVisibleHeight() {
  visibleHeight.value = window.visualViewport?.height || window.innerHeight;
}
onMounted(() => {
  if (props.page !== 'chat') return;
  syncVisibleHeight();
  window.visualViewport?.addEventListener('resize', syncVisibleHeight);
  window.addEventListener('resize', syncVisibleHeight);
});
onUnmounted(() => {
  window.visualViewport?.removeEventListener('resize', syncVisibleHeight);
  window.removeEventListener('resize', syncVisibleHeight);
});
const tabs = [
  ['home', '首页', 'home'],
  ['memories', '记忆', 'book'],
  ['square', '广场', 'community'],
  ['me', '我的', 'user'],
];
const focusedPage = computed(() =>
  ['create', 'memory-edit', 'compose', 'chat', 'login'].includes(props.page),
);
const activeTab = computed(() =>
  ['space', 'memory', 'restore'].includes(props.page)
    ? 'memories'
    : ['story'].includes(props.page)
      ? 'square'
      : ['privacy', 'terms', 'support', 'orders', 'plans'].includes(props.page)
        ? 'me'
        : props.page,
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
        : props.page === 'chat' || props.page === 'create'
          ? 'space'
          : props.page === 'story'
            ? 'square'
            : 'home',
    );
}
</script>
<template>
  <view
    class="app-shell"
    :class="{ 'focused-screen': focusedPage, 'chat-screen': page === 'chat' }"
    :style="
      page === 'chat' && visibleHeight
        ? { '--chat-viewport-height': visibleHeight + 'px' }
        : undefined
    "
  >
    <view class="topbar">
      <view v-if="page === 'home'" class="topbar-spacer" />
      <button v-else role="button" class="icon-button" aria-label="返回上一页" @click="back">
        <AppIcon name="back" />
      </button>
      <text class="page-title">{{ title }}</text
      ><text class="brand-small">萤火</text>
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
