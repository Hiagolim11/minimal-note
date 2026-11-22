package com.minimalnote.app;

import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;

import androidx.annotation.NonNull;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Fundo atrás das barras do sistema: cor de cima na barra de status, cor de baixo no resto. */
    static final class BarsDrawable extends Drawable {
        final Paint top = new Paint(), bottom = new Paint();
        int topHeight = 0;
        BarsDrawable() { top.setColor(0xFF0F1117); bottom.setColor(0xFF0F1117); }
        @Override public void draw(@NonNull Canvas c) {
            Rect b = getBounds();
            c.drawRect(b.left, b.top, b.right, b.top + topHeight, top);
            c.drawRect(b.left, b.top + topHeight, b.right, b.bottom, bottom);
        }
        @Override public void setAlpha(int a) { }
        @Override public void setColorFilter(ColorFilter f) { }
        @Override public int getOpacity() { return PixelFormat.OPAQUE; }
    }

    final BarsDrawable bars = new BarsDrawable();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MinimalNotePlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().getDecorView().setBackground(bars);

        // Android 15+ desenha o app atrás das barras do sistema. Afastamos a WebView das
        // barras E do teclado (o Capacitor só considera as barras, então o teclado
        // cobria o fim da nota enquanto se digitava).
        if (Build.VERSION.SDK_INT >= 35) {
            View web = getBridge().getWebView();
            ViewCompat.setOnApplyWindowInsetsListener(web, (v, wi) -> {
                Insets sys = wi.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                Insets ime = wi.getInsets(WindowInsetsCompat.Type.ime());
                ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) v.getLayoutParams();
                mlp.leftMargin = sys.left;
                mlp.rightMargin = sys.right;
                mlp.topMargin = sys.top;
                mlp.bottomMargin = Math.max(sys.bottom, ime.bottom);
                v.setLayoutParams(mlp);
                bars.topHeight = sys.top;
                bars.invalidateSelf();
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(web);
        }
    }

    void setBarColors(int top, int bottom) {
        bars.top.setColor(top);
        bars.bottom.setColor(bottom);
        bars.invalidateSelf();
    }
}
