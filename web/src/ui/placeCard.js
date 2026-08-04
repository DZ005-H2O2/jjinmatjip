// 리스트 아이템 / 상세 카드 렌더링

function esc(s) {
  const div = document.createElement("div");
  div.textContent = s ?? "";
  return div.innerHTML;
}

export function verdictChip(place) {
  if (!place.verdict) return `<span class="chip pending">분석중…</span>`;
  const cls =
    { 찐맛집: "green", 애매: "amber", 광고주의: "red", 정보부족: "gray" }[place.verdict] || "gray";
  const score = place.jjin_score != null ? ` ${place.jjin_score}` : "";
  return `<span class="chip ${cls}">${esc(place.verdict)}${score}</span>`;
}

// 현위치 기준 거리 표기 ("📍350m (도보 5분)")
function distText(p, from) {
  if (!from || !p.x || !p.y) return "";
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371e3;
  const dLat = toRad(p.y - from.lat);
  const dLon = toRad(p.x - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(p.y)) * Math.sin(dLon / 2) ** 2;
  const m = 2 * R * Math.asin(Math.sqrt(a));
  const dist = m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
  const walk = m < 2500 ? ` 도보${Math.max(1, Math.round(m / 67))}분` : "";
  return `📍${dist}${walk} · `;
}

export function renderList(places, { onSelect, isFav, sort = "default", onSortChange, from }) {
  const root = document.getElementById("place-list");
  root.innerHTML = "";

  const controls = document.createElement("div");
  controls.className = "list-controls";
  controls.innerHTML = `
    <span class="count">${places.length}곳</span>
    <div class="sort-toggle">
      <button type="button" data-sort="default" class="${sort === "default" ? "on" : ""}">기본순</button>
      <button type="button" data-sort="score" class="${sort === "score" ? "on" : ""}">찐점수순</button>
    </div>`;
  controls.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => onSortChange?.(b.dataset.sort)),
  );
  root.appendChild(controls);

  const sorted =
    sort === "score"
      ? [...places].sort((a, b) => (b.jjin_score ?? -1) - (a.jjin_score ?? -1))
      : places;

  for (const p of sorted) {
    const row = document.createElement("div");
    row.className = "place-row";
    row.dataset.id = p.id;
    row.innerHTML = `
      <div class="row-main">
        <div class="row-title">${esc(p.name)} ${isFav(p.id) ? "❤️" : ""}</div>
        <div class="row-sub">${distText(p, from)}${esc(p.category)} · ${esc(p.address)}</div>
      </div>
      <div class="row-badge">${verdictChip(p)}</div>`;
    row.addEventListener("click", () => onSelect(p));
    root.appendChild(row);
  }
}

export function updateListRow(place, isFav) {
  const row = document.querySelector(`.place-row[data-id="${place.id}"]`);
  if (row) {
    row.querySelector(".row-badge").innerHTML = verdictChip(place);
    const title = row.querySelector(".row-title");
    title.innerHTML = `${esc(place.name)} ${isFav(place.id) ? "❤️" : ""}`;
  }
}

export function renderDetail(place, { onBack, onToggleFav, isFav, workerAvailable, onDeep }) {
  const root = document.getElementById("place-detail");
  const isDeep = place.source === "fulltext";
  const blogs = (place.blogs || [])
    .map((b) => {
      const tag = b.certain
        ? `<span class="blog-tag ad certain" title="${esc(b.why || "")}">광고✓</span>`
        : b.is_ad
          ? `<span class="blog-tag ad">광고?</span>`
          : `<span class="blog-tag real">내돈내산${b.fulltext ? "✓" : "?"}</span>`;
      return `
      <a class="blog-row" href="${esc(b.link)}" target="_blank" rel="noopener">
        ${tag}
        <span class="blog-title">${esc(b.title)}</span>
      </a>`;
    })
    .join("");

  const deepSection = !place.verdict
    ? ""
    : isDeep
      ? `<p class="muted deep-done">🔬 블로그 본문까지 정밀 분석된 결과예요</p>`
      : `<button id="deep-btn" type="button">🔬 본문까지 정밀 분석 (협찬 배너·공지 탐지)</button>`;

  const analysis = !workerAvailable
    ? `<p class="muted">분석 서버 미설정 — 지도 검색만 가능해요</p>`
    : !place.verdict
      ? `<p class="muted">블로그 후기 분석중… ⏳</p>`
      : `
        <p class="summary">${esc(place.summary || "")}</p>
        ${
          place.ad_count != null
            ? `<p class="muted">내돈내산 ${isDeep ? "" : "추정 "}${place.real_count}건 · 광고 ${isDeep ? "" : "추정 "}${place.ad_count}건</p>`
            : ""
        }
        ${blogs ? `<div class="blog-list">${blogs}</div><p class="muted src">출처: 네이버 블로그 검색</p>` : ""}
        ${deepSection}`;

  root.innerHTML = `
    <div class="detail-head">
      <button class="back-btn" type="button">← 목록</button>
      <button class="fav-toggle" type="button">${isFav(place.id) ? "❤️" : "🤍"}</button>
    </div>
    <h2 class="detail-title">${esc(place.name)}</h2>
    <div class="detail-meta">${verdictChip(place)} <span class="muted">${esc(place.category)}</span></div>
    <p class="muted">${esc(place.address)}${place.phone ? " · " + esc(place.phone) : ""}</p>
    ${analysis}
    <div class="ext-links">
      <a class="ext-link kakao" href="${esc(place.url)}" target="_blank" rel="noopener">카카오맵 리뷰 ↗</a>
      <a class="ext-link naver" href="https://map.naver.com/p/search/${encodeURIComponent(
        `${place.name} ${place.region || ""}`.trim(),
      )}" target="_blank" rel="noopener">네이버지도 리뷰 ↗</a>
    </div>`;

  root.querySelector(".back-btn").addEventListener("click", onBack);
  root.querySelector(".fav-toggle").addEventListener("click", (e) => {
    onToggleFav(place);
    e.target.textContent = isFav(place.id) ? "❤️" : "🤍";
  });
  const deepBtn = root.querySelector("#deep-btn");
  if (deepBtn && onDeep) {
    deepBtn.addEventListener("click", () => {
      deepBtn.disabled = true;
      deepBtn.textContent = "🔬 본문 읽는 중… (10초 내외)";
      onDeep(place);
    });
  }
}

export function renderFavList(favorites, { onSelect, onRemove }) {
  const root = document.getElementById("fav-list");
  if (!favorites.length) {
    root.innerHTML = `<div class="muted center">아직 찜한 맛집이 없어요 🤍</div>`;
    return;
  }
  root.innerHTML = `<h3 class="fav-head">우리의 찜 ❤️</h3>`;
  for (const f of favorites) {
    const row = document.createElement("div");
    row.className = "place-row";
    row.innerHTML = `
      <div class="row-main">
        <div class="row-title">${esc(f.name)}</div>
        <div class="row-sub">${esc(f.address || "")}</div>
      </div>
      <div class="row-badge">
        ${f.jjin_score != null ? `<span class="chip green">${f.jjin_score}</span>` : ""}
        <button class="remove-fav" type="button" aria-label="찜 해제">✕</button>
      </div>`;
    row.querySelector(".remove-fav").addEventListener("click", (e) => {
      e.stopPropagation();
      onRemove(f);
    });
    row.addEventListener("click", () => onSelect(f));
    root.appendChild(row);
  }
}
