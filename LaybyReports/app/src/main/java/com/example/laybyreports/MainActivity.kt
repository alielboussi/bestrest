package com.example.laybyreports

import android.app.AlertDialog
import android.content.Context
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.webkit.*
import android.widget.EditText
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {
    private val allowedDomain = "https://bestrest-delta.vercel.app"
    private val allowedPath = "/layby-management"
    private val TAG = "LaybyWebView"
    private val PREFS = "device_prefs"
    private val DEVICE_NAME_KEY = "device_name"
    private val ANDROID_ID_KEY = "android_id"
    private val SUPABASE_API_URL = "https://khcxxblhblgwcrqsordo.supabase.co/rest/v1/devices"
    private val SUPABASE_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoY3h4YmxoYmxnd2NycXNvcmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NDcxOTcsImV4cCI6MjA2OTAyMzE5N30.2ctKuND0vmV2NmPIZTr-OaOJNYI9qJoa4QURZqCXFnI" // Use a secure backend in production!

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        var deviceName = prefs.getString(DEVICE_NAME_KEY, null)
        val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)

        // Prompt for device name if not set
        if (deviceName == null) {
            val input = EditText(this)
            AlertDialog.Builder(this)
                .setTitle("Enter Device Name")
                .setMessage("Please enter a name for this device:")
                .setView(input)
                .setCancelable(false)
                .setPositiveButton("OK") { _, _ ->
                    deviceName = input.text.toString()
                    prefs.edit().putString(DEVICE_NAME_KEY, deviceName).apply()
                    registerAndCheckDevice(androidId, deviceName!!)
                }
                .show()
        } else {
            registerAndCheckDevice(androidId, deviceName)
        }
    }

    private fun registerAndCheckDevice(androidId: String, deviceName: String) {
        CoroutineScope(Dispatchers.Main).launch {
            val allowed = withContext(Dispatchers.IO) {
                // Register or check device in Supabase
                checkOrRegisterDevice(androidId, deviceName)
            }
            if (allowed) {
                setupWebView()
            } else {
                showPermissionDenied()
            }
        }
    }

    private fun setupWebView() {
        val webView = findViewById<WebView>(R.id.webview)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.cacheMode = WebSettings.LOAD_DEFAULT
        webView.settings.setSupportMultipleWindows(false)
        webView.settings.javaScriptCanOpenWindowsAutomatically = false

        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)
        Log.d(TAG, "Initial cookies: " + cookieManager.getCookie(allowedDomain + allowedPath))

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                Log.d(TAG, "JS: ${consoleMessage?.message()} -- From line ${consoleMessage?.lineNumber()} of ${consoleMessage?.sourceId()}")
                return true
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url.toString()
                Log.d(TAG, "shouldOverrideUrlLoading (request): $url")
                val allowed = url.startsWith(allowedDomain)
                if (!allowed) Log.w(TAG, "Blocked navigation to: $url")
                return !allowed
            }

            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                Log.d(TAG, "shouldOverrideUrlLoading (url): $url")
                val allowed = url != null && url.startsWith(allowedDomain)
                if (!allowed) Log.w(TAG, "Blocked navigation to: $url")
                return !allowed
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                Log.d(TAG, "Page started loading: $url")
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                Log.d(TAG, "Page finished loading: $url")
                Log.d(TAG, "Cookies after load: " + CookieManager.getInstance().getCookie(url))
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                Log.e(TAG, "WebView error: ${error?.description} on ${request?.url}")
            }
        }

        WebView.setWebContentsDebuggingEnabled(true)
        webView.loadUrl(allowedDomain + allowedPath)
        Log.d(TAG, "Loading URL: ${allowedDomain + allowedPath}")
    }

    private fun showPermissionDenied() {
        AlertDialog.Builder(this)
            .setTitle("Permission Denied")
            .setMessage("This device is not allowed to use the app. Please contact support.")
            .setCancelable(false)
            .setPositiveButton("Exit") { _, _ -> finish() }
            .show()
    }

    private fun checkOrRegisterDevice(androidId: String, deviceName: String): Boolean {
        // This is a simple REST call. In production, use a secure backend!
        try {
            // Check if device exists
            val url = URL("$SUPABASE_API_URL?android_id=eq.$androidId")
            val conn = url.openConnection() as HttpURLConnection
            conn.setRequestProperty("apikey", SUPABASE_API_KEY)
            conn.setRequestProperty("Authorization", "Bearer $SUPABASE_API_KEY")
            conn.requestMethod = "GET"
            conn.connectTimeout = 5000
            conn.readTimeout = 5000

            val response = conn.inputStream.bufferedReader().readText()
            val arr = org.json.JSONArray(response)
            if (arr.length() > 0) {
                val obj = arr.getJSONObject(0)
                return obj.optBoolean("allowed", false)
            } else {
                // Register device
                val postUrl = URL(SUPABASE_API_URL)
                val postConn = postUrl.openConnection() as HttpURLConnection
                postConn.setRequestProperty("apikey", SUPABASE_API_KEY)
                postConn.setRequestProperty("Authorization", "Bearer $SUPABASE_API_KEY")
                postConn.setRequestProperty("Content-Type", "application/json")
                postConn.requestMethod = "POST"
                postConn.doOutput = true
                val json = JSONObject()
                json.put("android_id", androidId)
                json.put("device_name", deviceName)
                postConn.outputStream.write(json.toString().toByteArray())
                postConn.outputStream.flush()
                postConn.outputStream.close()
                val postResp = postConn.inputStream.bufferedReader().readText()
                // By default, allowed is true
                return true
            }
        } catch (e: Exception) {
            Log.e(TAG, "Device check/register failed: ${e.message}")
            return false // Deny access on error
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        Log.d(TAG, "Back button pressed (ignored)")
    }
}