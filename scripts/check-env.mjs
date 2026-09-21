import { existsSync, readFileSync } from 'node:fs';
const source = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const values = Object.fromEntries(
  source
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).trim()];
    }),
);
const groups = {
  database: ['DATABASE_URL', 'DIRECT_URL'],
  storage: ['SUPABASE_URL', 'SUPABASE_SECRET_KEY'],
  sms: ['SMS_ACCESS_KEY_ID', 'SMS_ACCESS_KEY_SECRET', 'SMS_SIGNATURE', 'SMS_TEMPLATE_ID'],
  ai: ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL'],
  photo: ['PHOTO_API_URL', 'PHOTO_API_KEY'],
  wechat: [
    'WECHAT_MCH_ID',
    'WECHAT_APP_ID',
    'WECHAT_API_V3_KEY',
    'WECHAT_CERT_SERIAL_NO',
    'WECHAT_PRIVATE_KEY_PATH',
    'WECHAT_NOTIFY_URL',
  ],
};
console.log('LOCAL DEMO runs without external credentials. Values are never printed.');
for (const [group, keys] of Object.entries(groups)) {
  const missing = keys.filter((k) => !values[k]);
  console.log(
    group +
      ': ' +
      (missing.length ? '待填写 ' + missing.join(', ') : '字段已填写（未验证账号或连接）'),
  );
}
console.log(
  'Filling fields does not enable live adapters; implementation + integration testing is required.',
);
