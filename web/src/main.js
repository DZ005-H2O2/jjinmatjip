import "./styles.css";
import {
  hasWorker,
  getPassword,
  setPassword,
  fetchFavorites,
  saveFavorites,
  analyzePlaces,
} from "./api.js";
import { loadKakaoSdk, initMap, renderMarkers, updateMarker, panTo } from "./map.js";
import { searchPlaces } from "./search.js";
import { initSheet, setState, showPanel } from "./ui/bottomSheet.js";
import {
  renderList,
  renderDetail,
  renderFavList,
  updateListRow,
} from "./ui/placeCard.js";

let places = [];
let favorites = [];

const isFav = (id) => favorites.some((f) => f.id === id);

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 3000);
}

// ── 비밀번호 게이트 ─────────────────────────────────────────
async function ensureAuth() {
  if (!hasWorker) return; // 워커 미설정: 지도 전용 모드
  let failed = false;
  while (true) {
    if (getPassword()) {
      try {
        const data = await fetchFavorites();
        favorites = data.favorites || [];
        return;
      } catch (e) {
        if (e.code !== 401) {
          toast("서버 연결 실패 — 지도만 사용 가능해요");
          return;
        }
        failed = true; // 틀린 비밀번호 → 에러 표시하며 재입력
      }
    }
    await promptPassword(failed);
  }
}

function promptPassword(showError) {
  return new Promise((resolve) => {
    const gate = document.getElementById("pw-gate");
    const form = document.getElementById("pw-form");
    const input = document.getElementById("pw-input");
    const error = document.getElementById("pw-error");
    gate.hidden = false;
    error.hidden = !showError;
    input.focus();
    form.onsubmit = (e) => {
      e.preventDefault();
      if (!input.value) return;
      setPassword(input.value);
      input.value = "";
      gate.hidden = true;
      resolve();
    };
  });
}

// ── 검색 → 분석 파이프라인 ──────────────────────────────────
async function onSearch(keyword) {
  showPanel("empty");
  document.getElementById("sheet-empty").textContent = "검색중… 🔎";
  try {
    places = await searchPlaces(keyword);
  } catch {
    toast("장소 검색에 실패했어요");
    return;
  }
  if (!places.length) {
    document.getElementById("sheet-empty").textContent = "검색 결과가 없어요 😢";
    return;
  }

  renderMarkers(places, openDetail);
  renderList(places, { onSelect: openDetail, isFav });
  showPanel("list");
  setState("half");

  if (hasWorker) runAnalysis(places.slice(0, 10));
}

async function runAnalysis(targets) {
  try {
    const { results } = await analyzePlaces(
      targets.map((p) => ({ id: p.id, name: p.name, region: p.region })),
    );
    for (const p of places) {
      const r = results[p.id];
      if (!r) continue;
      Object.assign(p, r);
      updateMarker(p);
      updateListRow(p, isFav);
    }
    // 상세 화면이 열려있으면 갱신
    const detail = document.getElementById("place-detail");
    if (!detail.hidden && detail.dataset.id) {
      const p = places.find((x) => x.id === detail.dataset.id);
      if (p) openDetail(p);
    }
  } catch (e) {
    if (e.code === 401) {
      await ensureAuth();
      return runAnalysis(targets);
    }
    toast("후기 분석에 실패했어요 — 다시 검색해보세요");
  }
}

// ── 상세 / 찜 ───────────────────────────────────────────────
function openDetail(place) {
  panTo(place);
  // 목록 밖(찜에서 진입)이면 places에 없을 수 있음
  const p = places.find((x) => x.id === place.id) || place;
  document.getElementById("place-detail").dataset.id = p.id;
  renderDetail(p, {
    onBack: () => {
      showPanel(places.length ? "list" : "empty");
    },
    onToggleFav: toggleFav,
    isFav,
    workerAvailable: hasWorker,
  });
  showPanel("detail");
  setState("full");

  // 11~15위 등 미분석 장소는 탭 시 지연 분석
  if (hasWorker && !p.verdict && p.region !== undefined) runAnalysis([p]);
}

async function toggleFav(place) {
  if (!hasWorker) {
    toast("찜 기능은 서버 설정 후 사용 가능해요");
    return;
  }
  if (isFav(place.id)) {
    favorites = favorites.filter((f) => f.id !== place.id);
  } else {
    favorites.push({
      id: place.id,
      name: place.name,
      address: place.address,
      url: place.url,
      x: place.x,
      y: place.y,
      jjin_score: place.jjin_score,
      addedAt: new Date().toISOString(),
    });
  }
  try {
    const data = await saveFavorites(favorites);
    favorites = data.favorites || favorites;
  } catch {
    toast("찜 저장에 실패했어요");
  }
}

async function openFavList() {
  if (!hasWorker) {
    toast("찜 기능은 서버 설정 후 사용 가능해요");
    return;
  }
  try {
    const data = await fetchFavorites();
    favorites = data.favorites || [];
  } catch (e) {
    if (e.code === 401) {
      await ensureAuth();
      return openFavList();
    }
  }
  renderFavList(favorites, {
    onSelect: (f) => openDetail(f),
    onRemove: async (f) => {
      favorites = favorites.filter((x) => x.id !== f.id);
      try {
        await saveFavorites(favorites);
      } catch {
        toast("찜 저장에 실패했어요");
      }
      openFavList();
    },
  });
  showPanel("fav");
  setState("half");
}

// ── 부트스트랩 ──────────────────────────────────────────────
async function boot() {
  initSheet();
  try {
    await loadKakaoSdk();
  } catch (e) {
    document.getElementById("sheet-empty").textContent = e.message;
    return;
  }
  initMap();
  await ensureAuth();

  document.getElementById("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.getElementById("search-input").value.trim();
    if (q) onSearch(q);
    document.getElementById("search-input").blur();
  });
  document.getElementById("fav-btn").addEventListener("click", openFavList);
}

boot();
