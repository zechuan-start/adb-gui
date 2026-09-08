import type { backendDialogsZh } from "./backend-zh-CN";
import type { BackendErrorMessages } from "../backendErrorContract";

export const backendErrorsEn = {
  "capture.picturesUnavailable": () =>
    "Cannot resolve the system Pictures folder. Choose a save folder in Settings",
  "capture.absoluteDirectory": () =>
    "The local save folder must be an absolute path",
  "capture.missingParent": () => "The save path has no parent folder",
  "files.createdDirectoryMissing": () =>
    "The folder was created but could not be found in the device listing",
  "files.uploadRegularOnly": () =>
    "Only regular files can be uploaded, not folders",
  "files.localNameUnavailable": () => "Cannot read the local file name",
  "files.saveNameUnavailable": () => "Cannot read the local save file name",
  "files.previewFormat": () =>
    "Only PNG, JPEG, WEBP and GIF images can be previewed",
  "files.missingDelimiter": () =>
    "Device directory records are missing the final delimiter",
  "files.absoluteDevicePath": () =>
    "The device path must be absolute and start with /",
  "files.pathContainsNul": () => "The device path cannot contain NUL",
  "files.pathAboveRoot": () =>
    "The device path cannot go above the root folder",
  "files.emptyName": () => "The name cannot be empty",
  "files.invalidName": () => "The name must be a single valid path segment",
  "files.absoluteSavePath": () => "The local save path must be absolute",
  "files.missingSaveName": () => "The local save path has no file name",
  "files.missingSaveParent": () => "The local save path has no parent folder",
  "files.saveParentMissing": () => "The local save folder does not exist",
  "files.savePathDirectory": () => "The local save path points to a folder",
  "files.uniqueTempFailed": () => "Cannot create a unique local temporary file",
  "files.uniqueBackupFailed": () => "Cannot create a unique local backup path",
  "recording.existingSession": () =>
    "A recording or recovery file already exists. Save or discard it first",
  "recording.busy": () => "The current recording operation has not finished",
  "recording.sessionChanged": () =>
    "The recording session changed. The operation was canceled",
  "recording.emptySource": () =>
    "The device recording is empty. The source file was kept for inspection",
  "recording.invalidPid": () => "The device recording PID is invalid",
  "clipboard.noText": () => "The clipboard has no available text",
  "clipboard.tooLarge": () => "Clipboard text exceeds the 256 KiB limit",
  "clipboard.encodeFailed": () => "Cannot encode the clipboard request",
  "clipboard.readDexFailed": () => "Cannot read the clipboard DEX",
  "clipboard.readOutputFailed": () => "Cannot read clipboard process output",
  "clipboard.outputTooLarge": () =>
    "Clipboard process output exceeds the limit",
  "clipboard.startFailed": () => "Cannot start the clipboard process",
  "clipboard.missingStdin": () => "The clipboard input pipe is missing",
  "clipboard.missingStdout": () => "The clipboard output pipe is missing",
  "clipboard.missingStderr": () => "The clipboard error pipe is missing",
  "clipboard.sendFailed": () => "Cannot send the clipboard request",
  "clipboard.waitFailed": () => "Cannot wait for the clipboard process",
  "clipboard.timeout": () => "The clipboard operation timed out",
  "clipboard.abnormalExit": () =>
    "The clipboard process did not exit normally. Check the device connection",
  "image.missingExtension": () => "The image file has no supported extension",
  "image.notRegularFile": () => "The selected path is not a regular file",
  "report.emptyBugreport": () => "The bugreport file is empty. Try again.",
  "report.busy": () =>
    "A full bugreport is being generated. Wait for the current task to finish.",
  "report.emptyScreenshot": () =>
    "The screenshot is empty. Check that the device screen is available.",
  "wifi.noIp": () =>
    "No WiFi IP address was found. Check that the device is connected to WiFi",
  "wifi.emptyAddress": () => "Enter a device IP address or ip:port",
  "ports.invalidDirection": () =>
    "Invalid direction. Expected forward or reverse.",
  "ports.invalidPort": () => "Port must be an integer between 1 and 65535.",
  "adb.shuttingDown": () => "The application is shutting down",
  "adb.notFound": () =>
    "adb was not found. Install Android Platform Tools or set ANDROID_HOME.",
  "adb.notInPath": () => "adb is not in PATH",
  "helper.deploymentTimeout": () =>
    "Timed out waiting for another DEX deployment",
  "capture.probeCleanup": () => "Cannot remove the recording preparation file",
  "capture.clockFailed": () => "Cannot read the system clock",
  "capture.directoryUnavailable": ({ path }) =>
    `The save folder is unavailable (${path})`,
  "capture.createDefaultFailed": ({ path }) =>
    `Cannot create the default save folder (${path})`,
  "capture.prepareFailed": ({ path }) =>
    `Cannot prepare the save destination (${path})`,
  "capture.tempFailed": ({ path }) => `Cannot create a staging file (${path})`,
  "capture.writeFailed": ({ path }) => `Cannot write the screenshot (${path})`,
  "capture.verifyFailed": ({ path }) =>
    `Cannot verify the local file (${path})`,
  "capture.syncFailed": ({ path }) => `Cannot sync the local file (${path})`,
  "capture.notDirectory": ({ path }) =>
    `The save location is not a folder: ${path}`,
  "capture.sizeMismatch": ({ path, expected, size }) =>
    `File integrity check failed (${path}): device ${expected} bytes, local ${size} bytes`,
  "capture.publishFailed": ({ path }) =>
    `Cannot publish the local file (${path})`,
  "files.listWorkerFailed": () => "The device directory task failed",
  "files.createFailed": () => "Cannot create a device folder",
  "files.createWorkerFailed": () => "The create folder task failed",
  "files.readLocalFailed": () => "Cannot read the local file",
  "files.uploadFailed": () => "Cannot upload the file to the device",
  "files.uploadWorkerFailed": () => "The upload task failed",
  "files.downloadFailed": () => "Cannot download the device file",
  "files.readTempFailed": () => "Cannot read the download staging file",
  "files.downloadWorkerFailed": () => "The download task failed",
  "files.readImageFailed": () => "Cannot read the device image",
  "files.previewWorkerFailed": () => "The image preview task failed",
  "files.invalidSize": () => "The device file size is invalid",
  "files.invalidModifiedAt": () =>
    "The device file modification time is invalid",
  "files.checkUploadDirectory": () => "Cannot inspect the device upload folder",
  "files.remoteSizeFailed": () => "Cannot read the device file size",
  "files.clockFailed": () => "Cannot read the system clock",
  "files.createTempFailed": () => "Cannot create a local temporary file",
  "files.inspectBackupFailed": () => "Cannot inspect the local backup path",
  "files.inspectTargetFailed": () => "Cannot inspect the local target file",
  "files.saveFailed": () => "Cannot save the downloaded file",
  "files.backupFailed": () => "Cannot back up the existing local file",
  "files.saveRestored": () =>
    "Cannot save the downloaded file. The original file was restored",
  "files.listFailed": ({ path }) => `Cannot read the device folder (${path})`,
  "files.invalidFieldCount": ({ count }) =>
    `Device directory records have an invalid field count: ${count}`,
  "files.unknownKind": ({ value }) => `Unknown device file type: ${value}`,
  "files.outOfScope": ({ path }) =>
    `The device returned a path outside the requested folder: ${path}`,
  "files.deviceNameUnavailable": ({ path }) =>
    `Cannot read the device file name: ${path}`,
  "files.uniqueRemoteNameFailed": ({ name }) =>
    `Cannot generate a unique device file name for ${name}`,
  "files.existsFailed": () => "Cannot check whether the device file exists",
  "files.previewTooLarge": ({ bytes }) =>
    `The image exceeds the 20 MiB preview limit: ${bytes} bytes`,
  "clipboard.hostReadFailed": () =>
    "Cannot read text from the computer clipboard",
  "clipboard.hostWriteFailed": () => "Cannot write to the computer clipboard",
  "capture.invalidDirectorySelection": () =>
    "The folder selection result is invalid",
  "clipboard.imageLengthMismatch": ({ expected, actual }) =>
    `Clipboard image pixel data length does not match: expected ${expected}, actual ${actual}`,
  "files.downloadSizeMismatch": ({ remote, local }) =>
    `Downloaded file size differs: device ${remote} bytes, local ${local} bytes`,
  "files.previewReadTooLarge": ({ bytes }) =>
    `Image data exceeds the 20 MiB preview limit: ${bytes} bytes`,
  "files.imageIncomplete": ({ expected, actual }) =>
    `The image was not read completely: device ${expected} bytes, read ${actual} bytes`,
  "files.restoreFailed": ({ path }) =>
    `Cannot save the downloaded file or restore the original. The backup is at ${path}`,
  "files.kindNotUtf8": () => "The device file type is not UTF-8",
  "files.sizeNotUtf8": () => "The device file size is not UTF-8",
  "files.modifiedNotUtf8": () =>
    "The device file modification time is not UTF-8",
  "files.pathNotUtf8": () => "The device file path is not UTF-8",
  "files.notDirectory": ({ path }) =>
    `The path is not an accessible folder: ${path}`,
  "files.directoryPermission": ({ path }) =>
    `No permission to read the device folder: ${path}`,
  "files.notFile": ({ path }) => `The device path is not a file: ${path}`,
  "recording.cleanupFailed": () =>
    "Recording cleanup failed. The device source file may still remain",
  "recording.readSessionFailed": () => "Cannot read the recording session",
  "recording.startFailed": () => "Cannot start device recording",
  "recording.startWorkerFailed": () => "The recording start task failed",
  "recording.updateSessionFailed": () => "Cannot update the recording session",
  "recording.saveWorkerFailed": () => "The recording save task failed",
  "recording.killHostFailed": () => "Cannot end the local recording connection",
  "recording.waitHostFailed": () =>
    "Cannot reap the local recording connection",
  "recording.releaseSessionFailed": () =>
    "Cannot release the recording session",
  "recording.discardWorkerFailed": () => "The discard recording task failed",
  "recording.inspectProcessFailed": () =>
    "Cannot inspect the recording process",
  "recording.readErrorFailed": () => "Cannot read recording diagnostics",
  "recording.waitStopFailed": () => "Cannot wait for recording to stop",
  "recording.stopFailed": () => "Cannot stop device recording",
  "recording.pullFailed": ({ remote, local }) =>
    `Cannot pull the device recording (${remote} -> ${local})`,
  "recording.inspectSourceFailed": ({ path }) =>
    `Cannot inspect the device source file (${path})`,
  "recording.processFailed": ({ status }) =>
    `The device recording process failed (${status})`,
  "recording.stopTimeout": ({ path }) =>
    `Stopping the device recording timed out. The source file was kept: ${path}`,
  "recording.queryProcessFailed": () =>
    "Cannot query the device recording process",
  "recording.confirmStopFailed": () =>
    "Cannot confirm that device recording has stopped",
  "recording.sourceCleanupFailed": ({ serial, path }) =>
    `The device source file was not removed (${serial} / ${path})`,
  "clipboard.invalidResponse": () =>
    "The clipboard helper response is invalid or incompatible",
  "clipboard.prepareDexFailed": () => "Cannot prepare the clipboard DEX",
  "clipboard.writeUnconfirmed": () =>
    "The result of this write is unconfirmed. It will not be retried automatically",
  "clipboard.killFailed": () => "Cannot terminate the clipboard process",
  "clipboard.reapFailed": () => "Cannot reap the clipboard process",
  "clipboard.locked": () => "The phone is locked. Unlock it and try again",
  "clipboard.user": () => "Only the primary user clipboard is supported",
  "clipboard.permission": () =>
    "The system denied shell access to the clipboard",
  "clipboard.deviceNoText": () => "The phone clipboard has no available text",
  "clipboard.unverified": () =>
    "The phone did not return matching clipboard contents",
  "clipboard.protocol": () => "The clipboard protocol is incompatible",
  "clipboard.unsupported": () =>
    "This device does not support the current clipboard helper",
  "adb.executeFailed": () => "Cannot execute adb",
  "device.listWorkerFailed": () => "The device list task failed",
  "adb.commandFailed": ({ status }) => `ADB command failed (${status})`,
  "adb.resourcesFailed": () => "Cannot locate application resources",
  "adb.metadataFailed": () => "Cannot read adb file information",
  "adb.permissionsFailed": () => "Cannot set adb executable permissions",
  "adb.locateFailed": () => "Cannot locate adb",
  "adb.resourceMetadataFailed": () =>
    "Cannot read the application resource directory",
  "adb.shutdownFailed": ({ pids }) =>
    `The bundled ADB server did not exit within 3 seconds (PIDs: ${pids})`,
  "adb.enumerateProcessesFailed": () => "Cannot enumerate Windows processes",
  "helper.resourcesFailed": () => "Cannot locate application resources",
  "helper.dexMissing": ({ path }) =>
    `Bundled app-info.dex is missing (${path}). Run scripts/build-app-info-dex/build.sh before packaging`,
  "helper.cleanupFailed": () => "Cannot clean up the temporary DEX",
  "helper.inspectDex": () => "Cannot inspect the device DEX",
  "helper.publishDex": () => "Cannot publish the helper DEX",
  "helper.operationTimeout": () => "The device helper operation timed out",
  "apps.installWorkerFailed": () => "The APK installation task failed",
  "apps.noLaunchActivity": ({ pkg }) =>
    `Cannot find a launch Activity for ${pkg}`,
  "apps.iconFailed": () => "Cannot read the application icon",
  "keys.unsupported": ({ action }) => `Unsupported key action: ${action}`,
  "image.accessFailed": ({ path }) => `Cannot access the image file ${path}`,
  "image.unsupportedExtension": ({ extension }) =>
    `Unsupported image format: .${extension}`,
  "image.metadataFailed": () => "Cannot read image file information",
  "image.readFailed": () => "Cannot read the image file",
  "screenshot.workerFailed": () => "The screenshot task failed",
  "screenshot.invalidPng": () => "The screenshot PNG is invalid",
  "screenshot.decodeFailed": () => "Cannot decode the screenshot",
  "screenshot.copyFailed": () => "Cannot copy the screenshot",
  "screenshot.captureFailed": () => "Cannot capture the device screen",
  "report.directoryFailed": () => "Cannot create the report folder",
  "report.writeLogcatFailed": () => "Cannot write logcat.txt",
  "report.writeInfoFailed": () => "Cannot write info.txt",
  "report.workerFailed": () => "The bugreport task failed",
  "report.collectFailed": () => "Cannot collect the bugreport",
  "report.readFailed": () => "Cannot read the bugreport file",
  "report.lockFailed": () => "Cannot lock the bugreport state",
  "report.screenshotFailed": () => "Cannot capture the report screenshot",
  "report.writeScreenshotFailed": () => "Cannot write screenshot.png",
  "wifi.tcpipFailed": () => "Cannot enable tcpip mode",
  "wifi.readIpFailed": () => "Cannot read the WiFi IP address",
  "wifi.staleCleanupFailed": ({ address }) =>
    `Device ${address} did not come online, and the stale connection could not be removed`,
  "wifi.reconnectFailed": ({ address }) =>
    `Device ${address} did not come online, and reconnection failed`,
  "wifi.stillUnavailable": ({ address }) =>
    `Device ${address} is still unavailable after reconnection`,
  "wifi.connectFailed": () => "Cannot connect to the device",
  "cache.directoryUnavailable": () =>
    "Cannot locate the application cache folder",
  "cache.serializeFailed": () => "Cannot serialize the application cache index",
  "cache.createFailed": ({ path }) =>
    `Cannot create the application cache folder (${path})`,
  "cache.pruneFailed": ({ path }) =>
    `Cannot prune application cache icons (${path})`,
  "cache.writeIconFailed": ({ path }) =>
    `Cannot write an application cache icon (${path})`,
  "cache.writeIndexFailed": ({ path }) =>
    `Cannot write the application cache index (${path})`,
  "cache.replaceIndexFailed": ({ path }) =>
    `Cannot replace the application cache index (${path})`,
  "image.tooLarge": ({ bytes }) =>
    `The image file exceeds the 64 MiB size limit: ${bytes} bytes`,
  "wifi.unknownState": () => "The ADB state is unknown",
  "wifi.unexpectedState": ({ state }) => `The ADB state is ${state}`,
  "apps.metadataFailed": () => "Cannot read application information",
  "apps.iconsFailed": () => "Cannot read application icons",
  "apps.readDexFailed": ({ path }) =>
    `Cannot read the bundled app-info.dex (${path})`,
  "apps.refreshDexFailed": () => "Refreshing app-info.dex also failed",
  "helper.startFailed": () => "Cannot start the device helper",
  "helper.waitFailed": () => "Cannot wait for the device helper",
  "helper.timeoutRefresh": ({ seconds }) =>
    `The device helper timed out after ${seconds} seconds. Retry to refresh its DEX`,
  "helper.freshDexFailed": () =>
    "The helper failed after a fresh DEX push. The device ROM may be incompatible",
  "helper.cachedDexFailed": () =>
    "The helper failed while using the cached DEX",
  "helper.pushRetryFailed": () =>
    "The app-info DEX push and its retry both failed",
  "apps.emptyOutput": () => "The app-info helper returned empty output",
  "apps.invalidIconPackages": () =>
    "No valid package names were supplied for icon lookup",
  "apps.invalidJson": () => "The app-info helper returned invalid JSON",
  "metrics.missingCpuRow": () => "CPU frame is missing the aggregate cpu row",
  "metrics.missingCpuCounters": () => "CPU frame has fewer than four counters",
  "metrics.cpuTotalOverflow": () => "CPU counter total overflowed",
  "metrics.cpuIdleOverflow": () => "CPU idle counter overflowed",
  "metrics.missingMemTotal": () => "Memory frame is missing MemTotal",
  "metrics.missingMemAvailable": () =>
    "Memory frame is missing MemAvailable and its fallback fields",
  "metrics.missingProcessOpen": () => "process stat is missing '('",
  "metrics.missingProcessClose": () => "process stat is missing ')'",
  "metrics.invalidPid": () => "process stat has an invalid pid",
  "metrics.missingProcessFields": () => "process stat has too few fields",
  "metrics.missingCpuData": () => "Metrics frame is missing CPU data",
  "metrics.shuttingDown": () =>
    "Device metrics session rejected: application is shutting down",
  "metrics.sessionIdExhausted": () => "Device metrics session ID exhausted",
  "metrics.missingStdout": () => "Failed to capture device metrics stdout",
  "metrics.missingStderr": () => "Failed to capture device metrics stderr",
  "metrics.invalidCpuCounter": ({ value }) => `Invalid CPU counter: ${value}`,
  "metrics.invalidUtime": () => "Invalid process utime",
  "metrics.invalidStime": () => "Invalid process stime",
  "metrics.invalidRss": () => "Invalid process rss",
  "metrics.invalidStartTime": () => "Invalid process start time",
  "metrics.startFailed": () => "Failed to start device metrics",
  "logcat.missingProcessHeaders": () =>
    "Process table is missing PID and NAME/CMD/COMMAND headers",
  "logcat.shuttingDown": () =>
    "Logcat session rejected: application is shutting down",
  "logcat.sessionIdExhausted": () => "Logcat session ID exhausted",
  "logcat.missingStdout": () => "Failed to capture logcat stdout",
  "logcat.missingStderr": () => "Failed to capture logcat stderr",
  "logcat.parseProcessFailed": () => "Cannot parse the device process table",
  "logcat.createDirectoryFailed": () => "Cannot create the log save folder",
  "logcat.writeFailed": () => "Cannot write the log file",
  "logcat.startFailed": () => "Cannot start Logcat",
  "logcat.stopAllFailed": ({ failed, total }) =>
    `Failed to stop ${failed} of ${total} Logcat sessions`,
  "logcat.waitFailed": () => "Cannot wait for the logcat process",
  "logcat.waitTimeout": () => "Waiting for the logcat process timed out",
  "logcat.killFailed": () => "Cannot terminate the logcat process",
  "logcat.readFailed": () => "Cannot read logcat output",
  "logcat.eof": () => "Logcat process exited (stdout EOF)",
  "logcat.superseded": () =>
    "Another logcat session became active while restarting",
  "logcat.stopFailed": ({ session }) =>
    `Cannot stop the logcat session ${session}`,
  "logcat.rejected": ({ session }) => `Logcat session ${session} was rejected`,
  "metrics.waitFailed": () => "Cannot wait for the metrics process",
  "metrics.waitTimeout": () => "Waiting for the metrics process timed out",
  "metrics.killFailed": () => "Cannot terminate the metrics process",
  "metrics.readFailed": () => "Cannot read metrics output",
  "metrics.eof": () => "Device metrics process exited (stdout EOF)",
  "metrics.superseded": () =>
    "Another metrics session became active while restarting",
  "metrics.stopFailed": ({ session }) =>
    `Cannot stop the metrics session ${session}`,
  "metrics.rejected": ({ session }) =>
    `Device metrics session ${session} was rejected`,
  "clipboard.invalidImageDimensions": () =>
    "Clipboard image dimensions are invalid",
} satisfies BackendErrorMessages;

export const backendDialogsEn = {
  captureDirectory: "Choose a screenshot and recording folder",
  recordingSaveAs: "Save recording as",
  discard: "Discard recording",
  cancel: "Cancel",
  restoreBody:
    "Restore all settings to their defaults? Saved screenshots, recordings and files will not be affected.",
  restoreTitle: "Restore default settings",
  restoreAll: "Restore all",
  uploadFiles: "Choose files to upload to the device",
  decodeImages: "Choose images to decode",
  images: "Images",
  saveDeviceFile: "Save device file",
  selectApk: "Select APK",
  discardBody: ({
    serial,
    remotePath,
  }: {
    serial: string;
    remotePath: string;
  }) =>
    `Discard the unsaved recording and delete its source file from the device?\n${serial}\n${remotePath}\nThis cannot be undone.`,
} satisfies typeof backendDialogsZh;
