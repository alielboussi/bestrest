package com.example.webviewapp

import android.graphics.Bitmap
import android.os.Bundle
import android.view.KeyEvent
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
            }
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = false
        }

        webView.webChromeClient = WebChromeClient()

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL)
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && ::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::webView.isInitialized) webView.saveState(outState)
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        if (::webView.isInitialized) webView.restoreState(savedInstanceState)
    }

    companion object {
        private const val START_URL = "https://bestrest-delta.vercel.app/price-labels-mobile"
    }
}
