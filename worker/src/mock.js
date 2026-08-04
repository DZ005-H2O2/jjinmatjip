// MOCK_CLAUDE=1 개발용 고정 픽스처 — LLM 비용 없이 UI 개발
const FIXTURES = [
  { jjin_score: 85, verdict: "찐맛집", summary: "내돈내산 후기가 다수. 크림파스타 언급이 반복적으로 등장해요. (mock)" },
  { jjin_score: 30, verdict: "광고주의", summary: "협찬 표기 글이 대부분이라 주의가 필요해요. (mock)" },
  { jjin_score: 55, verdict: "애매", summary: "광고성 글과 진짜 후기가 섞여 있어요. (mock)" },
];

export function mockResult(placeId, i) {
  const f = FIXTURES[i % FIXTURES.length];
  return {
    place_id: placeId,
    ...f,
    per_post: [0, 1, 2, 3, 4].map((index) => ({ index, is_ad: index % 2 === 1 })),
  };
}
