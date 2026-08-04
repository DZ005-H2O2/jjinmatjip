// 공유 찜 리스트 — KV 단일 키, PUT은 전체 교체(last-writer-wins)
const FAV_KEY = "fav:list";
const MAX_FAVORITES = 200;

export async function getFavorites(env) {
  const raw = await env.KV.get(FAV_KEY);
  return raw ? JSON.parse(raw) : { favorites: [], updatedAt: null };
}

export async function putFavorites(body, env) {
  const favorites = Array.isArray(body?.favorites) ? body.favorites.slice(0, MAX_FAVORITES) : [];
  const data = { favorites, updatedAt: new Date().toISOString() };
  await env.KV.put(FAV_KEY, JSON.stringify(data));
  return data;
}
