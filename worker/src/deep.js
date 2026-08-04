// 심층 분석: 탭한 식당 1곳의 블로그 "본문"까지 읽어 광고를 확정 판별.
//
// 핵심 아이디어: 협찬 공지가 이미지여도, 그 배너는 체험단 플랫폼이 제공한
// 이미지라서 본문 HTML의 이미지 주소에 플랫폼 도메인이 남는다. 이건 LLM
// 없이도 잡히는 결정적 신호(광고 확정)다. 텍스트 공지 문구도 마찬가지.
import { searchBlogs } from "./naver.js";
import { getCached, putCached } from "./cache.js";

// 체험단/리뷰 캠페인 플랫폼 흔적 (이미지 src·본문 링크에서 탐지)
const SPONSOR_PLATFORMS = [
  "adsome",
  "revu.",
  "reviewnote",
  "reviewplace",
  "dinnerqueen",
  "seoulouba",
  "cometoplay",
  "assaview",
  "popomon",
  "ringble",
  "storyn.kr",
  "gangnamfood",
  "inflexer",
  "modureview",
];

// 협찬 고지 문구 (본문 텍스트에서 탐지)
const SPONSOR_PHRASES = [
  "소정의 원고료",
  "원고료를 받",
  "제공받아",
  "제공 받아",
  "협찬",
  "체험단",
  "서포터즈",
  "유료 광고",
  "유료광고",
  "업체로부터",
  "지원받아",
  "초대받아",
];

const DEEP_SYSTEM_PROMPT = `You are a Korean restaurant review analyst. You receive Naver blog
posts about ONE restaurant. Some posts include body-text excerpts (start and end of
the post, where sponsorship disclosures live), others only title+description snippets.

Posts marked [확정광고] were already confirmed as sponsored via deterministic signals
(campaign-platform banner images or explicit disclosure phrases) — always keep is_ad
true for them.

For the rest, judge sponsored (광고·협찬) vs genuine (내돈내산) using: explicit phrases
(협찬, 원고료, 체험단, 제공받아...), press-release tone, menu-with-prices enumeration,
keyword-stuffed titles, near-identical phrasing across posts, clustered postdates.
Genuine signals: 내돈내산, 재방문, specific complaints/mixed opinions, waiting gripes,
personal context.

Scoring (jjin_score 0-100): base on genuine-post ratio weighted by evidence strength.
With body text you may judge more confidently than from snippets alone.
Verdicts: 찐맛집 (>=70 and >=2 genuine), 애매 (40-69/mixed), 광고주의 (<40 or
ad-dominated), 정보부족 (too little signal; jjin_score null).
summary: 1-2 Korean sentences; mention repeatedly praised dishes if any.
Do not invent facts.`;

