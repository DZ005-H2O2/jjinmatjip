// KV 캐시 — 프롬프트/스키마 변경 시 버전을 올려 일괄 무효화
const VERSION = "v1";
const TTL_NORMAL = 60 * 60 * 24 * 30; // 30일
const TTL_NO_INFO = 60 * 60 * 24 * 7; // 정보부족은 7일

const key = (placeId) => `analysis:${VERSION}:${placeId}`;

export async function getCached(env, placeId) {
  const raw = await env.KV.get(key(placeId));
  return raw ? JSON.parse(raw) : null;
}

export async function putCached(env, placeId, result) {
  const ttl = result.verdict === "정보부족" ? TTL_NO_INFO : TTL_NORMAL;
  await env.KV.put(key(placeId), JSON.stringify(result), { expirationTtl: ttl });
}
