// 남용 방지: 인증 실패 IP 잠금 + LLM 일일 사용 상한

const FAIL_LIMIT = 5; // 이 횟수 이상 틀리면
const FAIL_TTL = 3600; // 1시간 잠금
const DAILY_LLM_CAP = 60; // 하루 최대 분석(Claude 호출) 횟수

// 반환: "ok" | "wrong" | "locked"
// 정답이면 잠금과 무관하게 통과 — 커플이 같은 IP(집 와이파이)에서 오타로
// 스스로를 잠그는 사고 방지. 틀린 시도는 여전히 시간당 5회로 제한된다.
export async function authGate(env, ip, pw) {
  if (pw === env.APP_PASSWORD) return "ok";
  const key = `authfail:${ip}`;
  const fails = parseInt((await env.KV.get(key)) || "0", 10);
  if (fails >= FAIL_LIMIT) return "locked";
  await env.KV.put(key, String(fails + 1), { expirationTtl: FAIL_TTL });
  return "wrong";
}

// 오늘 분석 예산 1회 차감. 한도 초과면 false (호출부는 LLM/네이버 호출 생략)
export async function takeLlmBudget(env) {
  const key = `usage:${new Date().toISOString().slice(0, 10)}`;
  const n = parseInt((await env.KV.get(key)) || "0", 10);
  if (n >= DAILY_LLM_CAP) return false;
  await env.KV.put(key, String(n + 1), { expirationTtl: 172800 });
  return true;
}
