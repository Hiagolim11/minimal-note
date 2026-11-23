package com.minimalnote.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/**
 * Widget da tela inicial: atalhos para nova nota, nota diária, tarefas e busca.
 * Cada botão abre o app com a mesma ação dos atalhos do ícone (tratada em MinimalNotePlugin.parseIntent).
 */
public class QuickWidget extends AppWidgetProvider {
    private static final String[][] BUTTONS = {
        {"com.minimalnote.app.NEW_NOTE", "w_new"},
        {"com.minimalnote.app.DAILY_NOTE", "w_daily"},
        {"com.minimalnote.app.TASKS", "w_tasks"},
        {"com.minimalnote.app.SEARCH", "w_search"},
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_quick);
            for (int i = 0; i < BUTTONS.length; i++) {
                Intent intent = new Intent(context, MainActivity.class);
                intent.setAction(BUTTONS[i][0]);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                PendingIntent pi = PendingIntent.getActivity(context, 100 + i, intent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                int viewId = context.getResources().getIdentifier(BUTTONS[i][1], "id", context.getPackageName());
                views.setOnClickPendingIntent(viewId, pi);
            }
            manager.updateAppWidget(id, views);
        }
    }
}
