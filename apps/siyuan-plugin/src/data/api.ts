import { diagnosticValue, ReadDiagnosticError } from "./read-issues";

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
    if (!response.ok) throw new ReadDiagnosticError(`思源接口返回 HTTP ${response.status}`, { "接口": path, "HTTP 状态": String(response.status) });
    let result: unknown;
    try { result = await response.json(); }
    catch (error) {
      controller.signal.throwIfAborted();
      throw new ReadDiagnosticError("思源接口返回了无法解析的 JSON", { "接口": path, "原因": error instanceof Error ? error.message : String(error) });
    }
    controller.signal.throwIfAborted();
    if (
      !result ||
      typeof result !== "object" ||
      !("code" in result) ||
      typeof result.code !== "number"
    ) {
      throw new ReadDiagnosticError("思源接口返回了无效数据", { "接口": path, "实际类型": diagnosticValue(result) });
    }
    const envelope = result as { code: number; msg?: string; data: T };
    if (envelope.code !== 0)
      throw new ReadDiagnosticError(envelope.msg || "思源接口请求失败", { "接口": path, "错误码": String(envelope.code), "接口消息": envelope.msg || "（未提供）" });
    return envelope.data;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
