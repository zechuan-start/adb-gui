package com.adbgui.clipboard;

import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.ByteArrayOutputStream;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.PrintStream;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;

public final class Main {
    private static final String SENTINEL = "--ADBGUI-CLIPBOARD-V1--";
    private static final int MAX_TEXT_BYTES = 256 * 1024;
    private static final int MAX_WIRE_BYTES = MAX_TEXT_BYTES * 6 + 4096;

    static final class Failure extends Exception {
        final String code;
        Failure(String code) { this.code = code; }
    }

    private Main() {}

    static void validateText(String text) throws Failure {
        if (text.length() == 0) throw new Failure("no_text");
        if (text.getBytes(StandardCharsets.UTF_8).length > MAX_TEXT_BYTES) throw new Failure("too_large");
    }

    private static JSONObject readRequest() throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = System.in.read(buffer)) != -1) {
            if (bytes.size() + count > MAX_WIRE_BYTES) throw new Failure("too_large");
            bytes.write(buffer, 0, count);
        }
        String json = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
        JSONTokener tokener = new JSONTokener(json);
        Object value = tokener.nextValue();
        if (!(value instanceof JSONObject) || tokener.nextClean() != 0) throw new Failure("request");
        JSONObject request = (JSONObject) value;
        if (!Integer.valueOf(1).equals(request.get("version"))) throw new Failure("version");
        return request;
    }

    public static void main(String[] args) throws Exception {
        JSONObject envelope = new JSONObject().put("version", 1);
        int exitCode = 0;
        try {
            JSONObject request = readRequest();
            Object operation = request.get("operation");
            if (!"get".equals(operation) && !"set".equals(operation)) throw new Failure("request");
            ClipboardAccess clipboard = new ClipboardAccess();
            JSONObject result = new JSONObject();
            if ("get".equals(operation)) {
                String text = clipboard.get();
                result.put("kind", text == null ? "no_text" : "text");
                if (text != null) result.put("text", text);
            } else {
                Object text = request.get("text");
                if (!(text instanceof String)) throw new Failure("request");
                clipboard.set((String) text);
                result.put("kind", "written");
            }
            envelope.put("ok", true).put("result", result);
        } catch (Throwable error) {
            String code = error instanceof Failure ? ((Failure) error).code
                    : error instanceof SecurityException ? "permission" : "unsupported";
            envelope.put("ok", false).put("error", new JSONObject().put("code", code));
            exitCode = 1;
        }
        // Never print exception details or clipboard text through a diagnostic channel.
        PrintStream out = new PrintStream(new FileOutputStream(FileDescriptor.out), false, "UTF-8");
        out.print(SENTINEL + "\n");
        out.print(envelope.toString());
        out.flush();
        System.exit(exitCode);
    }
}
