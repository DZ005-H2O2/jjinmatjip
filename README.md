# 🍜 찐맛집

둘만 쓰는 찐맛집 탐색 모바일 웹앱. 지역/키워드로 검색하면 카카오맵 위에 후보 식당을 띄우고,
네이버 블로그 후기를 Claude로 분석해 **광고/협찬을 걸러낸 "찐 점수"와 요약**을 보여줍니다.

## 구조

```
web/     # 프론트엔드 — Vite vanilla JS, 카카오맵 SDK, GitHub Pages 배포
worker/  # 백엔드 — Cloudflare Worker (네이버 블로그검색 + Claude 분석 + KV 캐시/찜)
```

- 카카오 장소검색은 브라우저에서 직접 (JS SDK `services`)
- Worker가 하는 일: 네이버 블로그 스니펫 수집 → Claude Haiku 배치 분석(광고 판별, structured outputs) → KV 30일 캐시, 공유 찜 리스트, 공유 비밀번호 인증
- 비용: 캐시 미스 검색 1회 ≈ $0.015 (Claude Haiku 4.5). 나머지는 전부 무료 티어.

## 키 발급 체크리스트

### 1. 카카오 (지도 + 장소검색) — 무료
1. https://developers.kakao.com → 내 애플리케이션 → 애플리케이션 추가
2. 앱 키 중 **JavaScript 키** 복사 → `web/src/config.js`의 `KAKAO_JS_KEY`에 붙여넣기
3. ⚠️ **앱 설정 > 플랫폼 > Web 사이트 도메인**에 둘 다 등록 (안 하면 지도가 조용히 안 뜸):
   - `http://localhost:5173`
   - `https://<깃헙아이디>.github.io`
4. 카카오맵 사용 설정: 제품 설정 > 카카오맵 > 활성화

### 2. 네이버 (블로그 검색) — 무료 25,000회/일
1. https://developers.naver.com → Application → 애플리케이션 등록
2. 사용 API: **검색** 선택, 환경: WEB (주소는 아무거나, 서버에서만 호출함)
3. Client ID / Client Secret → Worker 시크릿으로 등록 (아래)

### 3. Cloudflare (Worker + KV) — 무료
1. https://dash.cloudflare.com 가입
2. `cd worker && npm install`
3. `npx wrangler login`
4. `npx wrangler kv namespace create KV` → 출력된 id를 `wrangler.toml`에 붙여넣기
5. 시크릿 등록:
   ```bash
   npx wrangler secret put NAVER_CLIENT_ID
   npx wrangler secret put NAVER_CLIENT_SECRET
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put APP_PASSWORD     # 둘만 아는 비밀번호
   ```
6. `npx wrangler deploy` → 출력된 `https://jjinmatjip-api.xxx.workers.dev` 주소를
   `web/src/config.js`의 `WORKER_URL`에 붙여넣기
7. `wrangler.toml`의 `ALLOWED_ORIGINS`에서 `USERNAME`을 실제 깃헙 아이디로 교체

### 4. Anthropic (Claude API) — 소액 과금
1. https://console.anthropic.com → API Keys → 키 생성 (최소 $5 크레딧 충전)
2. 위 3-5의 `ANTHROPIC_API_KEY` 시크릿으로 등록

## 로컬 개발

```bash
# 터미널 1 — Worker (worker/.dev.vars 먼저 작성, .dev.vars.example 참고)
cd worker && npm install && npm run dev

# 터미널 2 — 프론트
cd web && npm install && npm run dev
# → http://localhost:5173
```

- `worker/.dev.vars`에 `MOCK_CLAUDE=1`을 넣으면 Claude 호출 없이(비용 0원) 고정 픽스처로 UI 개발 가능
- 카카오 키만 있으면 Worker 없이도 지도 검색은 동작 (분석/찜은 비활성)

## 배포 (GitHub)

1. GitHub에 레포 생성 후 push → `main` 브랜치의 `web/**` 변경 시 Pages 자동 배포
2. 레포 Settings > Pages > Source를 **GitHub Actions**로 설정
3. Worker 자동 배포를 원하면: Cloudflare 대시보드에서 API Token 생성
   (템플릿: Edit Cloudflare Workers) → 레포 Settings > Secrets > Actions에
   `CLOUDFLARE_API_TOKEN` 등록. 아니면 `npx wrangler deploy`로 수동 배포.

## 판정 기준

| 배지 | 의미 |
|---|---|
| 🟢 찐맛집 (70+) | 내돈내산 추정 후기가 다수 |
| 🟡 애매 (40-69) | 광고와 진짜 후기가 섞임 |
| 🔴 광고주의 (<40) | 협찬/광고성 글 위주 |
| ⚪ 정보부족 | 후기가 적어 판단 불가 |

스니펫(제목+요약)만 분석하므로 판별은 보수적입니다. 블로그 원문 링크로 직접 확인하세요.
후기 출처: 네이버 블로그 검색 API.
