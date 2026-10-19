package br.com.rjcompressores.despesasmobile;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(TripNotificationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
