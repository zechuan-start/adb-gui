import type { Locale } from "../locale";
import type { Messages } from "../types";
import { en } from "./en";
import { zhCN } from "./zh-CN";

export const CATALOGS: Record<Locale, Messages> = { "zh-CN": zhCN, en };
