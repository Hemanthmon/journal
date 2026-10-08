import { Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../lib/theme';

/**
 * Dawn landscape for the sign-in screens: soft sky, rising sun, layered hills and a few
 * leaves. Drawn in SVG so it is crisp on every screen; a dusk palette in dark mode.
 */
const DAWN = {
  skyTop: '#F6E7D8',
  skyBottom: '#E4EFE6',
  sun: '#F7C59F',
  sunGlow: '#FBE3CC',
  far: '#B9D3C2',
  mid: '#8DB89E',
  near: '#5E9476',
  front: '#3F7358',
  leaf: '#2F5E46',
  bird: '#6B7F74',
};
const DUSK = {
  skyTop: '#1C2433',
  skyBottom: '#253A35',
  sun: '#E8B98F',
  sunGlow: '#5C4A45',
  far: '#2F4A42',
  mid: '#2A4239',
  near: '#22372F',
  front: '#1A2B25',
  leaf: '#3E6B55',
  bird: '#9FB2A8',
};

export function AuthHero({ title, subtitle, height = 300 }: { title: string; subtitle: string; height?: number }) {
  const { dark } = useTheme();
  const { width } = useWindowDimensions();
  const p = dark ? DUSK : DAWN;
  const w = 400;
  const h = 300;
  return (
    <View style={{ height, width: '100%', overflow: 'hidden' }}>
      <Svg width={width} height={height} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={p.skyTop} />
            <Stop offset="1" stopColor={p.skyBottom} />
          </LinearGradient>
          <RadialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={p.sunGlow} stopOpacity="0.9" />
            <Stop offset="1" stopColor={p.sunGlow} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={w} height={h} fill="url(#sky)" />
        <Circle cx="290" cy="150" r="90" fill="url(#glow)" />
        <Circle cx="290" cy="150" r="34" fill={p.sun} />
        {/* Birds */}
        <G stroke={p.bird} strokeWidth="2" fill="none" strokeLinecap="round">
          <Path d="M92 78 q7 -7 14 0 q7 -7 14 0" />
          <Path d="M128 58 q5 -5 10 0 q5 -5 10 0" />
          <Path d="M70 104 q4 -4 8 0 q4 -4 8 0" />
        </G>
        {/* Hills, far to near */}
        <Path d="M0 190 C 60 150, 120 160, 180 175 C 240 190, 300 150, 400 165 L400 300 L0 300 Z" fill={p.far} />
        <Path d="M0 215 C 70 185, 140 200, 210 210 C 280 220, 330 190, 400 200 L400 300 L0 300 Z" fill={p.mid} />
        <Path d="M0 240 C 80 215, 150 235, 230 238 C 300 241, 350 225, 400 230 L400 300 L0 300 Z" fill={p.near} />
        <Path d="M0 268 C 90 252, 170 268, 250 266 C 320 264, 360 256, 400 260 L400 300 L0 300 Z" fill={p.front} />
        {/* Leaves sprouting from the front hill */}
        <G fill={p.leaf}>
          <Path d="M48 262 C 40 240, 52 226, 66 222 C 66 238, 60 252, 48 262 Z" />
          <Path d="M50 262 C 34 252, 26 238, 30 228 C 44 232, 50 246, 50 262 Z" />
          <Path d="M352 258 C 346 240, 356 228, 368 224 C 368 238, 362 250, 352 258 Z" />
          <Ellipse cx="200" cy="270" rx="3" ry="6" />
        </G>
      </Svg>
      <View style={{ flex: 1, justifyContent: 'flex-start', paddingHorizontal: 24, paddingTop: 72 }}>
        <Text style={{ fontSize: 34, fontWeight: '700', color: dark ? '#F1F5F2' : '#1F3D2E', letterSpacing: -0.5 }}>{title}</Text>
        <Text style={{ fontSize: 16, marginTop: 6, color: dark ? '#C6D5CC' : '#3F5A4B', maxWidth: 280, lineHeight: 22 }}>{subtitle}</Text>
      </View>
    </View>
  );
}
