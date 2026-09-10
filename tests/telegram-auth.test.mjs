import test from 'node:test';
import assert from 'node:assert/strict';
import { webhookSecret, verifyWebhook, secureExistingWebhook } from '../lib/telegram-auth.js';
const bot = { token: 'synthetic-token', key: 'a' };
test('origin secret is bot-specific and rejects absent or incorrect headers', () => {
  assert.equal(verifyWebhook(bot, webhookSecret(bot)), true);
  for (const value of [undefined, '', [], 'wrong', webhookSecret({ ...bot, key: 'b' })]) assert.equal(verifyWebhook(bot, value), false);
});
test('registration preserves current URL, pending updates and delivery settings', async () => {
  let registered;
  const result = await secureExistingWebhook(bot, async (_, method, body) => {
    if (method === 'getWebhookInfo') return { url: 'https://example.org/telegram/a', allowed_updates: ['message'], max_connections: 12 };
    registered = body; return true;
  });
  assert.equal(result.secured, true);
  assert.equal(registered.url, 'https://example.org/telegram/a');
  assert.equal(registered.drop_pending_updates, false);
  assert.equal(registered.max_connections, 12);
  assert.deepEqual(registered.allowed_updates, ['message']);
});
test('unconfigured or unexpected webhooks are not overwritten', async () => {
  for (const url of ['', 'https://example.org/other']) {
    let calls = 0;
    const result = await secureExistingWebhook(bot, async () => { calls++; return { url }; });
    assert.equal(calls, 1); assert.equal(result.secured, false);
  }
});
