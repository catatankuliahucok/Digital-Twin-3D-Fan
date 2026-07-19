import React, { useState, useEffect } from 'react';
import { FanState } from '../types';
import { 
  Key, 
  Cpu, 
  Network, 
  FileJson, 
  Copy, 
  Check, 
  Sparkles, 
  HelpCircle, 
  Trash2, 
  ExternalLink,
  ShieldAlert,
  Save,
  Wrench,
  Wifi,
  Terminal,
  RefreshCw
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

interface HardwareHubProps {
  fanState: FanState;
  mqttTelemetryTopic?: string;
  mqttControlTopic?: string;
  mqttBrokerUrl?: string;
}

export default function HardwareHub({ 
  fanState, 
  mqttTelemetryTopic = 'industrial/fan/1/telemetry', 
  mqttControlTopic = 'industrial/fan/1/control',
  mqttBrokerUrl = 'mqtt://broker.emqx.io:1883'
}: HardwareHubProps) {
  // Config state
  const [apiKey, setApiKey] = useState<string>('');
  const [isApiKeySaved, setIsApiKeySaved] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<'esp32' | 'nodered' | 'wokwi'>('esp32');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Custom AI prompt state
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [isAiGenerating, setIsAiGenerating] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Dynamic code outputs
  const [esp32Code, setEsp32Code] = useState<string>('');
  const [nodeRedFlow, setNodeRedFlow] = useState<string>('');
  const [wokwiJson, setWokwiJson] = useState<string>('');

  // Extract broker hostname and port
  const brokerParts = mqttBrokerUrl.replace('mqtt://', '').replace('ws://', '').split(':');
  const brokerHost = brokerParts[0] || 'broker.emqx.io';
  const brokerPort = brokerParts[1] || '1883';

  // Load API Key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('GEMINI_API_KEY');
    if (savedKey) {
      setApiKey(savedKey);
      setIsApiKeySaved(true);
    }
  }, []);

  // Set up default code templates based on dynamic MQTT configuration
  useEffect(() => {
    // 1. ESP32 Code Template
    const defaultEsp32 = `/*
 * Industrial IoT Digital Twin Fan Controller
 * Microcontroller: ESP32
 * 
 * Subscribes to: ${mqttControlTopic}
 * Publishes to:  ${mqttTelemetryTopic}
 * MQTT Broker:   ${brokerHost}:${brokerPort}
 * 
 * Hardware Layout:
 * - PWM Pin 18 (Fan Motor Speed Control via MOSFET)
 * - Servo Pin 19 (Chassis Oscillation SG90 Servo)
 * - LED RGB Pins 21, 22, 23 (Indicator Emissive LED: RGB color)
 * - I2C SSD1306 OLED (128x64 display showing speed/telemetry)
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// Wi-Fi Credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// MQTT Configuration
const char* mqtt_server = "${brokerHost}";
const int mqtt_port = ${brokerPort};
const char* client_id = "esp32-industrial-fan-01";
const char* control_topic = "${mqttControlTopic}";
const char* telemetry_topic = "${mqttTelemetryTopic}";

// Pin Configurations
#define MOTOR_PWM_PIN 18
#define SERVO_PIN 19
#define RED_LED_PIN 21
#define GREEN_LED_PIN 22
#define BLUE_LED_PIN 23

// OLED Screen Definitions
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// Global Variables
WiFiClient espClient;
PubSubClient client(espClient);
Servo sweepServo;

// Fan Twin Local States
int currentPreset = ${fanState.preset};
float targetSpeedPercent = ${fanState.targetSpeed * 100};
bool isOscillating = ${fanState.isOscillating ? 'true' : 'false'};
String windMode = "${fanState.mode}";
int bladeCount = ${fanState.bladeCount};

// Telemetry counters
float simulatedRpm = ${fanState.rpm};
float simulatedPower = ${fanState.powerUsage};
unsigned long lastTelemetryPublish = 0;
const unsigned long publishInterval = 2000; // 2 seconds

// RGB Color Config matching chosen LED color: ${fanState.ledColor}
// Hex: ${fanState.ledColor}
int ledRedVal = 249;
int ledGreenVal = 115;
int ledBlueVal = 22;

void setup() {
  Serial.begin(115200);
  
  // Set Pin Modes
  pinMode(MOTOR_PWM_PIN, OUTPUT);
  pinMode(RED_LED_PIN, OUTPUT);
  pinMode(GREEN_LED_PIN, OUTPUT);
  pinMode(BLUE_LED_PIN, OUTPUT);
  
  // Attach Servo
  sweepServo.attach(SERVO_PIN);
  sweepServo.write(90); // Center position

  // Initialize OLED display
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 allocation failed"));
  } else {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(WHITE);
    display.setCursor(0, 10);
    display.println("IoT FAN TWIN");
    display.println("Initializing...");
    display.display();
  }

  // Connect to Wi-Fi and MQTT
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void setup_wifi() {
  delay(10);
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(ssid);
  
  display.clearDisplay();
  display.setCursor(0, 10);
  display.print("WiFi: ");
  display.println(ssid);
  display.display();

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("\\nWiFi connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  display.println("Connected!");
  display.display();
  delay(1000);
}

void callback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message arrived on [");
  Serial.print(topic);
  Serial.print("] ");
  
  String payloadStr = "";
  for (int i = 0; i < length; i++) {
    payloadStr += (char)payload[i];
  }
  Serial.println(payloadStr);

  // Parse control JSON command
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, payloadStr);
  
  if (error) {
    Serial.print("deserializeJson() failed: ");
    Serial.println(error.f_str());
    return;
  }

  const char* command = doc["command"];
  
  if (strcmp(command, "set_preset") == 0) {
    currentPreset = doc["value"];
    if (currentPreset == 0) targetSpeedPercent = 0;
    else if (currentPreset == 1) targetSpeedPercent = 30;
    else if (currentPreset == 2) targetSpeedPercent = 65;
    else if (currentPreset == 3) targetSpeedPercent = 100;
    Serial.printf("Command: Set Preset to %d (Speed %.1f%%)\\n", currentPreset, targetSpeedPercent);
  } 
  else if (strcmp(command, "set_speed") == 0) {
    float val = doc["value"];
    targetSpeedPercent = val * 100.0;
    if (val > 0.8) currentPreset = 3;
    else if (val > 0.4) currentPreset = 2;
    else if (val > 0.1) currentPreset = 1;
    else currentPreset = 0;
    Serial.printf("Command: Set Speed to %.1f%%\\n", targetSpeedPercent);
  } 
  else if (strcmp(command, "set_oscillation") == 0) {
    isOscillating = doc["value"];
    Serial.printf("Command: Set Oscillation to %s\\n", isOscillating ? "ON" : "OFF");
  } 
  else if (strcmp(command, "set_mode") == 0) {
    windMode = doc["value"].as<String>();
    Serial.printf("Command: Set Mode to %s\\n", windMode.c_str());
  }
  else if (strcmp(command, "emergency_stop") == 0) {
    targetSpeedPercent = 0;
    currentPreset = 0;
    isOscillating = false;
    Serial.println("EMERGENCY STOP TRIGGERED!");
  }

  // Update OLED display with new configurations
  update_display();
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    display.clearDisplay();
    display.setCursor(0, 10);
    display.println("Connecting MQTT...");
    display.display();

    if (client.connect(client_id)) {
      Serial.println("MQTT Connected!");
      client.subscribe(control_topic);
      display.println("Subscribed!");
      display.display();
      delay(500);
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void update_display() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0, 0);
  
  display.print("TWIN FAN [");
  display.print(windMode);
  display.println("]");
  
  display.drawLine(0, 10, 128, 10, WHITE);
  
  display.setCursor(0, 16);
  display.print("Preset: ");
  display.println(currentPreset);
  
  display.print("Speed : ");
  display.print(targetSpeedPercent);
  display.println("%");
  
  display.print("Oscill: ");
  display.println(isOscillating ? "SWEEPING" : "STATIONARY");
  
  display.print("Power : ");
  display.print(simulatedPower);
  display.println(" W");

  display.display();
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // Run chassis servo sweeps if oscillation is active
  if (isOscillating) {
    static int angle = 90;
    static int direction = 1;
    static unsigned long lastSweep = 0;
    if (millis() - lastSweep > 30) { // sweeping movement rate
      angle += direction;
      if (angle >= 140 || angle <= 40) direction = -direction;
      sweepServo.write(angle);
      lastSweep = millis();
    }
  }

  // Speed and power simulations mapping back to dynamic Twin telemetry
  float speedFactor = targetSpeedPercent / 100.0;
  simulatedRpm = speedFactor * 1650.0;
  simulatedPower = speedFactor * speedFactor * 72.0; // quadratic curves

  // Publish telemetry every 2 seconds
  if (millis() - lastTelemetryPublish > publishInterval) {
    lastTelemetryPublish = millis();
    
    StaticJsonDocument<256> telemetryDoc;
    telemetryDoc["timestamp"] = String(millis() / 1000) + "s";
    telemetryDoc["status"] = (targetSpeedPercent > 0) ? "RUNNING" : "IDLE";
    telemetryDoc["rpm"] = simulatedRpm;
    telemetryDoc["power_watts"] = simulatedPower;
    telemetryDoc["mode"] = windMode;
    telemetryDoc["preset_level"] = currentPreset;
    telemetryDoc["oscillation"] = isOscillating ? "ON" : "OFF";
    telemetryDoc["temperature_celsius"] = 30.2 + (speedFactor * 6.5);

    char buffer[256];
    serializeJson(telemetryDoc, buffer);
    client.publish(telemetry_topic, buffer);
    
    Serial.print("Published Telemetry: ");
    Serial.println(buffer);

    update_display();
  }
}`;
    setEsp32Code(defaultEsp32);

    // 2. Node-RED Flow Template
    const defaultNodeRed = `[
  {
    "id": "twin_flow_tab",
    "type": "tab",
    "label": "Twin Fan Controller",
    "disabled": false,
    "info": "Control deck and telemetry dashboard flow for the Industrial Digital Twin Fan"
  },
  {
    "id": "mqtt_in_telemetry",
    "type": "mqtt in",
    "z": "twin_flow_tab",
    "name": "Listen Telemetry",
    "topic": "${mqttTelemetryTopic}",
    "qos": "0",
    "datatype": "json",
    "broker": "twin_broker_instance",
    "nl": false,
    "rap": true,
    "rh": 0,
    "inputs": 0,
    "x": 160,
    "y": 140,
    "wires": [["debug_telemetry", "gauge_rpm", "gauge_power"]]
  },
  {
    "id": "mqtt_out_control",
    "type": "mqtt out",
    "z": "twin_flow_tab",
    "name": "Publish Control Commands",
    "topic": "${mqttControlTopic}",
    "qos": "0",
    "retain": "false",
    "respTopic": "",
    "contentType": "",
    "userProps": "",
    "correl": "",
    "expiry": "",
    "broker": "twin_broker_instance",
    "x": 640,
    "y": 300,
    "wires": []
  },
  {
    "id": "btn_preset_3",
    "type": "ui_button",
    "z": "twin_flow_tab",
    "name": "Preset Level 3",
    "group": "fan_controls_group",
    "order": 1,
    "width": 0,
    "height": 0,
    "passthru": false,
    "label": "LEVEL 3 (MAX)",
    "tooltip": "",
    "color": "",
    "bgcolor": "#F97316",
    "icon": "fa-fire",
    "payload": "{\\"command\\":\\"set_preset\\",\\"value\\":3}",
    "payloadType": "json",
    "topic": "topic",
    "topicType": "msg",
    "x": 160,
    "y": 280,
    "wires": [["mqtt_out_control"]]
  },
  {
    "id": "btn_stop",
    "type": "ui_button",
    "z": "twin_flow_tab",
    "name": "Emergency Stop",
    "group": "fan_controls_group",
    "order": 2,
    "width": 0,
    "height": 0,
    "passthru": false,
    "label": "EMERGENCY SHUTDOWN",
    "tooltip": "",
    "color": "#fff",
    "bgcolor": "#dc2626",
    "icon": "fa-exclamation-triangle",
    "payload": "{\\"command\\":\\"emergency_stop\\"}",
    "payloadType": "json",
    "topic": "topic",
    "topicType": "msg",
    "x": 170,
    "y": 340,
    "wires": [["mqtt_out_control"]]
  },
  {
    "id": "gauge_rpm",
    "type": "ui_gauge",
    "z": "twin_flow_tab",
    "name": "RPM Indicator",
    "group": "fan_telemetry_group",
    "order": 1,
    "width": 0,
    "height": 0,
    "gtype": "gage",
    "title": "Rotational Velocity",
    "label": "RPM",
    "format": "{{msg.payload.rpm}}",
    "min": 0,
    "max": "1800",
    "colors": ["#10b981", "#f59e0b", "#ef4444"],
    "seg1": "600",
    "seg2": "1200",
    "diff": false,
    "className": "",
    "x": 420,
    "y": 100,
    "wires": []
  },
  {
    "id": "gauge_power",
    "type": "ui_gauge",
    "z": "twin_flow_tab",
    "name": "Power draw Indicator",
    "group": "fan_telemetry_group",
    "order": 2,
    "width": 0,
    "height": 0,
    "gtype": "gage",
    "title": "Active Power Draw",
    "label": "Watts",
    "format": "{{msg.payload.power_watts}}",
    "min": 0,
    "max": "90",
    "colors": ["#3b82f6", "#10b981", "#ef4444"],
    "seg1": "25",
    "seg2": "65",
    "diff": false,
    "className": "",
    "x": 440,
    "y": 160,
    "wires": []
  },
  {
    "id": "debug_telemetry",
    "type": "debug",
    "z": "twin_flow_tab",
    "name": "Debug Log",
    "active": true,
    "tosidebar": true,
    "console": false,
    "tostatus": false,
    "complete": "payload",
    "targetType": "msg",
    "statusVal": "",
    "statusType": "auto",
    "x": 410,
    "y": 40,
    "wires": []
  },
  {
    "id": "twin_broker_instance",
    "type": "mqtt-broker",
    "name": "Twin Public MQTT EMQX",
    "broker": "${brokerHost}",
    "port": "${brokerPort}",
    "clientid": "nodered-twin-fan-sub-client",
    "autoConnect": true,
    "usetls": false,
    "protocolVersion": "4",
    "keepalive": "60",
    "cleansession": true,
    "birthTopic": "",
    "birthQos": "0",
    "birthPayload": "",
    "birthMsg": {},
    "closeTopic": "",
    "closeQos": "0",
    "closePayload": "",
    "closeMsg": {},
    "willTopic": "",
    "willQos": "0",
    "willPayload": "",
    "willMsg": {}
  },
  {
    "id": "fan_controls_group",
    "type": "ui_group",
    "name": "Twin Override Commands",
    "tab": "twin_dashboard_tab",
    "order": 2,
    "disp": true,
    "width": "6",
    "collapse": false,
    "className": ""
  },
  {
    "id": "fan_telemetry_group",
    "type": "ui_group",
    "name": "Real-time Telemetry Data",
    "tab": "twin_dashboard_tab",
    "order": 1,
    "disp": true,
    "width": "6",
    "collapse": false,
    "className": ""
  },
  {
    "id": "twin_dashboard_tab",
    "type": "ui_tab",
    "name": "IoT Twin Console",
    "icon": "dashboard",
    "order": 1,
    "disabled": false,
    "hidden": false
  }
]`;
    setNodeRedFlow(defaultNodeRed);

    // 3. Wokwi diagram.json Template
    const defaultWokwi = `{
  "version": 1,
  "author": "IoT Twin Developer",
  "editor": "wokwi",
  "parts": [
    { "type": "board-esp32-devkit-c-v4", "id": "esp", "top": 0, "left": 0, "attrs": {} },
    { "type": "board-ssd1306", "id": "oled", "top": -150, "left": -80, "attrs": { "i2cAddress": "0x3c" } },
    { "type": "wokwi-servo", "id": "servo", "top": -100, "left": 180, "attrs": {} },
    { "type": "wokwi-led-bar", "id": "indicator", "top": 120, "left": -120, "attrs": { "colors": ["red", "green", "blue", "yellow", "cyan"] } }
  ],
  "connections": [
    [ "esp:GND.1", "oled:GND", "black", [ "v0" ] ],
    [ "esp:3V3", "oled:VCC", "red", [ "v0" ] ],
    [ "esp:IO22", "oled:SCL", "yellow", [ "v0" ] ],
    [ "esp:IO21", "oled:SDA", "blue", [ "v0" ] ],

    [ "esp:GND.2", "servo:GND", "black", [ "h0" ] ],
    [ "esp:5V", "servo:VCC", "red", [ "h0" ] ],
    [ "esp:IO19", "servo:PWM", "orange", [ "h0" ] ],

    [ "esp:GND.3", "indicator:GND", "black", [ "v0" ] ],
    [ "esp:IO18", "indicator:A1", "green", [ "v0" ] ]
  ],
  "dependencies": {}
}`;
    setWokwiJson(defaultWokwi);
  }, [mqttTelemetryTopic, mqttControlTopic, mqttBrokerUrl, fanState]);

  // Handle saving API Key
  const handleSaveApiKey = () => {
    if (!apiKey.trim()) {
      alert('Masukkan API Key yang valid terlebih dahulu!');
      return;
    }
    localStorage.setItem('GEMINI_API_KEY', apiKey.trim());
    setIsApiKeySaved(true);
    setAiError(null);
  };

  const handleClearApiKey = () => {
    localStorage.removeItem('GEMINI_API_KEY');
    setApiKey('');
    setIsApiKeySaved(false);
  };

  // Copy text to clipboard
  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(type);
    setTimeout(() => {
      setCopiedText(null);
    }, 2000);
  };

  // AI Refactoring via Gemini
  const handleAiRefactor = async () => {
    if (!apiKey.trim()) {
      setAiError('Anda harus memasukkan dan menyimpan API Key Gemini terlebih dahulu!');
      return;
    }
    if (!aiPrompt.trim()) {
      setAiError('Masukkan permintaan kustomisasi terlebih dahulu (misal: "Tambahkan sensor suhu DHT22 ke data telemetry").');
      return;
    }

    setIsAiGenerating(true);
    setAiError(null);

    try {
      // Initialize client-side SDK safely with user's inputted key
      const ai = new GoogleGenAI({ 
        apiKey: apiKey.trim(),
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      let systemPrompt = '';
      let targetCodeToModify = '';

      if (activeSubTab === 'esp32') {
        systemPrompt = "You are an expert embedded systems and firmware architect. Customize the provided ESP32 Arduino code based on the user's requirements. Keep all MQTT connectivity logic and JSON serialization intact. Respond ONLY with the raw C++ code. Do not wrap it in markdown code blocks like ```cpp.";
        targetCodeToModify = esp32Code;
      } else if (activeSubTab === 'nodered') {
        systemPrompt = "You are a Node-RED systems analyst. Customize the provided Node-RED JSON flow array based on the user's instructions. Ensure the JSON is valid and properly closed. Respond ONLY with the raw minified or formatted JSON. Do not wrap in markdown code blocks.";
        targetCodeToModify = nodeRedFlow;
      } else {
        systemPrompt = "You are an expert Wokwi schematic designer. Modify the provided diagram.json file based on the user's hardware additions. Ensure valid JSON. Respond ONLY with the raw diagram JSON. Do not wrap in markdown code blocks.";
        targetCodeToModify = wokwiJson;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          { text: systemPrompt },
          { text: `Original code/configuration:\n\n${targetCodeToModify}` },
          { text: `User requested changes:\n\n${aiPrompt}` }
        ]
      });

      let textOutput = response.text || '';
      
      // Clean up markdown block wraps if they were included by accident
      if (textOutput.startsWith('```')) {
        const lines = textOutput.split('\n');
        if (lines[0].startsWith('```')) {
          lines.shift();
        }
        if (lines[lines.length - 1].startsWith('```')) {
          lines.pop();
        }
        textOutput = lines.join('\n');
      }

      if (activeSubTab === 'esp32') {
        setEsp32Code(textOutput.trim());
      } else if (activeSubTab === 'nodered') {
        setNodeRedFlow(textOutput.trim());
      } else {
        setWokwiJson(textOutput.trim());
      }

      setAiPrompt('');
      setAiError(null);
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || 'Gagal memproses AI kustomisasi. Silakan periksa validitas API Key.');
    } finally {
      setIsAiGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* 1. API KEY CONFIG SECTION */}
      <div className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-white/80">
            <Key className="w-4 h-4 text-orange-500" />
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider">Pengaturan API Key Gemini</h4>
          </div>
          <div className="flex items-center">
            {isApiKeySaved ? (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[8px] font-mono font-semibold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                ACTIVE (SAVED LOCAL)
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-[8px] font-mono font-semibold text-yellow-400">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-500"></span>
                OFFLINE ONLY
              </span>
            )}
          </div>
        </div>

        <p className="text-[10px] font-mono text-white/50 leading-relaxed">
          Masukkan <strong>Gemini API Key</strong> Anda untuk mengaktifkan <strong>Fitur Kustomisasi AI</strong>. 
          API Key Anda disimpan secara aman hanya di dalam browser Anda (Local Storage) dan digunakan langsung ke server Google.
        </p>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              id="api-key-input"
              type="password"
              placeholder="Masukkan Gemini API Key..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={isApiKeySaved}
              className="w-full bg-black/60 border border-white/10 rounded px-3 py-1.5 text-xs font-mono text-white/90 placeholder-white/20 focus:outline-none focus:border-orange-500/60 disabled:text-white/40 disabled:bg-black/30"
            />
          </div>

          {isApiKeySaved ? (
            <button
              id="btn-clear-api-key"
              onClick={handleClearApiKey}
              className="px-3 py-1.5 bg-red-950/30 hover:bg-red-900/40 border border-red-500/30 text-red-400 rounded text-xs font-mono transition-all cursor-pointer flex items-center space-x-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus</span>
            </button>
          ) : (
            <button
              id="btn-save-api-key"
              onClick={handleSaveApiKey}
              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded text-xs font-mono font-bold tracking-wider transition-all cursor-pointer flex items-center space-x-1"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Simpan</span>
            </button>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <a
            href="https://aistudio.google.com/"
            target="_blank"
            rel="noreferrer"
            className="text-[9px] font-mono text-cyan-400 hover:underline flex items-center gap-1"
          >
            Dapatkan API Key Gratis di Google AI Studio <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>

      {/* 2. DYNAMIC INTEGRATION GENERATOR */}
      <div className="space-y-4">
        <div className="flex border-b border-white/10">
          {(['esp32', 'nodered', 'wokwi'] as const).map((subTab) => (
            <button
              key={subTab}
              id={`btn-hw-tab-${subTab}`}
              onClick={() => setActiveSubTab(subTab)}
              className={`flex-1 py-2 text-center font-mono text-[9px] uppercase tracking-wider font-bold border-b-2 transition-all cursor-pointer ${
                activeSubTab === subTab
                  ? 'border-orange-500 text-white font-extrabold bg-orange-500/5'
                  : 'border-transparent text-white/40 hover:text-white/80'
              }`}
            >
              {subTab === 'esp32' && '⚡ ESP32 FIRMWARE'}
              {subTab === 'nodered' && '📦 Node-RED Flow'}
              {subTab === 'wokwi' && '💻 Wokwi JSON'}
            </button>
          ))}
        </div>

        {/* Tab description label */}
        <div className="text-[10px] font-mono text-white/50 leading-relaxed bg-black/20 p-3 rounded-lg border border-white/5 flex items-start gap-2.5">
          <Cpu className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <div>
            {activeSubTab === 'esp32' && (
              <span>
                Kode C++ Arduino ESP32 lengkap untuk disambungkan ke micro-hardware Anda. Telah dikonfigurasi otomatis agar dapat sinkron secara real-time dengan <strong>MQTT Twin Broker</strong>.
              </span>
            )}
            {activeSubTab === 'nodered' && (
              <span>
                JSON Flow Node-RED lengkap untuk mengimpor dasbor IoT Anda. Berisi Gauge RPM, indikator beban daya, tombol remote override, dan broker link.
              </span>
            )}
            {activeSubTab === 'wokwi' && (
              <span>
                Berkas layout sirkuit <code>diagram.json</code> untuk simulator perangkat keras daring di <strong>Wokwi.com</strong>. Lengkap dengan OLED LCD, ESP32, Servo, dan Motor LED.
              </span>
            )}
          </div>
        </div>

        {/* --- AI CUSTOMIZER FIELD --- */}
        <div className="bg-orange-500/5 border border-orange-500/10 rounded-xl p-4 space-y-3 relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 opacity-5 pointer-events-none">
            <Sparkles className="w-24 h-24 text-orange-500" />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <Sparkles className="w-4 h-4 text-orange-400" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-orange-400">
                Gemini AI Refactor Code
              </span>
            </div>
            {!isApiKeySaved && (
              <span className="text-[8px] font-mono text-yellow-500 flex items-center gap-1 bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/20">
                <ShieldAlert className="w-3 h-3" /> API Key Diperlukan
              </span>
            )}
          </div>

          <p className="text-[10px] font-mono text-white/40 leading-normal">
            Kustomisasi kode ini secara cerdas! Tambahkan sensor (DHT22, LDR), layar LCD alternatif (LCD 16x2, TFT), atau ubah pin mikrokontroler menggunakan kecerdasan Gemini.
          </p>

          <div className="flex gap-2">
            <input
              id="ai-customizer-input"
              type="text"
              placeholder={
                activeSubTab === 'esp32' 
                  ? 'Contoh: "Tambahkan sensor suhu DHT11 dan kirimkan datanya ke MQTT"' 
                  : activeSubTab === 'nodered'
                    ? 'Contoh: "Tambahkan chart visualisasi data baru ke Node-RED flow ini"'
                    : 'Contoh: "Tambahkan sensor ultrasonik dan hubungkan ke pin GPIO 4"'
              }
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              disabled={isAiGenerating || !isApiKeySaved}
              className="flex-1 bg-black/60 border border-white/10 rounded px-3 py-1.5 text-xs font-mono text-white/90 placeholder-white/20 focus:outline-none focus:border-orange-500/60 disabled:text-white/20 disabled:bg-black/40"
            />
            <button
              id="btn-ai-submit"
              onClick={handleAiRefactor}
              disabled={isAiGenerating || !isApiKeySaved || !aiPrompt.trim()}
              className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:bg-white/5 disabled:text-white/20 disabled:border-transparent text-white border border-orange-500/30 rounded text-xs font-mono font-bold transition-all cursor-pointer flex items-center space-x-1.5"
            >
              {isAiGenerating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>MEMPROSES...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>KUSTOMISASI AI</span>
                </>
              )}
            </button>
          </div>

          {aiError && (
            <div className="text-[9px] font-mono text-red-400 bg-red-950/20 border border-red-500/30 rounded p-2.5">
              {aiError}
            </div>
          )}
        </div>

        {/* --- CODE VIEWER --- */}
        <div className="relative border border-white/10 rounded-xl overflow-hidden bg-black/60">
          
          {/* Viewer top bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-[#121216]">
            <div className="flex items-center space-x-2">
              <div className="flex space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/60"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-green-500/60"></span>
              </div>
              <span className="text-[9px] font-mono text-white/40 tracking-wider">
                {activeSubTab === 'esp32' && 'industrial_iot_fan.ino'}
                {activeSubTab === 'nodered' && 'node_red_flow_import.json'}
                {activeSubTab === 'wokwi' && 'diagram.json'}
              </span>
            </div>
            
            <button
              id="btn-copy-code"
              onClick={() => {
                const targetText = activeSubTab === 'esp32' ? esp32Code : activeSubTab === 'nodered' ? nodeRedFlow : wokwiJson;
                handleCopy(targetText, activeSubTab);
              }}
              className="px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 hover:text-white transition-all text-[9px] font-mono flex items-center space-x-1 cursor-pointer"
            >
              {copiedText === activeSubTab ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">TERSALIN!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>SALIN KODE</span>
                </>
              )}
            </button>
          </div>

          {/* Actual Code Area */}
          <div className="p-4 overflow-x-auto max-h-[380px] font-mono text-[10px] text-zinc-300 leading-relaxed whitespace-pre select-all selection:bg-orange-500/20">
            {activeSubTab === 'esp32' && esp32Code}
            {activeSubTab === 'nodered' && nodeRedFlow}
            {activeSubTab === 'wokwi' && wokwiJson}
          </div>
        </div>

        {/* Node-RED and Wokwi setup tips */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          <div className="p-3 rounded-lg border border-white/5 bg-black/20 space-y-1">
            <span className="text-[8px] font-mono text-white/40 uppercase tracking-widest block">Panduan Node-RED</span>
            <p className="text-[10px] font-mono text-white/60 leading-normal">
              1. Buka Node-RED Editor Anda.<br />
              2. Klik menu <strong>Import</strong> (Ctrl+I).<br />
              3. Tempel JSON flow dari tab di atas dan klik <strong>Import</strong>.<br />
              4. Deploy flow dan buka dasbor Node-RED Anda!
            </p>
          </div>
          <div className="p-3 rounded-lg border border-white/5 bg-black/20 space-y-1">
            <span className="text-[8px] font-mono text-white/40 uppercase tracking-widest block">Panduan Simulator Wokwi</span>
            <p className="text-[10px] font-mono text-white/60 leading-normal">
              1. Buka <strong>wokwi.com</strong> dan pilih proyek <strong>ESP32</strong>.<br />
              2. Cari tab <strong>diagram.json</strong> di editor Wokwi.<br />
              3. Tempel isi JSON di atas untuk menyusun sirkuit otomatis.<br />
              4. Salin kode firmware ESP32 ke tab <strong>sketch.ino</strong> dan jalankan simulasi!
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}
