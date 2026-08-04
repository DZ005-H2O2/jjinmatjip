import { WORKER_URL } from "./config.js";

const PW_KEY = "jjin.pw";

// Worker is reachable when a URL is configured, or in dev via the vite proxy.
export const hasWorker = Boolean(WORKER_URL) || import.meta.env.DEV;

const base = WORKER_URL || "";

export function getPassword() {
  return localStorage.getItem(PW_KEY) || "";
}

export function setPassword(pw) {
  localStorage.setItem(PW_KEY, pw);
}

export function clearPassword() {
  localStorage.removeItem(PW_KEY);
}

async function request(path, options = {}) {
  const res = await fetch(base + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-App-Password": getPassword(),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    clearPassword();
    const err = new Error("unauthorized");
    err.code = 401;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`API 오류 (${res.status})`);
    err.code = res.status;
    throw err;
  }
  return res.json();
}

// pw 검증 겸용 — 성공하면 찜 목록 반환
export function fetchFavorites() {
  return request("/api/favorites");
}

export function saveFavorites(favorites) {
  return request("/api/favorites", {
    method: "PUT",
    body: JSON.stringify({ favorites }),
  });
}

export function analyzePlaces(places) {
  return request("/api/analyze", {
    method: "POST",
    body: JSON.stringify({ places }),
  });
}

// 한 곳만 블로그 본문까지 정밀 분석
export function deepAnalyze(place) {
  return request("/api/deep", {
    method: "POST",
    body: JSON.stringify({ place: { id: place.id, name: place.name, region: place.region } }),
  });
}
