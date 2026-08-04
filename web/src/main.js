import "./styles.css";
import {
  hasWorker,
  getPassword,
  setPassword,
  fetchFavorites,
  saveFavorites,
  analyzePlaces,
  deepAnalyze,
} from "./api.js";
import {
  loadKakaoSdk,
  initMap,
  getMap,
  renderMarkers,
  updateMarker,
  panTo,
  showUserLocation,
} from "./map.js";
import { searchPlaces, searchPlacesInBounds } from "./search.js";
import { initSheet, setState, showPanel } from "./ui/bottomSheet.js";
import {
  renderList,
  renderDetail,
  renderFavList,
  updateListRow,
} from "./ui/placeCard.js";

let places = [];
let favorites = [];
let sortMode = "default"; // "default" | "score"
let userPos = null; // { lat, lng }
let lastTargets = null; // 분석 실패 시 재시도용

const isFav = (id) => favorites.some((f) => f.id === id);

function renderPlaceList() {
  renderList(places, {
    onSelect: openDetail,
    isFav,
    sort: sortMode,
    onSortChange: (m) => {
      sortMode = m;
      renderPlaceList();
    },
    from: userPos,
  });
}

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

// ── 분석 상태 표시 ──────────────────────────────────────────
function setAnalyzeStatus(kind, text) {
  const el = document.getElementById("analyze-status");
  clearTimeout(setAnalyzeStatus._t);
  if (!kind) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.className = kind;
  el.textContent = text;
  if (kind === "done") {
    setAnalyzeStatus._t = setTimeout(() => (el.hidden = true), 3000);
  }
}

// ── 최근 검색어 ─────────────────────────────────────────────
const RECENT_KEY = "jjin.recent";

function getRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
  } catch {
    return [];
  }
}

