export type FanMode = 'normal' | 'natural' | 'sleep';

export interface FanState {
  speed: number;        // Smooth value 0.0 to 1.0 (representing 0% to 100% capacity)
  targetSpeed: number;  // The targeted speed we are accelerating/decelerating towards
  preset: 0 | 1 | 2 | 3; // Discrete speed levels (0 = off, 1 = low, 2 = medium, 3 = high)
  isOscillating: boolean;
  oscillationAngle: number; // Current physical angle of rotation of the head (in radians)
  mode: FanMode;
  bladeCount: 3 | 4 | 5;
  bodyColor: string;    // CSS/Hex color for fan chassis
  bladeColor: string;   // CSS/Hex color for blades
  showGrill: boolean;   // Toggle protective metal grill
  ledColor: string;     // Color of the operating status LED
  showStreamers: boolean; // Ribbon paper attached to the grill showing wind direction/power
  rpm: number;          // Current calculated Revolutions Per Minute
  powerUsage: number;   // Estimated power consumption in Watts
  windSpeed: number;    // Estimated wind speed in m/s
  airflow: number;      // Airflow rate in CFM (Cubic Feet per Minute)
}

export interface PresetConfig {
  label: string;
  speedVal: number;
  rpm: number;
  power: number;
}

export const SPEED_PRESETS: Record<0 | 1 | 2 | 3, PresetConfig> = {
  0: { label: 'Mati', speedVal: 0.0, rpm: 0, power: 0 },
  1: { label: 'Lambat', speedVal: 0.3, rpm: 450, power: 12 },
  2: { label: 'Sedang', speedVal: 0.65, rpm: 950, power: 28 },
  3: { label: 'Kencang', speedVal: 1.0, rpm: 1450, power: 55 },
};

export interface FanColorOption {
  name: string;
  hex: string;
  bladeHex: string;
}

export const FAN_COLORS: FanColorOption[] = [
  { name: 'Matte Black', hex: '#111115', bladeHex: '#25252b' },
  { name: 'Industrial Steel', hex: '#3f3f46', bladeHex: '#27272a' },
  { name: 'Putih Klasik', hex: '#F3F4F6', bladeHex: '#E5E7EB' },
  { name: 'Retro Mint', hex: '#A7F3D0', bladeHex: '#D1FAE5' },
  { name: 'Tactical Orange', hex: '#F97316', bladeHex: '#7C2D12' },
];

export const LED_COLORS = [
  { name: 'Warning Orange', hex: '#F97316' },
  { name: 'Cyan Glow', hex: '#22D3EE' },
  { name: 'Eco Green', hex: '#34D399' },
  { name: 'Alert Red', hex: '#F87171' },
];

export interface MqttMessageLog {
  id: string;
  timestamp: string;
  type: 'CONNECT' | 'CONNACK' | 'SUBSCRIBE' | 'PUBLISH_OUT' | 'PUBLISH_IN' | 'INFO';
  topic?: string;
  payload: string;
}

export interface MqttConfig {
  brokerUrl: string;
  clientId: string;
  telemetryTopic: string;
  controlTopic: string;
  publishInterval: number; // in seconds
}

