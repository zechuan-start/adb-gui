package com.adbgui.appinfo;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.os.Looper;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.PrintStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Entry point loaded by app_process to collect third-party application metadata. */
public final class Main {
    private static final int ICON_SIZE = 96;
    // Keep this value in sync with app_info.rs PAYLOAD_SENTINEL and rebuild the dex.
    private static final String SENTINEL = "--ADBGUI-APPINFO-V1--";

    private enum Mode {
        FULL,
        METADATA_ONLY,
        ICONS_ONLY
    }

    private static final class Options {
        private Mode mode = Mode.FULL;
        private final Set<String> packageFilter = new HashSet<>();
    }

    private Main() {}

    public static void main(String[] args) {
        PrintStream out = null;
        int exitCode = 0;
        try {
            out = new PrintStream(
                    new BufferedOutputStream(
                            new FileOutputStream(FileDescriptor.out),
                            1 << 16),
                    false,
                    "UTF-8");
            Options options = parseArgs(args);
            Context context = createSystemContext();
            PackageManager packageManager = context.getPackageManager();
            List<PackageInfo> packages = packageManager.getInstalledPackages(0);
            JSONArray result = new JSONArray();

            for (PackageInfo packageInfo : packages) {
                ApplicationInfo application = packageInfo.applicationInfo;
                if (application == null) {
                    continue;
                }
                String packageName = application.packageName;
                if (packageName == null
                        || packageName.length() == 0
                        || (application.flags & ApplicationInfo.FLAG_SYSTEM) != 0) {
                    continue;
                }
                if (!options.packageFilter.isEmpty()
                        && !options.packageFilter.contains(packageName)) {
                    continue;
                }
                result.put(readApplication(packageManager, packageInfo, options.mode));
            }

            out.print(SENTINEL);
            out.print('\n');
            out.print(result.toString());
            out.flush();
        } catch (Throwable error) {
            System.err.println("Failed to collect installed applications: " + error);
            error.printStackTrace(System.err);
            exitCode = 1;
        } finally {
            if (out != null) {
                out.flush();
            }
            System.err.flush();
        }

        if (exitCode != 0) {
            System.exit(exitCode);
        }
    }

    private static Options parseArgs(String[] args) {
        Options options = new Options();
        if (args == null) {
            return options;
        }
        for (String argument : args) {
            if ("--no-icons".equals(argument)) {
                options.mode = Mode.METADATA_ONLY;
            } else if ("--icons-only".equals(argument)) {
                options.mode = Mode.ICONS_ONLY;
            } else if (argument != null && !argument.startsWith("--")) {
                options.packageFilter.add(argument);
            }
        }
        return options;
    }

    private static Context createSystemContext() throws Exception {
        // app_process does not prepare the main looper before invoking this entry point,
        // while ActivityThread creates handlers during its framework bootstrap.
        if (Looper.myLooper() == null) {
            Looper.prepareMainLooper();
        }

        // ActivityThread is hidden from the SDK stubs, so resolve both bootstrap paths at runtime.
        Class<?> activityThreadClass = Class.forName("android.app.ActivityThread");
        try {
            return systemMainContext(activityThreadClass);
        } catch (Throwable primaryError) {
            reportBootstrapFailure("ActivityThread.systemMain()", primaryError);
            try {
                return lightweightContext(activityThreadClass);
            } catch (Throwable fallbackError) {
                reportBootstrapFailure("ActivityThread constructor", fallbackError);
                throw new IllegalStateException(
                        "Unable to obtain a system context; see stderr for both attempts.",
                        fallbackError);
            }
        }
    }

    private static Context systemMainContext(Class<?> activityThreadClass) throws Exception {
        Method systemMain = activityThreadClass.getDeclaredMethod("systemMain");
        systemMain.setAccessible(true);
        Object activityThread = systemMain.invoke(null);
        return getSystemContext(activityThreadClass, activityThread);
    }

    private static Context lightweightContext(Class<?> activityThreadClass) throws Exception {
        Constructor<?> constructor = activityThreadClass.getDeclaredConstructor();
        constructor.setAccessible(true);
        Object activityThread = constructor.newInstance();
        return getSystemContext(activityThreadClass, activityThread);
    }

    private static Context getSystemContext(
            Class<?> activityThreadClass,
            Object activityThread) throws Exception {
        Method getSystemContext = activityThreadClass.getDeclaredMethod("getSystemContext");
        getSystemContext.setAccessible(true);
        return (Context) getSystemContext.invoke(activityThread);
    }

    private static void reportBootstrapFailure(String attempt, Throwable error) {
        System.err.println("Failed to bootstrap context with " + attempt + ": " + error);
        error.printStackTrace(System.err);
    }

    private static JSONObject readApplication(
            PackageManager packageManager,
            PackageInfo packageInfo,
            Mode mode) throws Exception {
        ApplicationInfo application = packageInfo.applicationInfo;
        if (application == null) {
            throw new IllegalArgumentException("Package has no application info");
        }
        String packageName = application.packageName;
        JSONObject item = new JSONObject();
        item.put("packageName", packageName);

        if (mode == Mode.ICONS_ONLY) {
            item.put("icon", readIcon(packageManager, application));
            return item;
        }

        item.put("appName", readApplicationName(packageManager, application, packageName));
        item.put("icon", mode == Mode.FULL ? readIcon(packageManager, application) : "");
        item.put("apkSize", readApkSize(application));
        item.put("versionName", packageInfo.versionName == null ? "" : packageInfo.versionName);
        item.put("versionCode", packageInfo.getLongVersionCode());
        item.put("firstInstallTime", packageInfo.firstInstallTime);
        item.put("lastUpdateTime", packageInfo.lastUpdateTime);
        return item;
    }

    private static String readApplicationName(
            PackageManager packageManager,
            ApplicationInfo application,
            String fallback) {
        try {
            CharSequence label = packageManager.getApplicationLabel(application);
            if (label != null && label.length() > 0) {
                return label.toString();
            }
        } catch (Throwable error) {
            reportFieldFailure(application.packageName, "label", error);
        }
        return fallback;
    }

    private static String readIcon(
            PackageManager packageManager,
            ApplicationInfo application) {
        try {
            Drawable drawable = packageManager.getApplicationIcon(application);
            int width = drawable.getIntrinsicWidth() > 0
                    ? drawable.getIntrinsicWidth()
                    : ICON_SIZE;
            int height = drawable.getIntrinsicHeight() > 0
                    ? drawable.getIntrinsicHeight()
                    : ICON_SIZE;
            Bitmap source = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(source);
            drawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
            drawable.draw(canvas);

            Bitmap scaled = Bitmap.createScaledBitmap(source, ICON_SIZE, ICON_SIZE, true);
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            scaled.compress(Bitmap.CompressFormat.PNG, 100, bytes);
            if (scaled != source) {
                scaled.recycle();
            }
            source.recycle();
            return "data:image/png;base64,"
                    + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
        } catch (Throwable error) {
            reportFieldFailure(application.packageName, "icon", error);
            return "";
        }
    }

    private static long readApkSize(ApplicationInfo application) {
        try {
            if (application.sourceDir == null) {
                return 0;
            }
            return new File(application.sourceDir).length();
        } catch (Throwable error) {
            reportFieldFailure(application.packageName, "APK size", error);
            return 0;
        }
    }

    private static void reportFieldFailure(
            String packageName,
            String field,
            Throwable error) {
        System.err.println("Failed to read " + field + " for " + packageName + ": " + error);
    }
}
