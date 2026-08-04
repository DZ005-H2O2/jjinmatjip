// ── 사용자 설정 ──────────────────────────────────────────────
// 카카오 개발자 콘솔(developers.kakao.com)에서 발급한 JavaScript 키.
// JS 키는 도메인 제한으로 보호되므로 커밋해도 안전합니다.
// ⚠️ 앱 설정 > 플랫폼 > Web 에 다음 두 도메인을 반드시 등록:
//    http://localhost:5173  와  https://<username>.github.io
export const KAKAO_JS_KEY = "edde2f9425b4823e80c0dcda0f2f13b7";

// 배포된 Cloudflare Worker 주소 (예: "https://jjinmatjip-api.xxx.workers.dev").
// 비워두면: 로컬 개발에서는 vite 프록시(/api → localhost:8787)를 사용하고,
// 배포 환경에서는 분석/찜 기능 없이 지도 검색만 동작합니다.
export const WORKER_URL = "https://jjinmatjip-api.jjinmatjip-api.workers.dev";
