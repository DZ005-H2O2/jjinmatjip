// 네이버 블로그 검색 API — 장소별 후기 스니펫 수집

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
    "https://openapi.naver.com/v1/search/blog.json?" +
    new URLSearchParams({ query, display: "5", sort: "sim" });

  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": env.NAVER_CLIENT_ID,
      "X-Naver-Client-Secret": env.NAVER_CLIENT_SECRET,
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
