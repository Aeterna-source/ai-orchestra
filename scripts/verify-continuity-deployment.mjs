import { webhookSecret } from '../lib/telegram-auth.js';
const base = 'https://ai-orchestra-production.up.railway.app';
const health = await (await fetch(`${base}/api/health`)).json();
console.log(JSON.stringify({ version: health.build?.continuityRepairVersion, mode: health.build?.derivedMemoryMode }));
for (const [key, variable] of [['nevan','TELEGRAM_NEVAN_TOKEN'],['spud','TELEGRAM_SPUD_TOKEN'],['grokulchik','TELEGRAM_GROKULCHIK_TOKEN'],['reon','TELEGRAM_REON_TOKEN']]) {
  const token = process.env[variable];
  if (!token) continue;
  // Empty updates contain no message: no model calls, database writes or delivery.
  const rejected = await fetch(`${base}/telegram/${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const accepted = await fetch(`${base}/telegram/${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': webhookSecret({ key, token }) }, body: '{}' });
  const info = await (await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)).json();
  console.log(JSON.stringify({ key, unsignedStatus: rejected.status, signedStatus: accepted.status, webhookConfigured: Boolean(info.result?.url), pending: info.result?.pending_update_count }));
  if (rejected.status !== 403 || accepted.status !== 200) process.exitCode = 1;
}
