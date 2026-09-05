package com.adbgui.clipboard;

import android.app.KeyguardManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.AttributionSource;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;

final class ClipboardAccess {
    private final ClipboardManager clipboard;
    private final KeyguardManager keyguard;

    private static final class ShellContext extends ContextWrapper {
        ShellContext(Context base) { super(base); }
        @Override public String getPackageName() { return "com.android.shell"; }
        @Override public String getOpPackageName() { return "com.android.shell"; }
        @Override public Context getApplicationContext() { return this; }
        @Override public AttributionSource getAttributionSource() {
            return new AttributionSource.Builder(Process.myUid()).setPackageName(getPackageName()).build();
        }
    }

    ClipboardAccess() throws Exception {
        if (Process.myUid() != 2000) throw new Main.Failure("identity");
        if (Looper.myLooper() == null) Looper.prepareMainLooper();
        Class<?> activityThread = Class.forName("android.app.ActivityThread");
        Object thread = activityThread.getMethod("systemMain").invoke(null);
        Context system = (Context) activityThread.getMethod("getSystemContext").invoke(thread);
        Context shell = new ShellContext(system);
        if (!"com.android.shell".equals(shell.getPackageName())
                || !"com.android.shell".equals(shell.getOpPackageName())) {
            throw new Main.Failure("identity");
        }
        if (Build.VERSION.SDK_INT >= 31
                && (shell.getAttributionSource().getUid() != Process.myUid()
                || !"com.android.shell".equals(shell.getAttributionSource().getPackageName()))) {
            throw new Main.Failure("identity");
        }
        // ContextWrapper.getSystemService would retain the system context's android attribution.
        clipboard = ClipboardManager.class.getDeclaredConstructor(Context.class, Handler.class)
                .newInstance(shell, new Handler(Looper.getMainLooper()));
        keyguard = (KeyguardManager) shell.getSystemService(Context.KEYGUARD_SERVICE);
        if (clipboard == null || keyguard == null) throw new Main.Failure("unsupported");
    }

    private void checkAccess() throws Exception {
        // This helper only operates on the primary user's unlocked clipboard.
        Object user = Class.forName("android.app.ActivityManager").getMethod("getCurrentUser").invoke(null);
        if (!Integer.valueOf(0).equals(user)) throw new Main.Failure("user");
        if (keyguard.isDeviceLocked() || keyguard.isKeyguardLocked()) throw new Main.Failure("locked");
    }

    String get() throws Exception {
        checkAccess();
        ClipData clip = clipboard.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) return null;
        CharSequence text = clip.getItemAt(0).getText();
        if (text == null || text.length() == 0) return null;
        String result = text.toString();
        Main.validateText(result);
        return result;
    }

    void set(String text) throws Exception {
        Main.validateText(text);
        checkAccess();
        clipboard.setPrimaryClip(ClipData.newPlainText("ADB GUI", text));
        if (!text.equals(get())) throw new Main.Failure("unverified");
    }
}
