<script setup lang="ts">
import { ref } from 'vue';
const token = ref('');
const error = ref('');
const busy = ref(false);
const data = ref<any>(null);
async function load() {
  busy.value = true;
  error.value = '';
  try {
    const r = await fetch('/api/v1/dev/admin/overview', {
      headers: { authorization: 'Bearer ' + token.value },
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error?.message || '加载失败');
    data.value = body;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <main>
    <header><span>萤火 FIREFLY</span><small>本地开发控制台 · 非正式运营后台</small></header>
    <h1>让每一束光，被好好照顾。</h1>
    <p>查看开发数据与 API 接入状态。不提供真实退款、公开审核或用户管理权限。</p>
    <form @submit.prevent="load">
      <label for="token">开发管理令牌</label
      ><input
        id="token"
        v-model="token"
        type="password"
        autocomplete="off"
        placeholder="填写本机 DEV_ADMIN_TOKEN"
      /><button :disabled="busy">{{ busy ? '读取中…' : '读取开发状态' }}</button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
    <section v-if="data">
      <article
        v-for="[label, count] in [
          ['萤火空间', data.profiles],
          ['文字记忆', data.memories],
          ['演示订单', data.orders],
          ['待审核故事', data.pendingModeration],
        ]"
        :key="label"
      >
        <small>{{ label }}</small
        ><strong>{{ count }}</strong>
      </article>
    </section>
    <dl v-if="data">
      <template v-for="(v, k) in data.integrations" :key="k"
        ><dt>{{ k }}</dt>
        <dd>{{ v }}</dd></template
      >
    </dl>
    <p>令牌只保留在本页面内存，不写入浏览器存储。正式后台权限体系后续接入。</p>
  </main>
</template>
<style>
:root {
  font-family:
    system-ui,
    -apple-system,
    'PingFang SC',
    sans-serif;
  color: #40382f;
  background: #f7f5f0;
}
* {
  box-sizing: border-box;
}
main {
  max-width: 960px;
  padding: 32px 20px;
  margin: auto;
}
header {
  display: flex;
  gap: 20px;
  justify-content: space-between;
  margin-bottom: 64px;
}
h1 {
  font-size: 32px;
}
p {
  color: #756e64;
  line-height: 1.8;
}
form {
  background: #fffdfa;
  border: 1px solid #e7e1d7;
  border-radius: 20px;
  padding: 24px;
  margin: 32px 0;
  display: grid;
  gap: 14px;
}
input,
button {
  font: inherit;
  padding: 14px;
  border: 1px solid #d8cbb4;
  border-radius: 12px;
  min-height: 48px;
}
button {
  background: #f3bf44;
  cursor: pointer;
}
section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}
article {
  border: 1px solid #e7e1d7;
  padding: 24px;
  border-radius: 16px;
  background: #fffdfa;
}
strong {
  display: block;
  font-size: 32px;
  margin-top: 16px;
}
dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 24px;
  background: #fffdfa;
  border-radius: 16px;
}
button:focus-visible,
input:focus-visible {
  outline: 3px solid #9b6d0f;
}
</style>
