// Fake Tauri runtime for documentation screenshots.
//
// The page is the real Vite build of the app; only the IPC layer is replaced so
// every pane renders with stable, believable data instead of a live device.
// Injected by scripts/screenshots/capture.mjs before any app code runs.
(() => {
  const USB_SERIAL = "9A271FFAZ004TR";
  const WIFI_SERIAL = "192.168.31.42:5555";
  const SECOND_SERIAL = "23113RKC6C";
  const FRAME_INTERVAL_MS = 1000;
  const BACKFILL_FRAMES = 180;
  const LOG_BACKFILL_LINES = 320;
  const LOG_STEP_MS = 420;
  const LOG_TAIL_INTERVAL_MS = 1200;

  const callbacks = new Map();
  const listeners = new Map();
  let nextCallbackId = 1;
  let nextSessionId = 1;

  function transformCallback(callback, once = false) {
    const id = nextCallbackId++;
    callbacks.set(id, { callback, once });
    return id;
  }

  function emit(event, payload) {
    const ids = listeners.get(event);
    if (!ids) {
      return;
    }
    for (const id of [...ids]) {
      const entry = callbacks.get(id);
      if (!entry) {
        continue;
      }
      if (entry.once) {
        callbacks.delete(id);
        ids.delete(id);
      }
      entry.callback({ event, id, payload });
    }
  }

  // Deterministic noise so repeated runs produce identical charts and logs.
  function makeRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  function drawCanvas(width, height, draw) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext("2d"));
    return canvas.toDataURL("image/png");
  }

  function roundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }

  function appIcon(letter, background) {
    return drawCanvas(96, 96, (context) => {
      context.fillStyle = background;
      roundedRect(context, 0, 0, 96, 96, 22);
      context.fill();
      context.fillStyle = "#ffffff";
      context.font = "600 46px Helvetica, Arial, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(letter, 48, 52);
    });
  }

  // A believable phone screenshot for the file-manager image preview.
  function screenshotPng() {
    return drawCanvas(540, 1170, (context) => {
      context.fillStyle = "#f6f7f9";
      context.fillRect(0, 0, 540, 1170);
      context.fillStyle = "#1f2933";
      context.font = "500 18px Helvetica, Arial, sans-serif";
      context.fillText("9:41", 28, 44);
      context.fillRect(452, 30, 60, 14);

      context.fillStyle = "#1f6feb";
      context.fillRect(0, 64, 540, 150);
      context.fillStyle = "#ffffff";
      context.font = "600 30px Helvetica, Arial, sans-serif";
      context.fillText("Checkout", 28, 130);
      context.font = "400 20px Helvetica, Arial, sans-serif";
      context.fillText("3 items · ¥ 428.00", 28, 172);

      const random = makeRandom(4242);
      for (let row = 0; row < 4; row += 1) {
        const y = 250 + row * 190;
        context.fillStyle = "#ffffff";
        roundedRect(context, 24, y, 492, 160, 16);
        context.fill();
        context.fillStyle = "#dde3ea";
        roundedRect(context, 44, y + 24, 112, 112, 12);
        context.fill();
        context.fillStyle = "#22303c";
        context.fillRect(180, y + 36, 200 + random() * 120, 16);
        context.fillStyle = "#9aa5b1";
        context.fillRect(180, y + 70, 150 + random() * 90, 12);
        context.fillRect(180, y + 94, 110 + random() * 60, 12);
        context.fillStyle = "#1f6feb";
        context.fillRect(180, y + 122, 90, 14);
      }

      context.fillStyle = "#1f6feb";
      roundedRect(context, 24, 1040, 492, 68, 34);
      context.fill();
      context.fillStyle = "#ffffff";
      context.font = "600 22px Helvetica, Arial, sans-serif";
      context.textAlign = "center";
      context.fillText("Pay ¥ 428.00", 270, 1082);
    });
  }

  const DAY = 86_400_000;
  const NOW = Date.parse("2026-03-18T14:26:00Z");

  const DEVICES = [
    {
      serial: USB_SERIAL,
      state: "device",
      model: "Pixel 7",
      transport: "usb",
      is_network: false,
      alias_identity: "Pixel_7",
      device_id: USB_SERIAL,
    },
    {
      serial: WIFI_SERIAL,
      state: "device",
      model: "Pixel 7",
      transport: "network",
      is_network: true,
      alias_identity: "Pixel_7",
      device_id: USB_SERIAL,
    },
    {
      serial: SECOND_SERIAL,
      state: "device",
      model: "Xiaomi 14",
      transport: "usb",
      is_network: false,
      alias_identity: "Xiaomi_14",
      device_id: SECOND_SERIAL,
    },
  ];

  const DEVICE_DETAILS = {
    [USB_SERIAL]: {
      model: "Pixel 7",
      manufacturer: "Google",
      android_version: "14",
      sdk_level: "34",
      abi: "arm64-v8a",
      resolution: "1080x2400",
      density: "420",
      battery_level: "76",
      battery_status: "充电中",
    },
    [SECOND_SERIAL]: {
      model: "Xiaomi 14",
      manufacturer: "Xiaomi",
      android_version: "15",
      sdk_level: "35",
      abi: "arm64-v8a",
      resolution: "1200x2670",
      density: "440",
      battery_level: "63",
      battery_status: "放电中",
    },
  };

  const APPS = [
    ["com.shopdemo.android", "购物 Demo", "3.8.1", 30801, "S", "#1f6feb", 68_432_112],
    ["com.shopdemo.android.debug", "购物 Demo (Debug)", "3.9.0-beta2", 30900, "S", "#8250df", 92_118_004],
    ["com.shopdemo.seller", "商家助手", "2.6.4", 20604, "M", "#0b7285", 54_220_118],
    ["com.example.player", "Media Player", "2.4.0", 20400, "M", "#0f766e", 24_889_310],
    ["com.example.notes", "随手记", "1.12.3", 11203, "N", "#b45309", 12_004_882],
    ["com.example.fitness", "Fit Tracker", "5.2.7", 50207, "F", "#be123c", 41_552_006],
    ["com.example.wallet", "Wallet", "4.0.2", 40002, "W", "#15803d", 33_120_774],
    ["com.example.maps", "离线地图", "9.6.0", 96000, "M", "#0369a1", 128_774_002],
    ["com.example.reader", "Reader", "2.0.9", 20009, "R", "#7c2d12", 18_224_531],
    ["com.example.scanner", "Code Scanner", "1.4.4", 10404, "C", "#4338ca", 9_882_004],
    ["com.example.weather", "天气", "6.1.0", 61000, "W", "#0891b2", 22_441_209],
    ["com.example.podcast", "Podcast", "3.3.1", 30301, "P", "#a21caf", 47_009_338],
    ["com.example.todo", "待办清单", "1.9.0", 10900, "T", "#ca8a04", 8_552_170],
    ["com.example.gallery", "相册", "4.4.2", 40402, "G", "#c2410c", 36_774_190],
    ["com.example.mail", "邮箱", "8.0.5", 80005, "M", "#1d4ed8", 62_118_336],
    ["com.example.browser", "轻浏览器", "7.2.1", 70201, "B", "#334155", 88_442_005],
    ["com.example.translate", "翻译", "3.0.0", 30000, "T", "#047857", 29_118_442],
    ["com.example.camera", "Pro Camera", "2.8.6", 20806, "C", "#7c3aed", 71_009_884],
    ["com.example.music", "音乐盒", "5.5.0", 55000, "Y", "#db2777", 52_331_009],
    ["com.example.vpn", "VPN Client", "1.6.2", 10602, "V", "#0f172a", 14_552_330],
    ["com.example.ide", "Code Editor", "0.9.4", 904, "E", "#075985", 96_118_774],
    ["com.example.bank", "掌上银行", "6.4.1", 60401, "B", "#166534", 78_009_112],
  ].map(([packageName, appName, versionName, versionCode, letter, color, apkSize], index) => ({
    packageName,
    appName,
    versionName,
    versionCode,
    icon: appIcon(letter, color),
    firstInstallTime: NOW - (240 - index * 9) * DAY,
    lastUpdateTime: NOW - (index * 2 + 1) * DAY,
    apkSize,
  }));

  const DIRECTORIES = {
    "/sdcard": [
      ["Alarms", "directory", 4096, 30],
      ["Android", "directory", 4096, 6],
      ["DCIM", "directory", 4096, 2],
      ["Documents", "directory", 4096, 9],
      ["Download", "directory", 4096, 1],
      ["Movies", "directory", 4096, 14],
      ["Music", "directory", 4096, 21],
      ["Pictures", "directory", 4096, 3],
      ["screenshot-20260318-142455.png", "file", 1_842_113, 0.02, true],
      ["screenshot-20260317-093012.png", "file", 1_552_884, 1.1, true],
      ["screenrecord-20260318-141902.mp4", "file", 18_442_009, 0.1],
      ["shopdemo-trace.perfetto-trace", "file", 6_118_244, 0.4],
      ["logcat-checkout-crash.txt", "file", 486_112, 0.06],
      ["upload-manifest.json", "file", 4_812, 1.2],
    ],
    "/sdcard/Download": [
      ["shopdemo-3.9.0-beta2.apk", "file", 92_118_004, 0.3],
      ["crash-2026-03-18.txt", "file", 24_118, 0.05],
      ["ui-mock.png", "file", 412_009, 2.4, true],
    ],
  };

  function directoryListing(path) {
    const target = path && DIRECTORIES[path] ? path : "/sdcard";
    const entries = DIRECTORIES[target].map(([name, kind, size, ageDays, previewable]) => ({
      name,
      path: `${target === "/" ? "" : target}/${name}`,
      kind,
      size,
      modified_at: Math.floor((NOW - ageDays * DAY) / 1000),
      previewable: Boolean(previewable),
    }));
    const parent = target === "/sdcard" ? "/" : target.slice(0, target.lastIndexOf("/")) || "/";
    return { path: target, parent, entries };
  }

  const PROCESSES = [
    ["3182", "system_server"],
    ["4417", "com.android.systemui"],
    ["7781", "com.shopdemo.android"],
    ["7842", "com.shopdemo.android:push"],
    ["6120", "com.google.android.gms"],
    ["5533", "com.android.phone"],
    ["8017", "com.example.player"],
    ["2044", "surfaceflinger"],
    ["2210", "media.codec"],
    ["9033", "logd"],
  ].map(([pid, name]) => ({ pid, name }));

  const METRIC_PROCESSES = [
    ["7781", "com.shopdemo.android", 23.4, 412_880],
    ["3182", "system_server", 11.8, 268_112],
    ["4417", "com.android.systemui", 8.6, 224_540],
    ["2044", "surfaceflinger", 6.9, 96_220],
    ["6120", "com.google.android.gms", 4.2, 188_704],
    ["8017", "com.example.player", 3.5, 142_336],
    ["7842", "com.shopdemo.android:push", 2.1, 76_112],
    ["2210", "media.codec", 1.7, 58_920],
  ];

  // Message factories keep the stream from repeating verbatim line after line.
  const LOG_TEMPLATES = [
    ["D", "OkHttp", (r) => `--> GET https://api.shopdemo.dev/v3/catalog/home?page=${1 + Math.floor(r() * 6)}`],
    ["D", "OkHttp", (r) => `<-- 200 https://api.shopdemo.dev/v3/catalog/home (${(120 + r() * 260).toFixed(0)}ms, ${(8 + r() * 40).toFixed(1)} kB)`],
    ["D", "OkHttp", (r) => `--> POST https://api.shopdemo.dev/v3/checkout/quote (${(1 + r() * 4).toFixed(1)} kB body)`],
    ["W", "OkHttp", (r) => `<-- 429 https://api.shopdemo.dev/v3/checkout/quote (${(600 + r() * 700).toFixed(0)}ms) retry-after=2`],
    ["I", "CheckoutFlow", (r) => `step=${["address", "shipping", "coupon", "payment"][Math.floor(r() * 4)]} valid=true durationMs=${(90 + r() * 900).toFixed(0)}`],
    ["I", "Choreographer", (r) => `Skipped ${(3 + Math.floor(r() * 44))} frames! The application may be doing too much work on its main thread.`],
    ["D", "CartRepository", (r) => `Restored ${1 + Math.floor(r() * 6)} cart items from local cache in ${(6 + r() * 30).toFixed(0)}ms`],
    ["W", "ImageLoader", (r) => `Bitmap ${[1080, 1440, 2160][Math.floor(r() * 3)]}x${[1920, 2560, 2880][Math.floor(r() * 3)]} decoded on main thread, consider downsampling`],
    ["D", "Analytics", (r) => `queue=${4 + Math.floor(r() * 40)} flushed=${4 + Math.floor(r() * 40)} endpoint=events.shopdemo.dev`],
    ["I", "ShopApp", (r) => `Session ${Math.floor(r() * 0xffffff).toString(16).padStart(6, "0")} refreshed, expires in ${(1800 + Math.floor(r() * 3600))}s`],
    ["V", "SyncAdapter", (r) => `Scheduling periodic sync in ${(300 + Math.floor(r() * 20) * 60)}s`],
    ["D", "OrderRepository", (r) => `Local order draft persisted (id=draft-2026-0318-${(100 + Math.floor(r() * 800))})`],
    ["W", "StrictMode", () => "DiskReadViolation on main thread: SharedPreferences#getString"],
    ["E", "CoilLoader", (r) => `Failed to load https://cdn.shopdemo.dev/banner/spring-${1 + Math.floor(r() * 9)}.webp: timeout after 10000ms`],
    ["I", "ActivityManager", (r) => `Displayed com.shopdemo.android/.feature.checkout.CheckoutActivity: +${(180 + r() * 600).toFixed(0)}ms`],
    ["D", "GestureDetector", (r) => `onSingleTapConfirmed x=${(80 + r() * 900).toFixed(0)} y=${(200 + r() * 2000).toFixed(0)}`],
    ["I", "PaymentSheet", () => "Payment methods: [card, wallet, installment]"],
    ["D", "ShopApp", (r) => `Application#onCreate finished in ${(80 + r() * 160).toFixed(0)}ms (${r() > 0.5 ? "cold" : "warm"} start)`],
    ["I", "ConnectivityManager", (r) => `Network capabilities changed: downstream=${(20 + r() * 180).toFixed(0)}Mbps rtt=${(8 + r() * 60).toFixed(0)}ms`],
    ["D", "WorkManager", (r) => `Worker CartSyncWorker finished with SUCCESS in ${(200 + r() * 1800).toFixed(0)}ms`],
  ];

  const CRASH_LINES = [
    ["E", "AndroidRuntime", "FATAL EXCEPTION: main"],
    ["E", "AndroidRuntime", "Process: com.shopdemo.android, PID: 7781"],
    ["E", "AndroidRuntime", "java.lang.IllegalStateException: Checkout session expired before payment confirmation"],
    ["E", "AndroidRuntime", "    at com.shopdemo.checkout.PaymentPresenter.confirm(PaymentPresenter.kt:184)"],
    ["E", "AndroidRuntime", "    at com.shopdemo.checkout.CheckoutActivity.onPayClicked(CheckoutActivity.kt:96)"],
    ["E", "AndroidRuntime", "    at android.view.View.performClick(View.java:7659)"],
    ["E", "AndroidRuntime", "Caused by: java.net.SocketTimeoutException: timeout"],
    ["E", "AndroidRuntime", "    at okhttp3.internal.http2.Http2Stream.waitForIo(Http2Stream.kt:697)"],
    ["E", "AndroidRuntime", "    ... 24 more"],
    ["I", "ActivityManager", "Process com.shopdemo.android (pid 7781) has died: fg  TOP"],
  ];

  function formatLogTime(atMs) {
    const at = new Date(atMs);
    const pad = (value, size = 2) => String(value).padStart(size, "0");
    return `${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}:`
      + `${pad(at.getSeconds())}.${pad(at.getMilliseconds(), 3)}`;
  }

  function makeLogLine(level, tag, message, atMs) {
    const time = formatLogTime(atMs);
    const pid = tag === "ActivityManager" ? "3182" : "7781";
    const tid = tag === "OkHttp" ? "7864" : pid;
    return {
      time,
      level,
      tag,
      pid,
      tid,
      message,
      raw: `${time} ${pid} ${tid} ${level} ${tag}: ${message}`,
    };
  }

  function createLogGenerator(seed, startMs) {
    const random = makeRandom(seed);
    let clock = startMs;
    let previous = -1;
    return () => {
      let index = Math.floor(random() * LOG_TEMPLATES.length);
      if (index === previous) {
        index = (index + 1 + Math.floor(random() * 3)) % LOG_TEMPLATES.length;
      }
      previous = index;
      const [level, tag, build] = LOG_TEMPLATES[index];
      clock += LOG_STEP_MS;
      return makeLogLine(level, tag, build(random), clock);
    };
  }

  const logcatSessions = new Map();
  const metricsSessions = new Map();

  function startLogcatSession(serial) {
    const sessionId = nextSessionId++;
    const timers = [];
    logcatSessions.set(sessionId, { serial, timers });

    const nextLine = createLogGenerator(20260318, NOW - LOG_BACKFILL_LINES * LOG_STEP_MS);
    const lines = [];
    for (let index = 0; index < LOG_BACKFILL_LINES - CRASH_LINES.length; index += 1) {
      lines.push(nextLine());
    }
    let crashAt = NOW - CRASH_LINES.length * LOG_STEP_MS;
    for (const [level, tag, message] of CRASH_LINES) {
      crashAt += LOG_STEP_MS;
      lines.push(makeLogLine(level, tag, message, crashAt));
    }

    // Backfill the buffer, then keep a slow live tail so the stream reads as "实时".
    timers.push(
      setTimeout(() => {
        emit("logcat-batch", { serial, session_id: sessionId, lines });
      }, 120),
    );
    const nextTailLine = createLogGenerator(77777, NOW);
    timers.push(
      setInterval(() => {
        emit("logcat-batch", {
          serial,
          session_id: sessionId,
          lines: [nextTailLine()],
        });
      }, LOG_TAIL_INTERVAL_MS),
    );
    return { serial, session_id: sessionId };
  }

  function metricsFrame(serial, sessionId, atMs, index, random) {
    const cpuWave = Math.sin(index / 9) * 12 + Math.sin(index / 3.5) * 5 + Math.sin(index / 23) * 7;
    const cpu = Math.min(96, Math.max(6, 34 + cpuWave + random() * 9));
    const totalKb = 8_072_704;
    const memoryWave = Math.sin(index / 14) * 300_000
      + Math.sin(index / 5.5) * 90_000
      + Math.sin(index / 41) * 160_000;
    const usedKb = Math.round(4_512_000 + memoryWave + random() * 60_000);
    return {
      serial,
      session_id: sessionId,
      at_ms: atMs,
      cpu: { total_percent: Number(cpu.toFixed(1)), core_count: 8 },
      memory: {
        total_kb: totalKb,
        available_kb: totalKb - usedKb,
        used_kb: usedKb,
      },
      battery: { level: "76", status: "充电中", temperature_c: 31.4 },
      processes: METRIC_PROCESSES.map(([pid, comm, cpuPercent, rssKb], processIndex) => ({
        pid,
        comm,
        cpu_percent: Number(
          Math.max(0.2, cpuPercent + Math.sin(index / 5 + processIndex) * 1.8).toFixed(1),
        ),
        rss_kb: rssKb + Math.round(Math.sin(index / 7 + processIndex) * 4_096),
        is_new: false,
      })),
    };
  }

  function startMetricsSession(serial) {
    const sessionId = nextSessionId++;
    const timers = [];
    metricsSessions.set(sessionId, { serial, timers });
    const random = makeRandom(90210);
    let index = 0;
    timers.push(
      setTimeout(() => {
        const startedAt = Date.now() - BACKFILL_FRAMES * FRAME_INTERVAL_MS;
        for (; index < BACKFILL_FRAMES; index += 1) {
          emit(
            "device-metrics-frame",
            metricsFrame(serial, sessionId, startedAt + index * FRAME_INTERVAL_MS, index, random),
          );
        }
      }, 80),
    );
    timers.push(
      setInterval(() => {
        emit("device-metrics-frame", metricsFrame(serial, sessionId, Date.now(), index, random));
        index += 1;
      }, FRAME_INTERVAL_MS),
    );
    return { serial, session_id: sessionId };
  }

  function stopSession(store, sessionId) {
    const session = store.get(sessionId);
    if (!session) {
      return;
    }
    for (const timer of session.timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    store.delete(sessionId);
  }

  const COMMANDS = {
    get_adb_info: () => ({
      path: "/Users/dev/Library/Android/sdk/platform-tools/adb",
      version: "36.0.0-13206524",
      source: "sdk",
    }),
    list_devices: () => DEVICES,
    get_device_info: ({ serial }) => DEVICE_DETAILS[serial] ?? DEVICE_DETAILS[USB_SERIAL],
    get_current_activity: () => "com.shopdemo.android/.feature.checkout.CheckoutActivity",
    list_device_processes: () => PROCESSES,
    list_packages: () => APPS.map((app) => app.packageName),
    get_installed_apps: () => APPS,
    get_installed_app_icons: ({ packages }) =>
      APPS.filter((app) => !packages || packages.includes(app.packageName)).map((app) => ({
        packageName: app.packageName,
        icon: app.icon,
      })),
    get_app_icon: ({ pkg }) => APPS.find((app) => app.packageName === pkg)?.icon ?? "",
    read_app_info_cache: () => [],
    write_app_info_cache: () => null,
    get_package_pids: () => ["7781"],
    list_device_directory: ({ path }) => directoryListing(path),
    preview_device_image: () => {
      const dataUrl = screenshotPng();
      return {
        data_url: dataUrl,
        mime_type: "image/png",
        size: Math.round((dataUrl.length * 3) / 4),
      };
    },
    list_port_forwards: () => [
      {
        direction: "forward",
        local_port: "8081",
        remote_port: "8081",
        raw: `${USB_SERIAL} tcp:8081 tcp:8081`,
      },
      {
        direction: "reverse",
        local_port: "3000",
        remote_port: "3000",
        raw: `${USB_SERIAL} tcp:3000 tcp:3000`,
      },
    ],
    get_screen_record_status: () => ({
      active: false,
      serial: null,
      elapsed_secs: 0,
      pending_pull: false,
    }),
    start_logcat: ({ serial }) => startLogcatSession(serial),
    stop_logcat: ({ sessionId }) => {
      stopSession(logcatSessions, sessionId);
      return null;
    },
    clear_logcat: () => null,
    start_device_metrics: ({ serial }) => startMetricsSession(serial),
    stop_device_metrics: ({ sessionId }) => {
      stopSession(metricsSessions, sessionId);
      return null;
    },
  };

  function invoke(cmd, args = {}) {
    if (cmd === "plugin:event|listen") {
      const ids = listeners.get(args.event) ?? new Set();
      ids.add(args.handler);
      listeners.set(args.event, ids);
      return Promise.resolve(args.handler);
    }
    if (cmd === "plugin:event|unlisten") {
      listeners.get(args.event)?.delete(args.eventId);
      callbacks.delete(args.eventId);
      return Promise.resolve(null);
    }
    if (cmd === "plugin:updater|check") {
      return Promise.resolve(null);
    }
    if (cmd.startsWith("plugin:window|") || cmd.startsWith("plugin:webview|")) {
      return Promise.resolve(false);
    }
    const handler = COMMANDS[cmd];
    if (!handler) {
      console.warn(`[mock-tauri] unhandled command: ${cmd}`);
      return Promise.resolve(null);
    }
    return Promise.resolve(handler(args));
  }

  window.isTauri = true;
  window.__TAURI_INTERNALS__ = {
    invoke,
    transformCallback,
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main", windowLabel: "main" },
    },
    plugins: { path: { sep: "/", delimiter: ":" } },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: (event, eventId) => {
      listeners.get(event)?.delete(eventId);
    },
  };
})();
