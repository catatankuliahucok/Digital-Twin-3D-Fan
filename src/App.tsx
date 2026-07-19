import React, { useState, useEffect } from 'react';
import FanSimulation3D from './components/FanSimulation3D';
import FanControlPanel from './components/FanControlPanel';
import TelemetryChart from './components/TelemetryChart';
import useFanAudio from './hooks/useFanAudio';
import { FanState, SPEED_PRESETS } from './types';
import { 
  Volume2, 
  VolumeX, 
  Moon, 
  Sun, 
  Sparkles, 
  Info, 
  Wind, 
  Compass,
} from 'lucide-react';

export default function App() {
  // State for overall Fan state
  const [fanState, setFanState] = useState<FanState>({
    speed: 0.0,
    targetSpeed: 0.0,
    preset: 0,
    isOscillating: false,
    oscillationAngle: 0,
    mode: 'normal',
    bladeCount: 3,
    bodyColor: '#111115', // Matte Black default
    bladeColor: '#25252b',
    showGrill: true,
    ledColor: '#F97316', // Warning Orange default
    showStreamers: true,
    rpm: 0,
    powerUsage: 0,
    windSpeed: 0.0,
    airflow: 0,
  });

  // State for Night Mode (Ambient dark studio theme)
  const [isNightMode, setIsNightMode] = useState<boolean>(true); // default true for immersive dark vibe

  // Audio Synthesizer Hook
  const { isMuted, toggleMute, updateAudioSpeed } = useFanAudio();

  // Keep Audio Synth frequency/volume synchronized with 3D physical rotation speed
  useEffect(() => {
    updateAudioSpeed(fanState.speed);
  }, [fanState.speed, updateAudioSpeed]);

  // Handler for partial state updates from 3D canvas or sidebar controller
  const handleStateChange = (updates: Partial<FanState>) => {
    setFanState((prev) => ({
      ...prev,
      ...updates,
    }));
  };

  // Reset Engine handler requested by "Immersive UI" template
  const handleResetEngine = () => {
    setFanState((prev) => ({
      ...prev,
      speed: 0,
      targetSpeed: 0,
      preset: 0,
      isOscillating: false,
      oscillationAngle: 0,
      mode: 'normal',
    }));
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-slate-200 flex flex-col font-sans select-none overflow-x-hidden">
      
      {/* 1. TOP NAVIGATION / HEADER (Immersive UI theme) */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-[#121216] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)] animate-pulse"></div>
          <h1 className="text-xs sm:text-sm font-mono tracking-[0.2em] uppercase text-white font-semibold">
            System Dynamics / Fan Control v1.02
          </h1>
        </div>
        <div className="flex items-center gap-4 sm:gap-8">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] font-mono text-white/40 uppercase tracking-tighter">Connection Status</span>
            <span className="text-xs font-mono text-green-400 uppercase tracking-widest">Sim-Link Active</span>
          </div>
          <button 
            id="btn-reset-engine"
            onClick={handleResetEngine}
            className="px-4 py-1.5 border border-white/10 rounded bg-white/5 hover:bg-orange-500 hover:text-black hover:border-orange-500 transition-all text-[10px] uppercase tracking-widest font-bold text-white cursor-pointer active:scale-95"
          >
            Reset Engine
          </button>
        </div>
      </header>

      {/* 2. MAIN WORKSPACE */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 items-stretch relative">
        
        {/* Ambient Grid Background Overlay */}
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>

        {/* LEFT COLUMN: 3D VIEWPORT WITH RENDER PIPELINE LABELS */}
        <section className="lg:col-span-7 xl:col-span-8 flex flex-col h-[500px] lg:h-[680px] relative z-10">
          
          <div className="relative w-full h-full border border-white/5 flex flex-col bg-black/40 rounded-2xl overflow-hidden shadow-2xl">
            
            {/* Viewport Header overlay */}
            <div className="absolute top-4 left-6 text-[10px] font-mono text-white/40 uppercase tracking-[0.3em] z-10 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping"></span>
              <span>Real-time Render Pipeline</span>
            </div>

            {/* Viewport coordinates / Camera state overlay */}
            <div className="absolute top-4 right-6 text-right z-10 hidden sm:block">
              <div className="text-[9px] font-mono text-white/30 uppercase tracking-widest">Camera Tracking</div>
              <div className="text-[10px] font-mono text-orange-500/80">X: {(1.5 + Math.sin(fanState.oscillationAngle) * 2).toFixed(1)} | Y: 1.4 | Z: {fanState.speed.toFixed(2)}</div>
            </div>

            {/* Babylon 3D Component */}
            <div className="flex-1 w-full h-full">
              <FanSimulation3D 
                fanState={fanState} 
                onStateChange={handleStateChange}
                isNightMode={isNightMode}
              />
            </div>

            {/* Float HUD Controls inside Viewport */}
            <div className="absolute bottom-5 right-5 flex flex-row space-x-2 z-10">
              {/* Sound Toggle */}
              <button
                id="hud-toggle-sound"
                onClick={toggleMute}
                className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-[10px] uppercase tracking-wider font-mono font-bold border backdrop-blur-md transition-all active:scale-95 ${
                  isMuted 
                    ? 'bg-black/80 border-white/10 text-slate-400 hover:text-white' 
                    : 'bg-orange-500 text-black border-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.4)]'
                }`}
                title="Toggle real-time engine sound synthesis"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 animate-pulse" />}
                <span>{isMuted ? 'Mute' : 'Audio Live'}</span>
              </button>

              {/* Day/Night Studio Mode */}
              <button
                id="hud-toggle-night"
                onClick={() => setIsNightMode(!isNightMode)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-[10px] uppercase tracking-wider font-mono font-bold border backdrop-blur-md transition-all active:scale-95 ${
                  isNightMode 
                    ? 'bg-orange-600/20 text-orange-400 border-orange-500/40 shadow-[0_0_10px_rgba(249,115,22,0.15)]' 
                    : 'bg-black/80 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                {isNightMode ? <Moon className="w-3.5 h-3.5 text-orange-400" /> : <Sun className="w-3.5 h-3.5" />}
                <span>{isNightMode ? 'Studio Dimmed' : 'Studio Bright'}</span>
              </button>
            </div>

            {/* Quick Swing Compass HUD */}
            {fanState.isOscillating && (
              <div className="absolute bottom-5 left-5 bg-black/80 border border-white/10 backdrop-blur-sm rounded-lg px-2.5 py-1.5 text-[9px] font-mono text-orange-400 flex items-center space-x-1.5 pointer-events-none">
                <Compass className="w-3 h-3 animate-spin" style={{ animationDuration: '8s' }} />
                <span>OSC SPAN: {(fanState.oscillationAngle * (180 / Math.PI)).toFixed(1)}°</span>
              </div>
            )}

          </div>

        </section>

        {/* RIGHT COLUMN: CONTROLLER STACK */}
        <section className="lg:col-span-5 xl:col-span-4 flex flex-col z-10">
          <FanControlPanel 
            fanState={fanState} 
            onStateChange={handleStateChange}
          />
        </section>

      </main>

      {/* TELEMETRY CHART SECTION */}
      <section className="px-6 pb-6 w-full relative z-10">
        <TelemetryChart fanState={fanState} />
      </section>

      {/* 3. SCI-FI/INDUSTRIAL METRIC DOCS CARDFOOTER */}
      <section className="border-t border-white/5 bg-[#0a0a0c] px-6 py-6 mt-4">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-1">
            <h4 className="text-xs font-mono text-orange-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Inersia Mekanika Kipas</span>
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Tarik atau jentikkan baling-baling 3D secara manual saat kipas mati untuk mensimulasikan hukum gerak rotasi fisika dengan gesekan bantalan (bearing decay).
            </p>
          </div>

          <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-1">
            <h4 className="text-xs font-mono text-orange-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Wind className="w-3.5 h-3.5" />
              <span>Sintesis Audio Prosedural</span>
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Membuat gelombang audio sintetis real-time menggunakan Web Audio API. Frekuensi motor 50Hz disaring berdasarkan kecepatan RPM secara dinamis.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-1">
            <h4 className="text-xs font-mono text-orange-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              <span>Aliran Udara Aerodinamis</span>
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Hembusan angin disimulasikan menggunakan pita-pita dinamis (streamers) yang merespon kepakan angin, berfluktuasi indah, serta melorot secara gravitasi saat mati.
            </p>
          </div>
        </div>
      </section>

      {/* 4. IMMERSIVE SYSTEM STATUS FOOTER */}
      <footer className="h-8 border-t border-white/10 bg-[#0a0a0c] flex items-center px-6 justify-between shrink-0">
        <div className="flex gap-4 sm:gap-6">
          <div className="text-[9px] font-mono text-white/30 uppercase tracking-widest">
            Frames: <span className="text-green-500 font-bold">60.0 fps</span>
          </div>
          <div className="text-[9px] font-mono text-white/30 uppercase tracking-widest">
            Latency: <span className="text-green-500 font-bold">1.2ms</span>
          </div>
          <div className="text-[9px] font-mono text-white/30 uppercase tracking-widest">
            Active Core: <span className="text-white/60">BabylonJS v6.2</span>
          </div>
        </div>
        <div className="text-[9px] font-mono text-white/20 uppercase tracking-wider hidden sm:block">
          Environmental Simulation Kernel v2.4
        </div>
      </footer>

    </div>
  );
}
