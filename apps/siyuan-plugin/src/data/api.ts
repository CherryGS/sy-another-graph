export async function api<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(
    () =>
      controller.abort(
        new DOMException("思源接口请求超时，请重试", "TimeoutError"),
      ),
    30_000,
  );
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`思源接口返回 HTTP ${response.status}`);
    const result: unknown = await response.json();
    controller.signal.throwIfAborted();
    if (
      !result ||
      typeof result !== "object" ||
      !("code" in result) ||
      typeof result.code !== "number"
    ) {
      throw new Error("思源接口返回了无效数据");
    }
    const envelope = result as { code: number; msg?: string; data: T };
    if (envelope.code !== 0)
      throw new Error(envelope.msg || "思源接口请求失败");
    return envelope.data;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
