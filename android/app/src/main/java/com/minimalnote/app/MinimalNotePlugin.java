package com.minimalnote.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.os.PowerManager;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Base64;
import android.view.Window;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Recursos nativos do Minimal Note no Android:
 * arquivos do cofre (java.io, com acesso a todos os arquivos quando permitido),
 * permissão de armazenamento, textos/arquivos recebidos de outros apps e atalhos,
 * compartilhar, imprimir/PDF, backup em .zip e cores das barras do sistema.
 */
@CapacitorPlugin(
    name = "MinimalNote",
    permissions = {
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class MinimalNotePlugin extends Plugin {

    private static final Pattern NOTE = Pattern.compile(".*\\.(md|markdown|txt)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern IMAGE = Pattern.compile(".*\\.(png|jpe?g|gif|webp|svg|bmp|avif)$", Pattern.CASE_INSENSITIVE);
    private static final long MAX_TEXT = 8L * 1024 * 1024;

    private JSObject pendingIntent;

    @Override
    public void load() {
        pendingIntent = parseIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        JSObject data = parseIntent(intent);
        if (data != null) {
            pendingIntent = data;
            notifyListeners("intent", data, true);
        }
    }

    // ---------------- caminhos ----------------

    // "/a/files2" não está dentro de "/a/files": compara com o separador
    private static boolean isUnder(String path, String base) {
        return path.equals(base) || path.startsWith(base.endsWith("/") ? base : base + "/");
    }

    private File fileOf(PluginCall call, String key) throws IOException {
        String p = call.getString(key);
        if (p == null || p.isEmpty()) throw new IOException("Caminho vazio");
        if (p.startsWith("file://")) p = Uri.parse(p).getPath();
        File f = new File(p).getCanonicalFile();
        String path = f.getPath();
        String ext = Environment.getExternalStorageDirectory().getCanonicalPath();
        String app = getContext().getFilesDir().getCanonicalPath();
        String extApp = getContext().getExternalFilesDir(null) != null ? getContext().getExternalFilesDir(null).getCanonicalPath() : app;
        if (!(isUnder(path, ext) || isUnder(path, app) || isUnder(path, extApp))) throw new IOException("Caminho não permitido: " + p);
        return f;
    }

    private boolean storageGranted() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) return Environment.isExternalStorageManager();
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("storageGranted", storageGranted());
        r.put("externalRoot", Environment.getExternalStorageDirectory().getAbsolutePath());
        r.put("documents", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS).getAbsolutePath());
        r.put("appRoot", getContext().getFilesDir().getAbsolutePath());
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        r.put("powerSave", pm != null && pm.isPowerSaveMode());
        try { r.put("version", getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionName); } catch (Exception ignored) { }
        call.resolve(r);
    }

    @PluginMethod
    public void requestStorage(PluginCall call) {
        if (storageGranted()) { resolveGranted(call); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
            try {
                startActivityForResult(call, i, "storageResult");
            } catch (Exception e) {
                startActivityForResult(call, new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION), "storageResult");
            }
        } else {
            requestPermissionForAlias("storage", call, "storagePermResult");
        }
    }

    @ActivityCallback
    private void storageResult(PluginCall call, ActivityResult result) { resolveGranted(call); }

    @PermissionCallback
    private void storagePermResult(PluginCall call) { resolveGranted(call); }

    private void resolveGranted(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", storageGranted());
        call.resolve(r);
    }

    // ---------------- arquivos ----------------

    /** Lista o cofre inteiro numa só chamada: pastas, notas (com conteúdo) e imagens. */
    @PluginMethod
    public void scan(PluginCall call) {
        try {
            File root = fileOf(call, "root");
            if (!root.isDirectory()) throw new IOException("Pasta não encontrada");
            JSArray entries = new JSArray();
            walk(root, "", entries, 0);
            JSObject r = new JSObject();
            r.put("entries", entries);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    private void walk(File dir, String rel, JSArray out, int depth) throws IOException {
        if (depth > 24) return;
        File[] list = dir.listFiles();
        if (list == null) return;
        for (File f : list) {
            String name = f.getName();
            if (name.startsWith(".") || name.endsWith(".lumen-tmp")) continue;
            String p = rel.isEmpty() ? name : rel + "/" + name;
            JSObject e = new JSObject();
            e.put("path", p);
            e.put("mtime", f.lastModified());
            if (f.isDirectory()) {
                e.put("type", "folder");
                out.put(e);
                walk(f, p, out, depth + 1);
            } else if (NOTE.matcher(name).matches()) {
                e.put("type", "note");
                e.put("content", f.length() > MAX_TEXT ? "" : readText(f));
                out.put(e);
            } else if (IMAGE.matcher(name).matches()) {
                e.put("type", "image");
                out.put(e);
            }
        }
    }

    private static String readText(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) { return new String(readAll(in, MAX_TEXT), StandardCharsets.UTF_8); }
    }

    private static byte[] readAll(InputStream in, long limit) throws IOException {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n; long total = 0;
        while ((n = in.read(buf)) > 0) {
            total += n;
            if (total > limit) throw new IOException("Arquivo grande demais");
            bo.write(buf, 0, n);
        }
        return bo.toByteArray();
    }

    @PluginMethod
    public void read(PluginCall call) {
        try {
            JSObject r = new JSObject();
            r.put("data", readText(fileOf(call, "path")));
            call.resolve(r);
        } catch (Exception e) { call.reject(e.getMessage(), e); }
    }

    /** Escrita atômica: grava num temporário e troca pelo arquivo final. */
    @PluginMethod
    public void write(PluginCall call) {
        try {
            File f = fileOf(call, "path");
            String data = call.getString("data", "");
            byte[] bytes = Boolean.TRUE.equals(call.getBoolean("base64", false)) ? Base64.decode(data, Base64.DEFAULT) : data.getBytes(StandardCharsets.UTF_8);
            File parent = f.getParentFile();
            if (parent != null && !parent.isDirectory() && !parent.mkdirs()) throw new IOException("Não foi possível criar a pasta " + parent.getName());
            File tmp = new File(parent, f.getName() + ".lumen-tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(bytes);
                out.getFD().sync();
            }
            if (!tmp.renameTo(f)) {
                // alguns sistemas de arquivos não substituem na renomeação
                if (f.exists() && !f.delete()) { tmp.delete(); throw new IOException("Não foi possível salvar " + f.getName()); }
                if (!tmp.renameTo(f)) throw new IOException("Não foi possível salvar " + f.getName());
            }
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage(), e); }
    }

    @PluginMethod
    public void exists(PluginCall call) {
        try {
            File f = fileOf(call, "path");
            JSObject r = new JSObject();
            r.put("exists", f.exists());
            r.put("directory", f.isDirectory());
            call.resolve(r);
        } catch (Exception e) { call.reject(e.getMessage(), e); }
    }

    @PluginMethod
    public void mkdir(PluginCall call) {
        try {
            File f = fileOf(call, "path");
            if (!f.isDirectory() && !f.mkdirs()) throw new IOException("Não foi possível criar a pasta " + f.getName());
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage(), e); }
    }

    @PluginMethod
    public void rename(PluginCall call) {
        try {
            File a = fileOf(call, "from"), b = fileOf(call, "to");
            if (!a.exists()) throw new IOException("Item não encontrado: " + a.getName());
            File parent = b.getParentFile();
            if (parent != null && !parent.isDirectory()) parent.mkdirs();
            boolean caseOnly = a.getPath().equalsIgnoreCase(b.getPath()) && !a.getPath().equals(b.getPath());
            if (caseOnly) {
                // troca só de maiúsculas/minúsculas: passa por um nome intermediário
                File mid = new File(a.getParentFile(), a.getName() + ".lumen-mv");
                if (!a.renameTo(mid) || !mid.renameTo(b)) throw new IOException("Não foi possível renomear");
            } else {
                if (b.exists()) throw new IOException("Já existe um item com esse nome");
                if (!a.renameTo(b)) throw new IOException("Não foi possível renomear " + a.getName());
            }
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage(), e); }
    }

    /** Apaga de vez: só o arquivo de teste do cofre ou itens dentro de uma pasta .lixeira. */
    @PluginMethod
    public void remove(PluginCall call) {
        try {
            File f = fileOf(call, "path");
            String p = f.getPath();
            boolean probe = f.getName().equals(".minimal-note-probe");
            boolean inTrash = p.contains("/.lixeira/") || p.endsWith("/.lixeira");
            if (!probe && !inTrash) throw new IOException("Só itens da lixeira podem ser apagados de vez");
            deleteTree(f);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage(), e); }
    }

    private static void deleteTree(File f) {
        File[] list = f.listFiles();
        if (list != null) for (File c : list) deleteTree(c);
        f.delete();
    }

    /** Pastas dentro de um caminho (para o seletor de cofre). */
    @PluginMethod
    public void listDirs(PluginCall call) {
        try {
            File d = fileOf(call, "path");
            JSArray out = new JSArray();
            File[] list = d.listFiles();
            int notes = 0;
            if (list != null) {
                for (File f : list) {
                    if (f.isDirectory() && !f.getName().startsWith(".")) {
                        JSObject e = new JSObject();
                        e.put("name", f.getName());
                        out.put(e);
                    } else if (NOTE.matcher(f.getName()).matches()) notes++;
                }
            }
            JSObject r = new JSObject();
            r.put("dirs", out);
            r.put("notes", notes);
            r.put("readable", list != null);
            int total = 0;
            if (list != null) for (File f : list) if (!f.getName().startsWith(".")) total++;
            r.put("total", total);
            call.resolve(r);
        } catch (Exception e) { call.reject(e.getMessage(), e); }
    }

    // ---------------- backup ----------------

    @PluginMethod
    public void backup(PluginCall call) {
        try {
            File root = fileOf(call, "root");
            String stamp = new java.text.SimpleDateFormat("yyyy-MM-dd-HHmm", Locale.US).format(new java.util.Date());
            File dir = new File(getContext().getCacheDir(), "backup");
            dir.mkdirs();
            File[] old = dir.listFiles();
            if (old != null) for (File o : old) o.delete();
            File zip = new File(dir, "Minimal Note " + stamp + ".zip");
            int[] count = { 0 };
            try (ZipOutputStream zo = new ZipOutputStream(new FileOutputStream(zip))) {
                zipDir(root, "", zo, count);
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", zip);
            Intent s = new Intent(Intent.ACTION_SEND);
            s.setType("application/zip");
            s.putExtra(Intent.EXTRA_STREAM, uri);
            s.putExtra(Intent.EXTRA_SUBJECT, zip.getName());
            s.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(s, "Salvar backup do cofre");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            JSObject r = new JSObject();
            r.put("files", count[0]);
            r.put("name", zip.getName());
            call.resolve(r);
        } catch (Exception e) { call.reject(e.getMessage(), e); }
    }

    private void zipDir(File dir, String rel, ZipOutputStream zo, int[] count) throws IOException {
        File[] list = dir.listFiles();
        if (list == null) return;
        byte[] buf = new byte[16384];
        for (File f : list) {
            String name = f.getName();
            if (name.endsWith(".lumen-tmp")) continue;
            String p = rel.isEmpty() ? name : rel + "/" + name;
            if (f.isDirectory()) { zipDir(f, p, zo, count); continue; }
            zo.putNextEntry(new ZipEntry(p));
            try (InputStream in = new FileInputStream(f)) { int n; while ((n = in.read(buf)) > 0) zo.write(buf, 0, n); }
            zo.closeEntry();
            count[0]++;
        }
    }

    // ---------------- compartilhar / imprimir ----------------

    @PluginMethod
    public void share(PluginCall call) {
        String title = call.getString("title", "");
        Intent s = new Intent(Intent.ACTION_SEND);
        s.setType("text/plain");
        s.putExtra(Intent.EXTRA_TEXT, call.getString("text", ""));
        if (!title.isEmpty()) s.putExtra(Intent.EXTRA_SUBJECT, title);
        getActivity().startActivity(Intent.createChooser(s, title.isEmpty() ? "Compartilhar" : title));
        call.resolve();
    }

    /** Imprime a própria WebView (as regras @media print mostram só a nota) — permite salvar em PDF. */
    @PluginMethod
    public void print(PluginCall call) {
        String name = call.getString("name", "Nota");
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                final PrintDocumentAdapter base = getBridge().getWebView().createPrintDocumentAdapter(name);
                PrintDocumentAdapter adapter = new PrintDocumentAdapter() {
                    @Override public void onStart() { base.onStart(); }
                    @Override public void onLayout(PrintAttributes o, PrintAttributes n, CancellationSignal c, LayoutResultCallback cb, Bundle b) { base.onLayout(o, n, c, cb, b); }
                    @Override public void onWrite(PageRange[] p, ParcelFileDescriptor d, CancellationSignal c, WriteResultCallback cb) { base.onWrite(p, d, c, cb); }
                    @Override public void onFinish() { base.onFinish(); call.resolve(); }
                };
                pm.print(name, adapter, new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            } catch (Exception e) { call.reject(e.getMessage(), e); }
        });
    }

    // ---------------- barras do sistema ----------------

    @PluginMethod
    public void setBars(PluginCall call) {
        String top = call.getString("top", "#0f1117");
        String bottom = call.getString("bottom", top);
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", true));
        getActivity().runOnUiThread(() -> {
            try {
                int ct = Color.parseColor(top), cb = Color.parseColor(bottom);
                Window w = getActivity().getWindow();
                if (Build.VERSION.SDK_INT < 35) {
                    w.setStatusBarColor(ct);
                    w.setNavigationBarColor(cb);
                }
                // com a tela de ponta a ponta, as barras mostram o fundo da janela
                if (getActivity() instanceof MainActivity) ((MainActivity) getActivity()).setBarColors(ct, cb);
                else w.getDecorView().setBackgroundColor(ct);
                getBridge().getWebView().setBackgroundColor(ct);
                WindowInsetsControllerCompat ic = WindowCompat.getInsetsController(w, w.getDecorView());
                ic.setAppearanceLightStatusBars(!dark);
                ic.setAppearanceLightNavigationBars(!dark);
                call.resolve();
            } catch (Exception e) { call.reject(e.getMessage(), e); }
        });
    }

    // ---------------- intents recebidos ----------------

    @PluginMethod
    public void consumeIntent(PluginCall call) {
        JSObject r = new JSObject();
        if (pendingIntent != null) r.put("intent", pendingIntent);
        pendingIntent = null;
        call.resolve(r);
    }

    private JSObject parseIntent(Intent intent) {
        if (intent == null || intent.getAction() == null) return null;
        String action = intent.getAction();
        JSObject d = new JSObject();
        try {
            switch (action) {
                case "com.minimalnote.app.NEW_NOTE": d.put("type", "new"); break;
                case "com.minimalnote.app.DAILY_NOTE": d.put("type", "daily"); break;
                case "com.minimalnote.app.SEARCH": d.put("type", "search"); break;
                case Intent.ACTION_SEND: {
                    d.put("type", "share");
                    CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
                    String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
                    if (subject != null) d.put("subject", subject);
                    Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                    if (text != null) d.put("text", text.toString());
                    else if (stream != null) { d.put("text", readUri(stream)); d.put("name", nameOf(stream)); }
                    else return null;
                    break;
                }
                case Intent.ACTION_VIEW: {
                    Uri uri = intent.getData();
                    if (uri == null) return null;
                    d.put("type", "file");
                    d.put("name", nameOf(uri));
                    d.put("text", readUri(uri));
                    break;
                }
                default: return null;
            }
        } catch (Exception e) {
            d = new JSObject();
            d.put("type", "error");
            d.put("message", e.getMessage());
        }
        // não processa o mesmo intent de novo se a atividade for recriada
        getActivity().setIntent(new Intent(Intent.ACTION_MAIN));
        return d;
    }

    private String readUri(Uri uri) throws IOException {
        ContentResolver cr = getContext().getContentResolver();
        try (InputStream in = cr.openInputStream(uri)) {
            if (in == null) throw new IOException("Arquivo indisponível");
            return new String(readAll(in, MAX_TEXT), StandardCharsets.UTF_8);
        }
    }

    private String nameOf(Uri uri) {
        String name = null;
        if ("content".equals(uri.getScheme())) {
            try (Cursor c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst()) name = c.getString(0);
            } catch (Exception ignored) { }
        }
        if (name == null) name = uri.getLastPathSegment();
        return name == null ? "Nota importada.md" : name;
    }
}
