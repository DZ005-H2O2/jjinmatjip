import { KAKAO_JS_KEY } from "./config.js";

let map = null;
let overlays = new Map(); // place_id → CustomOverlay

export function loadKakaoSdk() {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps) return resolve();
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&libraries=services&autoload=false`;
    script.onload = () => window.kakao.maps.load(resolve);
    script.onerror = () =>
      reject(new Error("카카오맵 SDK 로드 실패 — JS 키와 도메인 등록을 확인하세요"));
    document.head.appendChild(script);
  });
}

export function initMap() {
  map = new kakao.maps.Map(document.getElementById("map"), {
    center: new kakao.maps.LatLng(37.5665, 126.978), // 서울시청
    level: 5,
  });
  return map;
}

export function getMap() {
  return map;
}

function scoreClass(place) {
  if (place.verdict === "정보부족") return "gray";
  if (place.jjin_score == null) return "pending";
  if (place.jjin_score >= 70) return "green";
  if (place.jjin_score >= 40) return "amber";
  return "red";
}

function pillLabel(place) {
  if (place.verdict === "정보부족") return "?";
  if (place.jjin_score == null) return "…";
  return String(place.jjin_score);
}

export function clearMarkers() {
  for (const ov of overlays.values()) ov.setMap(null);
  overlays.clear();
}

export function renderMarkers(places, onTap) {
  clearMarkers();
  const bounds = new kakao.maps.LatLngBounds();
  for (const p of places) {
    const pos = new kakao.maps.LatLng(p.y, p.x);
    bounds.extend(pos);
    const el = document.createElement("div");
    el.className = `marker-pill ${scoreClass(p)}`;
    el.textContent = pillLabel(p);
    el.addEventListener("click", () => onTap(p));
    const ov = new kakao.maps.CustomOverlay({ position: pos, content: el, yAnchor: 1.2 });
    ov.setMap(map);
    overlays.set(p.id, ov);
  }
  if (places.length) map.setBounds(bounds);
}

// 분석 결과 도착 시 해당 마커만 갱신
export function updateMarker(place) {
  const ov = overlays.get(place.id);
  if (!ov) return;
  const el = ov.getContent();
  el.className = `marker-pill ${scoreClass(place)}`;
  el.textContent = pillLabel(place);
}

export function panTo(place) {
  map.panTo(new kakao.maps.LatLng(place.y, place.x));
}
