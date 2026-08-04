# 찐맛집 (jjinmatjip)

둘만 쓰는 커플용 찐맛집 탐색 모바일 웹앱. 상세 배경/키 발급 절차는 README.md 참고.

## 아키텍처

- `web/` — Vite vanilla JS 정적 앱 (GitHub Pages 배포). 카카오맵 JS SDK로 지도 + 장소검색을 클라이언트에서 직접 수행.
- `worker/` — Cloudflare Worker. 역할: 네이버 블로그검색 프록시 → Claude Haiku 4.5 배치 분석(광고/협찬 판별, structured outputs) → KV 캐시(`analysis:v1:{place_id}`, 30일) + 공유 찜(`fav:list`) + `X-App-Password` 인증.
- 배포: `.github/workflows/` — main 푸시 시 Pages/Worker 자동 배포. Pages 서브패스는 CI가 `BASE_PATH`로 주입.

## 규칙/주의사항

- UI 텍스트는 한국어, 코드/주석은 영어 위주.
- 카카오 JS 키(`web/src/config.js`)는 도메인 제한이라 커밋해도 됨. 그 외 모든 키는 Worker 시크릿(`wrangler secret put`) 또는 `.dev.vars`(git 제외)에만.
- 분석 프롬프트/스키마를 바꾸면 `worker/src/cache.js`의 `VERSION`을 올려 캐시 무효화.
- LLM 모델은 `claude-haiku-4-5` (worker/src/analyze.js의 `MODEL` 상수 한 곳).
- 로컬 개발: `worker`에서 `npm run dev`(:8787) + `web`에서 `npm run dev`(:5173, /api는 프록시). `.dev.vars`에 `MOCK_CLAUDE=1`이면 Claude 호출 없이 픽스처 반환.
- 카카오 SDK는 도메인 미등록 시 조용히 실패함 — "로컬은 되는데 배포만 안 됨" 1순위 원인.