const DEEP_SCHEMA = {
  type: "object",
  properties: {
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
  required: ["jjin_score", "verdict", "summary", "per_post"],
  additionalProperties: false,
};

function mobileUrl(link) {
  try {
    const u = new URL(link);
    if (u.hostname === "blog.naver.com") u.hostname = "m.blog.naver.com";
    return u.toString();
  } catch {
    return link;
  }
}

// 본문 텍스트 + 이미지 주소 추출 (HTMLRewriter: 스트리밍이라 CPU 부담 적음)
async function fetchPostContent(link) {
  try {
    const res = await fetch(mobileUrl(link), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;

    let text = "";
    const imgs = [];
    const textHandler = {
      text(t) {
        text += t.text;
      },
    };
    const imgHandler = {
      element(el) {
        const src = el.getAttribute("src") || el.getAttribute("data-lazy-src") || "";
        if (src) imgs.push(src);
      },
    };
    const rewritten = new HTMLRewriter()
      .on("div.se-main-container", textHandler) // 스마트에디터 ONE
      .on("div#postViewArea", textHandler) // 구버전 에디터
      .on("div.post_ct", textHandler) // 모바일 구 레이아웃
      .on("img", imgHandler)
      .transform(res);
    await rewritten.arrayBuffer(); // 스트림 소비
    return { text: text.replace(/\s+/g, " ").trim(), imgs };
  } catch {
    return null;
  }
}

function detectSponsor(content) {
  if (!content) return { hit: false, why: null };
  const imgBlob = content.imgs.join(" ").toLowerCase();
  for (const p of SPONSOR_PLATFORMS) {
    if (imgBlob.includes(p)) return { hit: true, why: `체험단 플랫폼 배너(${p})` };
  }
  for (const phrase of SPONSOR_PHRASES) {
    if (content.text.includes(phrase)) return { hit: true, why: `공지 문구 "${phrase}"` };
  }
  return { hit: false, why: null };
}

function excerpt(text, head = 1200, tail = 800) {
  if (text.length <= head + tail) return text;
  return `${text.slice(0, head)} …(중략)… ${text.slice(-tail)}`;
}

export async function handleDeepAnalyze(body, env) {
  const place = body?.place;
  if (!place?.id || !place?.name) return { error: "invalid place" };

  const cached = await getCached(env, place.id);
  if (cached?.source === "fulltext") return { result: cached, cached: true };

  const posts = await searchBlogs(place, env);
  if (!posts.length) {
    const result = {
      place_id: place.id,
      jjin_score: null,
      verdict: "정보부족",
      ad_count: 0,
      real_count: 0,
      summary: "블로그 후기를 찾지 못했어요.",
      blogs: [],
      analyzedAt: new Date().toISOString(),
      source: "fulltext",
    };
    await putCached(env, place.id, result);
    return { result };
  }

  // 상위 3건은 본문까지, 나머지는 스니펫만
  const contents = await Promise.all(
    posts.map((post, i) => (i < 3 ? fetchPostContent(post.link) : Promise.resolve(null))),
  );
  const sponsor = contents.map(detectSponsor);

  // LLM 입력 구성
  const lines = [`Restaurant: ${place.name} (${place.region || "지역불명"})\n`];
  posts.forEach((post, i) => {
    const tag = sponsor[i].hit ? " [확정광고]" : "";
    lines.push(`[${i}]${tag} (${post.postdate}) ${post.title}`);
    if (contents[i]?.text) {
      lines.push(`본문: ${excerpt(contents[i].text)}`);
    } else {
      lines.push(`요약: ${post.description}`);
    }
    lines.push("");
  });

  let llm;
  if (env.MOCK_CLAUDE === "1") {
    llm = {
      jjin_score: 50,
      verdict: "애매",
      summary: "mock 심층 분석 결과입니다.",
      per_post: posts.map((_, i) => ({ index: i, is_ad: sponsor[i].hit })),
    };
  } else {
    const stub = env.LLM_DO.get(env.LLM_DO.idFromName("us-relay"), { locationHint: "enam" });
    const { text, usage } = await stub.createMessage({
      model: "claude-haiku-4-5",
      max_tokens: 1500,
      system: DEEP_SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: DEEP_SCHEMA } },
      messages: [{ role: "user", content: lines.join("\n") }],
    });
    console.log(`deep claude usage: in=${usage.input_tokens} out=${usage.output_tokens}`);
    llm = JSON.parse(text);
  }

  const blogs = posts.map((post, i) => {
    const certain = sponsor[i].hit;
    const is_ad = certain || (llm.per_post?.find((p) => p.index === i)?.is_ad ?? false);
    return {
      title: post.title,
      link: post.link,
      postdate: post.postdate,
      is_ad,
      certain,
      why: sponsor[i].why,
      fulltext: Boolean(contents[i]?.text),
    };
  });
  const adCount = blogs.filter((b) => b.is_ad).length;
  const result = {
    place_id: place.id,
    jjin_score: llm.jjin_score,
    verdict: llm.verdict,
    ad_count: adCount,
    real_count: blogs.length - adCount,
    summary: llm.summary,
    blogs,
    analyzedAt: new Date().toISOString(),
    source: "fulltext",
  };
  await putCached(env, place.id, result);
  return { result };
}
