export async function receiveUpdate(db, botKey, update) {
  if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0) return false;
  const result = await db.from('telegram_update_receipts').upsert({bot_key:botKey,update_id:update.update_id,payload:update},
    {onConflict:'bot_key,update_id',ignoreDuplicates:true});
  if (result.error) throw new Error('Telegram receipt could not be persisted');
  return true;
}

export async function drainUpdates(db, bots, handle) {
  const expired = await db.from('telegram_update_receipts').update({status:'failed',error:'Processing interrupted; inspect delivery before replay',updated_at:new Date().toISOString()})
    .eq('status','processing').lt('updated_at',new Date(Date.now()-30*60*1000).toISOString());
  if (expired.error) throw new Error('Telegram inbox recovery failed');
  const queued = await db.from('telegram_update_receipts').select('bot_key,update_id,payload')
    .eq('status','queued').order('created_at',{ascending:true}).limit(50);
  if (queued.error) throw new Error('Telegram inbox read failed');
  const firstPerBot = new Map();
  for (const receipt of queued.data || []) if (!firstPerBot.has(receipt.bot_key)) firstPerBot.set(receipt.bot_key,receipt);
  await Promise.all([...firstPerBot.values()].map(async receipt => {
    const bot = bots.get(receipt.bot_key);
    if (!bot) return;
    const claimed = await db.from('telegram_update_receipts').update({status:'processing',updated_at:new Date().toISOString()})
      .eq('bot_key',receipt.bot_key).eq('update_id',receipt.update_id).eq('status','queued').select('update_id');
    if (claimed.error || !claimed.data?.length) return;
    let status='completed', error=null;
    try { await handle(bot,receipt.payload); }
    catch { status='failed'; error='Telegram processing failed; inspect processing logs before replay'; }
    const finished = await db.from('telegram_update_receipts').update({status,error,updated_at:new Date().toISOString()})
      .eq('bot_key',receipt.bot_key).eq('update_id',receipt.update_id).eq('status','processing');
    if (finished.error) throw new Error('Telegram inbox status write failed');
  }));
}
