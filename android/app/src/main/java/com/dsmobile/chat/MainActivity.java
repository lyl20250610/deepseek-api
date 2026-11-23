package com.dsmobile.chat;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 在 Bridge 创建前注册，确保插件的 load() 早于 WebView 首次加载资源。
        registerPlugin(HotUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
