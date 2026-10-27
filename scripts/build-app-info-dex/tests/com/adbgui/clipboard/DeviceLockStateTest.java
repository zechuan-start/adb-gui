package com.adbgui.clipboard;

public final class DeviceLockStateTest {
    public static final class Window {
        boolean locked;
        public boolean isKeyguardLocked() { return locked; }
    }

    public static final class LegacyTrust {
        boolean locked;
        public boolean isDeviceLocked(int userId) {
            if (userId != 0) throw new AssertionError("Wrong user");
            return locked;
        }
    }

    public static final class ModernTrust {
        boolean locked;
        public boolean isDeviceLocked(int userId, int deviceId) {
            if (userId != 0 || deviceId != 0) throw new AssertionError("Wrong user or device");
            return locked;
        }
    }

    public static final class DeniedTrust {
        public boolean isDeviceLocked(int userId, int deviceId) {
            throw new SecurityException("denied");
        }
    }

    public static final class BrokenWindow {
        public boolean isKeyguardLocked() { throw new IllegalStateException("Binder unavailable"); }
    }

    public static final class NullTrust {
        public Boolean isDeviceLocked(int userId, int deviceId) { return null; }
    }

    public static final class BothTrust {
        public boolean isDeviceLocked(int userId, int deviceId) {
            throw new SecurityException("denied");
        }
        public boolean isDeviceLocked(int userId) {
            throw new AssertionError("A failed modern query must not fall back");
        }
    }

    private static void check(boolean condition) {
        if (!condition) throw new AssertionError();
    }

    public static void main(String[] args) throws Exception {
        Window window = new Window();
        LegacyTrust legacy = new LegacyTrust();
        ModernTrust modern = new ModernTrust();
        for (Object trust : new Object[] {legacy, modern}) {
            DeviceLockState state = new DeviceLockState(window, Window.class, trust, trust.getClass());
            window.locked = false;
            legacy.locked = modern.locked = false;
            check(!state.isLocked());
            legacy.locked = modern.locked = true;
            check(state.isLocked());
            legacy.locked = modern.locked = false;
            window.locked = true;
            check(state.isLocked());
        }
        window.locked = false;
        try {
            new DeviceLockState(window, Window.class, new DeniedTrust(), DeniedTrust.class).isLocked();
            throw new AssertionError("Permission failure was ignored");
        } catch (SecurityException expected) { }
        try {
            new DeviceLockState(window, Window.class, new BothTrust(), BothTrust.class).isLocked();
            throw new AssertionError("Modern permission failure was ignored");
        } catch (SecurityException expected) { }
        try {
            new DeviceLockState(window, Window.class, new NullTrust(), NullTrust.class).isLocked();
            throw new AssertionError("Null lock state was accepted");
        } catch (NullPointerException expected) { }
        try {
            new DeviceLockState(new BrokenWindow(), BrokenWindow.class, modern, ModernTrust.class).isLocked();
            throw new AssertionError("Window service failure was ignored");
        } catch (IllegalStateException expected) { }
        try {
            new DeviceLockState(null, Window.class, modern, ModernTrust.class);
            throw new AssertionError("Missing service was accepted");
        } catch (IllegalStateException expected) { }
        try {
            new DeviceLockState(window, Window.class, new Object(), Object.class);
            throw new AssertionError("Unknown trust API was accepted");
        } catch (NoSuchMethodException expected) { }
        System.out.println("DeviceLockState: legacy/modern lock states and fail-closed checks passed");
    }
}
