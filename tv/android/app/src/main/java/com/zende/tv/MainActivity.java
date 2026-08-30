package com.zende.tv;

import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import java.net.URI;
import java.net.URISyntaxException;

public final class MainActivity extends ComponentActivity {
    private static final String PREFS_NAME = "zende-tv";
    private static final String SERVER_URL_KEY = "server-url";

    private FrameLayout root;
    private WebView webView;
    private ProgressBar progress;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private String serverUrl;
    private boolean mainFrameFailed;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().getDecorView().setKeepScreenOn(true);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat insets = WindowCompat.getInsetsController(
            getWindow(),
            getWindow().getDecorView()
        );
        insets.hide(WindowInsetsCompat.Type.systemBars());
        insets.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );

        serverUrl = getPreferences(MODE_PRIVATE).getString(SERVER_URL_KEY, BuildConfig.ZENDE_URL);
        buildWebView();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleBack();
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else if (validatedServerUri(serverUrl) != null) {
            loadServer();
        } else {
            showServerDialog(false);
        }
    }

    private void buildWebView() {
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(7, 10, 18));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 10, 18));
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);

        // Keep the native layer neutral; the shared frontend normalizes TV pixel density.
        webView.setInitialScale(100);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUserAgentString(settings.getUserAgentString() + " ZendeTVShell/1.0 AndroidTV");

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, false);

        webView.setWebViewClient(new ZendeWebViewClient());
        webView.setWebChromeClient(new ZendeWebChromeClient());

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgressTintList(android.content.res.ColorStateList.valueOf(Color.rgb(253, 54, 126)));

        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        root.addView(progress, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            6
        ));
        setContentView(root);
        webView.requestFocus();
    }

    private void loadServer() {
        mainFrameFailed = false;
        webView.loadUrl(serverUrl);
    }

    private URI validatedServerUri(String raw) {
        if (raw == null) return null;
        try {
            URI uri = new URI(raw.trim());
            String scheme = uri.getScheme();
            if (!("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))) return null;
            if (uri.getHost() == null || uri.getHost().isBlank()) return null;
            if (uri.getUserInfo() != null) return null;
            return uri;
        } catch (URISyntaxException ignored) {
            return null;
        }
    }

    private String normalizedServerUrl(String raw) {
        String value = raw == null ? "" : raw.trim();
        while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        return value;
    }

    private boolean isSameServer(Uri candidate) {
        URI configured = validatedServerUri(serverUrl);
        if (configured == null || candidate == null) return false;
        int configuredPort = configured.getPort() >= 0
            ? configured.getPort()
            : ("https".equalsIgnoreCase(configured.getScheme()) ? 443 : 80);
        int candidatePort = candidate.getPort() >= 0
            ? candidate.getPort()
            : ("https".equalsIgnoreCase(candidate.getScheme()) ? 443 : 80);
        return configured.getScheme().equalsIgnoreCase(candidate.getScheme())
            && configured.getHost().equalsIgnoreCase(candidate.getHost())
            && configuredPort == candidatePort;
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            Toast.makeText(this, R.string.no_external_browser, Toast.LENGTH_SHORT).show();
        }
    }

    private void showServerDialog(boolean cancelable) {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setText(serverUrl);
        input.setSelectAllOnFocus(true);
        input.setHint("http://192.168.1.10:8077");
        input.setImeOptions(EditorInfo.IME_ACTION_GO);
        int horizontalPadding = Math.round(32 * getResources().getDisplayMetrics().density);
        FrameLayout container = new FrameLayout(this);
        container.setPadding(horizontalPadding, 0, horizontalPadding, 0);
        container.addView(input, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle(R.string.server_dialog_title)
            .setMessage(R.string.server_dialog_message)
            .setView(container)
            .setPositiveButton(R.string.connect, null)
            .setNegativeButton(cancelable ? android.R.string.cancel : R.string.exit, (ignored, which) -> {
                if (!cancelable) finish();
            })
            .create();
        dialog.setCanceledOnTouchOutside(false);
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            String candidate = normalizedServerUrl(input.getText().toString());
            if (validatedServerUri(candidate) == null) {
                input.setError(getString(R.string.invalid_server_url));
                return;
            }
            serverUrl = candidate;
            getPreferences(MODE_PRIVATE).edit().putString(SERVER_URL_KEY, serverUrl).apply();
            dialog.dismiss();
            webView.clearHistory();
            loadServer();
        }));
        input.setOnEditorActionListener((view, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO) {
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick();
                return true;
            }
            return false;
        });
        dialog.show();
        input.requestFocus();
    }

    private void hideFullscreenView() {
        if (fullscreenView == null) return;
        root.removeView(fullscreenView);
        fullscreenView = null;
        webView.setVisibility(View.VISIBLE);
        if (fullscreenCallback != null) fullscreenCallback.onCustomViewHidden();
        fullscreenCallback = null;
        webView.requestFocus();
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            showServerDialog(true);
            return true;
        }
        return super.onKeyUp(keyCode, event);
    }

    private void handleBack() {
        if (fullscreenView != null) {
            hideFullscreenView();
            return;
        }
        String tvBack = "(function(){return typeof window.__zendeTvHandleBack==='function'"
            + "?window.__zendeTvHandleBack():'unhandled';})()";
        webView.evaluateJavascript(tvBack, result -> {
            if ("\"overlay\"".equals(result) || "\"history\"".equals(result)) return;
            if ("\"unhandled\"".equals(result) && webView.canGoBack()) {
                webView.goBack();
                return;
            }
            Toast.makeText(this, R.string.back_at_home, Toast.LENGTH_SHORT).show();
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onPause() {
        webView.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }

    private final class ZendeWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String scheme = uri.getScheme();
            if (isSameServer(uri)) return false;
            if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                openExternal(uri);
            }
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            progress.setVisibility(View.GONE);
            view.requestFocus();
            if (mainFrameFailed) {
                Toast.makeText(MainActivity.this, R.string.server_unavailable, Toast.LENGTH_LONG).show();
                showServerDialog(true);
            }
        }

        @Override
        public void onReceivedError(
            WebView view,
            WebResourceRequest request,
            android.webkit.WebResourceError error
        ) {
            if (request.isForMainFrame()) mainFrameFailed = true;
        }

        @Override
        public void onReceivedHttpError(
            WebView view,
            WebResourceRequest request,
            WebResourceResponse errorResponse
        ) {
            if (request.isForMainFrame() && errorResponse.getStatusCode() >= 500) {
                mainFrameFailed = true;
            }
        }
    }

    private final class ZendeWebChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progress.setProgress(newProgress);
            progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (fullscreenView != null) {
                callback.onCustomViewHidden();
                return;
            }
            fullscreenView = view;
            fullscreenCallback = callback;
            webView.setVisibility(View.GONE);
            root.addView(view, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            ));
        }

        @Override
        public void onHideCustomView() {
            hideFullscreenView();
        }
    }
}
