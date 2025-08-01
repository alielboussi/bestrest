package com.example.laybyreports

import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private val allowedUrl = "https://bestrest-delta.vercel.app/layby-management"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val webView = findViewById<WebView>(R.id.webview)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url.toString()
                return !url.startsWith(allowedUrl)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return url == null || !url.startsWith(allowedUrl)
            }
        }

        webView.loadUrl(allowedUrl)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Do nothing; disables back navigation.
    }
}
