package com.example.priceprinting

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.viewinterop.AndroidView
import com.example.priceprinting.ui.theme.PriceprintingTheme

private const val START_URL = "https://bestrest-delta.vercel.app/price-labels-mobile"

class MainActivity : ComponentActivity() {
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            PriceprintingTheme {
                var progress by remember { mutableStateOf(0) }
                val context = LocalContext.current
                // Keep a single WebView instance
                val webView = remember { WebView(context) }

                BackHandler(enabled = true) {
                    if (webView.canGoBack()) webView.goBack() else finish()
                }

                DisposableEffect(Unit) {
                    onDispose { webView.destroy() }
                }

                Scaffold(
                    modifier = Modifier.fillMaxSize(),
                    topBar = {
                        TopBar(
                            title = "Best Rest",
                            showProgress = progress in 1..99,
                            onReload = { webView.reload() }
                        )
                    }
                ) { _ ->
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = {
                            webView.apply {
                                // Settings for modern webapps
                                settings.javaScriptEnabled = true
                                settings.domStorageEnabled = true
                                settings.cacheMode = WebSettings.LOAD_DEFAULT
                                settings.userAgentString = settings.userAgentString + " BestRestAndroidApp"
                                settings.mediaPlaybackRequiresUserGesture = false
                                settings.builtInZoomControls = false
                                settings.displayZoomControls = false
                                settings.loadWithOverviewMode = true
                                settings.useWideViewPort = true

                                CookieManager.getInstance().setAcceptCookie(true)

                                webViewClient = object : WebViewClient() {
                                    override fun shouldOverrideUrlLoading(
                                        view: WebView?, request: WebResourceRequest?
                                    ): Boolean {
                                        val uri = request?.url ?: return false
                                        val scheme = uri.scheme ?: return false
                                        return when (scheme) {
                                            "http", "https" -> false // keep in webview
                                            else -> {
                                                // Try to open other schemes (tel:, mailto:, whatsapp, intent, etc.)
                                                try {
                                                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                                                } catch (_: ActivityNotFoundException) { }
                                                true
                                            }
                                        }
                                    }

                                    override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                                        super.onPageStarted(view, url, favicon)
                                        progress = 5
                                    }
                                }

                                webChromeClient = object : WebChromeClient() {
                                    override fun onProgressChanged(view: WebView?, newProgress: Int) {
                                        progress = newProgress
                                    }
                                }

                                setDownloadListener(DownloadListener { url, _, contentDisposition, mimeType, _ ->
                                    // Delegate downloads to external apps (browser / PDF viewer / WhatsApp share target)
                                    try {
                                        val filename = URLUtil.guessFileName(url, contentDisposition, mimeType)
                                        val intent = Intent(Intent.ACTION_VIEW).apply { data = Uri.parse(url) }
                                        startActivity(Intent.createChooser(intent, "Open $filename"))
                                    } catch (_: Exception) { }
                                })

                                if (url == null) loadUrl(START_URL)
                            }
                        },
                        update = { }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TopBar(title: String, showProgress: Boolean, onReload: () -> Unit) {
    var refreshing by remember { mutableStateOf(false) }
    TopAppBar(
        title = {
            androidx.compose.foundation.layout.Column {
                Text(title)
                if (showProgress) {
                    LinearProgressIndicator(modifier = Modifier.fillMaxSize(), trackColor = androidx.compose.ui.graphics.Color.Transparent)
                }
            }
        },
        actions = {
            IconButton(onClick = {
                refreshing = true
                onReload()
                refreshing = false
            }) {
                Icon(
                    painter = painterResource(android.R.drawable.ic_popup_sync),
                    contentDescription = "Reload"
                )
            }
        }
    )
}