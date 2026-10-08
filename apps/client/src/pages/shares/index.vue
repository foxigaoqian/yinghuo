<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import AppScreen from '../../components/AppScreen.vue';
const query = ref<Record<string, string>>({});
onLoad((options) => {
  query.value = (options || {}) as Record<string, string>;
});
</script>
<template><AppScreen page="shares" title="我的发布" :query="query" /></template>
