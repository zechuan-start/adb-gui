import { BACKEND_ERROR_PARAMS } from "./backendErrorContract";
import { TOOL_ERROR_PARAMS } from "./toolErrorContract";
import { STREAM_ERROR_PARAMS } from "./streamErrorContract";
// Runtime schemas are also the source of the catalog's parameter types.
export const ERROR_PARAMS = {
  ...BACKEND_ERROR_PARAMS,
  ...TOOL_ERROR_PARAMS,
  ...STREAM_ERROR_PARAMS,
  unknown: {},
  invalid_payload: { code: "string" },
  "settings.invalidFormat": {},
  "settings.invalidStartDirectory": {},
  "settings.unsupportedVersion": {},
  "settings.invalidCaptureDirectory": {},
  "settings.invalidStartup": {},
  "settings.directoryInput": {},
  "settings.unavailable": {},
  "settings.load": {},
  "settings.save": {},
  "shell.adbInfo": {},
  "shell.devices": {},
  "shell.listenDevices": {},
  "shell.activity": {},
  "shell.processes": {},
  "shell.refresh": {},
  "shell.installUpdate": {},
  "shell.listenSettings": {},
  "shell.confirmReset": {},
  "shell.minimize": {},
  "shell.resize": {},
  "shell.closeWindow": {},
  "settings.invalidField": { key: "string" },
} as const;

export type ErrorCode = keyof typeof ERROR_PARAMS;
export type ErrorParams<C extends ErrorCode> = {
  [
    K in keyof (typeof ERROR_PARAMS)[C]
  ]: (typeof ERROR_PARAMS)[C][K] extends "number" ? number : string;
};
export type ErrorMessages = {
  [C in ErrorCode]: (params: ErrorParams<C>) => string;
};

export interface AppErrorPayload {
  code: string;
  params?: Record<string, string | number>;
  detail?: string;
  causes?: AppErrorPayload[];
}
