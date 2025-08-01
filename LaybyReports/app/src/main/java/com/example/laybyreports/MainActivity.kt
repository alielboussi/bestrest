package com.example.laybyreports

import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private val allowedDomain = "https://bestrest-delta.vercel.app"

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
                // Only allow navigation within your domain
                return !url.startsWith(allowedDomain)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return url == null || !url.startsWith(allowedDomain)
            }
        }

        webView.loadUrl("$allowedDomain/layby-management")
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Do nothing; disables back navigation.
    }
}