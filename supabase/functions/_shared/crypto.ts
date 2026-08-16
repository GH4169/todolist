import { HttpError } from './http.ts';

const PROVIDER = 'openai';

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    throw new HttpError(503, 'invalid_encryption_config', 'AI 凭据加密配置无效');
  }
}

async function getMasterKey() {
  const encoded = Deno.env.get('AI_CREDENTIAL_MASTER_KEY');
  if (!encoded) throw new HttpError(503, 'service_not_configured', 'AI 凭据加密服务尚未配置');
  const keyBytes = base64ToBytes(encoded);
  if (keyBytes.byteLength !== 32) {
    throw new HttpError(503, 'invalid_encryption_config', 'AI 凭据主密钥必须为 32 字节 Base64');
  }
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function getAdditionalData(userId: string) {
  return new TextEncoder().encode(`${userId}:${PROVIDER}:v1`);
}

export async function encryptApiKey(apiKey: string, userId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getMasterKey();
  const encrypted = await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: getAdditionalData(userId),
  }, key, new TextEncoder().encode(apiKey));
  return {
    encryptedSecret: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
    keyVersion: 1,
  };
}

export async function decryptApiKey(encryptedSecret: string, iv: string, userId: string) {
  try {
    const key = await getMasterKey();
    const decrypted = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: base64ToBytes(iv),
      additionalData: getAdditionalData(userId),
    }, key, base64ToBytes(encryptedSecret));
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'credential_decryption_failed', '无法读取已保存的 API Key，请重新配置');
  }
}
