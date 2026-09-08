import { backendErrorsZh, backendDialogsZh } from "./backend-zh-CN";
import { toolErrorsZh } from "./tools-zh-CN";
import { toolMessagesZh } from "./tools-zh-CN";
import { streamMessagesZh, streamErrorsZh } from "./streams-zh-CN";
import type { ErrorMessages } from "../errorContract";

export const zhCN = {
  common: {
    close: "关闭",
    cancel: "取消",
    confirm: "确定",
    copy: "复制",
    copied: "已复制",
    refresh: "刷新",
    retry: "重试",

    emptyOptions: "没有可选项",

    closeNotification: "关闭通知",
  },
  shell: {
    workspace: {
      tools: "工具",
      apps: "应用",
      files: "文件",
      codegen: "生码",
      decoder: "解码",
      perf: "性能",
      index: "工作区索引",
      hideLogs: "隐藏日志",
      showLogs: "显示日志",
      resizeLogs: "调整日志面板高度",
    },

    modules: {
      screenshot: "截图",
      recording: "录屏",
      install: "安装 APK",
      ports: "端口转发",
      keys: "快捷按键",
      clipboard: "剪贴板",
      currentApp: "当前应用",
      bugReport: "Bug 报告",
    },

    status: {
      noDevice: "没有检测到设备",
      unauthorized:
        "请在设备上确认 USB 调试授权. 生码和解码等本地工具仍可使用.",
      offline: "请重新连接设备或刷新设备列表. 生码和解码等本地工具仍可使用.",
      disconnected:
        "连接 Android 设备后可使用 ADB 功能. 生码和解码等本地工具仍可使用.",
      device: ({ state }: { state: string }) => `设备${state}`,
    },

    topBar: {
      chooseDevice: "选择设备",
      refreshDevice: "刷新设备",
      adbUnavailable: "adb 未就绪",
      minimize: "最小化窗口",
      restore: "还原窗口",
      maximize: "最大化窗口",
      resize: "切换窗口大小",
      closeWindow: "关闭窗口",
    },

    spec: {
      serial: "序列号",
      transport: "连接方式",
      model: "型号",
      state: "状态",
      details: "设备详情",
      loading: "读取中...",
      failed: "读取失败",
      vendorModel: "厂商 / 型号",
      display: "分辨率 / 密度",
      battery: "电量",
      unavailable: "设备不可用",
      noActivity: "暂无前台 Activity",
      label: "设备规格",
      refreshingActivity: "正在刷新前台 Activity",
      refreshActivity: "刷新前台 Activity",
      connections: ({
        labels,
        primary,
      }: {
        labels: string[];
        primary: string;
      }) => `${labels.join(" 和 ")} (当前 ${primary})`,

      batteryStatus: {
        charging: "充电中",
        discharging: "放电中",
        not_charging: "未充电",
        full: "已充满",
        unknown: "未知",
      },
    },

    update: {
      available: "发现新版本",
      close: "关闭更新提示",
      installing: "正在安装",
      install: "安装并重启",
      later: "稍后",
    },

    device: {
      notConnected: "未连接设备",
      online: "在线",
      unauthorized: "未授权",
      offline: "离线",
      unknown: "未知",
      connection: ({ label }: { label: string }) => `${label} 连接`,

      connections: ({
        labels,
        primary,
      }: {
        labels: string[];
        primary: string;
      }) => `${labels.join(" 和 ")} 连接, 当前使用 ${primary}`,
    },
  },
  settings: {
    sections: {
      general: "通用",
      logcat: "日志",
      capture: "截图与录屏",
      files: "文件",
      apps: "应用",
      codegen: "生码",
    },
    rows: {
      theme: {
        label: "主题",
        description: "跟随系统时随桌面外观自动切换",
      },
      startupPane: {
        label: "启动页面",
        description: "下次启动应用时生效",
      },
      checkUpdates: {
        label: "启动时检查更新",
        description: "只在启动时检查一次",
      },
      background: {
        label: "离开性能页后继续采集",
        description: "离开性能页后仍按秒采样, 会持续占用 adb 并增加设备耗电",
      },
      logcatFormat: {
        label: "显示格式",
        description: "紧凑只保留时间与等级两列",
      },
      logcatColumns: {
        label: "显示列",
      },
      softWrap: {
        label: "自动换行",
        description: "长行折行显示, 不再横向滚动",
      },
      autoFold: {
        label: "自动折叠崩溃堆栈",
        description: "一次崩溃先收成一行, 展开后仍是完整堆栈",
      },
      cozyRows: {
        label: "宽行距",
        description: "每行留更多纵向空隙, 长时间读日志更省眼",
      },
      logPanes: {
        label: "显示日志的工作区",
      },
      captureDirectory: {
        label: "本机保存目录",
        description: "截图与录屏共用. 恢复默认后回到系统图片目录下的 ADB GUI",
      },
      screenshotOpen: {
        label: "保存截图后打开图片",
      },
      screenshotReveal: {
        label: "保存截图后定位所在目录",
      },
      recordingOpen: {
        label: "保存录屏后打开视频",
        description: "保存失败时手机上的源文件会保留, 可重试保存或另存为",
      },
      fileSort: {
        label: "排序",
      },
      directoriesFirst: {
        label: "文件夹优先",
      },
      showHidden: {
        label: "显示隐藏文件",
        description: "以点开头的条目; 隐藏后会同时清空对它的选择",
      },
      startDirectory: {
        label: "设备起始目录",
        description: "下次进入文件页或点主页时生效, 不打断当前浏览",
      },
      appSort: {
        label: "排序",
      },
      codeType: {
        label: "码类型",
      },
      separator: {
        label: "分隔符",
        description: "批量生成时用它切分输入",
      },
    },
    general: {
      language: {
        label: "语言",
        description: "跟随系统时按系统语言选择, 非中文使用英文",
        system: "跟随系统",

        chinese: "简体中文",

        english: "English",
      },
    },

    dialog: {
      title: "设置",
      close: "关闭设置",
      sections: "设置分组",
      modified: "已修改",
      modifiedTitle: "当前值与默认不同",
      reset: "恢复默认",
      resetAll: "全部恢复默认",
      reload: "重新读取",
      resetStored: "恢复新设置默认值",
      independent: "主题与日志面板可见性仍可修改.",
      failed: "设置异常",
    },

    capture: {
      defaultUnavailable: "默认目录不可用",
      loading: "读取目录...",
      unavailable: "本机目录不可用",
      choose: "选择保存目录",
      reset: "恢复默认保存目录",
    },

    startDirectory: {
      download: "下载目录",
      storage: "内部存储",
      camera: "相机目录",
      custom: "自定义",
      label: "自定义设备起始目录",
    },

    sort: {
      asc: "升序",
      desc: "降序",
      name: "名称",
      modifiedAt: "修改时间",
      size: "大小",
      appName: "应用名称",
      packageName: "包名",
      firstInstallTime: "安装时间",
      lastUpdateTime: "更新时间",
      apkSize: "APK 大小",
      ascendingAction: "升序, 切换为降序",
      descendingAction: "降序, 切换为升序",
      by: ({ label }: { label: string }) => `${label}排序`,

      field: ({ label }: { label: string }) => `${label}排序字段`,

      direction: ({ label }: { label: string }) => `${label}排序方向`,

      action: ({ label, action }: { label: string; action: string }) =>
        `${label}${action}`,

      settings: ({ label }: { label: string }) => `${label}设置`,
    },

    theme: {
      system: "跟随系统",
      light: "亮色",
      dark: "暗色",
    },

    logcat: {
      standard: "标准",
      compact: "紧凑",
    },

    generator: {
      customSeparator: "自定义分隔符",
      placeholder: "输入自定义分隔符",
      required: "请输入自定义分隔符",
    },

    startup: { last: "恢复上次页面" },
  },
  logcat: streamMessagesZh.logcat,
  files: toolMessagesZh.files,
  apps: toolMessagesZh.apps,
  codegen: toolMessagesZh.codegen,
  decoder: toolMessagesZh.decoder,
  performance: streamMessagesZh.performance,
  tools: toolMessagesZh.tools,
  backendDialogs: backendDialogsZh,
  errors: {
    ...backendErrorsZh,
    ...toolErrorsZh,
    ...streamErrorsZh,
    unknown: () => "操作失败",
    invalid_payload: ({ code }) => `错误数据格式无效 (${code})`,
    "settings.invalidFormat": () => "设置格式无效",
    "settings.invalidStartDirectory": () => "文件起始目录设置无效",
    "settings.unsupportedVersion": () => "不支持此设置版本",
    "settings.invalidCaptureDirectory": () => "截图录屏保存目录设置无效",
    "settings.invalidStartup": () => "启动页面设置无效",
    "settings.directoryInput": () => "请输入不含 NUL 的 Android 绝对路径",
    "settings.unavailable": () => "设置尚未加载",
    "settings.load": () => "无法读取设置",
    "settings.save": () => "设置未保存",
    "shell.adbInfo": () => "读取 ADB 信息失败",
    "shell.devices": () => "读取设备列表失败",
    "shell.listenDevices": () => "监听设备更新失败",
    "shell.activity": () => "刷新前台 Activity 失败",
    "shell.processes": () => "读取设备进程表失败",
    "shell.refresh": () => "刷新设备失败",
    "shell.installUpdate": () => "安装更新失败",
    "shell.listenSettings": () => "监听设置菜单失败",
    "shell.confirmReset": () => "无法确认恢复默认",
    "shell.minimize": () => "最小化窗口失败",
    "shell.resize": () => "切换窗口大小失败",
    "shell.closeWindow": () => "关闭窗口失败",
    "settings.invalidField": ({ key }) => `设置字段 ${key} 无效`,
  } satisfies ErrorMessages,
};
