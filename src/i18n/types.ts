import type { ErrorMessages } from "./errorContract";
import type { zhCN } from "./messages/zh-CN";

// Catalog strings are widened by ordinary object inference, not `as const`.
// Error signatures come from their runtime contract, including unused params.
export type Messages = Omit<typeof zhCN, "errors"> & { errors: ErrorMessages };
export type Message = (messages: Messages) => string;
