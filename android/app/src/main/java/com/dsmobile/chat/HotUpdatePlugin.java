package com.dsmobile.chat;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Base64;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * 前端热更新插件。
 *
 * 更新包（zip）下载完成后由 JS 传给插件，插件解压到应用私有目录，并让 Capacitor 的
 * WebViewLocalServer 从该目录提供前端资源。下次启动时 load() 会自动应用已激活的版本，
 * 解压失败或文件损坏时自动回退到 APK 内置资源。
 */
@CapacitorPlugin(name = "HotUpdate")
public class HotUpdatePlugin extends Plugin {
    private static final String TAG = "HotUpdate";
    private static final String HOT_DIR = "hot";
    private static final String ACTIVE_FILE = "active.txt";
    private static final String TEMP_DIR = ".incoming";

    private File hotRoot() {
        return new File(getContext().getFilesDir(), HOT_DIR);
    }

    private File activeMarker() {
        return new File(hotRoot(), ACTIVE_FILE);
    }

    /** 插件加载时先于 WebView 载入执行，直接应用上一次已落盘的更新。 */
    @Override
    public void load() {
        applyActive();
    }

    private boolean applyActive() {
        try {
            File marker = activeMarker();
            if (!marker.exists()) {
                return false;
            }
            String version = readFirstLine(marker);
            if (version == null || version.isEmpty() || !version.matches("[A-Za-z0-9._-]+")) {
                return false;
            }
            File dir = new File(hotRoot(), version);
            if (!new File(dir, "index.html").isFile()) {
                return false;
            }
            bridge.setServerBasePath(dir.getAbsolutePath());
            Log.i(TAG, "Applied hot update " + version);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to apply hot update", e);
            return false;
        }
    }

    /** 当前生效的前端版本；未安装更新时返回 builtin。 */
    @PluginMethod
    public void getVersion(PluginCall call) {
        JSObject ret = new JSObject();
        String active = readFirstLine(activeMarker());
        ret.put("version", active == null || active.isEmpty() ? "builtin" : active);
        call.resolve(ret);
    }

    /**
     * 安装更新包。zipBase64 为更新包的 Base64 编码，version 为版本号。
     * 先解压到临时目录并校验 index.html，成功后再原子替换并激活，避免半写入导致白屏。
     */
    @PluginMethod
    public void install(PluginCall call) {
        String zipBase64 = call.getString("zipBase64");
        String version = call.getString("version");
        if (zipBase64 == null || version == null || !version.matches("[A-Za-z0-9._-]+")) {
            call.reject("Invalid update package");
            return;
        }
        File temp = new File(hotRoot(), TEMP_DIR);
        File target = new File(hotRoot(), version);
        try {
            deleteRecursively(temp);
            if (!temp.mkdirs()) {
                throw new IOException("Cannot create temp directory");
            }
            byte[] bytes = Base64.getDecoder().decode(zipBase64);
            unzip(new ByteArrayInputStream(bytes), temp);

            File index = new File(temp, "index.html");
            if (!index.isFile()) {
                throw new IOException("Update package has no index.html");
            }

            deleteRecursively(target);
            if (!temp.renameTo(target)) {
                throw new IOException("Cannot move update into place");
            }
            writeFirstLine(activeMarker(), version);

            JSObject ret = new JSObject();
            ret.put("version", version);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Install failed", e);
            deleteRecursively(temp);
            call.reject("Install failed: " + e.getMessage());
        }
    }

    /** 恢复到 APK 内置的前端资源，用于更新后出现异常时的兜底。 */
    @PluginMethod
    public void reset(PluginCall call) {
        try {
            File marker = activeMarker();
            if (marker.exists() && !marker.delete()) {
                throw new IOException("Cannot remove update marker");
            }
            bridge.setServerAssetPath("public");
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Reset failed", e);
            call.reject("Reset failed: " + e.getMessage());
        }
    }

    private void unzip(InputStream in, File target) throws IOException {
        try (ZipInputStream zip = new ZipInputStream(in)) {
            ZipEntry entry;
            byte[] buffer = new byte[8192];
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName();
                if (name.startsWith("/") || name.contains("..")) {
                    throw new IOException("Unsafe entry: " + name);
                }
                File out = new File(target, name);
                File parent = out.getParentFile();
                if (parent != null && !parent.exists() && !parent.mkdirs()) {
                    throw new IOException("Cannot create directory: " + parent);
                }
                if (entry.isDirectory()) {
                    continue;
                }
                try (OutputStream os = new FileOutputStream(out)) {
                    int count;
                    while ((count = zip.read(buffer)) > 0) {
                        os.write(buffer, 0, count);
                    }
                }
                zip.closeEntry();
            }
        }
    }

    private static String readFirstLine(File file) {
        if (!file.exists()) {
            return null;
        }
        try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
            return reader.readLine();
        } catch (IOException e) {
            return null;
        }
    }

    private static void writeFirstLine(File file, String value) throws IOException {
        File parent = file.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IOException("Cannot create directory: " + parent);
        }
        try (FileWriter writer = new FileWriter(file, false)) {
            writer.write(value);
            writer.write('\n');
        }
    }

    private static void deleteRecursively(File file) {
        if (!file.exists()) {
            return;
        }
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) {
                deleteRecursively(child);
            }
        }
        if (!file.delete()) {
            Log.w(TAG, "Cannot delete " + file);
        }
    }
}
