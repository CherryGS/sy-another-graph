export function userMessage(failure: unknown): string {
  const message = failure instanceof Error ? failure.message : String(failure);
  if (/Graph worker failed|Failed to fetch/i.test(message))
    return "本地图谱资源加载失败，请确认思源连接正常后重试。";
  if (/timed out|timeout/i.test(message)) return "请求超时，请检查连接后重新加载图谱。";
  return message;
}
