import React, { useState, useEffect, useRef } from 'react';
import { FanState, MqttConfig, MqttMessageLog } from '../types';
import { 
  Wifi, 
  WifiOff, 
  Play, 
  Square, 
  Send, 
  Clock, 
  Terminal, 
  Database, 
  Settings, 
  RefreshCw, 
  FileCode,
  CheckCircle,
  HelpCircle,
  XCircle
} from 'lucide-react';

interface MqttPanelProps {
  fanState: FanState;
  onStateChange: (updates: Partial<FanState>) => void;
  config: MqttConfig;
  onConfigChange: (newConfig: MqttConfig) => void;
}

export default function MqttPanel({ fanState, onStateChange, config, onConfigChange }: MqttPanelProps) {
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [logs, setLogs] = useState<MqttMessageLog[]>([]);
  const [isPublishingEnabled, setIsPublishingEnabled] = useState(true);
  const [customTopic, setCustomTopic] = useState(config.controlTopic);
  const [customPayload, setCustomPayload] = useState('{\n  "command": "set_preset",\n  "value": 3\n}');

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const publishTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Helper to add logs to terminal ---
  const addLog = (type: MqttMessageLog['type'], payload: string, topic?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const newLog: MqttMessageLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp,
      type,
      topic,
      payload
    };
    setLogs((prev) => [...prev.slice(-99), newLog]); // Keep last 100 logs
  };

  // Scroll to bottom of terminal when logs update
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // --- MQTT Connect simulation ---
  const handleConnect = () => {
    if (connectionState !== 'disconnected') return;

    setConnectionState('connecting');
    addLog('CONNECT', `Connecting to broker URL: ${config.brokerUrl}...`);

    // Simulate 1.2s handshake delay
    setTimeout(() => {
      setConnectionState('connected');
      addLog('CONNACK', `Successfully connected with ClientID: ${config.clientId}`);
      addLog('SUBSCRIBE', `Subscribed to topic: ${config.controlTopic}`);
    }, 1200);
  };

  const handleDisconnect = () => {
    if (connectionState === 'disconnected') return;

    if (publishTimerRef.current) {
      clearInterval(publishTimerRef.current);
      publishTimerRef.current = null;
    }

    addLog('INFO', 'Closing connection with remote MQTT broker.');
    setConnectionState('disconnected');
  };

  // --- Automatic Telemetry Publishing ---
  useEffect(() => {
    if (connectionState === 'connected' && isPublishingEnabled) {
      // Setup interval
      publishTimerRef.current = setInterval(() => {
        // Build telemetry packet
        const telemetryPayload = {
          timestamp: new Date().toISOString(),
          status: fanState.speed > 0 ? 'RUNNING' : 'IDLE',
          rpm: Math.round(fanState.rpm * 10) / 10,
          power_watts: Math.round(fanState.powerUsage * 10) / 10,
          airflow_cfm: fanState.airflow,
          mode: fanState.mode,
          preset_level: fanState.preset,
          oscillation: fanState.isOscillating ? 'ON' : 'OFF',
          temperature_celsius: Math.round((30.2 + fanState.speed * 6.5) * 10) / 10,
          efficiency: fanState.speed > 0 ? Math.round((fanState.airflow / (fanState.powerUsage || 1)) * 10) / 10 : 0
        };

        addLog(
          'PUBLISH_OUT', 
          JSON.stringify(telemetryPayload, null, 2), 
          config.telemetryTopic
        );
      }, config.publishInterval * 1000);
    } else {
      if (publishTimerRef.current) {
        clearInterval(publishTimerRef.current);
        publishTimerRef.current = null;
      }
    }

    return () => {
      if (publishTimerRef.current) {
        clearInterval(publishTimerRef.current);
      }
    };
  }, [connectionState, isPublishingEnabled, fanState, config.telemetryTopic, config.publishInterval]);

  // --- Process commands received on controlTopic ---
  const processCommand = (payloadStr: string) => {
    try {
      const parsed = JSON.parse(payloadStr);
      addLog('PUBLISH_IN', `Received command on ${config.controlTopic}:\n${JSON.stringify(parsed, null, 2)}`, config.controlTopic);

      // Handle properties
      const updates: Partial<FanState> = {};
      let actionTaken = '';

      if (parsed.command === 'set_preset' && typeof parsed.value === 'number') {
        const val = parsed.value as 0 | 1 | 2 | 3;
        if ([0, 1, 2, 3].includes(val)) {
          const speedVals = [0.0, 0.3, 0.65, 1.0];
          updates.preset = val;
          updates.targetSpeed = speedVals[val];
          actionTaken = `Preset speed updated to Level ${val}`;
        }
      } else if (parsed.command === 'set_speed' && typeof parsed.value === 'number') {
        const val = Math.max(0, Math.min(1, parsed.value));
        updates.targetSpeed = val;
        // Determine closest preset
        let nearestPreset: 0 | 1 | 2 | 3 = 0;
        if (val > 0.8) nearestPreset = 3;
        else if (val > 0.4) nearestPreset = 2;
        else if (val > 0.1) nearestPreset = 1;
        updates.preset = nearestPreset;
        actionTaken = `Rotation target speed set to ${(val * 100).toFixed(0)}%`;
      } else if (parsed.command === 'set_oscillation' && typeof parsed.value === 'boolean') {
        updates.isOscillating = parsed.value;
        actionTaken = `Chassis Oscillation set to ${parsed.value ? 'ON' : 'OFF'}`;
      } else if (parsed.command === 'toggle_oscillation') {
        updates.isOscillating = !fanState.isOscillating;
        actionTaken = `Chassis Oscillation toggled to ${!fanState.isOscillating ? 'ON' : 'OFF'}`;
      } else if (parsed.command === 'set_mode' && typeof parsed.value === 'string') {
        const validModes = ['normal', 'natural', 'sleep'];
        if (validModes.includes(parsed.value)) {
          updates.mode = parsed.value as any;
          actionTaken = `Wind dynamic mode set to ${parsed.value}`;
        }
      } else if (parsed.command === 'emergency_stop') {
        updates.speed = 0;
        updates.targetSpeed = 0;
        updates.preset = 0;
        updates.isOscillating = false;
        actionTaken = 'EMERGENCY SHUTDOWN TRIPPED!';
      }

      if (Object.keys(updates).length > 0) {
        onStateChange(updates);
        addLog('INFO', `Digital Twin Local State Synced: ${actionTaken}`);
      } else {
        addLog('INFO', 'Command parsed successfully, but no matching variables matched.');
      }

    } catch (e) {
      addLog('INFO', `JSON Error: Gagal mengurai paket kontrol MQTT. Format salah.`);
    }
  };

  // --- Send Simulated MQTT Control Event ---
  const handlePublishCustom = () => {
    if (connectionState !== 'connected') {
      alert('Sambungkan ke Broker MQTT terlebih dahulu!');
      return;
    }

    addLog('PUBLISH_OUT', customPayload, customTopic);

    // If the topic is our subscribed control topic, process the loopback command
    if (customTopic === config.controlTopic) {
      setTimeout(() => {
        processCommand(customPayload);
      }, 300);
    }
  };

  // Preset payload generator helper
  const loadPresetPayload = (cmdType: string) => {
    let payload = '';
    switch (cmdType) {
      case 'level3':
        payload = '{\n  "command": "set_preset",\n  "value": 3\n}';
        break;
      case 'stop':
        payload = '{\n  "command": "set_preset",\n  "value": 0\n}';
        break;
      case 'osc_on':
        payload = '{\n  "command": "set_oscillation",\n  "value": true\n}';
        break;
      case 'sleep':
        payload = '{\n  "command": "set_mode",\n  "value": "sleep"\n}';
        break;
      case 'emergency':
        payload = '{\n  "command": "emergency_stop"\n}';
        break;
    }
    setCustomPayload(payload);
    setCustomTopic(config.controlTopic);
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('INFO', 'Terminal logs buffer cleared.');
  };

  return (
    <div className="w-full flex flex-col h-full space-y-5 bg-[#121216]">
      
      {/* MQTT HEADER CONSOLE */}
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center space-x-2">
          <Database className="w-4 h-4 text-orange-500" />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Network Link</span>
        </div>
        <div className="flex items-center space-x-2">
          {connectionState === 'connected' ? (
            <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-green-500/15 border border-green-500/30 text-[9px] font-mono text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-ping"></span>
              <span>ONLINE</span>
            </span>
          ) : connectionState === 'connecting' ? (
            <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-yellow-500/15 border border-yellow-500/30 text-[9px] font-mono text-yellow-400">
              <RefreshCw className="h-2 w-2 animate-spin" />
              <span>CONNECTING</span>
            </span>
          ) : (
            <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-[9px] font-mono text-red-400">
              <WifiOff className="h-2 w-2" />
              <span>DISCONNECTED</span>
            </span>
          )}
        </div>
      </div>

      {/* BROKER CONNECTION PANEL */}
      <div className="bg-black/40 p-4 rounded-xl border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-white/50 uppercase tracking-widest flex items-center space-x-1.5">
            <Settings className="w-3.5 h-3.5" />
            <span>Broker Server Configurations</span>
          </span>
          <button
            onClick={() => setIsEditingConfig(!isEditingConfig)}
            className="text-[9px] font-mono uppercase text-orange-400 hover:text-orange-300 underline"
          >
            {isEditingConfig ? 'Selesai' : 'Ubah Config'}
          </button>
        </div>

        {isEditingConfig ? (
          <div className="space-y-2 text-xs font-mono">
            <div>
              <label className="text-white/40 block text-[9px] mb-1">BROKER URI</label>
              <input
                type="text"
                value={config.brokerUrl}
                onChange={(e) => onConfigChange({ ...config, brokerUrl: e.target.value })}
                className="w-full px-2 py-1 bg-black border border-white/10 rounded text-orange-400 focus:outline-none focus:border-orange-500 text-[11px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-white/40 block text-[9px] mb-1">CLIENT ID</label>
                <input
                  type="text"
                  value={config.clientId}
                  onChange={(e) => onConfigChange({ ...config, clientId: e.target.value })}
                  className="w-full px-2 py-1 bg-black border border-white/10 rounded text-slate-300 focus:outline-none text-[10px]"
                />
              </div>
              <div>
                <label className="text-white/40 block text-[9px] mb-1">PUB INTERVAL (S)</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={config.publishInterval}
                  onChange={(e) => onConfigChange({ ...config, publishInterval: Math.max(1, parseInt(e.target.value) || 2) })}
                  className="w-full px-2 py-1 bg-black border border-white/10 rounded text-slate-300 focus:outline-none text-[10px]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-white/40 block text-[9px] mb-1">TELEMETRY TOPIC</label>
                <input
                  type="text"
                  value={config.telemetryTopic}
                  onChange={(e) => onConfigChange({ ...config, telemetryTopic: e.target.value })}
                  className="w-full px-2 py-1 bg-black border border-white/10 rounded text-slate-300 focus:outline-none text-[9px]"
                />
              </div>
              <div>
                <label className="text-white/40 block text-[9px] mb-1">CONTROL TOPIC</label>
                <input
                  type="text"
                  value={config.controlTopic}
                  onChange={(e) => onConfigChange({ ...config, controlTopic: e.target.value })}
                  className="w-full px-2 py-1 bg-black border border-white/10 rounded text-slate-300 focus:outline-none text-[9px]"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-y-1.5 text-[10px] font-mono text-white/70">
            <div>
              <span className="text-white/30 block text-[8px] uppercase">Broker</span>
              <span className="text-orange-400">{config.brokerUrl}</span>
            </div>
            <div>
              <span className="text-white/30 block text-[8px] uppercase">Client ID</span>
              <span className="truncate block max-w-[120px]">{config.clientId}</span>
            </div>
            <div>
              <span className="text-white/30 block text-[8px] uppercase">Telemetry Topic</span>
              <span className="text-blue-400 font-medium">{config.telemetryTopic}</span>
            </div>
            <div>
              <span className="text-white/30 block text-[8px] uppercase">Control Sub Topic</span>
              <span className="text-green-400 font-medium">{config.controlTopic}</span>
            </div>
          </div>
        )}

        {/* CONNECTION TRIGGERS */}
        <div className="flex space-x-2 pt-2">
          {connectionState === 'disconnected' ? (
            <button
              onClick={handleConnect}
              className="flex-1 flex items-center justify-center space-x-1.5 py-2 rounded bg-orange-600 hover:bg-orange-500 text-white font-mono text-[10px] uppercase tracking-wider font-bold cursor-pointer transition-all active:scale-95 shadow-[0_0_15px_rgba(234,88,12,0.15)]"
            >
              <Wifi className="w-3.5 h-3.5" />
              <span>Connect Link</span>
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="flex-1 flex items-center justify-center space-x-1.5 py-2 rounded bg-red-650 hover:bg-red-600 border border-red-500/40 text-white font-mono text-[10px] uppercase tracking-wider font-bold cursor-pointer transition-all active:scale-95"
            >
              <WifiOff className="w-3.5 h-3.5" />
              <span>Disconnect Link</span>
            </button>
          )}

          <button
            onClick={() => setIsPublishingEnabled(!isPublishingEnabled)}
            disabled={connectionState !== 'connected'}
            className={`px-3 py-2 rounded font-mono text-[10px] uppercase tracking-wider border flex items-center space-x-1.5 ${
              connectionState !== 'connected'
                ? 'opacity-40 cursor-not-allowed bg-black/20 border-white/5 text-white/30'
                : isPublishingEnabled
                  ? 'bg-green-650/10 border-green-500/40 text-green-400'
                  : 'bg-yellow-650/10 border-yellow-500/40 text-yellow-400'
            }`}
          >
            {isPublishingEnabled ? <Play className="w-3 h-3 text-green-400" /> : <Square className="w-3 h-3 text-yellow-400" />}
            <span>Auto Pub</span>
          </button>
        </div>
      </div>

      {/* TELEMETRY PACKET TEMPLATE PRESETS */}
      <div className="space-y-2">
        <span className="text-[10px] font-mono text-white/40 uppercase tracking-[0.2em] block">Command Quick Payloads</span>
        <div className="grid grid-cols-5 gap-1.5">
          <button
            onClick={() => loadPresetPayload('level3')}
            className="py-1 bg-black/40 hover:bg-white/5 border border-white/5 rounded text-[8px] font-mono text-white/75"
            title="Sets preset to level 3 (turbo)"
          >
            LVL 3
          </button>
          <button
            onClick={() => loadPresetPayload('stop')}
            className="py-1 bg-black/40 hover:bg-white/5 border border-white/5 rounded text-[8px] font-mono text-white/75"
            title="Sets preset to level 0 (stops fan)"
          >
            STOP
          </button>
          <button
            onClick={() => loadPresetPayload('osc_on')}
            className="py-1 bg-black/40 hover:bg-white/5 border border-white/5 rounded text-[8px] font-mono text-white/75"
            title="Sets oscillation to true"
          >
            OSC ON
          </button>
          <button
            onClick={() => loadPresetPayload('sleep')}
            className="py-1 bg-black/40 hover:bg-white/5 border border-white/5 rounded text-[8px] font-mono text-white/75"
            title="Sets sleep mode"
          >
            SLEEP
          </button>
          <button
            onClick={() => loadPresetPayload('emergency')}
            className="py-1 bg-red-950/20 hover:bg-red-900/30 border border-red-500/30 rounded text-[8px] font-mono text-red-400 font-bold uppercase"
            title="Simulate immediate emergency system stop command"
          >
            HALT!
          </button>
        </div>
      </div>

      {/* MANUAL MQTT PUBLISHER FORM */}
      <div className="bg-black/30 border border-white/5 rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-white/50 uppercase tracking-widest flex items-center space-x-1.5">
            <FileCode className="w-3.5 h-3.5 text-blue-400" />
            <span>Interactive Packet Injector</span>
          </span>
        </div>

        <div className="space-y-1.5 text-[10px] font-mono">
          <div className="flex space-x-2 items-center">
            <span className="text-white/40 text-[9px] uppercase">TOPIC:</span>
            <input
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              className="flex-1 bg-black border border-white/5 rounded px-2 py-0.5 text-slate-300 focus:outline-none"
            />
          </div>
          <textarea
            rows={3}
            value={customPayload}
            onChange={(e) => setCustomPayload(e.target.value)}
            className="w-full bg-black border border-white/5 rounded p-2 text-green-400 font-mono text-[10px] focus:outline-none focus:border-green-500"
            placeholder='{"command": "set_preset", "value": 3}'
          />
        </div>

        <button
          onClick={handlePublishCustom}
          disabled={connectionState !== 'connected'}
          className={`w-full py-1.5 rounded flex items-center justify-center space-x-1.5 font-mono text-[10px] uppercase tracking-wider font-bold transition-all active:scale-98 cursor-pointer ${
            connectionState === 'connected'
              ? 'bg-orange-500 text-black shadow-md hover:bg-orange-400'
              : 'bg-black/20 text-white/30 border border-white/5 cursor-not-allowed'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>Inject Packet</span>
        </button>
      </div>

      {/* REAL-TIME MQTT MONITOR SCROLLING TERMINAL */}
      <div className="flex-1 flex flex-col min-h-[160px] max-h-[220px] bg-black/90 border border-white/10 rounded-xl overflow-hidden font-mono text-[10px] relative">
        <div className="h-7 bg-black flex items-center justify-between px-3.5 border-b border-white/5 z-10">
          <div className="flex items-center space-x-1.5">
            <Terminal className="w-3.5 h-3.5 text-orange-500 animate-pulse" />
            <span className="text-[9px] text-white/50 tracking-wider font-bold">LIVE MQTT MONITOR TERMINAL</span>
          </div>
          <button
            onClick={clearLogs}
            className="text-[8px] text-white/30 hover:text-white underline cursor-pointer"
          >
            Clear logs
          </button>
        </div>

        <div className="flex-1 p-3 overflow-y-auto space-y-2 select-text selection:bg-orange-500/30 selection:text-white custom-scrollbar">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/20 text-center text-[9px] py-6 space-y-1 select-none">
              <Database className="w-6 h-6 stroke-[1.2]" />
              <span>No communications packets captured.</span>
              <span>Connect network link to start.</span>
            </div>
          ) : (
            logs.map((log) => {
              let tagColor = 'text-blue-400';
              if (log.type === 'CONNECT') tagColor = 'text-yellow-400 font-bold';
              if (log.type === 'CONNACK') tagColor = 'text-green-400 font-bold';
              if (log.type === 'SUBSCRIBE') tagColor = 'text-purple-400';
              if (log.type === 'PUBLISH_OUT') tagColor = 'text-orange-400';
              if (log.type === 'PUBLISH_IN') tagColor = 'text-cyan-400 font-bold';
              if (log.type === 'INFO') tagColor = 'text-slate-400';

              return (
                <div key={log.id} className="border-b border-white/5 pb-1.5 leading-relaxed">
                  <div className="flex items-center justify-between text-[8px] text-white/30 mb-0.5">
                    <span>{log.timestamp}</span>
                    <span className={tagColor}>{log.type}</span>
                  </div>
                  {log.topic && (
                    <div className="text-[8px] text-white/40 mb-1 truncate">
                      Topic: <span className="text-white/60 font-medium">{log.topic}</span>
                    </div>
                  )}
                  <pre className="text-[9px] text-slate-300 font-mono whitespace-pre-wrap select-text break-all bg-black/40 p-1.5 rounded border border-white/5">
                    {log.payload}
                  </pre>
                </div>
              );
            })
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>

    </div>
  );
}
