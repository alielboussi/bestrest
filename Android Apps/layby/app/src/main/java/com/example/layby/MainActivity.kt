package com.example.layby

import android.Manifest
import android.app.DownloadManager
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.webkit.*
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat

class MainActivity : ComponentActivity() {
    private var pendingDownload: DownloadRequest? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                WebViewScreen("https://bestrest-delta.vercel.app/layby-management-mobile", this)
            }
        }
    }

    // Permission launcher for storage
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
            // Android 6-9: need permission
            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                pendingDownload = request
                requestPermissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                return
            }
        }
        startDownload(request)
    }

    private fun startDownload(request: DownloadRequest) {
        val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val downloadRequest = DownloadManager.Request(Uri.parse(request.url))
        downloadRequest.setMimeType(request.mimeType)
        downloadRequest.addRequestHeader("cookie", request.cookies)
        downloadRequest.addRequestHeader("User-Agent", request.userAgent)
        downloadRequest.setDescription("Downloading file...")
        downloadRequest.setTitle(request.fileName)
        downloadRequest.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        downloadRequest.setDestinationInExternalPublicDir(
            Environment.DIRECTORY_DOWNLOADS,
            request.fileName
        )
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

@Composable
fun WebViewScreen(url: String, activity: MainActivity) {
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = true
                webViewClient = WebViewClient()
                webChromeClient = WebChromeClient()
                loadUrl(url)

                setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
                    // Only handle HTTP/HTTPS URLs, ignore blob: and other schemes
                    if (url.startsWith("http://") || url.startsWith("https://")) {
                        val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
                        val cookies = CookieManager.getInstance().getCookie(url)
                        val request = DownloadRequest(
                            url = url,
                            userAgent = userAgent,
                            contentDisposition = contentDisposition,
                            mimeType = mimeType,
                            fileName = fileName,
                            cookies = cookies ?: ""
                        )
                        activity.checkAndDownload(request)
                    } else {
                        // Ignore blob: URLs to prevent DownloadManager crash
                    }
                }
            }
        }
    )
}
