import {
  ERROR_PARAMS,
  type AppErrorPayload,
  type ErrorCode,
  type ErrorParams,
} from "./errorContract";
import type { Messages } from "./types";

export type { AppErrorPayload } from "./errorContract";

export class AppError<C extends ErrorCode = ErrorCode> extends Error {
  readonly payload: AppErrorPayload;

  constructor(
    code: C,
    params: ErrorParams<C>,
    options: {
      detail?: string;
      causes?: AppErrorPayload[];
    } = {},
  ) {
    super(code);
    this.name = "AppError";
    this.payload = {
      code,
      params: params as Record<string, string | number>,
      ...options,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPayload(value: unknown, depth = 0): AppErrorPayload | null {
  if (depth > 8 || !isRecord(value) || typeof value.code !== "string")
    return null;
  if (value.detail !== undefined && typeof value.detail !== "string")
    return null;
  let params: AppErrorPayload["params"];
  if (value.params !== undefined) {
    if (!isRecord(value.params)) return null;
    params = {};
    for (const [key, param] of Object.entries(value.params)) {
      if (
        typeof param !== "string" &&
        !(typeof param === "number" && Number.isFinite(param))
      )
        return null;
      Object.defineProperty(params, key, { value: param, enumerable: true });
    }
  }
  let causes: AppErrorPayload[] | undefined;
  if (value.causes !== undefined) {
    if (!Array.isArray(value.causes) || value.causes.length > 16) return null;
    causes = [];
    for (const cause of value.causes) {
      const parsed = readPayload(cause, depth + 1);
      if (!parsed) return null;
      causes.push(parsed);
    }
  }
  return { code: value.code, params, detail: value.detail, causes };
}

export function toAppError(value: unknown): AppErrorPayload {
  if (value instanceof AppError) return value.payload;
  const payload = readPayload(value);
  if (payload) return payload;
  if (isRecord(value) && typeof value.code === "string") {
    return { code: "invalid_payload", params: { code: value.code } };
  }
  return {
    code: "unknown",
    detail:
      value instanceof Error
        ? value.message
        : typeof value === "string"
          ? value
          : String(value),
  };
}

export function errorIdentity(value: unknown): string {
  return JSON.stringify(toAppError(value), (_key, item: unknown) =>
    isRecord(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        )
      : item,
  );
}

export function translateError(
  payload: AppErrorPayload,
  messages: Messages,
): string {
  let text: string;
  if (Object.prototype.hasOwnProperty.call(ERROR_PARAMS, payload.code)) {
    const code = payload.code as ErrorCode;
    const params = payload.params ?? {};
    const schema: Record<string, string> = ERROR_PARAMS[code];
    const valid = Object.entries(schema).every(
      ([key, type]) =>
        Object.prototype.hasOwnProperty.call(params, key) &&
        typeof params[key] === type,
    );
    // The schema guards this single dispatch from the external code string.
    const render = messages.errors[code] as (
      params: Record<string, string | number>,
    ) => string;
    text = valid ? render(params) : messages.errors.invalid_payload({ code });
  } else {
    text = `${messages.errors.unknown({})} (${payload.code})`;
  }
  const details = [
    payload.detail,
    ...(payload.causes ?? []).map((cause) => translateError(cause, messages)),
  ].filter((detail): detail is string => Boolean(detail));
  return details.length ? `${text}: ${details.join("; ")}` : text;
}

export function errorText(value: unknown, messages: Messages): string {
  return translateError(toAppError(value), messages);
}
