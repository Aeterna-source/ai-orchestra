// Capabilities describe representation, not identity. Unknown models use the
// conservative path; a rejected format is handled by the structured caller.
export function providerCapabilities(provider, model = '', env = process.env) {
  const local = provider === 'local';
  const number = (key, fallback) => Number.isFinite(Number(env[key])) && Number(env[key]) > 0 ? Math.floor(Number(env[key])) : fallback;
  const prefix = provider.toUpperCase();
  const nativeSchema = provider === 'openai' ? /^(gpt-4o|gpt-4\.1|gpt-[5-9]|o[134])/.test(model)
    : provider === 'anthropic' ? /claude-(?:sonnet|opus|haiku)-(?:4-[5-9]|[5-9])/.test(model)
    : provider === 'xai' ? /^grok-[34]/.test(model) : env.LOCAL_STRUCTURED_OUTPUT === 'true';
  return {
    provider, model, nativeSchema,
    jsonObject: ['openai', 'xai'].includes(provider),
    strategy: local ? 'compact-ranked' : 'ranked',
    singleSystem: local,
    systemChars: number(`${prefix}_CONTEXT_SYSTEM_CHARS`, local ? 18000 : 72000),
    historyChars: number(`${prefix}_CONTEXT_HISTORY_CHARS`, local ? 6000 : 36000),
    historyMessages: number(`${prefix}_CONTEXT_HISTORY_MESSAGES`, local ? 8 : 40)
  };
}

export function structuredBody(capabilities, schema, name, endpoint = 'chat') {
  if (schema && capabilities.nativeSchema) {
    if (capabilities.provider === 'anthropic') return { output_config: { format: { type: 'json_schema', schema } } };
    if (endpoint === 'responses') return { text: { format: { type: 'json_schema', name, strict: true, schema } } };
    return { response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } } };
  }
  if (capabilities.jsonObject) return endpoint === 'responses'
    ? { text: { format: { type: 'json_object' } } }
    : { response_format: { type: 'json_object' } };
  return {};
}

export function unsupportedStructuredFormat(error) {
  return [400, 422].includes(error?.status) &&
    /response_format|json_schema|output_config|text\.format|structured.output/i.test(error.message || '') &&
    /unsupported|not.support|unknown|unrecognized|not.allowed|invalid.parameter/i.test(error.message || '');
}
