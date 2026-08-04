// 네이버 블로그 검색 — NAVER API HUB (네이버클라우드) 경유
// 구 developers.naver.com 오픈 API가 API HUB로 이관됨 (2026 기준, 한시적 무료)

function stripTags(s) {
  return (s || "")
    .replace(/<\/?b>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export async function searchBlogs(place, env) {
  const query = `${place.name} ${place.region || ""}`.trim();
  const url =
    "https://naverapihub.apigw.ntruss.com/search/v1/blog?" +
    new URLSearchParams({ query, display: "5", sort: "sim", format: "json" });

  const res = await fetch(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": env.NAVER_CLIENT_ID,
      "X-NCP-APIGW-API-KEY": env.NAVER_CLIENT_SECRET,
    },
  });
  if (!res.ok) {
    console.error(`naver search failed (${res.status}) for "${query}"`);
    return [];
  }
  const data = await res.json();
  return (data.items || []).map((item) => ({
    title: stripTags(item.title),
    description: stripTags(item.description),
    link: item.link,
    postdate: item.postdate,
  }));
}
