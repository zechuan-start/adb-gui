export const toolMessagesEn = {
  apps: {
    confirmAction: ({ action }: { action: "clear" | "uninstall" }) =>
      action === "clear" ? "Clear app data?" : "Uninstall app?",
    activityMonitor: {
      noForegroundApp: "No foreground app",
      completedSuccessfully: ({ packageName }: { packageName: string }) =>
        `${packageName} completed successfully`,
      currentAppActionFailed: ({ detail }: { detail: string }) =>
        `Current app action failed: ${detail}`,
      package: "Package",
      packageNameCopied: "Package name copied",
      copyPackageName: "Copy package name",
      enterAPackageName: "Enter a package name...",
      forceStop: "Force stop",
      launch: "Launch",
      clearDataFor: ({ packageName }: { packageName: string }) =>
        `Clear data for ${packageName}?`,
      clearData: "Clear data",
      uninstall: ({ packageName }: { packageName: string }) =>
        `Uninstall ${packageName}?`,
      uninstallLabel: "Uninstall",
      clickAgainToClearData: "Click again to clear data.",
      clickAgainToUninstallTheApp: "Click again to uninstall the app.",
      confirm: "Confirm",
    },
    appManager: {
      apkInstalledSuccessfully: "APK installed successfully",
      installingPleaseWait: "Installing, please wait",
      selectAnOnlineDeviceFirst: "Select an online device first",
      dropToInstallAPK: "Drop to install APK",
      onlyAPKFilesAreSupported: "Only APK files are supported",
      dropAnAPKIntoThisWindow: "Drop an APK into this window",
      installingAPKPleaseWait: "Installing APK, please wait",
      selectAnOnlineDeviceFirstLabel: "Select an online device first",
      installing: "Installing...",
      installOneAPKAtATime: "Install one APK at a time",
      couldNotStartDropListener: ({ detail }: { detail: string }) =>
        `Could not start drop listener: ${detail}`,
      chooseAndInstall: "Choose and install",
      installOnTheCurrentDevice: "Install on the current device",
    },
    packageManager: {
      couldNotLoadApps: ({ detail }: { detail: string }) =>
        `Could not load apps: ${detail}`,
      completedSuccessfully: ({ packageName }: { packageName: string }) =>
        `${packageName} completed successfully`,
      operationFailed: ({ detail }: { detail: string }) =>
        `Operation failed: ${detail}`,
      appListUnavailable: "App list unavailable",
      connectAnOnlineDeviceToBrowseAndManage:
        "Connect an online device to browse and manage user apps.",
      searchAppNameOrPackage: "Search app name or package",
      refreshAppList: "Refresh app list",
      liveDataUnavailableShowingPreviouslyLoadedData:
        "Live data unavailable. Showing previously loaded data.",
      appNamesAndVersionsUnavailableShowingBasicInfo:
        "App names and versions unavailable. Showing basic info.",
      hideDetails: "Hide details",
      viewDetails: "View details",
      appPackage: "App / package",
      version: "Version",
      readingAppInfo: "Reading app info...",
      noUserAppsToManageOnThisDevice: "No user apps to manage on this device.",
      noMatchingApps: "No matching apps.",
      type: "Type",
      userApp: "User app",
      versionCode: "Version code",
      firstInstalled: "First installed",
      lastUpdated: "Last updated",
      apkSize: "APK size",
      device: "Device",
      confirm: "Confirm",
      uninstall: "Uninstall",
      processing: "Processing",
      launch: "Launch",
      forceStop: "Force stop",
      clearDataLabel: "Clear data",
      noAppSelected: "No app selected",
      selectAPackageOnTheLeftToView:
        "Select a package on the left to view actions.",
    },
  },
  tools: {
    recordingSaveDestination: ({ path }: { path: string }) =>
      `Save destination: ${path}`,
    recordingDeviceSource: ({
      serial,
      path,
    }: {
      serial: string;
      path: string;
    }) => `Device source: ${serial} / ${path}`,
    bugReportTool: {
      bugDataCollectedIn: ({ path }: { path: string }) =>
        `Bug data collected in ${path}`,
      quickCollectionFailed: ({ detail }: { detail: string }) =>
        `Quick collection failed: ${detail}`,
      fullBugreportSavedTo: ({ path }: { path: string }) =>
        `Full Bugreport saved to ${path}`,
      fullBugreportFailed: ({ detail }: { detail: string }) =>
        `Full Bugreport failed: ${detail}`,
      quickCollect: "Quick collect",
      fullBugreport: "Full Bugreport",
      generatingAFullBugreportThisMayTakeSeveral:
        "Generating a full Bugreport. This may take several minutes.",
      quickCollectIncludesAScreenshotActivityDeviceInfo:
        "Quick collect includes a screenshot, Activity, device info and recent logs.",
      theLatestReportPathWillAppearHere:
        "The latest report path will appear here.",
      availableWhenTheDeviceIsOnline: "Available when the device is online",
      reportPathCopied: "Report path copied",
      copyPath: "Copy path",
      showFile: "Show file",
      showFolder: "Show folder",
    },
    clipboardTool: {
      textSentToTheDeviceClipboard: "Text sent to the device clipboard",
      deviceTextCopiedToTheComputerClipboard:
        "Device text copied to the computer clipboard",
      sendToDevice: "Send to device",
      copyToComputer: "Copy to computer",
      noDeviceConnected: "No device connected",
    },
    deepLinkTool: {
      deepLinkOpened: "Deep Link opened",
      couldNotOpen: ({ detail }: { detail: string }) =>
        `Could not open: ${detail}`,
      httpsExampleComOrMyappPath: "https://example.com or myapp://path",
      open: "Open",
      enterAnAddress: "Enter an address",
      availableWhenTheDeviceIsOnline: "Available when the device is online",
    },
    portForwardTool: {
      couldNotRefreshPortForwarding: ({ detail }: { detail: string }) =>
        `Could not refresh port forwarding: ${detail}`,
      portForwardingRuleAdded: "Port forwarding rule added",
      couldNotAddPortForwarding: ({ detail }: { detail: string }) =>
        `Could not add port forwarding: ${detail}`,
      portForwardingRuleDeleted: "Port forwarding rule deleted",
      couldNotDeletePortForwarding: ({ detail }: { detail: string }) =>
        `Could not delete port forwarding: ${detail}`,
      refreshPortForwarding: "Refresh port forwarding",
      forwardingDirection: "Forwarding direction",
      localPort: "Local port",
      devicePort: "Device port",
      add: "Add",
      refreshing: "Refreshing",
      noPortForwardingRules: "No port forwarding rules",
      availableWhenTheDeviceIsOnline: "Available when the device is online",
      direction: "Direction",
      actions: "Actions",
      deleteRule: "Delete rule",
    },
    quickKeys: {
      navigation: "Navigation",
      back: "Back",
      home: "Home",
      recentApps: "Recent apps",
      input: "Input",
      enter: "Enter",
      delete: "Delete",
      hardware: "Hardware",
      power: "Power",
      volumeUp: "Volume up",
      volumeDown: "Volume down",
      sent: ({ action }: { action: string }) => `${action} sent`,
      couldNotSendKey: ({ detail }: { detail: string }) =>
        `Could not send key: ${detail}`,
    },
    screenRecordTool: {
      couldNotOpenVideoAutomatically: "Could not open video automatically",
      recordingSaved: ({
        path,
        warnings,
      }: {
        path: string;
        warnings: string[];
      }) =>
        `Recording saved: ${path}${warnings.length ? `; ${warnings.join("; ")}` : ""}`,
      recoveryAbandonedSourceMayRemainOnDevice: ({
        serial,
        path,
        detail,
      }: {
        serial: string;
        path: string;
        detail: string;
      }) =>
        `Recovery abandoned; source may remain on device: ${serial} / ${path}; ${detail}`,
      saveAbandonedAndDeviceSourceDeleted:
        "Save abandoned and device source deleted",
      couldNotRefreshRecordingStatus: ({ detail }: { detail: string }) =>
        `Could not refresh recording status: ${detail}`,
      couldNotOpenSavedRecording: ({ detail }: { detail: string }) =>
        `Could not open saved recording: ${detail}`,
      starting: "Starting...",
      processing: "Processing...",
      waitingToRecoverSave: "Waiting to recover save",
      startRecording: "Start recording",
      stopAndSave: "Stop and save",
      status: "Status",
      saveFailed: "Save failed",
      processingLabel: "Processing",
      recording: "Recording",
      pendingSave: "Pending save",
      ready: "Ready",
      deviceOffline: "Device offline",
      duration: "Duration",
      afterClosingRecoverTheDeviceSourceManually:
        "After closing, recover the device source manually.",
      retrySave: "Retry save",
      saveAs: "Save as",
      discardSave: "Discard save",
      noSavedRecordingYet: "No saved recording yet",
      revealInFileManager: "Reveal in file manager",
      openWithDefaultApp: "Open with default app",
    },
    screenshot: {
      screenshotPathCopied: "Screenshot path copied",
      savedScreenshotActionFailed: ({
        path,
        detail,
      }: {
        path: string;
        detail: string;
      }) => `Saved screenshot action failed (${path}): ${detail}`,
      screenshotSavedTo: ({
        path,
        failed,
      }: {
        path: string;
        failed: boolean;
      }) =>
        `Screenshot saved to ${path}${failed ? "; could not open or reveal automatically" : ""}`,
      screenshotCopiedToClipboard: "Screenshot copied to clipboard",
      screenshotFailed: ({ detail }: { detail: string }) =>
        `Screenshot failed: ${detail}`,
      capturing: "Capturing...",
      saveScreenshot: "Save screenshot",
      copying: "Copying...",
      captureAndCopy: "Capture and copy",
      theLatestScreenshotWillAppearHere:
        "The latest screenshot will appear here.",
      copyPath: "Copy path",
      revealInFileManager: "Reveal in file manager",
      openWithDefaultApp: "Open with default app",
    },
    wifiConnect: {
      couldNotRefreshDevices: ({ detail }: { detail: string }) =>
        `Could not refresh devices: ${detail}`,
      deviceConnected: "Device connected",
      wifiConnectionFailed: ({ detail }: { detail: string }) =>
        `WiFi connection failed: ${detail}`,
      deviceDisconnected: "Device disconnected",
      couldNotDisconnectDevice: ({ detail }: { detail: string }) =>
        `Could not disconnect device: ${detail}`,
      connectedToYouCanUnplugUSB: ({ address }: { address: string }) =>
        `Connected to ${address}; you can unplug USB`,
      couldNotSwitchToWiFi: ({ detail }: { detail: string }) =>
        `Could not switch to WiFi: ${detail}`,
      wifiConnection: "WiFi connection",
      closeWiFiConnection: "Close WiFi connection",
      manualConnection: "Manual connection",
      connect: "Connect",
      networkDevices: "Network devices",
      noWiFiDevices: "No WiFi devices",
      disconnect: "Disconnect",
      switchCurrentUSBDeviceToWiFi: "Switch current USB device to WiFi",
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
    }) =>
      `${images} image${images === 1 ? "" : "s"}, ${decoded} decoded, ${codes} code${codes === 1 ? "" : "s"}`,
    decodeFailure: ({ detail }: { detail: string }) =>
      `Decoding failed: ${detail}`,
    codeDecoderPage: {
      decodingImagesPleaseWait: "Decoding images, please wait",
      ignoredUnsupportedFiles: ({ count }: { count: number }) =>
        `Ignored ${count} unsupported file${count === 1 ? "" : "s"}`,
      decodeUpToImagesPerBatchSkipped: ({
        limit,
        skipped,
      }: {
        limit: number;
        skipped: number;
      }) => `Decode up to ${limit} images per batch; skipped ${skipped}`,
      decodingTaskFailed: ({ detail }: { detail: string }) =>
        `Decoding task failed: ${detail}`,
      couldNotChooseImages: ({ detail }: { detail: string }) =>
        `Could not choose images: ${detail}`,
      noImageInTheClipboard: "No image in the clipboard",
      clipboardImage: "Clipboard image",
      couldNotReadClipboardImage: ({ detail }: { detail: string }) =>
        `Could not read clipboard image: ${detail}`,
      couldNotStartDropListener: ({ detail }: { detail: string }) =>
        `Could not start drop listener: ${detail}`,
      decodingImagesOneByOne: "Decoding images one by one",
      dropToDecodeImages: "Drop to decode images",
      supportsPNGJPEGGIFBMPAndWebPOnly:
        "Supports PNG, JPEG, GIF, BMP and WebP only",
      dropImagesHere: "Drop images here",
      decodeSource: "Decode source",
      chooseImages: "Choose images",
      pasteImage: "Paste image",
      decoding: ({ done, total }: { done: number; total: number }) =>
        `Decoding ${done} / ${total}`,
      latestBatchImages: ({ count }: { count: number }) =>
        `Latest batch: ${count} image${count === 1 ? "" : "s"}`,
      waitingForImages: "Waiting for images",
      clear: "Clear",
      clearDecodedResults: "Clear decoded results",
      copyFailed: ({ detail }: { detail: string }) => `Copy failed: ${detail}`,
      couldNotOpenLink: ({ detail }: { detail: string }) =>
        `Could not open link: ${detail}`,
      results: "Results",
      allDecodedResultsCopied: "All decoded results copied",
      copyAll: "Copy all",
      decodedResults: "Decoded results",
      waitingForTheFirstImage: "Waiting for the first image",
      noDecodedResultsYet: "No decoded results yet",
      dropImagesChooseFilesOrPasteAnImage:
        "Drop images, choose files or paste an image.",
      failed: "Failed",
      codesLabel: ({ count }: { count: number }) =>
        `${count} code${count === 1 ? "" : "s"}`,
      noCodeFound: "No code found",
      decodedContentCopied: "Decoded content copied",
      copyDecodedContent: "Copy decoded content",
      openInBrowser: "Open in browser",
      openLinkInBrowser: "Open link in browser",
    },
  },
  codegen: {
    options: {
      newline: "Newline",
      comma: "Comma",
      semicolon: "Semicolon",
      tab: "Tab",
      custom: "Custom",
      qr: "QR code",
    },
    itemCount: ({ count, formatted }: { count: number; formatted: string }) =>
      `${formatted} item${count === 1 ? "" : "s"}`,
    codeGeneratorPage: {
      batchGenerator: "Batch generator",
      generatorSettings: "Generator settings",
      data: "Data",
      clear: "Clear",
      clearInputAndResults: "Clear input and results",
      generateCtrlCommandEnter: "Generate (Ctrl/Command+Enter)",
      generate: "Generate",
      results: "Results",
      qrCode: "QR code",
      inputOrOptionsChanged: "Input or options changed",
      generatedResults: "Generated results",
      noCodesGeneratedYet: "No codes generated yet",
      enterDataOnTheLeftAndGenerate: "Enter data on the left and generate.",
      previewItem: ({ index }: { index: number }) => `Preview item ${index}`,
      codePreview: "Code preview",
      closePreview: "Close preview",
      previousItem: "Previous item",
      nextItem: "Next item",
      whitespace: ({ count }: { count: number }) => `Whitespace (${count})`,
    },
    generatedCodeCanvas: {
      generatedQRCode: "Generated QR code",
      generatedCode128Barcode: "Generated Code 128 barcode",
    },
  },
  files: {
    kinds: {
      directory: "Folder",
      symlink: "Link",
      other: "Other",
      file: "File",
    },
    transfer: {
      preparing: ({ kind }: { kind: "upload" | "download" }) =>
        `Preparing ${kind}`,
      complete: ({ kind }: { kind: "upload" | "download" }) =>
        `${kind === "upload" ? "Upload" : "Download"} complete`,
      partial: ({
        kind,
        succeeded,
        failed,
      }: {
        kind: "upload" | "download";
        succeeded: number;
        failed: number;
      }) =>
        `${kind === "upload" ? "Upload" : "Download"}: ${succeeded} succeeded, ${failed} failed`,
      failed: ({
        kind,
        count,
      }: {
        kind: "upload" | "download";
        count: number;
      }) => `${kind === "upload" ? "Upload" : "Download"} failed: ${count}`,
    },
    deviceFileManager: {
      aFileTransferIsAlreadyRunning: "A file transfer is already running",
      uploadedFiles: ({ count }: { count: number }) =>
        `Uploaded ${count} file${count === 1 ? "" : "s"}`,
      uploadCompleteSucceededFailed: ({
        succeeded,
        failed,
      }: {
        succeeded: number;
        failed: number;
      }) => `Upload complete: ${succeeded} succeeded, ${failed} failed`,
      couldNotStartDropListener: ({ detail }: { detail: string }) =>
        `Could not start drop listener: ${detail}`,
      couldNotChooseUploadFiles: ({ detail }: { detail: string }) =>
        `Could not choose upload files: ${detail}`,
      fileSavedTo: ({ path }: { path: string }) => `File saved to ${path}`,
      couldNotDownloadFile: ({ detail }: { detail: string }) =>
        `Could not download file: ${detail}`,
      couldNotChooseSaveLocation: ({ detail }: { detail: string }) =>
        `Could not choose save location: ${detail}`,
      pathCopied: "Path copied",
      couldNotCopyPath: ({ detail }: { detail: string }) =>
        `Could not copy path: ${detail}`,
      createdDirectory: ({ path }: { path: string }) =>
        `Created directory ${path}`,
      couldNotCreateDirectory: ({ detail }: { detail: string }) =>
        `Could not create directory: ${detail}`,
      couldNotRevealFile: ({ detail }: { detail: string }) =>
        `Could not reveal file: ${detail}`,
      goToStartDirectory: "Go to start directory",
      goToParentDirectory: "Go to parent directory",
      absoluteDevicePath: "Absolute device path",
      connectADeviceToBrowseFiles: "Connect a device to browse files",
      copyCurrentPath: "Copy current path",
      goToPath: "Go to path",
      refreshDirectory: "Refresh directory",
      deviceFiles: "Device files",
      newDirectory: "New directory",
      uploadFiles: "Upload files",
      settings: "Settings",
      openDownloadsFolder: "Open downloads folder",
      directoryName: "Directory name",
      newDirectoryName: "New directory name",
      create: "Create",
      name: "Name",
      type: "Type",
      size: "Size",
      modified: "Modified",
      selectAnOnlineDeviceFirst: "Select an online device first",
      noFilesToDisplay: "No files to display",
      thisDirectoryIsEmpty: "This directory is empty",
      readingDeviceDirectory: "Reading device directory",
      dropToUploadToThisDirectory: "Drop to upload to this directory",
      noItemSelected: "No item selected",
      selectAFileOrDirectoryOnTheLeft:
        "Select a file or directory on the left.",
      imagePreviewUnavailable: "Image preview unavailable",
      path: "Path",
      copyPath: "Copy path",
      openDirectory: "Open directory",
      downloadToComputer: "Download to computer",
      recentTransfer: "Recent transfer",
      noTransferHistory: "No transfer history",
      uploading: "Uploading",
      downloading: "Downloading",
      revealInFileManager: "Reveal in file manager",
    },
  },
};

export const toolErrorsEn = {
  clipboard_empty: () => "No clipboard text available; destination unchanged",
  clipboard_too_large: () => "Clipboard text exceeds the 256 KiB limit",
  clipboard_device_empty: () =>
    "No text in the device clipboard; computer clipboard unchanged",
  recording_session_changed: () =>
    "Recording session changed; action cancelled",
  recording_path_missing: () => "Recording session has no original save path",
  recording_refresh_failed: () => "Could not refresh the session",
  decoder_canvas_unavailable: () => "Could not create an image decoding canvas",
  generator_empty_input: () => "Enter data to generate",
  generator_empty_separator: () => "Enter a custom separator",
  generator_no_values: () => "No data to generate",
  generator_unsupported_code128: () => "Code 128 does not support this content",
  generator_render_failed: ({ format }: { format: string }) =>
    `${format === "qr" ? "QR code" : "Code 128"} generation failed`,
  port_invalid: () => "Ports must be integers from 1 to 65535",
};
