import React, { useRef, useState, useEffect } from 'react';
import { FanState, FAN_COLORS, LED_COLORS, SPEED_PRESETS, FanMode } from '../types';
import { 
  Fan, 
  Wind, 
  Moon, 
  Zap, 
  Gauge, 
  RefreshCw, 
  Palette, 
  Activity, 
  Eye, 
  EyeOff, 
  Volume2, 
  Sliders,
  Check
} from 'lucide-react';
import { motion, useAnimation } from 'motion/react';
import MqttPanel from './MqttPanel';
import HardwareHub from './HardwareHub';
import { MqttConfig } from '../types';

interface FanControlPanelProps {
  fanState: FanState;
  onStateChange: (updates: Partial<FanState>) => void;
}

export default function FanControlPanel({ fanState, onStateChange }: FanControlPanelProps) {
  const [activeTab, setActiveTab] = useState<'controls' | 'mqtt' | 'hardware'>('controls');
  const [mqttConfig, setMqttConfig] = useState<MqttConfig>({
    brokerUrl: 'mqtt://broker.emqx.io:1883',
    clientId: 'digital-twin-fan-' + Math.floor(Math.random() * 10000),
    telemetryTopic: 'industrial/fan/1/telemetry',
    controlTopic: 'industrial/fan/1/control',
    publishInterval: 2, // 2 seconds
  });
  const dialRef = useRef<HTMLDivElement>(null);
  const [isDraggingDial, setIsDraggingDial] = useState(false);
  const [isDraggingCord, setIsDraggingCord] = useState(false);
  const [cordOffset, setCordOffset] = useState(0);
  const cordControls = useAnimation();

  // --- 1. Interactive Circular Drag Speed Dial ---
  const handleDialMove = (clientX: number, clientY: number) => {
    if (!dialRef.current) return;
    const rect = dialRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    let angle = Math.atan2(dy, dx); 
    let degrees = (angle * 180) / Math.PI;
    
    let normalizedDegrees = degrees + 135; 
    if (normalizedDegrees < 0) normalizedDegrees += 360;
    if (normalizedDegrees > 360) normalizedDegrees -= 360;

    let speedFraction = 0;
    if (normalizedDegrees <= 270) {
      speedFraction = normalizedDegrees / 270;
    } else if (normalizedDegrees > 270 && normalizedDegrees < 315) {
      speedFraction = 0;
    } else {
      speedFraction = 1;
    }

    const finalSpeed = Math.max(0.0, Math.min(1.0, Math.round(speedFraction * 100) / 100));

    let nearestPreset: 0 | 1 | 2 | 3 = 0;
    let minDiff = 999;
    ([0, 1, 2, 3] as const).forEach(p => {
      const diff = Math.abs(SPEED_PRESETS[p].speedVal - finalSpeed);
      if (diff < minDiff) {
        minDiff = diff;
        nearestPreset = p;
      }
    });

    onStateChange({
      targetSpeed: finalSpeed,
      preset: nearestPreset,
    });
  };

  const handleDialMouseDown = (e: React.MouseEvent) => {
    setIsDraggingDial(true);
    handleDialMove(e.clientX, e.clientY);
  };

  const handleDialTouchStart = (e: React.TouchEvent) => {
    setIsDraggingDial(true);
    if (e.touches[0]) {
      handleDialMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent) => {
      if (isDraggingDial) {
        handleDialMove(e.clientX, e.clientY);
      }
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (isDraggingDial && e.touches[0]) {
        handleDialMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleGlobalUp = () => {
      if (isDraggingDial) {
        setIsDraggingDial(false);
      }
    };

    if (isDraggingDial) {
      window.addEventListener('mousemove', handleGlobalMove);
      window.addEventListener('mouseup', handleGlobalUp);
      window.addEventListener('touchmove', handleGlobalTouchMove);
      window.addEventListener('touchend', handleGlobalUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [isDraggingDial]);

  // --- 2. Interactive Tactile Pull Cord ---
  const handleCordMove = (clientY: number) => {
    if (!isDraggingCord) return;
    const maxPull = 120; 
    const deltaY = Math.max(0, Math.min(maxPull, clientY));
    setCordOffset(deltaY);
  };

  const handleCordStart = () => {
    setIsDraggingCord(true);
  };

  useEffect(() => {
    const handleGlobalCordMove = (e: MouseEvent) => {
      if (isDraggingCord) {
        handleCordMove(e.movementY + cordOffset);
      }
    };

    const handleGlobalCordTouchMove = (e: TouchEvent) => {
      if (isDraggingCord && e.touches[0]) {
        const currentTouchY = e.touches[0].clientY;
        handleCordMove(currentTouchY - 450); 
      }
    };

    const handleGlobalCordUp = () => {
      if (isDraggingCord) {
        setIsDraggingCord(false);

        if (cordOffset > 35) {
          const nextPreset = ((fanState.preset + 1) % 4) as 0 | 1 | 2 | 3;
          onStateChange({
            preset: nextPreset,
            targetSpeed: SPEED_PRESETS[nextPreset].speedVal,
          });
        }

        cordControls.start({
          y: 0,
          transition: { type: 'spring', stiffness: 400, damping: 15 }
        });
        setCordOffset(0);
      }
    };

    if (isDraggingCord) {
      window.addEventListener('mousemove', handleGlobalCordMove);
      window.addEventListener('mouseup', handleGlobalCordUp);
      window.addEventListener('touchmove', handleGlobalCordTouchMove);
      window.addEventListener('touchend', handleGlobalCordUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalCordMove);
      window.removeEventListener('mouseup', handleGlobalCordUp);
      window.removeEventListener('touchmove', handleGlobalCordTouchMove);
      window.removeEventListener('touchend', handleGlobalCordUp);
    };
  }, [isDraggingCord, cordOffset, fanState.preset]);

  const selectPreset = (p: 0 | 1 | 2 | 3) => {
    onStateChange({
      preset: p,
      targetSpeed: SPEED_PRESETS[p].speedVal,
    });
  };

  // Convert targetSpeed to rotation degrees (-135 to +135)
  const currentDegrees = -135 + (fanState.targetSpeed * 270);

  // Sound description translations
  const getFanSoundDescription = () => {
    if (fanState.rpm === 0) return 'Muted (Engine Static)';
    if (fanState.rpm < 200) return 'Ultra Fine Hum 🔇';
    if (fanState.rpm < 600) return 'Whispering Breeze 🍃';
    if (fanState.rpm < 1100) return 'Balanced Airflow 🌀';
    return 'Turbo Velocity Hum ⚡';
  };

  // Emergency Stop Trigger
  const handleEmergencyStop = () => {
    onStateChange({
      speed: 0,
      targetSpeed: 0,
      preset: 0,
      isOscillating: false,
    });
  };

  return (
    <div className="w-full bg-[#121216] border border-white/10 rounded-2xl flex flex-col h-full overflow-hidden">
      
      {/* Tab Selectors */}
      <div className="flex border-b border-white/10 shrink-0">
        <button
          id="tab-controls"
          onClick={() => setActiveTab('controls')}
          className={`flex-1 py-3 text-center font-mono text-[10px] uppercase tracking-[0.2em] font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'controls'
              ? 'border-orange-500 text-orange-500 bg-orange-500/5'
              : 'border-transparent text-white/40 hover:text-white/80'
          }`}
        >
          ⚙️ Controls
        </button>
        <button
          id="tab-mqtt"
          onClick={() => setActiveTab('mqtt')}
          className={`flex-1 py-3 text-center font-mono text-[10px] uppercase tracking-[0.2em] font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'mqtt'
              ? 'border-orange-500 text-orange-500 bg-orange-500/5'
              : 'border-transparent text-white/40 hover:text-white/80'
          }`}
        >
          🌐 MQTT Twin
        </button>
        <button
          id="tab-hardware"
          onClick={() => setActiveTab('hardware')}
          className={`flex-1 py-3 text-center font-mono text-[10px] uppercase tracking-[0.2em] font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'hardware'
              ? 'border-orange-500 text-orange-500 bg-orange-500/5'
              : 'border-transparent text-white/40 hover:text-white/80'
          }`}
        >
          🔌 HW Link
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'controls' ? (
          <>
            {/* 1. COMPONENT HEADER */}
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl bg-orange-950/20 border border-orange-500/30 text-orange-400 ${fanState.rpm > 0 ? 'animate-spin' : ''}`} style={{ animationDuration: `${Math.max(0.3, 3 - (fanState.speed * 2.8))}s` }}>
                    <Fan className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-white/40 uppercase tracking-[0.2em] block">Control Deck</span>
                    <h2 className="text-sm font-bold text-white tracking-widest uppercase font-mono">Control Interface</h2>
                  </div>
                </div>
                <div className="flex items-center space-x-2 px-2.5 py-1 rounded-md bg-black/40 border border-white/10 text-[9px] font-mono text-white/50 tracking-wider">
                  <span className={`h-2 w-2 rounded-full ${fanState.preset > 0 ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)] animate-pulse' : 'bg-red-500'}`}></span>
                  <span>{fanState.preset > 0 ? 'ENGAGED' : 'STANDBY'}</span>
                </div>
              </div>
            </div>

            {/* 2. SPEED CONTROLLER (ROTATIONAL VELOCITY DIAL) */}
            <div className="flex flex-col items-center py-2 relative">
              <label className="text-[10px] font-mono text-white/40 uppercase tracking-[0.2em] mb-4 block">Rotational Velocity</label>
              
              {/* The Dial Ring Container */}
              <div 
                ref={dialRef}
                onMouseDown={handleDialMouseDown}
                onTouchStart={handleDialTouchStart}
                className={`relative w-44 h-44 rounded-full border border-white/5 ${isDraggingDial ? 'cursor-grabbing bg-orange-950/10' : 'cursor-grab bg-black/40'} flex items-center justify-center transition-colors duration-200 shadow-inner`}
              >
                {/* Glowing Dial Arc */}
                <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
                  <circle
                    cx="88"
                    cy="88"
                    r="76"
                    className="stroke-black/50 fill-none"
                    strokeWidth="5"
                  />
                  <circle
                    cx="88"
                    cy="88"
                    r="76"
                    className="stroke-orange-500 fill-none transition-all duration-75"
                    strokeWidth="6"
                    strokeDasharray={2 * Math.PI * 76}
                    strokeDashoffset={2 * Math.PI * 76 * (1 - (fanState.targetSpeed * 0.75))} 
                    strokeLinecap="round"
                    transform="rotate(135 88 88)" 
                  />
                </svg>

                {/* Central Stats Inside Dial */}
                <div className="text-center z-10 pointer-events-none select-none">
                  <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest block">Speed</span>
                  <div className="text-4xl font-light text-white font-mono tracking-tight">
                    {Math.round(fanState.targetSpeed * 100)}
                  </div>
                  <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest mt-0.5 block">Percent</span>
                </div>

                {/* Draggable Indicator Handle */}
                <div 
                  className="absolute w-5 h-5 rounded-full bg-orange-500 border border-white/20 shadow-[0_0_12px_rgba(249,115,22,0.6)] flex items-center justify-center cursor-pointer pointer-events-none"
                  style={{
                    transform: `rotate(${currentDegrees}deg) translateY(-76px) rotate(${-currentDegrees}deg)`,
                  }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-black"></div>
                </div>
              </div>

              {/* Level Presets (0, 1, 2, 3) */}
              <div className="grid grid-cols-4 gap-2 w-full mt-6">
                {([0, 1, 2, 3] as const).map((p) => {
                  const isSelected = fanState.preset === p;
                  return (
                    <button
                      key={p}
                      id={`btn-preset-${p}`}
                      onClick={() => selectPreset(p)}
                      className={`py-2 rounded border transition-all flex flex-col items-center justify-center cursor-pointer ${
                        isSelected 
                          ? 'bg-orange-500 text-black border-orange-400 font-bold shadow-[0_0_15px_rgba(249,115,22,0.3)] scale-[1.03]' 
                          : 'bg-black/40 text-white/60 border-white/10 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span className="text-[8px] opacity-70 font-mono tracking-widest uppercase">LVL</span>
                      <span className="text-sm font-mono font-bold">{p}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. MODE & MOVEMENT */}
            <div className="space-y-3">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-[0.2em] block">System Modes</span>
              
              {/* Wind Mode Selector */}
              <div className="grid grid-cols-3 gap-2 bg-black/30 p-1 rounded border border-white/10">
                {(['normal', 'natural', 'sleep'] as FanMode[]).map((m) => {
                  const isSelected = fanState.mode === m;
                  return (
                    <button
                      key={m}
                      id={`btn-mode-${m}`}
                      onClick={() => onStateChange({ mode: m })}
                      className={`py-1.5 rounded font-mono text-[10px] uppercase tracking-wider font-semibold transition-all flex items-center justify-center space-x-1 ${
                        isSelected 
                          ? 'bg-orange-500 text-black' 
                          : 'text-white/40 hover:text-white'
                      }`}
                    >
                      {m === 'normal' && <Wind className="w-3.5 h-3.5" />}
                      {m === 'natural' && <Activity className="w-3.5 h-3.5" />}
                      {m === 'sleep' && <Moon className="w-3.5 h-3.5" />}
                      <span>{m === 'normal' ? 'Norm' : m === 'natural' ? 'Nat' : 'Sleep'}</span>
                    </button>
                  );
                })}
              </div>

              {/* Oscillation Toggle */}
              <button
                id="btn-oscillation"
                onClick={() => onStateChange({ isOscillating: !fanState.isOscillating })}
                className={`w-full py-2 px-3 rounded font-mono text-[10px] uppercase tracking-widest transition-all flex items-center justify-between border ${
                  fanState.isOscillating 
                    ? 'bg-orange-500/15 border-orange-500/40 text-orange-400 shadow-[inset_0_1px_2px_rgba(249,115,22,0.1)]' 
                    : 'bg-black/40 border-white/10 text-white/60 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <RefreshCw className={`w-3.5 h-3.5 ${fanState.isOscillating ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
                  <span>Chassis Oscillation</span>
                </div>
                <span className="font-bold">{fanState.isOscillating ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            {/* 4. DESIGN CUSTOMIZATION */}
            <div className="space-y-4 border-t border-white/10 pt-4">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-[0.2em] block">Aerodynamic Geometry</span>
              
              {/* Blade count configuration */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-white/60 uppercase tracking-wider">Blade Count</span>
                <div className="flex bg-black/40 p-1 rounded border border-white/10">
                  {([3, 4, 5] as const).map((num) => (
                    <button
                      key={num}
                      id={`btn-blade-${num}`}
                      onClick={() => onStateChange({ bladeCount: num })}
                      className={`w-8 py-1 rounded text-xs font-mono font-bold transition-all ${
                        fanState.bladeCount === num 
                          ? 'bg-orange-500 text-black font-extrabold' 
                          : 'text-white/40 hover:text-white'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fan Body/Chassis Color */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono text-white/60 uppercase tracking-wider flex items-center space-x-1.5">
                    <Palette className="w-3.5 h-3.5" />
                    <span>Chassis Texture</span>
                  </span>
                  <span className="text-[10px] font-mono text-orange-500">
                    {FAN_COLORS.find(c => c.hex === fanState.bodyColor)?.name || 'Custom'}
                  </span>
                </div>
                <div className="flex space-x-2.5">
                  {FAN_COLORS.map((color) => {
                    const isSelected = fanState.bodyColor === color.hex;
                    return (
                      <button
                        key={color.name}
                        id={`btn-color-${color.name.replace(/\s+/g, '-').toLowerCase()}`}
                        onClick={() => onStateChange({ bodyColor: color.hex, bladeColor: color.bladeHex })}
                        className={`w-6 h-6 rounded-full relative border flex items-center justify-center transition-all ${
                          isSelected ? 'border-orange-500 ring-2 ring-black/80 scale-110 shadow-[0_0_8px_rgba(249,115,22,0.5)]' : 'border-white/10 hover:scale-105'
                        }`}
                        style={{ backgroundColor: color.hex }}
                        title={color.name}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white font-bold" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* LED Lights Glow */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono text-white/60 uppercase tracking-wider flex items-center space-x-1.5">
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Indicator Emissive LED</span>
                  </span>
                  <span className="text-[10px] font-mono text-orange-400">
                    {LED_COLORS.find(c => c.hex === fanState.ledColor)?.name || 'LED'}
                  </span>
                </div>
                <div className="flex space-x-2.5">
                  {LED_COLORS.map((ledColor) => {
                    const isSelected = fanState.ledColor === ledColor.hex;
                    return (
                      <button
                        key={ledColor.name}
                        id={`btn-led-${ledColor.name.replace(/\s+/g, '-').toLowerCase()}`}
                        onClick={() => onStateChange({ ledColor: ledColor.hex })}
                        className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
                          isSelected ? 'border-white ring-2 ring-black scale-110' : 'border-transparent hover:scale-105'
                        }`}
                        style={{ 
                          backgroundColor: ledColor.hex,
                          boxShadow: isSelected ? `0 0 10px ${ledColor.hex}` : 'none'
                        }}
                        title={ledColor.name}
                      >
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-black"></div>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Visibility Toggles (Grille, Streamers) */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  id="btn-toggle-grill"
                  onClick={() => onStateChange({ showGrill: !fanState.showGrill })}
                  className="flex items-center justify-between p-2.5 rounded bg-black/40 border border-white/10 text-[10px] font-mono text-white/70 hover:bg-white/5"
                >
                  <div className="flex items-center space-x-1.5">
                    {fanState.showGrill ? <Eye className="w-3.5 h-3.5 text-orange-400" /> : <EyeOff className="w-3.5 h-3.5 text-white/30" />}
                    <span>Metal Grill</span>
                  </div>
                  <span className="font-bold">{fanState.showGrill ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  id="btn-toggle-streamers"
                  onClick={() => onStateChange({ showStreamers: !fanState.showStreamers })}
                  className="flex items-center justify-between p-2.5 rounded bg-black/40 border border-white/10 text-[10px] font-mono text-white/70 hover:bg-white/5"
                >
                  <div className="flex items-center space-x-1.5">
                    <Wind className={`w-3.5 h-3.5 ${fanState.showStreamers && fanState.preset > 0 ? 'animate-bounce text-orange-400' : 'text-white/30'}`} />
                    <span>Ribbons</span>
                  </div>
                  <span className="font-bold">{fanState.showStreamers ? 'ON' : 'OFF'}</span>
                </button>
              </div>
            </div>

            {/* 5. TELEMETRY DISPLAY */}
            <div className="flex-1 flex flex-col gap-3">
              <div className="p-3.5 rounded bg-black/30 border border-white/5">
                <div className="text-[9px] font-mono text-white/40 uppercase tracking-widest mb-0.5">Telemetry RPM Speed</div>
                <div className="text-lg font-mono text-orange-400 tracking-tighter">
                  {fanState.rpm.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} RPM
                </div>
              </div>
              <div className="p-3.5 rounded bg-black/30 border border-white/5">
                <div className="text-[9px] font-mono text-white/40 uppercase tracking-widest mb-0.5">Airflow Volume Output</div>
                <div className="text-lg font-mono text-blue-400 tracking-tighter">
                  {fanState.airflow} CFM
                </div>
              </div>
              <div className="p-3.5 rounded bg-black/30 border border-white/5">
                <div className="text-[9px] font-mono text-white/40 uppercase tracking-widest mb-0.5">Blade Dynamic Temp</div>
                <div className="text-lg font-mono text-slate-300 tracking-tighter">
                  {(30.2 + (fanState.speed * 6.5)).toFixed(1)} °C
                </div>
              </div>
            </div>

            {/* 6. PLAYFUL TACTILE PULL-CORD */}
            <div className="flex flex-col items-center border-t border-white/10 pt-4 relative select-none">
              <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest mb-2">Vintage Pull Thread (Speed Step)</span>
              
              <div className="w-full h-14 flex justify-center relative">
                <div className="absolute top-0 w-3 h-3 rounded-full bg-[#1e1e24] border border-white/20 z-10 shadow-md"></div>
                
                <motion.div 
                  drag="y"
                  dragConstraints={{ top: 0, bottom: 120 }}
                  dragElastic={0.1}
                  animate={cordControls}
                  onDragStart={handleCordStart}
                  onDrag={(e, info) => handleCordMove(info.point.y)}
                  onDragEnd={() => {
                    setIsDraggingCord(false);
                    if (cordOffset > 35) {
                      const nextPreset = ((fanState.preset + 1) % 4) as 0 | 1 | 2 | 3;
                      onStateChange({
                        preset: nextPreset,
                        targetSpeed: SPEED_PRESETS[nextPreset].speedVal,
                      });
                    }
                    setCordOffset(0);
                    cordControls.start({
                      y: 0,
                      transition: { type: 'spring', stiffness: 500, damping: 12 }
                    });
                  }}
                  className="absolute top-1 flex flex-col items-center cursor-row-resize select-none"
                  style={{ y: cordOffset }}
                >
                  <div 
                    className={`w-[2px] bg-slate-400 transition-colors duration-150 ${isDraggingCord ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]' : ''}`}
                    style={{ height: `${24 + cordOffset / 2}px` }}
                  ></div>

                  <div className={`w-3.5 h-6 rounded-b-full rounded-t-sm border border-white/10 transition-all flex items-center justify-center ${isDraggingCord ? 'bg-orange-500 scale-110 shadow-md' : 'bg-gradient-to-b from-orange-600 to-amber-800'}`}>
                    <div className="w-1 h-1 rounded-full bg-black"></div>
                  </div>
                </motion.div>
              </div>
            </div>

            {/* 7. EMERGENCY STOP CONTROL BUTTON (Immersive UI template footer controls) */}
            <div className="pt-4 border-t border-white/10 mt-auto">
              <button 
                id="btn-emergency-stop"
                onClick={handleEmergencyStop}
                className="w-full py-3.5 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-bold font-mono uppercase tracking-[0.3em] rounded transition-all shadow-[0_0_20px_rgba(234,88,12,0.2)] active:scale-95 cursor-pointer"
              >
                Engage Emergency Stop
              </button>
            </div>
          </>
        ) : activeTab === 'mqtt' ? (
          <MqttPanel 
            fanState={fanState} 
            onStateChange={onStateChange} 
            config={mqttConfig} 
            onConfigChange={setMqttConfig} 
          />
        ) : (
          <HardwareHub 
            fanState={fanState} 
            mqttTelemetryTopic={mqttConfig.telemetryTopic}
            mqttControlTopic={mqttConfig.controlTopic}
            mqttBrokerUrl={mqttConfig.brokerUrl}
          />
        )}
      </div>

    </div>
  );
}
