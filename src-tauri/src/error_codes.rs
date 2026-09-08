// Stable IPC error codes. Keep the frontend backendErrorContract and catalogs in sync.
pub const FILES_KIND_NOT_UTF8: &str = "files.kindNotUtf8";
pub const FILES_SIZE_NOT_UTF8: &str = "files.sizeNotUtf8";
pub const FILES_MODIFIED_NOT_UTF8: &str = "files.modifiedNotUtf8";
pub const FILES_PATH_NOT_UTF8: &str = "files.pathNotUtf8";
pub const ADB_COMMAND_FAILED: &str = "adb.commandFailed";
#[cfg(windows)]
pub const ADB_ENUMERATE_PROCESSES_FAILED: &str = "adb.enumerateProcessesFailed";
pub const ADB_EXECUTE_FAILED: &str = "adb.executeFailed";
pub const ADB_LOCATE_FAILED: &str = "adb.locateFailed";
#[cfg(unix)]
pub const ADB_METADATA_FAILED: &str = "adb.metadataFailed";
pub const ADB_NOT_FOUND: &str = "adb.notFound";
pub const ADB_NOT_IN_PATH: &str = "adb.notInPath";
#[cfg(unix)]
pub const ADB_PERMISSIONS_FAILED: &str = "adb.permissionsFailed";
#[cfg(windows)]
pub const ADB_RESOURCE_METADATA_FAILED: &str = "adb.resourceMetadataFailed";
pub const ADB_RESOURCES_FAILED: &str = "adb.resourcesFailed";
#[cfg(windows)]
pub const ADB_SHUTDOWN_FAILED: &str = "adb.shutdownFailed";
pub const ADB_SHUTTING_DOWN: &str = "adb.shuttingDown";
pub const APPS_EMPTY_OUTPUT: &str = "apps.emptyOutput";
pub const APPS_ICON_FAILED: &str = "apps.iconFailed";
pub const APPS_ICONS_FAILED: &str = "apps.iconsFailed";
pub const APPS_INSTALL_WORKER_FAILED: &str = "apps.installWorkerFailed";
pub const APPS_INVALID_ICON_PACKAGES: &str = "apps.invalidIconPackages";
pub const APPS_INVALID_JSON: &str = "apps.invalidJson";
pub const APPS_METADATA_FAILED: &str = "apps.metadataFailed";
pub const APPS_NO_LAUNCH_ACTIVITY: &str = "apps.noLaunchActivity";
pub const APPS_READ_DEX_FAILED: &str = "apps.readDexFailed";
pub const APPS_REFRESH_DEX_FAILED: &str = "apps.refreshDexFailed";
pub const CACHE_CREATE_FAILED: &str = "cache.createFailed";
pub const CACHE_DIRECTORY_UNAVAILABLE: &str = "cache.directoryUnavailable";
pub const CACHE_PRUNE_FAILED: &str = "cache.pruneFailed";
pub const CACHE_REPLACE_INDEX_FAILED: &str = "cache.replaceIndexFailed";
pub const CACHE_SERIALIZE_FAILED: &str = "cache.serializeFailed";
pub const CACHE_WRITE_ICON_FAILED: &str = "cache.writeIconFailed";
pub const CACHE_WRITE_INDEX_FAILED: &str = "cache.writeIndexFailed";
pub const CAPTURE_ABSOLUTE_DIRECTORY: &str = "capture.absoluteDirectory";
pub const CAPTURE_CLOCK_FAILED: &str = "capture.clockFailed";
pub const CAPTURE_CREATE_DEFAULT_FAILED: &str = "capture.createDefaultFailed";
pub const CAPTURE_DIRECTORY_UNAVAILABLE: &str = "capture.directoryUnavailable";
pub const CAPTURE_MISSING_PARENT: &str = "capture.missingParent";
pub const CAPTURE_NOT_DIRECTORY: &str = "capture.notDirectory";
pub const CAPTURE_PICTURES_UNAVAILABLE: &str = "capture.picturesUnavailable";
pub const CAPTURE_PREPARE_FAILED: &str = "capture.prepareFailed";
pub const CAPTURE_PROBE_CLEANUP: &str = "capture.probeCleanup";
pub const CAPTURE_PUBLISH_FAILED: &str = "capture.publishFailed";
pub const CAPTURE_SIZE_MISMATCH: &str = "capture.sizeMismatch";
pub const CAPTURE_SYNC_FAILED: &str = "capture.syncFailed";
pub const CAPTURE_TEMP_FAILED: &str = "capture.tempFailed";
pub const CAPTURE_VERIFY_FAILED: &str = "capture.verifyFailed";
pub const CAPTURE_WRITE_FAILED: &str = "capture.writeFailed";
pub const CLIPBOARD_ABNORMAL_EXIT: &str = "clipboard.abnormalExit";
pub const CLIPBOARD_DEVICE_NO_TEXT: &str = "clipboard.deviceNoText";
pub const CLIPBOARD_ENCODE_FAILED: &str = "clipboard.encodeFailed";
pub const CLIPBOARD_INVALID_RESPONSE: &str = "clipboard.invalidResponse";
pub const CLIPBOARD_KILL_FAILED: &str = "clipboard.killFailed";
pub const CLIPBOARD_LOCKED: &str = "clipboard.locked";
pub const CLIPBOARD_MISSING_STDERR: &str = "clipboard.missingStderr";
pub const CLIPBOARD_MISSING_STDIN: &str = "clipboard.missingStdin";
pub const CLIPBOARD_MISSING_STDOUT: &str = "clipboard.missingStdout";
pub const CLIPBOARD_NO_TEXT: &str = "clipboard.noText";
pub const CLIPBOARD_OUTPUT_TOO_LARGE: &str = "clipboard.outputTooLarge";
pub const CLIPBOARD_PERMISSION: &str = "clipboard.permission";
pub const CLIPBOARD_PREPARE_DEX_FAILED: &str = "clipboard.prepareDexFailed";
pub const CLIPBOARD_PROTOCOL: &str = "clipboard.protocol";
pub const CLIPBOARD_READ_DEX_FAILED: &str = "clipboard.readDexFailed";
pub const CLIPBOARD_READ_OUTPUT_FAILED: &str = "clipboard.readOutputFailed";
pub const CLIPBOARD_REAP_FAILED: &str = "clipboard.reapFailed";
pub const CLIPBOARD_SEND_FAILED: &str = "clipboard.sendFailed";
pub const CLIPBOARD_START_FAILED: &str = "clipboard.startFailed";
pub const CLIPBOARD_TIMEOUT: &str = "clipboard.timeout";
pub const CLIPBOARD_TOO_LARGE: &str = "clipboard.tooLarge";
pub const CLIPBOARD_UNSUPPORTED: &str = "clipboard.unsupported";
pub const CLIPBOARD_UNVERIFIED: &str = "clipboard.unverified";
pub const CLIPBOARD_USER: &str = "clipboard.user";
pub const CLIPBOARD_WAIT_FAILED: &str = "clipboard.waitFailed";
pub const CLIPBOARD_WRITE_UNCONFIRMED: &str = "clipboard.writeUnconfirmed";
pub const DEVICE_LIST_WORKER_FAILED: &str = "device.listWorkerFailed";
pub const FILES_ABSOLUTE_DEVICE_PATH: &str = "files.absoluteDevicePath";
pub const FILES_ABSOLUTE_SAVE_PATH: &str = "files.absoluteSavePath";
pub const FILES_BACKUP_FAILED: &str = "files.backupFailed";
pub const FILES_CHECK_UPLOAD_DIRECTORY: &str = "files.checkUploadDirectory";
pub const FILES_CLOCK_FAILED: &str = "files.clockFailed";
pub const FILES_CREATE_FAILED: &str = "files.createFailed";
pub const FILES_CREATE_TEMP_FAILED: &str = "files.createTempFailed";
pub const FILES_CREATE_WORKER_FAILED: &str = "files.createWorkerFailed";
pub const FILES_CREATED_DIRECTORY_MISSING: &str = "files.createdDirectoryMissing";
pub const FILES_DEVICE_NAME_UNAVAILABLE: &str = "files.deviceNameUnavailable";
pub const FILES_DIRECTORY_PERMISSION: &str = "files.directoryPermission";
pub const FILES_DOWNLOAD_FAILED: &str = "files.downloadFailed";
pub const FILES_DOWNLOAD_SIZE_MISMATCH: &str = "files.downloadSizeMismatch";
pub const FILES_DOWNLOAD_WORKER_FAILED: &str = "files.downloadWorkerFailed";
pub const FILES_EMPTY_NAME: &str = "files.emptyName";
pub const FILES_EXISTS_FAILED: &str = "files.existsFailed";
pub const FILES_IMAGE_INCOMPLETE: &str = "files.imageIncomplete";
pub const FILES_INSPECT_BACKUP_FAILED: &str = "files.inspectBackupFailed";
pub const FILES_INSPECT_TARGET_FAILED: &str = "files.inspectTargetFailed";
pub const FILES_INVALID_FIELD_COUNT: &str = "files.invalidFieldCount";
pub const FILES_INVALID_MODIFIED_AT: &str = "files.invalidModifiedAt";
pub const FILES_INVALID_NAME: &str = "files.invalidName";
pub const FILES_INVALID_SIZE: &str = "files.invalidSize";
pub const FILES_LIST_FAILED: &str = "files.listFailed";
pub const FILES_LIST_WORKER_FAILED: &str = "files.listWorkerFailed";
pub const FILES_LOCAL_NAME_UNAVAILABLE: &str = "files.localNameUnavailable";
pub const FILES_MISSING_DELIMITER: &str = "files.missingDelimiter";
pub const FILES_MISSING_SAVE_NAME: &str = "files.missingSaveName";
pub const FILES_MISSING_SAVE_PARENT: &str = "files.missingSaveParent";
pub const FILES_NOT_DIRECTORY: &str = "files.notDirectory";
pub const FILES_NOT_FILE: &str = "files.notFile";
pub const FILES_OUT_OF_SCOPE: &str = "files.outOfScope";
pub const FILES_PATH_ABOVE_ROOT: &str = "files.pathAboveRoot";
pub const FILES_PATH_CONTAINS_NUL: &str = "files.pathContainsNul";
pub const FILES_PREVIEW_FORMAT: &str = "files.previewFormat";
pub const FILES_PREVIEW_READ_TOO_LARGE: &str = "files.previewReadTooLarge";
pub const FILES_PREVIEW_TOO_LARGE: &str = "files.previewTooLarge";
pub const FILES_PREVIEW_WORKER_FAILED: &str = "files.previewWorkerFailed";
pub const FILES_READ_IMAGE_FAILED: &str = "files.readImageFailed";
pub const FILES_READ_LOCAL_FAILED: &str = "files.readLocalFailed";
pub const FILES_READ_TEMP_FAILED: &str = "files.readTempFailed";
pub const FILES_REMOTE_SIZE_FAILED: &str = "files.remoteSizeFailed";
pub const FILES_RESTORE_FAILED: &str = "files.restoreFailed";
pub const FILES_SAVE_FAILED: &str = "files.saveFailed";
pub const FILES_SAVE_NAME_UNAVAILABLE: &str = "files.saveNameUnavailable";
pub const FILES_SAVE_PARENT_MISSING: &str = "files.saveParentMissing";
pub const FILES_SAVE_PATH_DIRECTORY: &str = "files.savePathDirectory";
pub const FILES_SAVE_RESTORED: &str = "files.saveRestored";
pub const FILES_UNIQUE_BACKUP_FAILED: &str = "files.uniqueBackupFailed";
pub const FILES_UNIQUE_REMOTE_NAME_FAILED: &str = "files.uniqueRemoteNameFailed";
pub const FILES_UNIQUE_TEMP_FAILED: &str = "files.uniqueTempFailed";
pub const FILES_UNKNOWN_KIND: &str = "files.unknownKind";
pub const FILES_UPLOAD_FAILED: &str = "files.uploadFailed";
pub const FILES_UPLOAD_REGULAR_ONLY: &str = "files.uploadRegularOnly";
pub const FILES_UPLOAD_WORKER_FAILED: &str = "files.uploadWorkerFailed";
pub const HELPER_CACHED_DEX_FAILED: &str = "helper.cachedDexFailed";
pub const HELPER_CLEANUP_FAILED: &str = "helper.cleanupFailed";
pub const HELPER_DEPLOYMENT_TIMEOUT: &str = "helper.deploymentTimeout";
pub const HELPER_DEX_MISSING: &str = "helper.dexMissing";
pub const HELPER_FRESH_DEX_FAILED: &str = "helper.freshDexFailed";
pub const HELPER_INSPECT_DEX: &str = "helper.inspectDex";
pub const HELPER_OPERATION_TIMEOUT: &str = "helper.operationTimeout";
pub const HELPER_PUBLISH_DEX: &str = "helper.publishDex";
pub const HELPER_PUSH_RETRY_FAILED: &str = "helper.pushRetryFailed";
pub const HELPER_RESOURCES_FAILED: &str = "helper.resourcesFailed";
pub const HELPER_START_FAILED: &str = "helper.startFailed";
pub const HELPER_TIMEOUT_REFRESH: &str = "helper.timeoutRefresh";
pub const HELPER_WAIT_FAILED: &str = "helper.waitFailed";
pub const IMAGE_ACCESS_FAILED: &str = "image.accessFailed";
pub const IMAGE_METADATA_FAILED: &str = "image.metadataFailed";
pub const IMAGE_MISSING_EXTENSION: &str = "image.missingExtension";
pub const IMAGE_NOT_REGULAR_FILE: &str = "image.notRegularFile";
pub const IMAGE_READ_FAILED: &str = "image.readFailed";
pub const IMAGE_TOO_LARGE: &str = "image.tooLarge";
pub const IMAGE_UNSUPPORTED_EXTENSION: &str = "image.unsupportedExtension";
pub const KEYS_UNSUPPORTED: &str = "keys.unsupported";
pub const LOGCAT_CREATE_DIRECTORY_FAILED: &str = "logcat.createDirectoryFailed";
pub const LOGCAT_EOF: &str = "logcat.eof";
pub const LOGCAT_KILL_FAILED: &str = "logcat.killFailed";
pub const LOGCAT_MISSING_PROCESS_HEADERS: &str = "logcat.missingProcessHeaders";
pub const LOGCAT_MISSING_STDERR: &str = "logcat.missingStderr";
pub const LOGCAT_MISSING_STDOUT: &str = "logcat.missingStdout";
pub const LOGCAT_PARSE_PROCESS_FAILED: &str = "logcat.parseProcessFailed";
pub const LOGCAT_READ_FAILED: &str = "logcat.readFailed";
pub const LOGCAT_REJECTED: &str = "logcat.rejected";
pub const LOGCAT_SESSION_ID_EXHAUSTED: &str = "logcat.sessionIdExhausted";
pub const LOGCAT_SHUTTING_DOWN: &str = "logcat.shuttingDown";
pub const LOGCAT_START_FAILED: &str = "logcat.startFailed";
pub const LOGCAT_STOP_ALL_FAILED: &str = "logcat.stopAllFailed";
pub const LOGCAT_STOP_FAILED: &str = "logcat.stopFailed";
pub const LOGCAT_SUPERSEDED: &str = "logcat.superseded";
pub const LOGCAT_WAIT_FAILED: &str = "logcat.waitFailed";
pub const LOGCAT_WAIT_TIMEOUT: &str = "logcat.waitTimeout";
pub const LOGCAT_WRITE_FAILED: &str = "logcat.writeFailed";
pub const METRICS_CPU_IDLE_OVERFLOW: &str = "metrics.cpuIdleOverflow";
pub const METRICS_CPU_TOTAL_OVERFLOW: &str = "metrics.cpuTotalOverflow";
pub const METRICS_EOF: &str = "metrics.eof";
pub const METRICS_INVALID_CPU_COUNTER: &str = "metrics.invalidCpuCounter";
pub const METRICS_INVALID_PID: &str = "metrics.invalidPid";
pub const METRICS_INVALID_RSS: &str = "metrics.invalidRss";
pub const METRICS_INVALID_START_TIME: &str = "metrics.invalidStartTime";
pub const METRICS_INVALID_STIME: &str = "metrics.invalidStime";
pub const METRICS_INVALID_UTIME: &str = "metrics.invalidUtime";
pub const METRICS_KILL_FAILED: &str = "metrics.killFailed";
pub const METRICS_MISSING_CPU_COUNTERS: &str = "metrics.missingCpuCounters";
pub const METRICS_MISSING_CPU_DATA: &str = "metrics.missingCpuData";
pub const METRICS_MISSING_CPU_ROW: &str = "metrics.missingCpuRow";
pub const METRICS_MISSING_MEM_AVAILABLE: &str = "metrics.missingMemAvailable";
pub const METRICS_MISSING_MEM_TOTAL: &str = "metrics.missingMemTotal";
pub const METRICS_MISSING_PROCESS_CLOSE: &str = "metrics.missingProcessClose";
pub const METRICS_MISSING_PROCESS_FIELDS: &str = "metrics.missingProcessFields";
pub const METRICS_MISSING_PROCESS_OPEN: &str = "metrics.missingProcessOpen";
pub const METRICS_MISSING_STDERR: &str = "metrics.missingStderr";
pub const METRICS_MISSING_STDOUT: &str = "metrics.missingStdout";
pub const METRICS_READ_FAILED: &str = "metrics.readFailed";
pub const METRICS_REJECTED: &str = "metrics.rejected";
pub const METRICS_SESSION_ID_EXHAUSTED: &str = "metrics.sessionIdExhausted";
pub const METRICS_SHUTTING_DOWN: &str = "metrics.shuttingDown";
pub const METRICS_START_FAILED: &str = "metrics.startFailed";
pub const METRICS_STOP_FAILED: &str = "metrics.stopFailed";
pub const METRICS_SUPERSEDED: &str = "metrics.superseded";
pub const METRICS_WAIT_FAILED: &str = "metrics.waitFailed";
pub const METRICS_WAIT_TIMEOUT: &str = "metrics.waitTimeout";
pub const PORTS_INVALID_DIRECTION: &str = "ports.invalidDirection";
pub const PORTS_INVALID_PORT: &str = "ports.invalidPort";
pub const RECORDING_BUSY: &str = "recording.busy";
pub const RECORDING_CLEANUP_FAILED: &str = "recording.cleanupFailed";
pub const RECORDING_CONFIRM_STOP_FAILED: &str = "recording.confirmStopFailed";
pub const RECORDING_DISCARD_WORKER_FAILED: &str = "recording.discardWorkerFailed";
pub const RECORDING_EMPTY_SOURCE: &str = "recording.emptySource";
pub const RECORDING_EXISTING_SESSION: &str = "recording.existingSession";
pub const RECORDING_INSPECT_PROCESS_FAILED: &str = "recording.inspectProcessFailed";
pub const RECORDING_INSPECT_SOURCE_FAILED: &str = "recording.inspectSourceFailed";
pub const RECORDING_INVALID_PID: &str = "recording.invalidPid";
pub const RECORDING_KILL_HOST_FAILED: &str = "recording.killHostFailed";
pub const RECORDING_PROCESS_FAILED: &str = "recording.processFailed";
pub const RECORDING_PULL_FAILED: &str = "recording.pullFailed";
pub const RECORDING_QUERY_PROCESS_FAILED: &str = "recording.queryProcessFailed";
pub const RECORDING_READ_ERROR_FAILED: &str = "recording.readErrorFailed";
pub const RECORDING_READ_SESSION_FAILED: &str = "recording.readSessionFailed";
pub const RECORDING_RELEASE_SESSION_FAILED: &str = "recording.releaseSessionFailed";
pub const RECORDING_SAVE_WORKER_FAILED: &str = "recording.saveWorkerFailed";
pub const RECORDING_SESSION_CHANGED: &str = "recording.sessionChanged";
pub const RECORDING_SOURCE_CLEANUP_FAILED: &str = "recording.sourceCleanupFailed";
pub const RECORDING_START_FAILED: &str = "recording.startFailed";
pub const RECORDING_START_WORKER_FAILED: &str = "recording.startWorkerFailed";
pub const RECORDING_STOP_FAILED: &str = "recording.stopFailed";
pub const RECORDING_STOP_TIMEOUT: &str = "recording.stopTimeout";
pub const RECORDING_UPDATE_SESSION_FAILED: &str = "recording.updateSessionFailed";
pub const RECORDING_WAIT_HOST_FAILED: &str = "recording.waitHostFailed";
pub const RECORDING_WAIT_STOP_FAILED: &str = "recording.waitStopFailed";
pub const REPORT_BUSY: &str = "report.busy";
pub const REPORT_COLLECT_FAILED: &str = "report.collectFailed";
pub const REPORT_DIRECTORY_FAILED: &str = "report.directoryFailed";
pub const REPORT_EMPTY_BUGREPORT: &str = "report.emptyBugreport";
pub const REPORT_EMPTY_SCREENSHOT: &str = "report.emptyScreenshot";
pub const REPORT_LOCK_FAILED: &str = "report.lockFailed";
pub const REPORT_READ_FAILED: &str = "report.readFailed";
pub const REPORT_SCREENSHOT_FAILED: &str = "report.screenshotFailed";
pub const REPORT_WORKER_FAILED: &str = "report.workerFailed";
pub const REPORT_WRITE_INFO_FAILED: &str = "report.writeInfoFailed";
pub const REPORT_WRITE_LOGCAT_FAILED: &str = "report.writeLogcatFailed";
pub const REPORT_WRITE_SCREENSHOT_FAILED: &str = "report.writeScreenshotFailed";
pub const SCREENSHOT_CAPTURE_FAILED: &str = "screenshot.captureFailed";
pub const SCREENSHOT_COPY_FAILED: &str = "screenshot.copyFailed";
pub const SCREENSHOT_DECODE_FAILED: &str = "screenshot.decodeFailed";
pub const SCREENSHOT_INVALID_PNG: &str = "screenshot.invalidPng";
pub const SCREENSHOT_WORKER_FAILED: &str = "screenshot.workerFailed";
pub const WIFI_CONNECT_FAILED: &str = "wifi.connectFailed";
pub const WIFI_EMPTY_ADDRESS: &str = "wifi.emptyAddress";
pub const WIFI_NO_IP: &str = "wifi.noIp";
pub const WIFI_READ_IP_FAILED: &str = "wifi.readIpFailed";
pub const WIFI_RECONNECT_FAILED: &str = "wifi.reconnectFailed";
pub const WIFI_STALE_CLEANUP_FAILED: &str = "wifi.staleCleanupFailed";
pub const WIFI_STILL_UNAVAILABLE: &str = "wifi.stillUnavailable";
pub const WIFI_TCPIP_FAILED: &str = "wifi.tcpipFailed";
pub const WIFI_UNEXPECTED_STATE: &str = "wifi.unexpectedState";
pub const WIFI_UNKNOWN_STATE: &str = "wifi.unknownState";

