import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronRight, Activity, Thermometer, Users, Zap, Fan, 
  Terminal, ShieldCheck, Orbit, Crosshair, Hexagon
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, update, push, set, query, limitToLast } from 'firebase/database';
import { formatInTimeZone } from 'date-fns-tz';
import { fr } from 'date-fns/locale';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from './lib/utils';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- Types ---
type Mode = 'AUTO' | 'MANUAL_WEB' | 'MANUAL_LOCAL';

interface Sensors {
  temperature: number;
  humidity: number;
  people: number;
  motion: boolean;
}

interface SystemStatus {
  mode: Mode;
  light: 'ON' | 'OFF';
  fan: 'ON' | 'OFF';
  status: string;
}

interface SystemLog {
  id?: string;
  type: string;
  message: string;
  timestamp: number;
}

// --- Components ---

const SpaceBackground = () => {
  const particles = useMemo(() => {
    return Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 1,
      duration: Math.random() * 20 + 20,
      delay: Math.random() * 5,
    }));
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-cyan-500/20"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.x}%`,
            top: `${p.y}%`,
          }}
          animate={{
            y: [`${p.y}%`, `${p.y - 20}%`],
            opacity: [0, 0.8, 0],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: "linear"
          }}
        />
      ))}
    </div>
  );
};

const KineticToggle = ({ enabled, onChange, disabled, type }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean; type: 'light' | 'fan' }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => onChange(!enabled)}
    className={cn(
      "relative flex h-10 w-20 shrink-0 cursor-pointer rounded-full p-1 transition-all duration-500 ease-out border shadow-inner overflow-hidden",
      enabled ? "bg-cyan-900/40 border-cyan-500/50" : "bg-black/60 border-white/5",
      disabled && "opacity-40 cursor-not-allowed"
    )}
  >
    {/* Energy glow track internally */}
    {enabled && <div className="absolute inset-0 bg-cyan-500/20 blur-md pointer-events-none" />}
    
    <motion.div
      layout
      initial={false}
      animate={{ x: enabled ? 40 : 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "z-10 flex h-8 w-8 items-center justify-center rounded-full shadow-lg border",
        enabled ? "bg-cyan-50 border-cyan-300 neon-glow-cyan text-cyan-900" : "bg-zinc-800 border-zinc-600 text-zinc-400"
      )}
    >
       {type === 'light' ? (
         <Zap className={cn("w-4 h-4", enabled ? "fill-cyan-500" : "")} />
       ) : (
         <motion.div animate={{ rotate: enabled ? 360 : 0 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}>
           <Fan className="w-4 h-4" />
         </motion.div>
       )}
    </motion.div>
  </button>
);

