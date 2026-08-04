// 카카오 장소검색 (클라이언트 직접 — JS SDK services 라이브러리)

const FOOD_CATEGORIES = new Set(["FD6", "CE7"]); // 음식점, 카페

// 도로명/지번 주소에서 동 단위 지역명 추출 (블로그 검색 질의용)
export function regionFrom(addressName) {
  const parts = (addressName || "").split(" ");
  const dong = parts.find((p) => /(동|가|읍|면|리)\d*$/.test(p));
  return dong || parts[1] || "";
}

function toPlace(d) {
  return {
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
  };
}

function handleResults(resolve, reject) {
  return (data, status) => {
    if (status === kakao.maps.services.Status.OK) {
      const food = data.filter((d) => FOOD_CATEGORIES.has(d.category_group_code));
      resolve((food.length ? food : data).slice(0, 15).map(toPlace));
    } else if (status === kakao.maps.services.Status.ZERO_RESULT) {
      resolve([]);
    } else {
      reject(new Error("장소 검색 실패"));
    }
  };
}

// near가 있으면 그 위치 반경 20km 내 결과를 우선 (데이트 중 "파스타"만 쳐도 근처가 나오게)
export function searchPlaces(keyword, near) {
  return new Promise((resolve, reject) => {
    const ps = new kakao.maps.services.Places();
    const opts = { size: 15 };
    if (near) {
      opts.location = new kakao.maps.LatLng(near.lat, near.lng);
      opts.radius = 20000;
    }
    ps.keywordSearch(
      keyword,
      (data, status) => {
        // 반경 내 결과가 없으면 전국 검색으로 폴백
        if (near && status === kakao.maps.services.Status.ZERO_RESULT) {
          ps.keywordSearch(keyword, handleResults(resolve, reject), { size: 15 });
        } else {
          handleResults(resolve, reject)(data, status);
        }
      },
      opts,
    );
  });
}

// 현재 지도 화면 범위 안에서 검색. 키워드가 없으면 음식점 카테고리 전체.
export function searchPlacesInBounds(keyword, bounds) {
  return new Promise((resolve, reject) => {
    const ps = new kakao.maps.services.Places();
    const cb = handleResults(resolve, reject);
    if (keyword) {
      ps.keywordSearch(keyword, cb, { size: 15, bounds });
    } else {
      ps.categorySearch("FD6", cb, { bounds });
    }
  });
}
