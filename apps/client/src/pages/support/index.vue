<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import AppScreen from '../../components/AppScreen.vue';
const query = ref<Record<string, string>>({});
onLoad((options) => {
  query.value = (options || {}) as Record<string, string>;
});
</script>
<template><AppScreen page="support" title="帮助与反馈" :query="query" /></template>
