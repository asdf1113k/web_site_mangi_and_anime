package com.anixart.grab;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.StandardCharsets;

public class ProxyService extends Service {

    private static final String TAG = "ProxyService";
    private static final int PORT = 8888;
    private static final String CHANNEL_ID = "proxy_channel";

    public static volatile boolean isRunning = false;
    public static volatile String lastToken = null;

    private ServerSocket serverSocket;
    private Thread serverThread;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(1, buildNotification("Ожидание токена..."));
        startProxy();
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        isRunning = false;
        try {
            if (serverSocket != null) serverSocket.close();
        } catch (IOException ignored) {}
        if (serverThread != null) serverThread.interrupt();
    }

    private void startProxy() {
        serverThread = new Thread(() -> {
            try {
                serverSocket = new ServerSocket(PORT);
                isRunning = true;
                Log.i(TAG, "Proxy started on port " + PORT);

                while (!Thread.interrupted()) {
                    try {
                        Socket client = serverSocket.accept();
                        new Thread(() -> handleClient(client)).start();
                    } catch (IOException e) {
                        if (!Thread.interrupted()) Log.e(TAG, "Accept error", e);
                        break;
                    }
                }
            } catch (IOException e) {
                Log.e(TAG, "Failed to start proxy", e);
            }
            isRunning = false;
        });
        serverThread.start();
    }

    private void handleClient(Socket client) {
        try {
            client.setSoTimeout(30000);
            InputStream in = client.getInputStream();
            OutputStream out = client.getOutputStream();

            // Read first line to get the request
            StringBuilder headerBuilder = new StringBuilder();
            int b;
            while ((b = in.read()) != -1) {
                headerBuilder.append((char) b);
                if (headerBuilder.length() > 8192) break;
                // Check for end of headers
                String s = headerBuilder.toString();
                if (s.endsWith("\r\n\r\n")) break;
            }

            String headers = headerBuilder.toString();
            if (headers.isEmpty()) {
                client.close();
                return;
            }

            String firstLine = headers.split("\r\n")[0];
            // e.g. "GET http://api.anixart.tv/path?token=xxx HTTP/1.1"
            // or   "CONNECT api.anixart.tv:443 HTTP/1.1"

            if (firstLine.startsWith("CONNECT")) {
                handleConnect(client, in, out, firstLine);
            } else {
                handleHttp(client, in, out, headers, firstLine);
            }
        } catch (Exception e) {
            Log.d(TAG, "Client error: " + e.getMessage());
        } finally {
            try { client.close(); } catch (IOException ignored) {}
        }
    }

    private void handleHttp(Socket client, InputStream clientIn, OutputStream clientOut,
                            String headers, String firstLine) {
        try {
            // Parse URL from "GET http://host/path?query HTTP/1.1"
            String[] parts = firstLine.split(" ");
            if (parts.length < 3) return;

            String method = parts[0];
            String urlStr = parts[1];

            URI uri = new URI(urlStr);
            String host = uri.getHost();
            int port = uri.getPort();
            if (port == -1) port = 80;

            // Check for Anixart token
            String query = uri.getQuery();
            if (query != null && query.contains("token=")) {
                if (host != null && (host.contains("anixart") || host.contains("anixsekai") || host.contains("anixmirai"))) {
                    String token = extractToken(query);
                    if (token != null && !token.isEmpty()) {
                        lastToken = token;
                        Log.i(TAG, "TOKEN FOUND: " + token.substring(0, Math.min(20, token.length())) + "...");
                        updateNotification("Токен найден!");
                    }
                }
            }

            // Forward request to real server
            Socket server = new Socket(host, port);
            server.setSoTimeout(30000);
            OutputStream serverOut = server.getOutputStream();
            InputStream serverIn = server.getInputStream();

            // Rewrite request to relative path
            String path = uri.getRawPath();
            if (uri.getRawQuery() != null) path += "?" + uri.getRawQuery();
            String newFirstLine = method + " " + path + " HTTP/1.1\r\n";

            // Rewrite headers: replace first line, fix Host
            String[] headerLines = headers.split("\r\n");
            StringBuilder newHeaders = new StringBuilder();
            newHeaders.append(newFirstLine);
            for (int i = 1; i < headerLines.length; i++) {
                String line = headerLines[i];
                if (line.isEmpty()) break;
                if (line.toLowerCase().startsWith("proxy-connection")) continue;
                if (line.toLowerCase().startsWith("host:")) {
                    newHeaders.append("Host: ").append(host);
                    if (uri.getPort() != -1) newHeaders.append(":").append(uri.getPort());
                    newHeaders.append("\r\n");
                } else {
                    newHeaders.append(line).append("\r\n");
                }
            }
            newHeaders.append("\r\n");

            serverOut.write(newHeaders.toString().getBytes(StandardCharsets.UTF_8));
            serverOut.flush();

            // Pipe both directions
            Thread t1 = pipeThread(clientIn, serverOut);
            Thread t2 = pipeThread(serverIn, clientOut);
            t1.start();
            t2.start();
            t2.join(30000);

            server.close();
        } catch (Exception e) {
            Log.d(TAG, "HTTP forward error: " + e.getMessage());
        }
    }

    private void handleConnect(Socket client, InputStream clientIn, OutputStream clientOut,
                               String firstLine) {
        try {
            // "CONNECT host:port HTTP/1.1"
            String[] parts = firstLine.split(" ");
            String[] hostPort = parts[1].split(":");
            String host = hostPort[0];
            int port = hostPort.length > 1 ? Integer.parseInt(hostPort[1]) : 443;

            // Drain remaining headers
            // (already read in handleClient)

            Socket server = new Socket(host, port);
            server.setSoTimeout(30000);

            // Send 200 to client
            clientOut.write("HTTP/1.1 200 Connection Established\r\n\r\n".getBytes());
            clientOut.flush();

            // Pipe bidirectionally
            Thread t1 = pipeThread(clientIn, server.getOutputStream());
            Thread t2 = pipeThread(server.getInputStream(), clientOut);
            t1.start();
            t2.start();
            t2.join(30000);

            server.close();
        } catch (Exception e) {
            Log.d(TAG, "CONNECT error: " + e.getMessage());
        }
    }

    private Thread pipeThread(InputStream in, OutputStream out) {
        return new Thread(() -> {
            try {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                    out.flush();
                }
            } catch (IOException ignored) {}
        });
    }

    private String extractToken(String query) {
        for (String param : query.split("&")) {
            if (param.startsWith("token=")) {
                return param.substring(6);
            }
        }
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Token Grabber", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Прокси для перехвата токена");
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String text) {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        return builder
                .setContentTitle("Anixart Token Grabber")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_lock_lock)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();
    }

    private void updateNotification(String text) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.notify(1, buildNotification(text));
    }
}
