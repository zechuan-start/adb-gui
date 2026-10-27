package com.adbgui.clipboard;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;

/** The same two lock checks as KeyguardManager, without its UI-process bootstrap. */
final class DeviceLockState {
    private final Object window;
    private final Object trust;
    private final Method keyguardLocked;
    private final Method deviceLocked;

    DeviceLockState() throws Exception {
        this(service("window", "android.view.IWindowManager"),
                Class.forName("android.view.IWindowManager"),
                service("trust", "android.app.trust.ITrustManager"),
                Class.forName("android.app.trust.ITrustManager"));
    }

    DeviceLockState(Object window, Class<?> windowType, Object trust, Class<?> trustType)
            throws Exception {
        if (window == null || trust == null) throw new IllegalStateException("Missing lock service");
        this.window = window;
        this.trust = trust;
        keyguardLocked = windowType.getMethod("isKeyguardLocked");
        Method method;
        try {
            method = trustType.getMethod("isDeviceLocked", int.class, int.class);
        } catch (NoSuchMethodException olderAndroid) {
            method = trustType.getMethod("isDeviceLocked", int.class);
        }
        deviceLocked = method;
    }

    private static Object service(String name, String type) throws Exception {
        Class<?> binder = Class.forName("android.os.IBinder");
        Object handle = Class.forName("android.os.ServiceManager")
                .getMethod("getService", String.class).invoke(null, name);
        return Class.forName(type + "$Stub").getMethod("asInterface", binder).invoke(null, handle);
    }

    boolean isLocked() throws Exception {
        // ClipboardAccess has already rejected non-primary users. Device 0 is the physical device.
        Object[] args = deviceLocked.getParameterTypes().length == 2
                ? new Object[] {0, 0} : new Object[] {0};
        return query(deviceLocked, trust, args) || query(keyguardLocked, window);
    }

    private static boolean query(Method method, Object target, Object... args) throws Exception {
        try {
            // Null, malformed results and Binder failures must fail closed, never mean unlocked.
            return (Boolean) method.invoke(target, args);
        } catch (InvocationTargetException error) {
            Throwable cause = error.getCause();
            if (cause instanceof Exception) throw (Exception) cause;
            throw error;
        }
    }
}
