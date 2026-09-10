import { createHmac, timingSafeEqual } from 'node:crypto';

export function webhookSecret(bot) {
  if (!bot?.token || !bot?.key) throw new Error('Missing bot identity');
  return createHmac('sha256', bot.token).update(`orchestra-webhook-v1:${bot.key}`).digest('hex');
}

export function verifyWebhook(bot, header) {
  if (typeof header !== 'string') return false;
  const expected = Buffer.from(webhookSecret(bot));
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function secureExistingWebhook(bot, api) {
  const info = await api(bot, 'getWebhookInfo', {});
  if (!info?.url) return { key: bot.key, secured: false, reason: 'no-existing-webhook' };
  const url = new URL(info.url);
  if (url.protocol !== 'https:' || url.pathname !== `/telegram/${bot.key}`) {
    return { key: bot.key, secured: false, reason: 'unexpected-webhook-path' };
  }
  const ok = await api(bot, 'setWebhook', {
    url: info.url,
    secret_token: webhookSecret(bot),
    allowed_updates: info.allowed_updates || ['message', 'edited_message'],
    max_connections: info.max_connections || 40,
    drop_pending_updates: false
  });
  return { key: bot.key, secured: ok === true };
}
