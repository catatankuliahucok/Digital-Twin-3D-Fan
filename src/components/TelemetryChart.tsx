import React, { useState, useEffect, useRef } from 'react';
import { FanState } from '../types';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { 
  TrendingUp, 
  Zap, 
  Activity, 
  Play, 
  Pause, 
  Trash2, 
  Gauge,
  Flame,
  BatteryCharging
} from 'lucide-react';

interface TelemetryChartProps {
  fanState: FanState;
}

interface TelemetryPoint {
  time: string;
  rpm: number;
  power: number;
  efficiency: number;
}

export default function TelemetryChart({ fanState }: TelemetryChartProps) {
  // Config state
  const [historyLength, setHistoryLength] = useState<number>(30); // 30 seconds default
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [history, setHistory] = useState<TelemetryPoint[]>([]);
  
  // Custom states for data analysis
  const [energyAccumulated, setEnergyAccumulated] = useState<number>(0); // in Wh (Watt-hours)
  const [peakRpm, setPeakRpm] = useState<number>(0);
  const [peakPower, setPeakPower] = useState<number>(0);
  const [surgeActive, setSurgeActive] = useState<boolean>(false);

  const stateRef = useRef(fanState);
  const isPausedRef = useRef(isPaused);
  const surgeActiveRef = useRef(surgeActive);

  // Sync refs to avoid closures in setInterval
  useEffect(() => {
    stateRef.current = fanState;
  }, [fanState]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    surgeActiveRef.current = surgeActive;
  }, [surgeActive]);

  // Pre-populate history with zero/flat points on mount to make chart immediately beautiful
  useEffect(() => {
    const initialHistory: TelemetryPoint[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const timeStr = new Date(now.getTime() - i * 1000).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });
      initialHistory.push({
        time: timeStr,
        rpm: 0,
        power: 0,
        efficiency: 0,
      });
    }
    setHistory(initialHistory);
  }, []);

  // Set up the 1-second real-time logging interval
  useEffect(() => {
    const interval = setInterval(() => {
      if (isPausedRef.current) return;

      const currentState = stateRef.current;
      const isSurging = surgeActiveRef.current;

      // Calculate real or simulated values
      let powerVal = currentState.powerUsage;
      let rpmVal = currentState.rpm;

      if (isSurging) {
        // Add a random dynamic spike of +15W and +300 RPM for anomaly simulation analysis
        powerVal += Math.round(15 + Math.random() * 8);
        rpmVal += Math.round(250 + Math.random() * 80);
      }

      // Safe efficiency ratio (RPM per Watt)
      const efficiencyVal = powerVal > 0 ? parseFloat((rpmVal / powerVal).toFixed(2)) : 0;

      // Accumulate energy usage: Watts * (1s / 3600s) = Watt-hours
      setEnergyAccumulated((prev) => prev + (powerVal / 3600));

      // Update peaks
      setPeakRpm((prev) => Math.max(prev, rpmVal));
      setPeakPower((prev) => Math.max(prev, powerVal));

      const timeStr = new Date().toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });

      setHistory((prev) => {
        const newPoint: TelemetryPoint = {
          time: timeStr,
          rpm: rpmVal,
          power: powerVal,
          efficiency: efficiencyVal,
        };
        const updated = [...prev, newPoint];
        // Keep only up to the selected history length
        if (updated.length > historyLength) {
          return updated.slice(updated.length - historyLength);
        }
        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [historyLength]);

  // Adjust history slice size if historyLength changes
  useEffect(() => {
    setHistory((prev) => {
      if (prev.length > historyLength) {
        return prev.slice(prev.length - historyLength);
      }
      return prev;
    });
  }, [historyLength]);

  // Handle simulations
  const triggerSurge = () => {
    setSurgeActive(true);
    setTimeout(() => {
      setSurgeActive(false);
    }, 3000); // 3-second temporary anomaly
  };

  const clearMetrics = () => {
    setPeakRpm(0);
    setPeakPower(0);
    setEnergyAccumulated(0);
    
    // Clear graph to zeroes
    const initialHistory: TelemetryPoint[] = [];
    const now = new Date();
    for (let i = historyLength - 1; i >= 0; i--) {
      const timeStr = new Date(now.getTime() - i * 1000).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });
      initialHistory.push({
        time: timeStr,
        rpm: 0,
        power: 0,
        efficiency: 0,
      });
    }
    setHistory(initialHistory);
  };

  // Safe current efficiency ratio for UI display
  const currentEfficiency = fanState.powerUsage > 0 
    ? (fanState.rpm / fanState.powerUsage).toFixed(1) 
    : '0.0';

  return (
    <div id="telemetry-chart-container" className="w-full bg-[#121216] border border-white/10 rounded-2xl p-6 flex flex-col space-y-6 shadow-2xl">
      
      {/* Chart Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-950/20 border border-cyan-500/30 text-cyan-400">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-white/40 uppercase tracking-[0.2em] block">Telemetry Analysis</span>
            <h3 className="text-sm font-bold text-white tracking-widest uppercase font-mono">
              Real-time Power &amp; Rotation Analytics
            </h3>
          </div>
        </div>

        {/* Dashboard Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Timespan selectors */}
          <div className="flex items-center bg-black/40 p-1 rounded-lg border border-white/10">
            {([15, 30, 60] as const).map((len) => (
              <button
                key={len}
                id={`btn-time-${len}`}
                onClick={() => setHistoryLength(len)}
                className={`px-3 py-1 text-[9px] font-mono font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
                  historyLength === len
                    ? 'bg-cyan-500 text-black font-extrabold shadow-md'
                    : 'text-white/40 hover:text-white'
                }`}
              >
                {len}s Window
              </button>
            ))}
          </div>

          {/* Surge simulation */}
          <button
            id="btn-surge-simulation"
            onClick={triggerSurge}
            disabled={isPaused}
            className={`px-3 py-1.5 rounded border text-[9px] font-mono font-bold uppercase tracking-wider transition-all flex items-center space-x-1 cursor-pointer ${
              surgeActive
                ? 'bg-red-600 border-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.5)] animate-pulse'
                : isPaused
                  ? 'bg-white/5 border-white/10 text-white/20 cursor-not-allowed'
                  : 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20'
            }`}
            title="Inject an artificial electrical anomaly / load spike to test analysis metrics"
          >
            <Flame className={`w-3.5 h-3.5 ${surgeActive ? 'animate-bounce' : ''}`} />
            <span>{surgeActive ? 'SURGE ACTIVE' : 'SIM SURGE'}</span>
          </button>

          {/* Pause / Resume */}
          <button
            id="btn-toggle-pause"
            onClick={() => setIsPaused(!isPaused)}
            className={`p-2 rounded-lg border transition-all cursor-pointer ${
              isPaused 
                ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20' 
                : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
            }`}
            title={isPaused ? "Resume real-time data streaming" : "Pause real-time data streaming"}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>

          {/* Reset Stats */}
          <button
            id="btn-clear-metrics"
            onClick={clearMetrics}
            className="p-2 rounded-lg border border-white/10 bg-white/5 text-white/60 hover:bg-red-950/20 hover:text-red-400 hover:border-red-500/30 transition-all cursor-pointer"
            title="Clear and reset history and peaks"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Dynamic Power Draw */}
        <div className="bg-black/30 border border-white/5 rounded-xl p-3.5 flex flex-col justify-between space-y-1">
          <div className="flex items-center justify-between text-white/40">
            <span className="text-[9px] font-mono uppercase tracking-widest">Active Draw</span>
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div>
            <div className="text-xl font-mono text-cyan-400 font-bold leading-none">
              {fanState.powerUsage} <span className="text-xs text-cyan-400/70 font-normal font-sans">Watts</span>
            </div>
            <div className="text-[8px] font-mono text-white/30 uppercase mt-1">
              Peak Logged: {peakPower} W
            </div>
          </div>
        </div>

        {/* Dynamic Rotation Speed */}
        <div className="bg-black/30 border border-white/5 rounded-xl p-3.5 flex flex-col justify-between space-y-1">
          <div className="flex items-center justify-between text-white/40">
            <span className="text-[9px] font-mono uppercase tracking-widest">Rotational Velocity</span>
            <Gauge className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <div>
            <div className="text-xl font-mono text-orange-400 font-bold leading-none">
              {fanState.rpm.toLocaleString()} <span className="text-xs text-orange-400/70 font-normal font-sans">RPM</span>
            </div>
            <div className="text-[8px] font-mono text-white/30 uppercase mt-1">
              Peak Logged: {peakRpm} RPM
            </div>
          </div>
        </div>

        {/* Specific Energy Efficiency */}
        <div className="bg-black/30 border border-white/5 rounded-xl p-3.5 flex flex-col justify-between space-y-1">
          <div className="flex items-center justify-between text-white/40">
            <span className="text-[9px] font-mono uppercase tracking-widest">Spec Efficiency</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div>
            <div className="text-xl font-mono text-emerald-400 font-bold leading-none">
              {currentEfficiency} <span className="text-[10px] text-emerald-400/70 font-normal font-sans">RPM/W</span>
            </div>
            <div className="text-[8px] font-mono text-white/30 uppercase mt-1">
              Aerodynamic coefficient
            </div>
          </div>
        </div>

        {/* Accumulated Workload */}
        <div className="bg-black/30 border border-white/5 rounded-xl p-3.5 flex flex-col justify-between space-y-1">
          <div className="flex items-center justify-between text-white/40">
            <span className="text-[9px] font-mono uppercase tracking-widest">Power Consumed</span>
            <BatteryCharging className="w-3.5 h-3.5 text-yellow-400" />
          </div>
          <div>
            <div className="text-xl font-mono text-yellow-400 font-bold leading-none">
              {energyAccumulated.toFixed(4)} <span className="text-xs text-yellow-400/70 font-normal font-sans">Wh</span>
            </div>
            <div className="text-[8px] font-mono text-white/30 uppercase mt-1">
              Active session energy
            </div>
          </div>
        </div>
      </div>

      {/* Line Chart Visualizer Container */}
      <div className="w-full h-64 bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col justify-center relative">
        {isPaused && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] rounded-xl z-20 flex items-center justify-center space-x-2 border border-yellow-500/10">
            <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse"></span>
            <span className="text-[10px] font-mono text-yellow-500 uppercase tracking-widest font-semibold">
              Telemetry Stream Paused
            </span>
          </div>
        )}

        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={history}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="#FFFFFF" 
              opacity={0.05} 
              vertical={false} 
            />
            
            <XAxis 
              dataKey="time" 
              stroke="#FFFFFF" 
              opacity={0.3} 
              tickLine={false}
              axisLine={false}
              style={{ fontSize: '9px', fontFamily: 'monospace' }}
              dy={10}
            />

            {/* Left Y-axis (RPM) */}
            <YAxis 
              yAxisId="left"
              stroke="#F97316" 
              opacity={0.5} 
              tickLine={false}
              axisLine={false}
              domain={[0, 1800]}
              style={{ fontSize: '9px', fontFamily: 'monospace' }}
              dx={-5}
            />

            {/* Right Y-axis (Watts) */}
            <YAxis 
              yAxisId="right"
              orientation="right"
              stroke="#22D3EE" 
              opacity={0.5} 
              tickLine={false}
              axisLine={false}
              domain={[0, 90]}
              style={{ fontSize: '9px', fontFamily: 'monospace' }}
              dx={5}
            />

            {/* Styled Custom Tooltip */}
            <Tooltip
              contentStyle={{ 
                backgroundColor: 'rgba(18, 18, 22, 0.95)', 
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                fontSize: '10px',
                fontFamily: 'monospace',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
              }}
              itemStyle={{ padding: '2px 0' }}
              labelStyle={{ color: 'rgba(255, 255, 255, 0.4)', fontWeight: 'bold', marginBottom: '4px' }}
              formatter={(value: any, name: any) => {
                if (name === 'rpm') return [`${value} RPM`, 'Velocity'];
                if (name === 'power') return [`${value} Watts`, 'Power Draw'];
                return [value, name];
              }}
            />

            <Legend 
              verticalAlign="top" 
              height={36}
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '9px', fontFamily: 'monospace', opacity: 0.8 }}
              formatter={(value) => {
                if (value === 'rpm') return <span className="text-orange-400">Rotational Speed (RPM)</span>;
                if (value === 'power') return <span className="text-cyan-400">Power Consumption (W)</span>;
                return value;
              }}
            />

            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="rpm" 
              stroke="#F97316" 
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: '#F97316' }}
              name="rpm"
            />

            <Line 
              yAxisId="right"
              type="monotone" 
              dataKey="power" 
              stroke="#22D3EE" 
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: '#22D3EE' }}
              name="power"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Analysis Insight footer label */}
      <div className="flex flex-col sm:flex-row items-center justify-between text-[10px] font-mono text-white/30 border-t border-white/5 pt-4 gap-2">
        <span>DYNAMIC TELEMETRY SAMPLER // INTERVAL: 1000ms</span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
          ACTIVE RATIO: {currentEfficiency} RPM/W
        </span>
      </div>

    </div>
  );
}
