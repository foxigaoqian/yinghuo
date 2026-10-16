<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ name: string }>();
const paths: Record<string, string> = {
  home: 'M3 10 12 3l9 7v10H3z M9 20v-7h6v7',
  spark: 'm12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z',
  book: 'M12 5v16M3 4c3-1 6-1 9 1 3-2 6-2 9-1v15c-3-1-6-1-9 2-3-3-6-3-9-2z',
  user: 'M8 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4 21v-2a8 8 0 0 1 16 0v2',
  community:
    'M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8 M2 21v-2a7 7 0 0 1 14 0v2 M18 3a4 4 0 0 1 0 8 M22 21v-2a7 7 0 0 0-4-6',
  photo: 'M3 4h18v16H3z M3 16l5-5 5 5 3-3 5 5 M16 8h.01',
  mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z M6 10v2a6 6 0 0 0 12 0v-2 M12 18v4 M9 22h6',
  plus: 'M12 5v14 M5 12h14',
  back: 'm15 5-7 7 7 7',
  arrow: 'M4 12h16 m-6-6 6 6-6 6',
  lock: 'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4',
  card: 'M3 5h18v14H3z M3 10h18 M6 15h4',
  chat: 'M3 4h18v13H9l-6 4z',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 11v6 M12 7.6v.2',
  shield: 'M12 3l7 3v5c0 4.2-2.8 8-7 10-4.2-2-7-5.8-7-10V6z',
  share: 'M12 15V4 m-4 4 4-4 4 4 M5 14v5h14v-5',
  chevron: 'm9 5 7 7-7 7',
  close: 'M6 6l12 12 M18 6 6 18',
  heart: 'M12 20s-7-4.6-7-9.4A4 4 0 0 1 12 8a4 4 0 0 1 7 2.6C19 15.4 12 20 12 20z',
  send: 'M4 12l16-8-6 16-3-6z M11 14l9-10',
  smile: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M8.5 14.5a4.5 4.5 0 0 0 7 0 M9 9.6v.2 M15 9.6v.2',
  camera: 'M4 8h3.2L9 6h6l1.8 2H20v12H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  edit: 'M4 20h4L19 9l-4-4L4 16z M14 5l4 4',
};
const src = computed(
  () =>
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#806846" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="' +
        (paths[props.name] || paths.spark) +
        '"/></svg>',
    ),
);
</script>
<template><image :src="src" class="app-icon" aria-hidden="true" /></template>