const TeslaSlider = ({ value, options, onChange, disabled }: { 
  value: Mode; 
  options: { label: string; value: Mode }[]; 
  onChange: (v: Mode) => void; 
  disabled?: boolean 
}) => {
  return (
    <div className={cn("relative flex p-1 rounded-full bg-black/60 border border-white/5 shadow-inner", disabled && "opacity-50 pointer-events-none")}>
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative px-4 py-2.5 text-[11px] uppercase tracking-widest font-bold rounded-full transition-all duration-300 ease-out flex-1 z-10",
              isActive ? "text-cyan-50 text-glow-cyan" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="tesla-slider-active"
                className="absolute inset-0 rounded-full bg-cyan-900/60 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.4)] z-[-1]"
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              />
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

export default function App() {
  const [sensors, setSensors] = useState<Sensors | null>(null);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [history, setHistory] = useState<{ time: string; temp: number }[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // 1. Subscribe to Sensors
    const sensorsRef = ref(db, 'sensors');
    const unsubSensors = onValue(sensorsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setSensors(data);
        
        // Update Chart History
        setHistory(prev => {
          const newPoint = { time: formatInTimeZone(new Date(), 'Africa/Dakar', 'HH:mm:ss'), temp: data.temperature || 0 };
          const newHist = [...prev, newPoint].slice(-15);
          if (prev.length === 0) {
              return Array.from({length: 15}).map((_, i) => ({
                 time: formatInTimeZone(new Date(Date.now() - (15-i)*60000), 'Africa/Dakar', 'HH:mm'),
                 temp: (data.temperature || 20) + (Math.random() - 0.5) * 2
              })).concat(newPoint);
          }
          return newHist;
        });
      } else {
        // Seed initial structure if empty
        set(sensorsRef, { temperature: 22.5, humidity: 45, people: 0, motion: false });
      }
    }, (error) => console.error("Firebase Read Error:", error));

    // 2. Subscribe to System
    const systemRef = ref(db, 'system');
    const unsubSystem = onValue(systemRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setSystem(data);
      } else {
         set(systemRef, { mode: 'AUTO', light: 'OFF', fan: 'OFF', status: 'ONLINE' });
      }
    });

    // 3. Subscribe to Logs
    const logsRef = query(ref(db, 'logs'), limitToLast(50));
    const unsubLogs = onValue(logsRef, (snapshot) => {
      const logsMap = snapshot.val();
      if (logsMap) {
        const parsedLogs = Object.entries(logsMap).map(([key, val]: any) => ({
          id: key,
          ...val
        })).sort((a, b) => b.timestamp - a.timestamp);
        setLogs(parsedLogs);
      } else {
        setLogs([]);
      }
    });

    return () => {
      unsubSensors();
      unsubSystem();
      unsubLogs();
    };
  }, []);

  // Control Function
  const updateSystemCommand = async (updates: Partial<SystemStatus>, logType: string, logMsg: string) => {
    if (!system) return;
    
    // Send configuration to ESP32 via RTDB
    await update(ref(db, 'system'), updates);
    
    // Push new log entry
    await push(ref(db, 'logs'), {
      type: logType,
      message: logMsg,
      timestamp: Date.now()
    });
  };

  if (!sensors || !system) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030305]">
        <motion.div 
          animate={{ scale: [0.95, 1.05, 0.95], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="w-24 h-24 rounded-full border border-cyan-500/20 backdrop-blur-2xl flex items-center justify-center p-4 shadow-[0_0_30px_rgba(6,182,212,0.2)]"
        >
          <Orbit className="w-10 h-10 text-cyan-400 animate-spin-slow" />
        </motion.div>
      </div>
    );
  }

  const isInteractive = system.mode === 'MANUAL_WEB';
  const isAuto = system.mode === 'AUTO';

  return (
    <>
      <SpaceBackground />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6 font-sans relative z-10">
        
        {/* HUD Header */}
        <header className="flex justify-between items-center vision-glass rounded-2xl px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 rounded-lg">
              <Hexagon className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
               <h1 className="font-bold text-sm tracking-widest text-zinc-100 uppercase">Smart Classroom Control System</h1>
            </div>
          </div>
          <div className="flex items-center space-x-6 text-xs">
            <span className="font-mono text-zinc-400">{formatInTimeZone(currentTime, 'Africa/Dakar', 'EEEE d MMMM · HH:mm:ss', { locale: fr }).toUpperCase()}</span>
            <div className="flex items-center space-x-2 bg-black/40 border border-white/5 px-3 py-1.5 rounded-full">
              <motion.div 
                 animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }}
                 className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]" 
              />
              <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-300">
                {system.status === 'ONLINE' ? 'Liaison Neurale Synchro' : 'ESP32 HORSLIGNE'}
              </span>
            </div>
          </div>
        </header>

        <main className="flex flex-col lg:flex-row gap-6">
          
          {/* Main Holographic Clusters (Left) */}
          <div className="flex-[3] flex flex-col gap-6">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Climate Node */}
              <motion.div 
                 className="vision-glass rounded-[32px] p-6 relative overflow-hidden group border-t-cyan-500/20"
              >
                {/* Background Wave Effect */}
                <div className="absolute inset-0 bg-gradient-to-b from-cyan-900/10 to-transparent opacity-50" />
                
                <div className="flex justify-between items-start mb-8 relative z-10">
                   <div className="w-12 h-12 bg-black/50 border border-white/10 rounded-2xl flex items-center justify-center text-cyan-400 shadow-inner">
                     <Thermometer className="w-6 h-6" />
                   </div>
                   <div className="flex flex-col items-end">
                     <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Nœud Climatique</span>
                     <span className="text-[10px] text-cyan-600 mt-1 font-mono">{sensors.humidity}% Humidité</span>
                   </div>
                </div>
                <div className="relative z-10 flex items-end gap-2">
                   <motion.div 
                      key={sensors.temperature}
                      initial={{ y: -10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="text-6xl font-medium tracking-tighter text-glow-cyan text-white"
                   >
                      {sensors.temperature?.toFixed(1)}
                   </motion.div>
                   <span className="text-xl text-cyan-500 font-mono mb-2">°C</span>
                </div>
              </motion.div>

              {/* Bio-Signature Node */}
              <motion.div className="vision-glass rounded-[32px] p-6 relative overflow-hidden">
                {/* Background Particle Sim */}
                <div className="absolute top-0 right-0 p-8 opacity-20">
                    <Orbit className="w-32 h-32 text-blue-400" strokeWidth={1} />
                </div>

                <div className="flex justify-between items-start mb-8 relative z-10">
                   <div className="w-12 h-12 bg-black/50 border border-white/10 rounded-2xl flex items-center justify-center text-blue-400 shadow-inner">
                     <Users className="w-6 h-6" />
                   </div>
                   <div className="flex flex-col items-end">
                     <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Bio-Signatures</span>
                     <span className={cn("text-[10px] mt-1 font-mono font-bold", sensors.motion ? "text-green-400" : "text-zinc-600")}>
                        {sensors.motion ? 'Mouvement Actif !' : 'Statique'}
                     </span>
                   </div>
                </div>
                <div className="relative z-10">
                   <motion.div 
                      key={sensors.people}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', bounce: 0.6 }}
                      className="text-6xl font-medium tracking-tighter text-white"
                      style={{ textShadow: '0 0 15px rgba(96, 165, 250, 0.4)' }}
                   >
                      {sensors.people}
                   </motion.div>
                   <div className="text-sm text-blue-400 font-mono mt-2">Entités Organiques Détectées</div>
                </div>
              </motion.div>
            </div>

            {/* Neural Telemetry Chart */}
            <div className="flex-1 vision-glass rounded-[32px] p-6 flex flex-col min-h-[320px]">
              <div className="flex justify-between items-center mb-6">
                 <div className="flex items-center gap-3">
                   <Activity className="w-5 h-5 text-cyan-500" />
                   <h2 className="text-sm font-bold tracking-widest uppercase text-zinc-200">Flux Thermique</h2>
                 </div>
                 <div className="flex items-center gap-2 bg-black/50 px-3 py-1 rounded-full border border-white/5">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-[9px] font-mono tracking-widest text-cyan-400">EN DIRECT</span>
                 </div>
              </div>
              
              <div className="flex-1 w-full -ml-4 min-h-[180px]">
                 <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={history}>
                      <defs>
                        <linearGradient id="cyberGrid" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.4}/>
                          <stop offset="100%" stopColor="#06b6d4" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#52525b', fontFamily: 'JetBrains Mono' }} dy={10} />
                      <YAxis domain={['auto', 'auto']} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#52525b', fontFamily: 'JetBrains Mono' }} dx={-10} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: '1px solid rgba(6,182,212,0.3)', background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(10px)', color: '#fff' }}
                        itemStyle={{ color: '#06b6d4', fontWeight: 600, fontFamily: 'JetBrains Mono' }}
                      />
                      <Area type="monotone" dataKey="temp" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#cyberGrid)" />
                   </AreaChart>
                 </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Tesla-Style Control Center (Right) */}
          <aside className="lg:w-[400px] flex flex-col gap-6">
            
            <div className="tesla-panel rounded-[32px] p-8 flex flex-col gap-10">
              
              {/* Autonomy Selector */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                   <ShieldCheck className="w-4 h-4 text-zinc-500" />
                   <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Niveau d'Autonomie</span>
                </div>
                <TeslaSlider 
                   value={system.mode}
                   onChange={(val) => updateSystemCommand({ mode: val }, 'MODE_CHANGE', `Mode défini sur ${val}`)}
                   options={[
                     { label: 'Auto IA', value: 'AUTO' },
                     { label: 'Web Manuel', value: 'MANUAL_WEB' },
                     { label: 'Terminal', value: 'MANUAL_LOCAL' },
                   ]}
                />
              </div>

              <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

              {/* Kinetic Activators */}
              <div className="flex flex-col gap-6">
                 <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest w-full border-b border-white/5 pb-2">Systèmes Énergétiques</span>
                 
                 <div className="flex items-center justify-between group">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-zinc-200 uppercase tracking-widest">Illumination</span>
                      <span className="text-[10px] text-zinc-500 font-mono mt-1">État: {system.light === 'ON' ? 'ÉMISSION EN COURS' : 'REPOS'}</span>
                    </div>
                    <KineticToggle 
                      type="light"
                      enabled={system.light === 'ON'} 
                      disabled={!isInteractive && !isAuto} 
                      onChange={(val) => {
                        if (isInteractive) updateSystemCommand({ light: val ? 'ON' : 'OFF' }, 'LIGHT_TOGGLE', `Laser lumineux ${val ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`)
                      }}
                    />
                 </div>

                 <div className="flex items-center justify-between group">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-zinc-200 uppercase tracking-widest">Turbines</span>
                      <span className="text-[10px] text-zinc-500 font-mono mt-1">Status: {system.fan === 'ON' ? 'ROTATION KINÉTIQUE' : 'VERROUILLÉ'}</span>
                    </div>
                    <KineticToggle 
                      type="fan"
                      enabled={system.fan === 'ON'} 
                      disabled={!isInteractive && !isAuto} 
                      onChange={(val) => {
                        if (isInteractive) updateSystemCommand({ fan: val ? 'ON' : 'OFF' }, 'FAN_TOGGLE', `Turbines atmosphériques ${val ? 'ENGAGÉES' : 'ARRÊTÉES'}`)
                      }}
                    />
                 </div>
              </div>
              
              {/* AI Status Message */}
              <AnimatePresence mode="wait">
                <motion.div 
                   key={system.mode}
                   initial={{ opacity: 0, filter: "blur(10px)" }}
                   animate={{ opacity: 1, filter: "blur(0px)" }}
                   exit={{ opacity: 0 }}
                   className="mt-2 p-4 bg-black/40 border border-white/5 rounded-2xl"
                >
                  <p className="text-[10px] uppercase font-mono tracking-widest flex items-start gap-3">
                    <Crosshair className="w-4 h-4 shrink-0 text-cyan-500" />
                    <span className="text-zinc-400">
                      {system.mode === 'AUTO' && "L'Intelligence Artificielle contrôle l'écosystème selon les matrices de confort spatial."}
                      {system.mode === 'MANUAL_WEB' && "Surcharge autorisée. Interface des commandes holographiques déverrouillée."}
                      {system.mode === 'MANUAL_LOCAL' && "Contrôle web bloqué. L'ESP32 écoute les commandes locales sur site."}
                    </span>
                  </p>
                </motion.div>
              </AnimatePresence>

            </div>

          </aside>
        </main>
        
        {/* Deep Terminal Logs Array */}
        <div className="vision-glass rounded-[24px] p-6 lg:col-span-12 mt-2">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-white/5 pb-2">
              <Terminal className="w-4 h-4" />
              Journal des Événements Neureux
            </h3>
            <div className="space-y-1 max-h-[250px] overflow-y-auto pr-2 font-mono">
              <AnimatePresence initial={false}>
                {logs.map((log) => (
                  <motion.div 
                    key={log.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="flex items-center gap-4 py-2 hover:bg-white/5 px-3 rounded-lg transition-colors border-l border-transparent hover:border-cyan-500/50"
                  >
                     <span className="text-[11px] text-cyan-600">[{formatInTimeZone(new Date(log.timestamp), 'Africa/Dakar', 'HH:mm:ss')}]</span>
                     <span className="text-[9px] uppercase tracking-widest text-zinc-600 w-24 shrink-0">{log.type.replace('_', ' ')}</span>
                     <span className="text-xs text-zinc-300">{log.message}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
              {logs.length === 0 && (
                <div className="text-center py-6 text-xs text-zinc-600">
                   Silences radio. En attente de signaux.
                </div>
              )}
            </div>
        </div>

      </div>
    </>
  );
}



