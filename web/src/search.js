// 카카오 장소검색 (클라이언트 직접 — JS SDK services 라이브러리)

const FOOD_CATEGORIES = new Set(["FD6", "CE7"]); // 음식점, 카페

// 도로명/지번 주소에서 동 단위 지역명 추출 (블로그 검색 질의용)
export function regionFrom(addressName) {
  const parts = (addressName || "").split(" ");
  const dong = parts.find((p) => /(동|가|읍|면|리)\d*$/.test(p));
  return dong || parts[1] || "";
}

export function searchPlaces(keyword) {
  return new Promise((resolve, reject) => {
    const ps = new kakao.maps.services.Places();
    ps.keywordSearch(
      keyword,
      (data, status) => {
        if (status === kakao.maps.services.Status.OK) {
          const food = data.filter((d) => FOOD_CATEGORIES.has(d.category_group_code));
          const results = (food.length ? food : data).slice(0, 15).map((d) => ({
            id: d.id,
            name: d.place_name,
            category: d.category_name?.split(">").pop()?.trim() || "",
            address: d.road_address_name || d.address_name,
            region: regionFrom(d.address_name),
            phone: d.phone,
            url: d.place_url, // https://place.map.kakao.com/{id}
            x: Number(d.x),
            y: Number(d.y),
            // 분석 결과 (나중에 채워짐)
            jjin_score: null,
            verdict: null,
            summary: null,
            blogs: [],
          }));
          resolve(results);
        } else if (status === kakao.maps.services.Status.ZERO_RESULT) {
          resolve([]);
        } else {
          reject(new Error("장소 검색 실패"));
        }
      },
      { size: 15 },
    );
  });
}
