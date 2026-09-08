import { backendErrorsEn, backendDialogsEn } from "./backend-en";
import { toolErrorsEn } from "./tools-en";
import { toolMessagesEn } from "./tools-en";
import { streamMessagesEn, streamErrorsEn } from "./streams-en";
import type { Messages } from "../types";

export const en: Messages = {
  common: {
    close: "Close",
    cancel: "Cancel",
    confirm: "OK",
    copy: "Copy",
    copied: "Copied",
    refresh: "Refresh",
    retry: "Retry",

    emptyOptions: "No options",

    closeNotification: "Dismiss notification",
  },
  shell: {
    workspace: {
      tools: "Tools",
      apps: "Apps",
      files: "Files",
      codegen: "Generate",
      decoder: "Decode",
      perf: "Performance",
      index: "Workspaces",
      hideLogs: "Hide logs",
      showLogs: "Show logs",
      resizeLogs: "Resize log panel",
    },

    modules: {
      screenshot: "Screenshot",
      recording: "Recording",
      install: "Install APK",
      ports: "Port forwarding",
      keys: "Key events",
      clipboard: "Clipboard",
      currentApp: "Current app",
      bugReport: "Bug report",
    },

    status: {
      noDevice: "No device detected",
      unauthorized:
        "Allow USB debugging on the device. Local tools such as Generate and Decode are still available.",
      offline:
        "Reconnect the device or refresh the device list. Local tools such as Generate and Decode are still available.",
      disconnected:
        "Connect an Android device to use ADB. Local tools such as Generate and Decode are still available.",
      device: ({ state }: { state: string }) => `Device ${state.toLowerCase()}`,
    },

    topBar: {
      chooseDevice: "Select device",
      refreshDevice: "Refresh devices",
      adbUnavailable: "adb not ready",
      minimize: "Minimize window",
      restore: "Restore window",
      maximize: "Maximize window",
      resize: "Toggle window size",
      closeWindow: "Close window",
    },

    spec: {
      serial: "Serial",
      transport: "Connection",
      model: "Model",
      state: "State",
      details: "Device details",
      loading: "Loading...",
      failed: "Could not load",
      vendorModel: "Vendor / model",
      display: "Resolution / density",
      battery: "Battery",
      unavailable: "Device unavailable",
      noActivity: "No foreground Activity",
      label: "Device specifications",
      refreshingActivity: "Refreshing foreground Activity",
      refreshActivity: "Refresh foreground Activity",
      connections: ({
        labels,
        primary,
      }: {
        labels: string[];
        primary: string;
      }) => `${labels.join(" and ")} (${primary} active)`,

      batteryStatus: {
        charging: "Charging",
        discharging: "Discharging",
        not_charging: "Not charging",
        full: "Full",
        unknown: "Unknown",
      },
    },

    update: {
      available: "Update available",
      close: "Dismiss update",
      installing: "Installing",
      install: "Install and restart",
      later: "Later",
    },

    device: {
      notConnected: "No device connected",
      online: "Online",
      unauthorized: "Unauthorized",
      offline: "Offline",
      unknown: "Unknown",
      connection: ({ label }: { label: string }) => `${label} connection`,

      connections: ({
        labels,
        primary,
      }: {
        labels: string[];
        primary: string;
      }) => `${labels.join(" and ")} connected, using ${primary}`,
    },
  },
  settings: {
    sections: {
      general: "General",
      logcat: "Logs",
      capture: "Screenshots & recording",
      files: "Files",
      apps: "Apps",
      codegen: "Generate",
    },
    rows: {
      theme: {
        label: "Theme",
        description: "Follow the desktop appearance automatically",
      },
      startupPane: {
        label: "Startup page",
        description: "Applies the next time the app starts",
      },
      checkUpdates: {
        label: "Check for updates on startup",
        description: "Check once when the app starts",
      },
      background: {
        label: "Keep collecting outside Performance",
        description:
          "Continue sampling every second, using adb and device battery",
      },
      logcatFormat: {
        label: "Display format",
        description: "Compact shows only time and level",
      },
      logcatColumns: {
        label: "Visible columns",
      },
      softWrap: {
        label: "Wrap lines",
        description: "Wrap long lines without horizontal scrolling",
      },
      autoFold: {
        label: "Collapse crash stacks",
        description: "Show each crash as one row; expand to see the full stack",
      },
      cozyRows: {
        label: "Spacious rows",
        description: "More space between rows for easier reading",
      },
      logPanes: {
        label: "Workspaces with logs",
      },
      captureDirectory: {
        label: "Local save directory",
        description:
          "Shared by screenshots and recordings. Reset to ADB GUI in your Pictures folder",
      },
      screenshotOpen: {
        label: "Open screenshots after saving",
      },
      screenshotReveal: {
        label: "Reveal saved screenshots in folder",
      },
      recordingOpen: {
        label: "Open recordings after saving",
        description:
          "Failed saves keep the source on the device, ready to retry or save as",
      },
      fileSort: {
        label: "Sort",
      },
      directoriesFirst: {
        label: "Folders first",
      },
      showHidden: {
        label: "Show hidden files",
        description:
          "Entries starting with a dot; hiding also clears their selection",
      },
      startDirectory: {
        label: "Device start directory",
        description:
          "Applies on entering Files or pressing Home, without interrupting browsing",
      },
      appSort: {
        label: "Sort",
      },
      codeType: {
        label: "Code type",
      },
      separator: {
        label: "Separator",
        description: "Split batch input with this separator",
      },
    },
    general: {
      language: {
        label: "Language",
        description:
          "Use Chinese for a Chinese system language, otherwise English",
        system: "System",

        chinese: "简体中文",

        english: "English",
      },
    },

    dialog: {
      title: "Settings",
      close: "Close settings",
      sections: "Settings sections",
      modified: "Modified",
      modifiedTitle: "Different from the default",
      reset: "Restore defaults",
      resetAll: "Restore all defaults",
      reload: "Reload",
      resetStored: "Restore saved preferences",
      independent: "Theme and log panel visibility are still editable.",
      failed: "Settings error",
    },

    capture: {
      defaultUnavailable: "Default directory unavailable",
      loading: "Loading directory...",
      unavailable: "Local directory unavailable",
      choose: "Choose save directory",
      reset: "Restore default save directory",
    },

    startDirectory: {
      download: "Downloads",
      storage: "Internal storage",
      camera: "Camera",
      custom: "Custom",
      label: "Custom device start directory",
    },

    sort: {
      asc: "Ascending",
      desc: "Descending",
      name: "Name",
      modifiedAt: "Modified",
      size: "Size",
      appName: "App name",
      packageName: "Package",
      firstInstallTime: "Installed",
      lastUpdateTime: "Updated",
      apkSize: "APK size",
      ascendingAction: "Ascending, switch to descending",
      descendingAction: "Descending, switch to ascending",
      by: ({ label }: { label: string }) => `Sort ${label.toLowerCase()}`,

      field: ({ label }: { label: string }) => `${label} sort field`,

      direction: ({ label }: { label: string }) => `${label} sort direction`,

      action: ({ label, action }: { label: string; action: string }) =>
        `${label}: ${action}`,

      settings: ({ label }: { label: string }) => `${label} settings`,
    },

    theme: {
      system: "System",
      light: "Light",
      dark: "Dark",
    },

    logcat: {
      standard: "Standard",
      compact: "Compact",
    },

    generator: {
      customSeparator: "Custom separator",
      placeholder: "Enter a custom separator",
      required: "Enter a custom separator",
    },

    startup: { last: "Restore last page" },
  },
  logcat: streamMessagesEn.logcat,
  files: toolMessagesEn.files,
  apps: toolMessagesEn.apps,
  codegen: toolMessagesEn.codegen,
  decoder: toolMessagesEn.decoder,
  performance: streamMessagesEn.performance,
  tools: toolMessagesEn.tools,
  backendDialogs: backendDialogsEn,
  errors: {
    ...backendErrorsEn,
    ...toolErrorsEn,
    ...streamErrorsEn,
    unknown: () => "Operation failed",
    invalid_payload: ({ code }) => `Invalid error data (${code})`,
    "settings.invalidFormat": () => "Invalid settings format",
    "settings.invalidStartDirectory": () =>
      "Invalid file start directory setting",
    "settings.unsupportedVersion": () => "Unsupported settings version",
    "settings.invalidCaptureDirectory": () =>
      "Invalid capture directory setting",
    "settings.invalidStartup": () => "Invalid startup page setting",
    "settings.directoryInput": () =>
      "Enter an absolute Android path without NUL characters",
    "settings.unavailable": () => "Settings have not loaded",
    "settings.load": () => "Could not read settings",
    "settings.save": () => "Settings were not saved",
    "shell.adbInfo": () => "Could not read ADB information",
    "shell.devices": () => "Could not list devices",
    "shell.listenDevices": () => "Could not listen for device updates",
    "shell.activity": () => "Could not refresh the foreground Activity",
    "shell.processes": () => "Could not read device processes",
    "shell.refresh": () => "Could not refresh devices",
    "shell.installUpdate": () => "Could not install the update",
    "shell.listenSettings": () => "Could not listen for the settings menu",
    "shell.confirmReset": () => "Could not confirm restoring defaults",
    "shell.minimize": () => "Could not minimize the window",
    "shell.resize": () => "Could not resize the window",
    "shell.closeWindow": () => "Could not close the window",
    "settings.invalidField": ({ key }) => `Invalid settings field: ${key}`,
  },
};
