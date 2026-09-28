<script setup lang="ts">
import AppIcon from './AppIcon.vue';
const props = defineProps<{ page: string; title: string }>();
const tabs = [
  ['home', '首页', 'home'],
  ['space', '萤火', 'spark'],
  ['square', '广场', 'book'],
  ['me', '我的', 'user'],
];
function go(page: string) {
  uni.reLaunch({ url: '/pages/' + page + '/index' });
}
function back() {
  const stack = getCurrentPages();
  if (stack.length > 1) uni.navigateBack();
  else go('home');
}
</script>
<template>
  <view class="app-shell">
    <view class="topbar">
      <view v-if="page === 'home'" class="topbar-spacer" />
      <button v-else class="icon-button" aria-label="返回上一页" @click="back">
        <AppIcon name="back" />
      </button>
      <text class="page-title">{{ title }}</text
      ><text class="brand-small">萤火</text>
    </view>
    <view class="content"><slot /></view>
    <view class="bottom-nav" role="navigation" aria-label="主导航">
      <button
        v-for="[id, label, icon] in tabs"
        :key="id"
        role="button"
        :class="{ active: props.page === id }"
        @click="go(id)"
      >
        <AppIcon :name="icon" /><text>{{ label }}</text>
      </button>
    </view>
  </view>
</template>
