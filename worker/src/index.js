import { handleAnalyze } from "./analyze.js";
import { handleDeepAnalyze } from "./deep.js";
import { getFavorites, putFavorites } from "./favorites.js";

export { LlmRelay } from "./llmRelay.js";

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-App-Password",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);

    // 공유 비밀번호 검증
    if (request.headers.get("X-App-Password") !== env.APP_PASSWORD) {
      return json({ error: "unauthorized" }, 401, cors);
    }

    try {
      if (url.pathname === "/api/analyze" && request.method === "POST") {
        const body = await request.json();
        return json(await handleAnalyze(body, env), 200, cors);
      }
      if (url.pathname === "/api/deep" && request.method === "POST") {
        const body = await request.json();
        return json(await handleDeepAnalyze(body, env), 200, cors);
      }
      if (url.pathname === "/api/favorites" && request.method === "GET") {
        return json(await getFavorites(env), 200, cors);
      }
      if (url.pathname === "/api/favorites" && request.method === "PUT") {
        const body = await request.json();
        return json(await putFavorites(body, env), 200, cors);
      }
      return json({ error: "not found" }, 404, cors);
    } catch (e) {
      console.error("worker error:", e.message, e.stack);
      return json({ error: "internal", message: e.message }, 502, cors);
    }
  },
};