#[cfg(test)]
pub const ALL: &[&str] = &[
    FILES_KIND_NOT_UTF8,
    FILES_SIZE_NOT_UTF8,
    FILES_MODIFIED_NOT_UTF8,
    FILES_PATH_NOT_UTF8,
    ADB_COMMAND_FAILED,
    #[cfg(windows)]
    ADB_ENUMERATE_PROCESSES_FAILED,
    ADB_EXECUTE_FAILED,
    ADB_LOCATE_FAILED,
    #[cfg(unix)]
    ADB_METADATA_FAILED,
    ADB_NOT_FOUND,
    ADB_NOT_IN_PATH,
    #[cfg(unix)]
    ADB_PERMISSIONS_FAILED,
    #[cfg(windows)]
    ADB_RESOURCE_METADATA_FAILED,
    ADB_RESOURCES_FAILED,
    #[cfg(windows)]
    ADB_SHUTDOWN_FAILED,
    ADB_SHUTTING_DOWN,
    APPS_EMPTY_OUTPUT,
    APPS_ICON_FAILED,
    APPS_ICONS_FAILED,
    APPS_INSTALL_WORKER_FAILED,
    APPS_INVALID_ICON_PACKAGES,
    APPS_INVALID_JSON,
    APPS_METADATA_FAILED,
    APPS_NO_LAUNCH_ACTIVITY,
    APPS_READ_DEX_FAILED,
    APPS_REFRESH_DEX_FAILED,
    CACHE_CREATE_FAILED,
    CACHE_DIRECTORY_UNAVAILABLE,
    CACHE_PRUNE_FAILED,
    CACHE_REPLACE_INDEX_FAILED,
    CACHE_SERIALIZE_FAILED,
    CACHE_WRITE_ICON_FAILED,
    CACHE_WRITE_INDEX_FAILED,
    CAPTURE_ABSOLUTE_DIRECTORY,
    CAPTURE_CLOCK_FAILED,
    CAPTURE_CREATE_DEFAULT_FAILED,
    CAPTURE_DIRECTORY_UNAVAILABLE,
    CAPTURE_MISSING_PARENT,
    CAPTURE_NOT_DIRECTORY,
    CAPTURE_PICTURES_UNAVAILABLE,
    CAPTURE_PREPARE_FAILED,
    CAPTURE_PROBE_CLEANUP,
    CAPTURE_PUBLISH_FAILED,
    CAPTURE_SIZE_MISMATCH,
    CAPTURE_SYNC_FAILED,
    CAPTURE_TEMP_FAILED,
    CAPTURE_VERIFY_FAILED,
    CAPTURE_WRITE_FAILED,
    CLIPBOARD_ABNORMAL_EXIT,
    CLIPBOARD_DEVICE_NO_TEXT,
    CLIPBOARD_ENCODE_FAILED,
    CLIPBOARD_INVALID_RESPONSE,
    CLIPBOARD_KILL_FAILED,
    CLIPBOARD_LOCKED,
    CLIPBOARD_MISSING_STDERR,
    CLIPBOARD_MISSING_STDIN,
    CLIPBOARD_MISSING_STDOUT,
    CLIPBOARD_NO_TEXT,
    CLIPBOARD_OUTPUT_TOO_LARGE,
    CLIPBOARD_PERMISSION,
    CLIPBOARD_PREPARE_DEX_FAILED,
    CLIPBOARD_PROTOCOL,
    CLIPBOARD_READ_DEX_FAILED,
    CLIPBOARD_READ_OUTPUT_FAILED,
    CLIPBOARD_REAP_FAILED,
    CLIPBOARD_SEND_FAILED,
    CLIPBOARD_START_FAILED,
    CLIPBOARD_TIMEOUT,
    CLIPBOARD_TOO_LARGE,
    CLIPBOARD_UNSUPPORTED,
    CLIPBOARD_UNVERIFIED,
    CLIPBOARD_USER,
    CLIPBOARD_WAIT_FAILED,
    CLIPBOARD_WRITE_UNCONFIRMED,
    DEVICE_LIST_WORKER_FAILED,
    FILES_ABSOLUTE_DEVICE_PATH,
    FILES_ABSOLUTE_SAVE_PATH,
    FILES_BACKUP_FAILED,
    FILES_CHECK_UPLOAD_DIRECTORY,
    FILES_CLOCK_FAILED,
    FILES_CREATE_FAILED,
    FILES_CREATE_TEMP_FAILED,
    FILES_CREATE_WORKER_FAILED,
    FILES_CREATED_DIRECTORY_MISSING,
    FILES_DEVICE_NAME_UNAVAILABLE,
    FILES_DIRECTORY_PERMISSION,
    FILES_DOWNLOAD_FAILED,
    FILES_DOWNLOAD_SIZE_MISMATCH,
    FILES_DOWNLOAD_WORKER_FAILED,
    FILES_EMPTY_NAME,
    FILES_EXISTS_FAILED,
    FILES_IMAGE_INCOMPLETE,
    FILES_INSPECT_BACKUP_FAILED,
    FILES_INSPECT_TARGET_FAILED,
    FILES_INVALID_FIELD_COUNT,
    FILES_INVALID_MODIFIED_AT,
    FILES_INVALID_NAME,
    FILES_INVALID_SIZE,
    FILES_LIST_FAILED,
    FILES_LIST_WORKER_FAILED,
    FILES_LOCAL_NAME_UNAVAILABLE,
    FILES_MISSING_DELIMITER,
    FILES_MISSING_SAVE_NAME,
    FILES_MISSING_SAVE_PARENT,
    FILES_NOT_DIRECTORY,
    FILES_NOT_FILE,
    FILES_OUT_OF_SCOPE,
    FILES_PATH_ABOVE_ROOT,
    FILES_PATH_CONTAINS_NUL,
    FILES_PREVIEW_FORMAT,
    FILES_PREVIEW_READ_TOO_LARGE,
    FILES_PREVIEW_TOO_LARGE,
    FILES_PREVIEW_WORKER_FAILED,
    FILES_READ_IMAGE_FAILED,
    FILES_READ_LOCAL_FAILED,
    FILES_READ_TEMP_FAILED,
    FILES_REMOTE_SIZE_FAILED,
    FILES_RESTORE_FAILED,
    FILES_SAVE_FAILED,
    FILES_SAVE_NAME_UNAVAILABLE,
    FILES_SAVE_PARENT_MISSING,
    FILES_SAVE_PATH_DIRECTORY,
    FILES_SAVE_RESTORED,
    FILES_UNIQUE_BACKUP_FAILED,
    FILES_UNIQUE_REMOTE_NAME_FAILED,
    FILES_UNIQUE_TEMP_FAILED,
    FILES_UNKNOWN_KIND,
    FILES_UPLOAD_FAILED,
    FILES_UPLOAD_REGULAR_ONLY,
    FILES_UPLOAD_WORKER_FAILED,
    HELPER_CACHED_DEX_FAILED,
    HELPER_CLEANUP_FAILED,
    HELPER_DEPLOYMENT_TIMEOUT,
    HELPER_DEX_MISSING,
    HELPER_FRESH_DEX_FAILED,
    HELPER_INSPECT_DEX,
    HELPER_OPERATION_TIMEOUT,
    HELPER_PUBLISH_DEX,
    HELPER_PUSH_RETRY_FAILED,
    HELPER_RESOURCES_FAILED,
    HELPER_START_FAILED,
    HELPER_TIMEOUT_REFRESH,
    HELPER_WAIT_FAILED,
    IMAGE_ACCESS_FAILED,
    IMAGE_METADATA_FAILED,
    IMAGE_MISSING_EXTENSION,
    IMAGE_NOT_REGULAR_FILE,
    IMAGE_READ_FAILED,
    IMAGE_TOO_LARGE,
    IMAGE_UNSUPPORTED_EXTENSION,
    KEYS_UNSUPPORTED,
    LOGCAT_CREATE_DIRECTORY_FAILED,
    LOGCAT_EOF,
    LOGCAT_KILL_FAILED,
    LOGCAT_MISSING_PROCESS_HEADERS,
    LOGCAT_MISSING_STDERR,
    LOGCAT_MISSING_STDOUT,
    LOGCAT_PARSE_PROCESS_FAILED,
    LOGCAT_READ_FAILED,
    LOGCAT_REJECTED,
    LOGCAT_SESSION_ID_EXHAUSTED,
    LOGCAT_SHUTTING_DOWN,
    LOGCAT_START_FAILED,
    LOGCAT_STOP_ALL_FAILED,
    LOGCAT_STOP_FAILED,
    LOGCAT_SUPERSEDED,
    LOGCAT_WAIT_FAILED,
    LOGCAT_WAIT_TIMEOUT,
    LOGCAT_WRITE_FAILED,
    METRICS_CPU_IDLE_OVERFLOW,
    METRICS_CPU_TOTAL_OVERFLOW,
    METRICS_EOF,
    METRICS_INVALID_CPU_COUNTER,
    METRICS_INVALID_PID,
    METRICS_INVALID_RSS,
    METRICS_INVALID_START_TIME,
    METRICS_INVALID_STIME,
    METRICS_INVALID_UTIME,
    METRICS_KILL_FAILED,
    METRICS_MISSING_CPU_COUNTERS,
    METRICS_MISSING_CPU_DATA,
    METRICS_MISSING_CPU_ROW,
    METRICS_MISSING_MEM_AVAILABLE,
    METRICS_MISSING_MEM_TOTAL,
    METRICS_MISSING_PROCESS_CLOSE,
    METRICS_MISSING_PROCESS_FIELDS,
    METRICS_MISSING_PROCESS_OPEN,
    METRICS_MISSING_STDERR,
    METRICS_MISSING_STDOUT,
    METRICS_READ_FAILED,
    METRICS_REJECTED,
    METRICS_SESSION_ID_EXHAUSTED,
    METRICS_SHUTTING_DOWN,
    METRICS_START_FAILED,
    METRICS_STOP_FAILED,
    METRICS_SUPERSEDED,
    METRICS_WAIT_FAILED,
    METRICS_WAIT_TIMEOUT,
    PORTS_INVALID_DIRECTION,
    PORTS_INVALID_PORT,
    RECORDING_BUSY,
    RECORDING_CLEANUP_FAILED,
    RECORDING_CONFIRM_STOP_FAILED,
    RECORDING_DISCARD_WORKER_FAILED,
    RECORDING_EMPTY_SOURCE,
    RECORDING_EXISTING_SESSION,
    RECORDING_INSPECT_PROCESS_FAILED,
    RECORDING_INSPECT_SOURCE_FAILED,
    RECORDING_INVALID_PID,
    RECORDING_KILL_HOST_FAILED,
    RECORDING_PROCESS_FAILED,
    RECORDING_PULL_FAILED,
    RECORDING_QUERY_PROCESS_FAILED,
    RECORDING_READ_ERROR_FAILED,
    RECORDING_READ_SESSION_FAILED,
    RECORDING_RELEASE_SESSION_FAILED,
    RECORDING_SAVE_WORKER_FAILED,
    RECORDING_SESSION_CHANGED,
    RECORDING_SOURCE_CLEANUP_FAILED,
    RECORDING_START_FAILED,
    RECORDING_START_WORKER_FAILED,
    RECORDING_STOP_FAILED,
    RECORDING_STOP_TIMEOUT,
    RECORDING_UPDATE_SESSION_FAILED,
    RECORDING_WAIT_HOST_FAILED,
    RECORDING_WAIT_STOP_FAILED,
    REPORT_BUSY,
    REPORT_COLLECT_FAILED,
    REPORT_DIRECTORY_FAILED,
    REPORT_EMPTY_BUGREPORT,
    REPORT_EMPTY_SCREENSHOT,
    REPORT_LOCK_FAILED,
    REPORT_READ_FAILED,
    REPORT_SCREENSHOT_FAILED,
    REPORT_WORKER_FAILED,
    REPORT_WRITE_INFO_FAILED,
    REPORT_WRITE_LOGCAT_FAILED,
    REPORT_WRITE_SCREENSHOT_FAILED,
    SCREENSHOT_CAPTURE_FAILED,
    SCREENSHOT_COPY_FAILED,
    SCREENSHOT_DECODE_FAILED,
    SCREENSHOT_INVALID_PNG,
    SCREENSHOT_WORKER_FAILED,
    WIFI_CONNECT_FAILED,
    WIFI_EMPTY_ADDRESS,
    WIFI_NO_IP,
    WIFI_READ_IP_FAILED,
    WIFI_RECONNECT_FAILED,
    WIFI_STALE_CLEANUP_FAILED,
    WIFI_STILL_UNAVAILABLE,
    WIFI_TCPIP_FAILED,
    WIFI_UNEXPECTED_STATE,
    WIFI_UNKNOWN_STATE,
];
