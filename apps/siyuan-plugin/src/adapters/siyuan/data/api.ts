import { message as msg, MessageError } from "../../../core/diagnostics/message";
import { diagnosticValue, ReadDiagnosticError } from "../../../core/diagnostics/read-issues";

export async function api<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(
    () =>
      controller.abort(
        new MessageError(msg("text.theSiyuanApiRequestTimedOutPleaseRetry"), "TimeoutError"),
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
    if (!response.ok)
      throw new ReadDiagnosticError(
        msg("text.theSiyuanApiReturnedHttpValue", { p0: response.status }),
        {
          "text.api": path,
          "text.httpStatus": String(response.status),
        },
      );
    let result: unknown;
    try {
      result = await response.json();
    } catch (error) {
      controller.signal.throwIfAborted();
      throw new ReadDiagnosticError(msg("text.theSiyuanApiReturnedInvalidJson"), {
        "text.api": path,
        "text.reason": error instanceof Error ? error.message : String(error),
      });
    }
    controller.signal.throwIfAborted();
    if (
      !result ||
      typeof result !== "object" ||
      !("code" in result) ||
      typeof result.code !== "number"
    ) {
      throw new ReadDiagnosticError(msg("text.theSiyuanApiReturnedInvalidData"), {
        "text.api": path,
        "text.actualType": diagnosticValue(result),
      });
    }
    const envelope = result as { code: number; msg?: string; data: T };
    if (envelope.code !== 0)
      throw new ReadDiagnosticError(envelope.msg || msg("text.theSiyuanApiRequestFailed"), {
        "text.api": path,
        "text.errorCode": String(envelope.code),
        "text.apiMessage": envelope.msg || msg("text.notProvided"),
      });
    return envelope.data;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
