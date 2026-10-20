const DEFAULT_SQUAREFACE_BASE_URL = 'https://api.sqface.sbs/v1';
const DEFAULT_SQUAREFACE_MODEL = 'claude-sonnet-5';
const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
const SQUAREFACE_HOSTS = new Set(['api.sqface.sbs', 'api.squarefaceicon.org']);

function squareFaceKey(env) {
  const key = typeof env?.SQUAREFACE_API_KEY === 'string' ? env.SQUAREFACE_API_KEY.trim() : '';
  return key || null;
}

function hasWorkersAi(env) {
  return typeof env?.AI?.run === 'function';
}

export function isAiConfigured(env) {
  return Boolean(squareFaceKey(env));
}

export function aiProvider(env) {
  return squareFaceKey(env) ? 'squareface' : 'disabled';
}

function squareFaceEndpoint(env) {
  const configured =
    typeof env?.SQUAREFACE_BASE_URL === 'string' ? env.SQUAREFACE_BASE_URL.trim() : '';
  const url = new URL(configured || DEFAULT_SQUAREFACE_BASE_URL);
  if (url.protocol !== 'https:' || !SQUAREFACE_HOSTS.has(url.hostname)) {
    throw new Error('SquareFace API endpoint is not allowed');
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function answerText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('');
}

function validatedAnswer(content) {
  const answer = answerText(content).trim();
  if (
    !answer ||
    /(作为\s*AI|我是人工智能|我是萤火\s*AI|我是(?:一名|一个)?(?:AI)?记忆陪伴助手|我(?:并)?不是(?:你的|你)?[^，。！？\n]{0,16}(?:哦|啊)?[，。！？\n]|我现在没有看到|我没有看到关于|无法和你聊起|我已经保存|已写入长期记忆|我(?:还|也)?记得|我(?:曾经)?认识|我(?:曾经)?见过)/i.test(
      answer,
    )
  ) {
    throw new Error('AI provider returned an invalid answer');
  }
  return answer.slice(0, 800);
}

async function callSquareFace(env, messages, imageDataUrl = '') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(squareFaceEndpoint(env), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${squareFaceKey(env)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.SQUAREFACE_CHAT_MODEL || DEFAULT_SQUAREFACE_MODEL,
        messages: imageDataUrl
          ? messages.map((message, index) =>
              index === messages.length - 1 && message.role === 'user'
                ? {
                    ...message,
                    content: [
                      { type: 'text', text: String(message.content || '请看看这张照片。') },
                      { type: 'image_url', image_url: { url: imageDataUrl, detail: 'low' } },
                    ],
                  }
                : message,
            )
          : messages,
        max_tokens: 280,
        temperature: 0.25,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`SquareFace API returned HTTP ${response.status}`);
    }
    const payload = await response.json();
    return validatedAnswer(payload?.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(timeout);
  }
}

async function callWorkersAi(env, messages) {
  const response = await env.AI.run(env.WORKERS_AI_CHAT_MODEL || DEFAULT_WORKERS_AI_MODEL, {
    messages,
    max_tokens: 280,
    temperature: 0.25,
    stream: false,
  });
  return validatedAnswer(response?.response || response?.result?.response);
}

export async function generateAiReply(env, messages, options = {}) {
  if (squareFaceKey(env)) {
    return callSquareFace(env, messages, options.imageDataUrl || '');
  }
  throw new Error('No chat relay is available');
}