function pushRecent(keyword) {
  const list = [keyword, ...getRecent().filter((k) => k !== keyword)].slice(0, 6);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

function renderEmptyPanel() {
  const el = document.getElementById("sheet-empty");
  const recent = getRecent();
  if (!recent.length) {
    el.textContent = "지역과 키워드로 검색해보세요 🍜";
    return;
  }
  el.innerHTML =
    `<div class="recent-label">최근 검색</div>` +
    recent.map((k) => `<button type="button" class="recent-chip">${k.replace(/</g, "&lt;")}</button>`).join("");
  el.querySelectorAll(".recent-chip").forEach((b) =>
    b.addEventListener("click", () => {
      document.getElementById("search-input").value = b.textContent;
      onSearch(b.textContent);
    }),
  );
}

// ── 검색 → 분석 파이프라인 ──────────────────────────────────
async function onSearch(keyword) {
  showPanel("empty");
  document.getElementById("sheet-empty").textContent = "검색중… 🔎";
  let found;
  try {
    found = await searchPlaces(keyword, userPos);
  } catch {
    toast("장소 검색에 실패했어요");
    return;
  }
  pushRecent(keyword);
  presentResults(found, { fit: true });
}

// 지도를 움직인 뒤 현재 화면 범위에서 재검색 (키워드 없으면 음식점 전체)
async function onAreaSearch() {
  const keyword = document.getElementById("search-input").value.trim();
  let found;
  try {
    found = await searchPlacesInBounds(keyword, getMap().getBounds());
  } catch {
    toast("장소 검색에 실패했어요");
    return;
  }
  presentResults(found, { fit: false });
}

function presentResults(found, { fit }) {
  places = found;
  sortMode = "default";
  if (!places.length) {
    document.getElementById("sheet-empty").textContent = "이 지역엔 결과가 없어요 😢";
    showPanel("empty");
    return;
  }
  renderMarkers(places, openDetail, { fit });
  renderPlaceList();
  showPanel("list");
  setState("half");
  if (hasWorker) runAnalysis(places.slice(0, 10));
}

async function runAnalysis(targets) {
  lastTargets = targets;
  setAnalyzeStatus("analyzing", `⏳ 블로그 후기 분석중… (${targets.length}곳, 5~15초)`);
  try {
    const { results } = await analyzePlaces(
      targets.map((p) => ({ id: p.id, name: p.name, region: p.region })),
    );
    for (const p of places) {
      const r = results[p.id];
      if (!r) continue;
      Object.assign(p, r);
      updateMarker(p);
    }
    renderPlaceList(); // 점수 반영 + 정렬 갱신
    // 상세 화면이 열려있으면 갱신
    const detail = document.getElementById("place-detail");
    if (!detail.hidden && detail.dataset.id) {
      const p = places.find((x) => x.id === detail.dataset.id);
      if (p) openDetail(p);
    }
    setAnalyzeStatus("done", "✅ 분석 완료 — 찐점수순으로 정렬해보세요");
  } catch (e) {
    if (e.code === 401) {
      setAnalyzeStatus(null);
      await ensureAuth();
      return runAnalysis(targets);
    }
    setAnalyzeStatus("error", "⚠️ 후기 분석 실패 — 여기를 눌러 재시도");
  }
}

// ── 상세 / 찜 ───────────────────────────────────────────────
function openDetail(place) {
  panTo(place);
  // 목록 밖(찜에서 진입)이면 places에 없을 수 있음
  const p = places.find((x) => x.id === place.id) || place;
  const el = document.getElementById("place-detail");
  // 안드로이드 뒤로가기로 목록에 돌아올 수 있게 히스토리에 쌓기 (재렌더 시 중복 방지)
  if (el.hidden) history.pushState({ panel: "detail" }, "");
  el.dataset.id = p.id;
  renderDetail(p, {
    onBack: () => history.back(),
    onToggleFav: toggleFav,
    isFav,
    workerAvailable: hasWorker,
    onDeep: runDeepAnalysis,
  });
  showPanel("detail");
  setState("full");

  // 11~15위 등 미분석 장소는 탭 시 지연 분석
  if (hasWorker && !p.verdict && p.region !== undefined) runAnalysis([p]);
}

async function runDeepAnalysis(place) {
  try {
    const { result } = await deepAnalyze(place);
    const p = places.find((x) => x.id === place.id) || place;
    Object.assign(p, result);
    updateMarker(p);
    updateListRow(p, isFav);
    openDetail(p);
  } catch (e) {
    if (e.code === 401) {
      await ensureAuth();
      return runDeepAnalysis(place);
    }
    toast("정밀 분석에 실패했어요 — 다시 시도해보세요");
    openDetail(place);
  }
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
      region: place.region,
      category: place.category,
      url: place.url,
      x: place.x,
      y: place.y,
      jjin_score: place.jjin_score,
      verdict: place.verdict,
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
  if (document.getElementById("fav-list").hidden) {
    history.pushState({ panel: "fav" }, "");
  }
  // 찜한 곳들을 지도에 ♥ 마커로 표시
  const favMarkers = favorites.filter((f) => f.x && f.y).map((f) => ({ ...f, _fav: true }));
  if (favMarkers.length) renderMarkers(favMarkers, openDetail, { fit: true });
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
  renderEmptyPanel();
  await ensureAuth();

  document.getElementById("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.getElementById("search-input").value.trim();
    if (q) onSearch(q);
    document.getElementById("search-input").blur();
  });
  document.getElementById("fav-btn").addEventListener("click", openFavList);
  document.getElementById("area-search-btn").addEventListener("click", onAreaSearch);
  document.getElementById("locate-btn").addEventListener("click", onLocate);
  document.getElementById("analyze-status").addEventListener("click", (e) => {
    if (e.target.className === "error" && lastTargets) runAnalysis(lastTargets);
  });

  // 안드로이드 뒤로가기: 상세/찜 화면이면 목록으로 (앱 종료 방지)
  window.addEventListener("popstate", () => {
    const detailVisible = !document.getElementById("place-detail").hidden;
    const favVisible = !document.getElementById("fav-list").hidden;
    if (!detailVisible && !favVisible) return;
    if (favVisible || detailVisible) {
      // 찜 화면에서 나올 때는 검색 마커 복원
      if (places.length) {
        renderMarkers(places, openDetail, { fit: false });
        showPanel("list");
        setState("half");
      } else {
        showPanel("empty");
        setState("peek");
      }
    }
  });
}

// ── 내 위치 ─────────────────────────────────────────────────
function onLocate() {
  if (!navigator.geolocation) {
    toast("이 브라우저는 위치를 지원하지 않아요");
    return;
  }
  toast("내 위치 찾는 중… 📍");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      showUserLocation(userPos.lat, userPos.lng);
      if (places.length) renderPlaceList(); // 거리 표시 갱신
      toast("파란 점이 내 위치예요 — 🔄 이 지역에서 검색을 눌러보세요");
    },
    () => toast("위치 접근을 허용해주세요 (브라우저 설정)"),
    { enableHighAccuracy: true, timeout: 8000 },
  );
}

boot();
