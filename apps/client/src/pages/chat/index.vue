<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import AppScreen from '../../components/AppScreen.vue';
const query = ref<Record<string, string>>({});
onLoad((options) => {
  query.value = (options || {}) as Record<string, string>;
});
</script>
<template><AppScreen page="chat" title="AI 记忆对话" :query="query" /></template>
