export const toolMessagesZh = {
  apps: {
    confirmAction: ({ action }: { action: "clear" | "uninstall" }) =>
      `确认${action === "clear" ? "清除数据" : "卸载"}?`,
    activityMonitor: {
      noForegroundApp: "暂无前台应用",
      completedSuccessfully: ({ packageName }: { packageName: string }) =>
        `${packageName} 操作成功`,
      currentAppActionFailed: ({ detail }: { detail: string }) =>
        `当前应用操作失败: ${detail}`,
      package: "包名",
      packageNameCopied: "已复制包名",
      copyPackageName: "复制包名",
      enterAPackageName: "输入包名...",
      forceStop: "强停",
      launch: "启动",
      clearDataFor: ({ packageName }: { packageName: string }) =>
        `确认清除 ${packageName} 数据?`,
      clearData: "清数据",
      uninstall: ({ packageName }: { packageName: string }) =>
        `确认卸载 ${packageName}?`,
      uninstallLabel: "卸载",
      clickAgainToClearData: "再次点击以清除数据。",
      clickAgainToUninstallTheApp: "再次点击以卸载应用。",
      confirm: "确认",
    },
    appManager: {
      apkInstalledSuccessfully: "APK 安装成功",
      installingPleaseWait: "正在安装, 请稍候",
      selectAnOnlineDeviceFirst: "先选择在线设备",
      dropToInstallAPK: "释放以安装 APK",
      onlyAPKFilesAreSupported: "仅支持 APK 文件",
      dropAnAPKIntoThisWindow: "拖拽 APK 到此窗口",
      installingAPKPleaseWait: "正在安装 APK, 请稍候",
      selectAnOnlineDeviceFirstLabel: "请先选择一台在线设备",
      installing: "安装中...",
      installOneAPKAtATime: "一次只能安装一个 APK",
      couldNotStartDropListener: ({ detail }: { detail: string }) =>
        `拖拽监听启动失败: ${detail}`,
      chooseAndInstall: "选择并安装",
      installOnTheCurrentDevice: "安装到当前设备",
    },
    packageManager: {
      couldNotLoadApps: ({ detail }: { detail: string }) =>
        `加载应用列表失败: ${detail}`,
      completedSuccessfully: ({ packageName }: { packageName: string }) =>
        `${packageName} 操作成功`,
      operationFailed: ({ detail }: { detail: string }) =>
        `操作失败: ${detail}`,
      appListUnavailable: "应用列表不可用",
      connectAnOnlineDeviceToBrowseAndManage:
        "连接在线设备后可浏览和管理用户应用.",
      searchAppNameOrPackage: "搜索应用名称或包名",
      refreshAppList: "刷新应用列表",
      liveDataUnavailableShowingPreviouslyLoadedData:
        "实时读取失败, 当前显示上次读取的数据.",
      appNamesAndVersionsUnavailableShowingBasicInfo:
        "应用名称和版本读取失败, 当前显示精简信息.",
      hideDetails: "收起详情",
      viewDetails: "查看详情",
      appPackage: "应用 / 包名",
      version: "版本",
      readingAppInfo: "正在读取应用信息...",
      noUserAppsToManageOnThisDevice: "设备上没有可管理的用户应用.",
      noMatchingApps: "没有匹配的应用.",
      type: "类型",
      userApp: "用户应用",
      versionCode: "版本代码",
      firstInstalled: "首次安装",
      lastUpdated: "最后更新",
      apkSize: "APK 大小",
      device: "设备",
      confirm: "确认",
      uninstall: "卸载",
      processing: "处理中",
      launch: "启动",
      forceStop: "强停",
      clearDataLabel: "清数据",
      noAppSelected: "未选择应用",
      selectAPackageOnTheLeftToView: "从左侧选择一个包名查看操作.",
    },
  },
  tools: {
    recordingSaveDestination: ({ path }: { path: string }) =>
      `保存目标: ${path}`,
    recordingDeviceSource: ({
      serial,
      path,
    }: {
      serial: string;
      path: string;
    }) => `设备源文件: ${serial} / ${path}`,
    bugReportTool: {
      bugDataCollectedIn: ({ path }: { path: string }) =>
        `Bug 资料已收集到 ${path}`,
      quickCollectionFailed: ({ detail }: { detail: string }) =>
        `快速收集失败: ${detail}`,
      fullBugreportSavedTo: ({ path }: { path: string }) =>
        `完整 Bugreport 已保存到 ${path}`,
      fullBugreportFailed: ({ detail }: { detail: string }) =>
        `完整 Bugreport 失败: ${detail}`,
      quickCollect: "快速收集",
      fullBugreport: "完整 Bugreport",
      generatingAFullBugreportThisMayTakeSeveral:
        "正在生成完整 Bugreport，可能需要数分钟。",
      quickCollectIncludesAScreenshotActivityDeviceInfo:
        "快速收集包含截图、Activity、设备信息和最近日志。",
      theLatestReportPathWillAppearHere: "最近报告路径将在这里显示。",
      availableWhenTheDeviceIsOnline: "设备在线后可操作",
      reportPathCopied: "已复制报告路径",
      copyPath: "复制路径",
      showFile: "显示文件",
      showFolder: "显示目录",
    },
    clipboardTool: {
      textSentToTheDeviceClipboard: "文本已发送到手机剪贴板",
      deviceTextCopiedToTheComputerClipboard: "手机文本已复制到电脑剪贴板",
      sendToDevice: "发送到手机",
      copyToComputer: "复制到电脑",
      noDeviceConnected: "未连接设备",
    },
    deepLinkTool: {
      deepLinkOpened: "已打开 Deep Link",
      couldNotOpen: ({ detail }: { detail: string }) => `打开失败: ${detail}`,
      httpsExampleComOrMyappPath: "https://example.com 或 myapp://path",
      open: "打开",
      enterAnAddress: "等待输入地址",
      availableWhenTheDeviceIsOnline: "设备在线后可操作",
    },
    portForwardTool: {
      couldNotRefreshPortForwarding: ({ detail }: { detail: string }) =>
        `刷新端口转发失败: ${detail}`,
      portForwardingRuleAdded: "端口转发规则已添加",
      couldNotAddPortForwarding: ({ detail }: { detail: string }) =>
        `添加端口转发失败: ${detail}`,
      portForwardingRuleDeleted: "端口转发规则已删除",
      couldNotDeletePortForwarding: ({ detail }: { detail: string }) =>
        `删除端口转发失败: ${detail}`,
      refreshPortForwarding: "刷新端口转发",
      forwardingDirection: "转发方向",
      localPort: "本机端口",
      devicePort: "设备端口",
      add: "添加",
      refreshing: "正在刷新",
      noPortForwardingRules: "暂无端口转发规则",
      availableWhenTheDeviceIsOnline: "设备在线后可操作",
      direction: "方向",
      actions: "操作",
      deleteRule: "删除规则",
    },
    quickKeys: {
      navigation: "导航",
      back: "返回",
      home: "主页",
      recentApps: "最近任务",
      input: "输入",
      enter: "回车",
      delete: "删除",
      hardware: "硬件",
      power: "电源",
      volumeUp: "音量+",
      volumeDown: "音量-",
      sent: ({ action }: { action: string }) => `${action} 已发送`,
      couldNotSendKey: ({ detail }: { detail: string }) =>
        `按键发送失败: ${detail}`,
    },
    screenRecordTool: {
      couldNotOpenVideoAutomatically: "自动打开视频失败",
      recordingSaved: ({
        path,
        warnings,
      }: {
        path: string;
        warnings: string[];
      }) =>
        `录屏已保存: ${path}${warnings.length ? `; ${warnings.join("; ")}` : ""}`,
      recoveryAbandonedSourceMayRemainOnDevice: ({
        serial,
        path,
        detail,
      }: {
        serial: string;
        path: string;
        detail: string;
      }) => `已放弃恢复, 设备源文件可能仍保留: ${serial} / ${path}; ${detail}`,
      saveAbandonedAndDeviceSourceDeleted: "已放弃保存并删除设备源文件",
      couldNotRefreshRecordingStatus: ({ detail }: { detail: string }) =>
        `刷新录屏状态失败: ${detail}`,
      couldNotOpenSavedRecording: ({ detail }: { detail: string }) =>
        `打开已保存录屏失败: ${detail}`,
      starting: "启动中...",
      processing: "处理中...",
      waitingToRecoverSave: "等待恢复保存",
      startRecording: "开始录屏",
      stopAndSave: "停止并保存",
      status: "状态",
      saveFailed: "保存失败",
      processingLabel: "处理中",
      recording: "录制中",
      pendingSave: "待保存",
      ready: "待开始",
      deviceOffline: "设备离线",
      duration: "时长",
      afterClosingRecoverTheDeviceSourceManually:
        "退出后需要手动找回设备源文件.",
      retrySave: "重试保存",
      saveAs: "另存为",
      discardSave: "放弃保存",
      noSavedRecordingYet: "尚无已保存录屏",
      revealInFileManager: "在文件管理器中显示",
      openWithDefaultApp: "用默认程序打开",
    },
    screenshot: {
      screenshotPathCopied: "已复制截图路径",
      savedScreenshotActionFailed: ({
        path,
        detail,
      }: {
        path: string;
        detail: string;
      }) => `操作已保存截图失败 (${path}): ${detail}`,
      screenshotSavedTo: ({
        path,
        failed,
      }: {
        path: string;
        failed: boolean;
      }) => `截图已保存到 ${path}${failed ? ", 自动打开或定位失败" : ""}`,
      screenshotCopiedToClipboard: "截图已复制到剪贴板",
      screenshotFailed: ({ detail }: { detail: string }) =>
        `截图失败: ${detail}`,
      capturing: "截图中...",
      saveScreenshot: "保存截图",
      copying: "复制中...",
      captureAndCopy: "截图并复制",
      theLatestScreenshotWillAppearHere: "最近截图将在这里显示。",
      copyPath: "复制路径",
      revealInFileManager: "在文件管理器中显示",
      openWithDefaultApp: "用默认程序打开",
    },
    wifiConnect: {
      couldNotRefreshDevices: ({ detail }: { detail: string }) =>
        `刷新设备列表失败: ${detail}`,
      deviceConnected: "设备连接成功",
      wifiConnectionFailed: ({ detail }: { detail: string }) =>
        `WiFi 连接失败: ${detail}`,
      deviceDisconnected: "设备已断开",
      couldNotDisconnectDevice: ({ detail }: { detail: string }) =>
        `断开设备失败: ${detail}`,
      connectedToYouCanUnplugUSB: ({ address }: { address: string }) =>
        `已连接 ${address}, 可以拔掉 USB 线`,
      couldNotSwitchToWiFi: ({ detail }: { detail: string }) =>
        `一键切换到 WiFi 失败: ${detail}`,
      wifiConnection: "WiFi 连接",
      closeWiFiConnection: "关闭 WiFi 连接",
      manualConnection: "手动连接",
      connect: "连接",
      networkDevices: "网络设备",
      noWiFiDevices: "暂无 WiFi 设备",
      disconnect: "断开",
      switchCurrentUSBDeviceToWiFi: "一键切换当前 USB 设备到 WiFi",
    },
  },
  decoder: {
    batchSummary: ({
      images,
      decoded,
      codes,
    }: {
      images: number;
      decoded: number;
      codes: number;
    }) => `${images} 张图, ${decoded} 张识别成功, ${codes} 个码`,
    decodeFailure: ({ detail }: { detail: string }) => `解码失败: ${detail}`,
    codeDecoderPage: {
      decodingImagesPleaseWait: "正在解码图片, 请稍候",
      ignoredUnsupportedFiles: ({ count }: { count: number }) =>
        `已忽略 ${count} 个不支持的文件`,
      decodeUpToImagesPerBatchSkipped: ({
        limit,
        skipped,
      }: {
        limit: number;
        skipped: number;
      }) => `单次最多解码 ${limit} 张图片, 已截断 ${skipped} 张`,
      decodingTaskFailed: ({ detail }: { detail: string }) =>
        `解码任务失败: ${detail}`,
      couldNotChooseImages: ({ detail }: { detail: string }) =>
        `选择图片失败: ${detail}`,
      noImageInTheClipboard: "剪贴板中没有图片",
      clipboardImage: "剪贴板图片",
      couldNotReadClipboardImage: ({ detail }: { detail: string }) =>
        `读取剪贴板图片失败: ${detail}`,
      couldNotStartDropListener: ({ detail }: { detail: string }) =>
        `拖拽监听启动失败: ${detail}`,
      decodingImagesOneByOne: "正在逐张解码",
      dropToDecodeImages: "释放以解码图片",
      supportsPNGJPEGGIFBMPAndWebPOnly: "仅支持 PNG、JPEG、GIF、BMP 和 WebP",
      dropImagesHere: "拖拽图片到此处",
      decodeSource: "解码来源",
      chooseImages: "选择图片",
      pasteImage: "粘贴图片",
      decoding: ({ done, total }: { done: number; total: number }) =>
        `正在解码 ${done} / ${total}`,
      latestBatchImages: ({ count }: { count: number }) =>
        `最近批次 ${count} 张图片`,
      waitingForImages: "等待图片",
      clear: "清空",
      clearDecodedResults: "清空解码结果",
      copyFailed: ({ detail }: { detail: string }) => `复制失败: ${detail}`,
      couldNotOpenLink: ({ detail }: { detail: string }) =>
        `打开链接失败: ${detail}`,
      results: "结果",
      allDecodedResultsCopied: "已复制全部解码结果",
      copyAll: "复制全部",
      decodedResults: "解码结果列表",
      waitingForTheFirstImage: "等待首张图片完成",
      noDecodedResultsYet: "还没有解码结果",
      dropImagesChooseFilesOrPasteAnImage: "拖入图片, 选择文件或粘贴图片.",
      failed: "失败",
      codesLabel: ({ count }: { count: number }) => `${count} 个码`,
      noCodeFound: "未识别到码",
      decodedContentCopied: "已复制解码内容",
      copyDecodedContent: "复制解码内容",
      openInBrowser: "在浏览器中打开",
      openLinkInBrowser: "在浏览器中打开链接",
    },
  },
  codegen: {
    options: {
      newline: "换行",
      comma: "逗号",
      semicolon: "分号",
      tab: "制表符",
      custom: "自定义",
      qr: "二维码",
    },
    itemCount: ({ formatted }: { count: number; formatted: string }) =>
      `${formatted} 项`,
    codeGeneratorPage: {
      batchGenerator: "批量生码",
      generatorSettings: "生码设置",
      data: "数据",
      clear: "清空",
      clearInputAndResults: "清空输入和结果",
      generateCtrlCommandEnter: "生成 (Ctrl/Command+Enter)",
      generate: "生成",
      results: "结果",
      qrCode: "二维码",
      inputOrOptionsChanged: "输入或参数已修改",
      generatedResults: "生成结果列表",
      noCodesGeneratedYet: "还没有生成任何码",
      enterDataOnTheLeftAndGenerate: "在左侧输入数据并生成.",
      previewItem: ({ index }: { index: number }) => `放大预览第 ${index} 项`,
      codePreview: "码图放大预览",
      closePreview: "关闭预览",
      previousItem: "上一项",
      nextItem: "下一项",
      whitespace: ({ count }: { count: number }) => `空白字符 (${count})`,
    },
    generatedCodeCanvas: {
      generatedQRCode: "生成的二维码",
      generatedCode128Barcode: "生成的 Code 128 条形码",
    },
  },
  files: {
    kinds: {
      directory: "文件夹",
      symlink: "链接",
      other: "其他",
      file: "文件",
    },
    transfer: {
      preparing: ({ kind }: { kind: "upload" | "download" }) =>
        `准备${kind === "upload" ? "上传" : "下载"}`,
      complete: ({ kind }: { kind: "upload" | "download" }) =>
        `${kind === "upload" ? "上传" : "下载"}完成`,
      partial: ({
        kind,
        succeeded,
        failed,
      }: {
        kind: "upload" | "download";
        succeeded: number;
        failed: number;
      }) =>
        `${kind === "upload" ? "上传" : "下载"}: ${succeeded} 个成功, ${failed} 个失败`,
      failed: ({
        kind,
        count,
      }: {
        kind: "upload" | "download";
        count: number;
      }) => `${kind === "upload" ? "上传" : "下载"}失败: ${count} 个`,
    },
    deviceFileManager: {
      aFileTransferIsAlreadyRunning: "已有文件传输正在进行",
      uploadedFiles: ({ count }: { count: number }) => `已上传 ${count} 个文件`,
      uploadCompleteSucceededFailed: ({
        succeeded,
        failed,
      }: {
        succeeded: number;
        failed: number;
      }) => `上传完成: ${succeeded} 个成功, ${failed} 个失败`,
      couldNotStartDropListener: ({ detail }: { detail: string }) =>
        `拖拽监听启动失败: ${detail}`,
      couldNotChooseUploadFiles: ({ detail }: { detail: string }) =>
        `选择上传文件失败: ${detail}`,
      fileSavedTo: ({ path }: { path: string }) => `文件已保存到 ${path}`,
      couldNotDownloadFile: ({ detail }: { detail: string }) =>
        `下载文件失败: ${detail}`,
      couldNotChooseSaveLocation: ({ detail }: { detail: string }) =>
        `选择保存位置失败: ${detail}`,
      pathCopied: "路径已复制",
      couldNotCopyPath: ({ detail }: { detail: string }) =>
        `复制路径失败: ${detail}`,
      createdDirectory: ({ path }: { path: string }) => `已新建目录 ${path}`,
      couldNotCreateDirectory: ({ detail }: { detail: string }) =>
        `新建目录失败: ${detail}`,
      couldNotRevealFile: ({ detail }: { detail: string }) =>
        `无法在文件管理器中显示文件: ${detail}`,
      goToStartDirectory: "返回起始目录",
      goToParentDirectory: "返回上级目录",
      absoluteDevicePath: "设备绝对路径",
      connectADeviceToBrowseFiles: "连接设备后可浏览文件",
      copyCurrentPath: "复制当前路径",
      goToPath: "前往路径",
      refreshDirectory: "刷新目录",
      deviceFiles: "设备文件",
      newDirectory: "新建目录",
      uploadFiles: "上传文件",
      settings: "设置",
      openDownloadsFolder: "打开下载目录",
      directoryName: "目录名称",
      newDirectoryName: "新目录名称",
      create: "创建",
      name: "名称",
      type: "类型",
      size: "大小",
      modified: "修改时间",
      selectAnOnlineDeviceFirst: "先选择一台在线设备",
      noFilesToDisplay: "没有可显示的文件",
      thisDirectoryIsEmpty: "此目录为空",
      readingDeviceDirectory: "正在读取设备目录",
      dropToUploadToThisDirectory: "释放以上传到当前目录",
      noItemSelected: "未选择项目",
      selectAFileOrDirectoryOnTheLeft: "从左侧选择文件或目录.",
      imagePreviewUnavailable: "图片预览不可用",
      path: "路径",
      copyPath: "复制路径",
      openDirectory: "打开目录",
      downloadToComputer: "下载到电脑",
      recentTransfer: "最近传输",
      noTransferHistory: "暂无传输记录",
      uploading: "正在上传",
      downloading: "正在下载",
      revealInFileManager: "在文件管理器中显示",
    },
  },
};

export const toolErrorsZh = {
  clipboard_empty: () => "剪贴板没有可用文本, 目标内容保持不变",
  clipboard_too_large: () => "剪贴板文本超过 256 KiB 限制",
  clipboard_device_empty: () => "手机剪贴板没有可用文本, 电脑内容保持不变",
  recording_session_changed: () => "录屏会话已变化, 操作已取消",
  recording_path_missing: () => "录屏会话缺少原保存路径",
  recording_refresh_failed: () => "无法刷新会话",
  decoder_canvas_unavailable: () => "无法创建图片解码画布",
  generator_empty_input: () => "请输入要生成的数据",
  generator_empty_separator: () => "请输入自定义分隔符",
  generator_no_values: () => "没有可生成的数据",
  generator_unsupported_code128: () => "Code 128 不支持该内容",
  generator_render_failed: ({ format }: { format: string }) =>
    `${format === "qr" ? "二维码" : "Code 128"}生成失败`,
  port_invalid: () => "端口必须是 1-65535 的整数",
};
