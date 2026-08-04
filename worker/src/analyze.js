import { searchBlogs } from "./naver.js";
import { getCached, putCached } from "./cache.js";
import { mockResult } from "./mock.js";

const MODEL = "claude-haiku-4-5";
const MAX_PLACES = 10;


const SYSTEM_PROMPT = `You are a Korean restaurant review analyst. You receive Naver blog
search snippets (title + description + postdate) for several restaurants. For each
restaurant, classify each blog post as likely sponsored/ad (광고·협찬) or genuine
(내돈내산), then produce an overall verdict.

Ad signals (explicit): 협찬, 원고료, 소정의 원고료, 체험단, 서포터즈, 제공받아,
초대받아, 지원받아, 유료광고, "업체로부터".
Ad signals (subtle): press-release tone; menu-with-prices enumeration; excessive
superlatives typical of campaigns; near-identical phrasing across different blogs;
multiple posts clustered within days (compare postdate); generic keyword-stuffed
titles like "[성수 맛집] OO 다녀왔어요!".
Genuine signals: 내돈내산, 재방문, specific complaints or mixed opinions,
waiting-time gripes, personal context unrelated to the restaurant.

Scoring (jjin_score 0-100): start from the genuine-post ratio; weight by evidence
strength and post count. Snippets are short, so be conservative — prefer 광고주의
over certainty.
Verdicts: 찐맛집 (score>=70 and >=2 genuine posts), 애매 (40-69 or mixed),
광고주의 (<40 or ad-dominated), 정보부족 (<3 posts and no clear signals; use
jjin_score null).
summary: 1-2 Korean sentences; mention repeatedly praised dishes/keywords if any.
Do not invent facts not present in the snippets.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          place_id: { type: "string" },
          jjin_score: { anyOf: [{ type: "integer" }, { type: "null" }] },
          verdict: { type: "string", enum: ["찐맛집", "애매", "광고주의", "정보부족"] },
          summary: { type: "string" },
          per_post: {
            type: "array",
            items: {
              type: "object",
              properties: {
                index: { type: "integer" },
                is_ad: { type: "boolean" },
              },
              required: ["index", "is_ad"],
              additionalProperties: false,
            },
          },
        },
        required: ["place_id", "jjin_score", "verdict", "summary", "per_post"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
};

function buildUserContent(placesWithPosts) {
  const lines = ["Analyze the following restaurants:\n"];
  for (const { place, posts } of placesWithPosts) {
    lines.push(`## place_id: ${place.id} — ${place.name} (${place.region || "지역불명"})`);
    posts.forEach((post, i) => {
      lines.push(`[${i}] (${post.postdate}) ${post.title} — ${post.description}`);
    });
    lines.push("");
  }
  return lines.join("\n");
}

async function callClaude(placesWithPosts, env) {
  // 미국 리전 DO를 통해 호출 (llmRelay.js 참고)
  const stub = env.LLM_DO.get(env.LLM_DO.idFromName("us-relay"), { locationHint: "enam" });
  const { text, usage } = await stub.createMessage({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [{ role: "user", content: buildUserContent(placesWithPosts) }],
  });
  console.log(`claude usage: in=${usage.input_tokens} out=${usage.output_tokens}`);
  return JSON.parse(text).results || [];
}

export async function handleAnalyze(body, env) {
  const places = (body?.places || []).slice(0, MAX_PLACES);
  const results = {};
  const cached = [];
  const analyzed = [];

  // 1. 캐시 조회
  const misses = [];
  for (const place of places) {
    if (!place?.id || !place?.name) continue;
    const hit = await getCached(env, place.id);
    if (hit) {
      results[place.id] = hit;
      cached.push(place.id);
    } else {
      misses.push(place);
    }
  }

  if (!misses.length) return { results, cached, analyzed };

  // 2. 네이버 블로그 검색 (병렬)
  const withPosts = await Promise.all(
    misses.map(async (place) => ({ place, posts: await searchBlogs(place, env) })),
  );

  // 후기 0건 → LLM 생략, 정보부족 처리
  const toAnalyze = [];
  for (const entry of withPosts) {
    if (!entry.posts.length) {
      const result = {
        place_id: entry.place.id,
        jjin_score: null,
        verdict: "정보부족",
        ad_count: 0,
        real_count: 0,
        summary: "블로그 후기를 찾지 못했어요.",
        blogs: [],
        analyzedAt: new Date().toISOString(),
        source: "snippet",
      };
      results[entry.place.id] = result;
      analyzed.push(entry.place.id);
      await putCached(env, entry.place.id, result);
    } else {
      toAnalyze.push(entry);
    }
  }

  if (!toAnalyze.length) return { results, cached, analyzed };

  // 3. Claude 배치 분석 (1회 호출, structured outputs)
  const llmResults =
    env.MOCK_CLAUDE === "1"
      ? toAnalyze.map((e, i) => mockResult(e.place.id, i))
      : await callClaude(toAnalyze, env);

  const byId = Object.fromEntries(llmResults.map((r) => [r.place_id, r]));

  for (const { place, posts } of toAnalyze) {
    const r = byId[place.id];
    if (!r) continue;
    const blogs = posts.map((post, i) => ({
      title: post.title,
      link: post.link,
      postdate: post.postdate,
      is_ad: r.per_post?.find((p) => p.index === i)?.is_ad ?? false,
    }));
    const adCount = blogs.filter((b) => b.is_ad).length;
    const result = {
      place_id: place.id,
      jjin_score: r.jjin_score,
      verdict: r.verdict,
      ad_count: adCount,
      real_count: blogs.length - adCount,
      summary: r.summary,
      blogs,
      analyzedAt: new Date().toISOString(),
      source: "snippet",
    };
    results[place.id] = result;
    analyzed.push(place.id);
    await putCached(env, place.id, result);
  }

  return { results, cached, analyzed };
}
