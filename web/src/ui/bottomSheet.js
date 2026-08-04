// 3단 바텀시트: peek(핸들만) / half(리스트) / full(상세)

const STATES = ["peek", "half", "full"];
let sheet;

export function initSheet() {
  sheet = document.getElementById("bottom-sheet");
  const handle = document.getElementById("sheet-handle");

  let startY = null;
  let startState = null;

  const onStart = (y) => {
    startY = y;
    startState = current();
  };
  const onEnd = (y) => {
    if (startY == null) return;
    const dy = startY - y; // 위로 끌면 양수
    const idx = STATES.indexOf(startState);
    if (dy > 40 && idx < 2) setState(STATES[idx + 1]);
    else if (dy < -40 && idx > 0) setState(STATES[idx - 1]);
    startY = null;
  };

  handle.addEventListener("touchstart", (e) => onStart(e.touches[0].clientY), { passive: true });
  handle.addEventListener("touchend", (e) => onEnd(e.changedTouches[0].clientY), { passive: true });
  handle.addEventListener("mousedown", (e) => onStart(e.clientY));
  window.addEventListener("mouseup", (e) => startY != null && onEnd(e.clientY));
  handle.addEventListener("click", () => {
    // 탭으로도 토글 (peek ↔ half)
    if (current() === "peek") setState("half");
  });
}

function current() {
  return STATES.find((s) => sheet.classList.contains(s)) || "peek";
}

export function setState(state) {
  sheet.classList.remove(...STATES);
  sheet.classList.add(state);
}

// 표시할 패널 전환: 'empty' | 'list' | 'detail' | 'fav'
export function showPanel(name) {
  document.getElementById("sheet-empty").hidden = name !== "empty";
  document.getElementById("place-list").hidden = name !== "list";
  document.getElementById("place-detail").hidden = name !== "detail";
  document.getElementById("fav-list").hidden = name !== "fav";
}
