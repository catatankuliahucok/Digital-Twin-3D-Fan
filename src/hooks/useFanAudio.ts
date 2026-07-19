import { useEffect, useRef, useState } from 'react';

export default function useFanAudio() {
  const [isMuted, setIsMuted] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  
  // Audio Nodes
  const motorHumOscRef = useRef<OscillatorNode | null>(null);
  const motorHumGainRef = useRef<GainNode | null>(null);
  
  const windSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const windFilterRef = useRef<BiquadFilterNode | null>(null);
  const windGainRef = useRef<GainNode | null>(null);
  
  const masterGainRef = useRef<GainNode | null>(null);

  const initAudio = () => {
    if (audioCtxRef.current) return;

    try {
      // 1. Create Audio Context
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;

      // 2. Master Gain
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0, ctx.currentTime);
      masterGain.connect(ctx.destination);
      masterGainRef.current = masterGain;

      // 3. Setup Motor Hum Synth (Low frequency oscillator)
      const humOsc = ctx.createOscillator();
      humOsc.type = 'sine';
      humOsc.frequency.setValueAtTime(50, ctx.currentTime); // 50Hz base frequency hum
      
      const humGain = ctx.createGain();
      humGain.gain.setValueAtTime(0, ctx.currentTime); // start silent
      
      humOsc.connect(humGain);
      humGain.connect(masterGain);
      humOsc.start();
      
      motorHumOscRef.current = humOsc;
      motorHumGainRef.current = humGain;

      // 4. Setup Wind Rustle Synth (Filtered White Noise Buffer)
      const bufferSize = ctx.sampleRate * 2; // 2 seconds of noise
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1; // white noise
      }

      const windSource = ctx.createBufferSource();
      windSource.buffer = noiseBuffer;
      windSource.loop = true;

      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.setValueAtTime(120, ctx.currentTime); // low frequency rumble
      windFilter.Q.setValueAtTime(1.0, ctx.currentTime);

      const windGain = ctx.createGain();
      windGain.gain.setValueAtTime(0, ctx.currentTime);

      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(masterGain);
      windSource.start();

      windSourceRef.current = windSource;
      windFilterRef.current = windFilter;
      windGainRef.current = windGain;

    } catch (err) {
      console.warn('Failed to initialize Web Audio API:', err);
    }
  };

  // Toggle Mute State
  const toggleMute = () => {
    if (isMuted) {
      // Unmuting: Initialize if needed, then resume context & fade in master volume
      initAudio();
      
      const ctx = audioCtxRef.current;
      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        
        const masterGain = masterGainRef.current;
        if (masterGain) {
          masterGain.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 0.1);
        }
        setIsMuted(false);
      }
    } else {
      // Muting: Fade out master volume
      const ctx = audioCtxRef.current;
      const masterGain = masterGainRef.current;
      if (ctx && masterGain) {
        masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
      }
      setIsMuted(true);
    }
  };

  // Update sound parameters dynamically based on current fan speed [0.0 to 1.0]
  const updateAudioSpeed = (speed: number) => {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state === 'suspended' || isMuted) return;

    const time = ctx.currentTime;

    // A. Motor Hum Updates
    const humOsc = motorHumOscRef.current;
    const humGain = motorHumGainRef.current;
    if (humOsc && humGain) {
      if (speed > 0.02) {
        // Frequency rises slightly with RPM (50Hz to 75Hz)
        const targetFreq = 48 + speed * 27;
        humOsc.frequency.setTargetAtTime(targetFreq, time, 0.1);
        
        // Volume rises with speed
        const targetHumVol = 0.03 + speed * 0.12;
        humGain.gain.setTargetAtTime(targetHumVol, time, 0.15);
      } else {
        // Fade to silent
        humGain.gain.setTargetAtTime(0, time, 0.15);
      }
    }

    // B. Wind Rustle Updates
    const windFilter = windFilterRef.current;
    const windGain = windGainRef.current;
    if (windFilter && windGain) {
      if (speed > 0.02) {
        // Wind noise filter cutoff rises with speed (makes it sound higher pitch and sharper at high speeds)
        // 100Hz (deep rumble) -> 580Hz (whoosh of air)
        const targetCutoff = 100 + speed * 480;
        windFilter.frequency.setTargetAtTime(targetCutoff, time, 0.12);

        // Wind volume rises with speed squared (exponential aerodynamic resistance)
        const targetWindVol = speed * speed * 0.28;
        windGain.gain.setTargetAtTime(targetWindVol, time, 0.12);
      } else {
        // Fade to silent
        windGain.gain.setTargetAtTime(0, time, 0.2);
      }
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      const ctx = audioCtxRef.current;
      if (ctx) {
        ctx.close();
      }
    };
  }, []);

  return {
    isMuted,
    toggleMute,
    updateAudioSpeed,
  };
}
