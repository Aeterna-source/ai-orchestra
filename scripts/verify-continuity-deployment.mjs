import { webhookSecret } from '../lib/telegram-auth.js';
const base = 'https://ai-orchestra-production.up.railway.app';
const health = await (await fetch(`${base}/api/health`)).json();
console.log(JSON.stringify({ version: health.build?.continuityRepairVersion, mode: health.build?.derivedMemoryMode }));
const chatDenied = await fetch(`${base}/api/chat`, {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
console.log(JSON.stringify({unauthenticatedChatStatus:chatDenied.status}));
if (chatDenied.status !== 403) process.exitCode = 1;
const visual = await (await fetch(`${base}/api/visualization/nevan`)).json();
if (JSON.stringify(visual).includes('"notes"')) { console.log('Visualization exposes notes'); process.exitCode = 1; }
if (process.env.TELEGRAM_ADMIN_SECRET) {
  const denied = await fetch(`${base}/api/core-proposals/Nevan`);
  if (denied.status !== 403) process.exitCode = 1;
  console.log(JSON.stringify({unauthenticatedCoreReviewStatus:denied.status}));
  for (const profile of ['Nevan','Spud','Miro','Reon','Zefir']) {
    const proposals = await fetch(`${base}/api/core-proposals/${profile}`, {headers:{'X-Telegram-Admin-Secret':process.env.TELEGRAM_ADMIN_SECRET}});
    if (!proposals.ok) process.exitCode = 1;
    else console.log(JSON.stringify({profile,pendingCoreProposals:(await proposals.json()).length}));
    const response = await fetch(`${base}/api/cognitive/retrieval-check`, { method: 'POST', headers: {
      'Content-Type':'application/json','X-Telegram-Admin-Secret':process.env.TELEGRAM_ADMIN_SECRET
    }, body: JSON.stringify({ profile }) });
    if (response.ok) console.log(JSON.stringify(await response.json()));
    else { console.log(JSON.stringify({ profile, retrievalCheckStatus:response.status })); process.exitCode = 1; }
  }
}
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
