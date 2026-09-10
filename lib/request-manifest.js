import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function requestManifest(body, messages, endpoint) {
  return {
    version: 1, endpoint, requestHash: hash(body),
    messages: messages.map(message => ({ role: message.role, hash: hash(message.content), characters: JSON.stringify(message.content).length })),
    model: body.model,
    parameters: Object.fromEntries(['temperature','max_tokens','max_completion_tokens','max_output_tokens','reasoning_effort','store']
      .filter(key => key in body).map(key => [key, body[key]]))
  };
}
