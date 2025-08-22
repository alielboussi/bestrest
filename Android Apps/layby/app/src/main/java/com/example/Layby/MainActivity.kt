package com.example.layby

import android.Manifest
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.util.Log
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature

class MainActivity : ComponentActivity() {

    private var pendingDownload: DownloadRequest? = null
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Cookies
        try {
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().flush()
        } catch (_: Throwable) { }

        // Pure WebView (no Compose)
        webView = WebView(this).apply {
            // Force software rendering to rule out GPU issues
            @Suppress("DEPRECATION")
            setLayerType(WebView.LAYER_TYPE_SOFTWARE, null)
            setBackgroundColor(Color.WHITE)

            WebView.setWebContentsDebuggingEnabled(true)

            // capture the outer WebView for inner scopes
            val wv = this

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                loadWithOverviewMode = true
                useWideViewPort = true
                mediaPlaybackRequiresUserGesture = false
                javaScriptCanOpenWindowsAutomatically = true
                setSupportMultipleWindows(true)
                @Suppress("DEPRECATION")
                setOffscreenPreRaster(true)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    safeBrowsingEnabled = true
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                    // ✅ pass the actual WebView, not WebSettings
                    CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true)
                }
                if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                    WebSettingsCompat.setAlgorithmicDarkeningAllowed(this, false)
                }

                // Strip "; wv" to avoid site-level WebView blocks
                val ua = userAgentString ?: ""
                userAgentString = ua.replace("; wv", "", ignoreCase = true)
            }

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView?, request: WebResourceRequest?
                ): Boolean {
                    val u = request?.url ?: return false
                    return when (u.scheme) {
                        "http", "https" -> false
                        "tel", "mailto", "geo", "sms", "intent", "whatsapp" -> {
                            try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (_: Exception) {}
                            true
                        }
                        else -> true
                    }
                }

                override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                    Log.i("WV", "onPageStarted $url")
                    super.onPageStarted(view, url, favicon)
                }

                override fun onPageCommitVisible(view: WebView?, url: String?) {
                    Log.i("WV", "Page commit visible: $url")
                    super.onPageCommitVisible(view, url)
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    Log.i("WV", "onPageFinished $url")
                    // Probe the DOM and catch script errors
                    view?.evaluateJavascript(
                        """
                        (function(){
                          window.addEventListener('error', function(e){
                            console.log('JSERR:'+ e.message + ' @' + (e.filename||'') + ':' + (e.lineno||0));
                          });
                          try {
                            console.log('READY:'+document.readyState+', title='+document.title);
                            var root = document.querySelector('#root') || document.body;
                            return JSON.stringify({
                              title: document.title,
                              ready: document.readyState,
                              hasRoot: !!root,
                              bodyLen: (document.body && document.body.innerHTML ? document.body.innerHTML.length : 0)
                            });
                          } catch (e) {
                            console.log('JSERR:'+e.message);
                            return JSON.stringify({error:e.message});
                          }
                        })();
                        """.trimIndent()
                    ) { v -> Log.d("WV-EVAL", "Probe: $v") }
                    super.onPageFinished(view, url)
                }

                override fun onReceivedHttpError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    errorResponse: WebResourceResponse?
                ) {
                    if (request != null && !request.isForMainFrame) {
                        Log.e("WV-HTTP", "Subresource HTTP ${errorResponse?.statusCode} for ${request.url}")
                    }
                    super.onReceivedHttpError(view, request, errorResponse)
                }

                override fun onReceivedError(
                    view: WebView?, request: WebResourceRequest?, error: WebResourceError?
                ) {
                    if (request == null || request.isForMainFrame) {
                        val desc = error?.description ?: "Unknown"
                        Log.e("WV", "Main frame error: $desc")
                        view?.loadData(
                            """
                            <html><body style="font-family:sans-serif;padding:24px;background:#fff;color:#000">
                            <h3>Load error</h3><p>$desc</p>
                            </body></html>
                            """.trimIndent(),
                            "text/html","utf-8"
                        )
                    }
                    super.onReceivedError(view, request, error)
                }

                override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                    request?.url?.toString()?.let { u ->
                        if (u.endsWith(".js") || u.endsWith(".css")) Log.d("WV-NET", "Requesting: $u")
                    }
                    return super.shouldInterceptRequest(view, request)
                }

                override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler?, error: SslError?) {
                    Log.e("WV", "SSL error: $error")
                    handler?.cancel()
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                    Log.d("WV-CONSOLE", "${consoleMessage.message()} @${consoleMessage.sourceId()}:${consoleMessage.lineNumber()}")
                    return true
                }
            }

            setDownloadListener { dlUrl, userAgent, contentDisposition, mimeType, _ ->
                if (dlUrl != null && (dlUrl.startsWith("http://") || dlUrl.startsWith("https://"))) {
                    val fileName = URLUtil.guessFileName(dlUrl, contentDisposition, mimeType)
                    val cookies = CookieManager.getInstance().getCookie(dlUrl)
                    val req = DownloadRequest(
                        url = dlUrl,
                        userAgent = userAgent ?: "",
                        contentDisposition = contentDisposition ?: "",
                        mimeType = mimeType ?: "application/octet-stream",
                        fileName = fileName,
                        cookies = cookies ?: ""
                    )
                    checkAndDownload(req)
                }
            }
        }

        setContentView(webView)
        webView.loadUrl("https://bestrest-delta.vercel.app/layby-management-mobile")
    }

    override fun onDestroy() {
        try {
            (webView.parent as? ViewGroup)?.removeView(webView)
            webView.stopLoading()
            webView.destroy()
        } catch (_: Throwable) {}
        super.onDestroy()
    }

    // Downloads
    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted && pendingDownload != null) {
            startDownload(pendingDownload!!)
            pendingDownload = null
        }
    }

    fun checkAndDownload(request: DownloadRequest) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            val granted = ContextCompat.checkSelfPermission(
                this, Manifest.permission.WRITE_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                pendingDownload = request
                requestPermissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                return
            }
        }
        startDownload(request)
    }

    private fun startDownload(request: DownloadRequest) {
        val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val downloadRequest = DownloadManager.Request(Uri.parse(request.url)).apply {
            setMimeType(request.mimeType)
            addRequestHeader("cookie", request.cookies)
            addRequestHeader("User-Agent", request.userAgent)
            setDescription("Downloading file...")
            setTitle(request.fileName)
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, request.fileName)
            setAllowedOverMetered(true)
            setAllowedOverRoaming(true)
        }
        dm.enqueue(downloadRequest)
    }
}

data class DownloadRequest(
    val url: String,
    val userAgent: String,
    val contentDisposition: String,
    val mimeType: String,
    val fileName: String,
    val cookies: String
)
