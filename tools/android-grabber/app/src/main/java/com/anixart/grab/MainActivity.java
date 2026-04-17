package com.anixart.grab;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.button.MaterialButton;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends AppCompatActivity {

    private MaterialButton startBtn;
    private TextView statusText;
    private TextView tokenText;
    private LinearLayout tokenCard;
    private LinearLayout sendCard;
    private Handler handler;
    private boolean isRunning = false;
    private String foundToken = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        startBtn = findViewById(R.id.startBtn);
        statusText = findViewById(R.id.statusText);
        tokenText = findViewById(R.id.tokenText);
        tokenCard = findViewById(R.id.tokenCard);
        sendCard = findViewById(R.id.sendCard);
        handler = new Handler(Looper.getMainLooper());

        startBtn.setOnClickListener(v -> toggleProxy());

        findViewById(R.id.wifiBtn).setOnClickListener(v -> {
            startActivity(new Intent(Settings.ACTION_WIFI_SETTINGS));
        });

        findViewById(R.id.copyBtn).setOnClickListener(v -> {
            if (foundToken != null) {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("token", foundToken));
                Toast.makeText(this, "Токен скопирован!", Toast.LENGTH_SHORT).show();
            }
        });

        findViewById(R.id.sendBtn).setOnClickListener(v -> {
            sendCard.setVisibility(sendCard.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE);
        });

        findViewById(R.id.sendPcBtn).setOnClickListener(v -> sendTokenToPC());

        // Restore saved PC URL
        EditText pcUrl = findViewById(R.id.pcUrlInput);
        String saved = getPrefs().getString("pc_url", "");
        if (!saved.isEmpty()) pcUrl.setText(saved);

        // Check if service is already running
        if (ProxyService.isRunning) {
            isRunning = true;
            updateUI();
        }

        // Poll for token
        startTokenPolling();
    }

    private SharedPreferences getPrefs() {
        return getSharedPreferences("grabber", MODE_PRIVATE);
    }

    private void toggleProxy() {
        if (isRunning) {
            stopService(new Intent(this, ProxyService.class));
            isRunning = false;
        } else {
            Intent intent = new Intent(this, ProxyService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
            isRunning = true;
        }
        updateUI();
    }

    private void updateUI() {
        if (isRunning) {
            startBtn.setText("Остановить");
            statusText.setText("Прокси запущен на порту 8888\nОткрой Anixart...");
            statusText.setTextColor(getResources().getColor(R.color.green));
        } else {
            startBtn.setText("Запустить");
            statusText.setText("Прокси остановлен");
            statusText.setTextColor(getResources().getColor(R.color.text_sec));
        }

        if (foundToken != null) {
            tokenCard.setVisibility(View.VISIBLE);
            tokenText.setText(foundToken);
        }
    }

    private void startTokenPolling() {
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                String token = ProxyService.lastToken;
                if (token != null && !token.equals(foundToken)) {
                    foundToken = token;
                    updateUI();
                }
                handler.postDelayed(this, 500);
            }
        }, 500);
    }

    private void sendTokenToPC() {
        EditText pcUrl = findViewById(R.id.pcUrlInput);
        String url = pcUrl.getText().toString().trim();
        if (url.isEmpty()) {
            Toast.makeText(this, "Введи адрес сайта", Toast.LENGTH_SHORT).show();
            return;
        }
        if (!url.startsWith("http")) url = "http://" + url;
        if (!url.contains(":")) url += ":3000";

        // Save URL
        getPrefs().edit().putString("pc_url", url).apply();

        final String finalUrl = url + "/auth/anixart/token";
        final String token = foundToken;

        new Thread(() -> {
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(finalUrl).openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);

                String json = "{\"token\":\"" + token + "\"}";
                OutputStream os = conn.getOutputStream();
                os.write(json.getBytes("UTF-8"));
                os.close();

                int code = conn.getResponseCode();
                handler.post(() -> {
                    if (code == 200) {
                        Toast.makeText(this, "Токен отправлен на ПК!", Toast.LENGTH_LONG).show();
                    } else {
                        Toast.makeText(this, "Ошибка: код " + code, Toast.LENGTH_SHORT).show();
                    }
                });
            } catch (Exception e) {
                handler.post(() -> {
                    Toast.makeText(this, "Ошибка: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                });
            }
        }).start();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        handler.removeCallbacksAndMessages(null);
    }
}
