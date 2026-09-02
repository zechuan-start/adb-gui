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

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.lang.reflect.Method;
import java.util.List;

/** Entry point loaded by app_process to collect third-party application metadata. */
public final class Main {
    private static final int ICON_SIZE = 96;

    private Main() {}

    public static void main(String[] args) {
        try {
            Context context = createSystemContext();
            PackageManager packageManager = context.getPackageManager();
            List<ApplicationInfo> applications = packageManager.getInstalledApplications(0);
            JSONArray result = new JSONArray();

            for (ApplicationInfo application : applications) {
                if (application.packageName == null
                        || application.packageName.length() == 0
                        || (application.flags & ApplicationInfo.FLAG_SYSTEM) != 0) {
                    continue;
                }
                result.put(readApplication(packageManager, application));
            }

            System.out.print(result.toString());
        } catch (Throwable error) {
            System.err.println("Failed to collect installed applications: " + error);
            error.printStackTrace(System.err);
            System.exit(1);
        }
    }

    private static Context createSystemContext() throws Exception {
        // app_process does not prepare the main looper before invoking this entry point,
        // while ActivityThread creates handlers during its framework bootstrap.
        if (Looper.myLooper() == null) {
            Looper.prepareMainLooper();
        }

        // ActivityThread is hidden from the SDK stubs, so keep the build compatible with
        // a normal android.jar and resolve only this app_process bootstrap path at runtime.
        Class<?> activityThreadClass = Class.forName("android.app.ActivityThread");
        Method systemMain = activityThreadClass.getDeclaredMethod("systemMain");
        systemMain.setAccessible(true);
        Object activityThread = systemMain.invoke(null);
        Method getSystemContext = activityThreadClass.getDeclaredMethod("getSystemContext");
        getSystemContext.setAccessible(true);
        return (Context) getSystemContext.invoke(activityThread);
    }

    private static JSONObject readApplication(
            PackageManager packageManager,
            ApplicationInfo application) throws Exception {
        String packageName = application.packageName;
        JSONObject item = new JSONObject();
        item.put("packageName", packageName);
        item.put("appName", readApplicationName(packageManager, application, packageName));
        item.put("icon", readIcon(packageManager, application));
        item.put("apkSize", readApkSize(application));

        String versionName = "";
        long versionCode = 0;
        long firstInstallTime = 0;
        long lastUpdateTime = 0;
        try {
            PackageInfo packageInfo = packageManager.getPackageInfo(packageName, 0);
            versionName = packageInfo.versionName == null ? "" : packageInfo.versionName;
            versionCode = packageInfo.getLongVersionCode();
            firstInstallTime = packageInfo.firstInstallTime;
            lastUpdateTime = packageInfo.lastUpdateTime;
        } catch (Throwable error) {
            reportFieldFailure(packageName, "package info", error);
        }

        item.put("versionName", versionName);
        item.put("versionCode", versionCode);
        item.put("firstInstallTime", firstInstallTime);
        item.put("lastUpdateTime", lastUpdateTime);
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
