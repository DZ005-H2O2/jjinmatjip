// 미국 리전에 고정 배치되는 Claude 호출 중계 Durable Object.
// 이유: 한국발 무료 트래픽은 홍콩 콜로에서 실행되는데, 홍콩 IP는
// Anthropic이 지역 차단(403 Request not allowed)함. DO를 locationHint로
// 북미에 배치하면 Anthropic 호출이 지원 지역에서 나간다.
import { DurableObject } from "cloudflare:workers";
import Anthropic from "@anthropic-ai/sdk";

export class LlmRelay extends DurableObject {
  async createMessage(params) {
    const client = new Anthropic({ apiKey: this.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create(params);
    // RPC 반환값은 구조 복제 가능해야 하므로 필요한 것만 추린다
    return {
      text: response.content.find((b) => b.type === "text")?.text ?? "{}",
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  }
}
