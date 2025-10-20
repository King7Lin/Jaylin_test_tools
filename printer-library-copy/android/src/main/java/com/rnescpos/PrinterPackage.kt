package com.rnescpos

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.reactnativexprinter.XPrinterModule
import com.reactnativeepsonprinter.EpsonPrinterModule

class PrinterPackage: ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): MutableList<NativeModule> =
        mutableListOf(
            PrinterModule(reactContext),
            XPrinterModule(reactContext), // 同时注册 XPrinter 原生模块
            EpsonPrinterModule(reactContext) // 同时注册 Epson 原生模块
        )

    override fun createViewManagers(reactContext: ReactApplicationContext): MutableList<ViewManager<*, *>> =
        mutableListOf()
}