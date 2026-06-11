import React from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Points, PointMaterial, Environment, Text, MeshDistortMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { motion, useScroll, useTransform } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { EffectComposer, Bloom, ChromaticAberration, Noise, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'

gsap.registerPlugin(ScrollTrigger)

// Fonts
const mono = `"Fragment Mono", ui-monospace, SFMono-Regular, Menlo, monospace`
const display = `"Space Grotesk", "Instrument Sans", Inter, system-ui, sans-serif`
const text = `"Instrument Sans", Inter, system-ui, sans-serif`

// Global scroll state driven by GSAP ScrollTrigger (cinematic smoothed scrub)
export const scrollStore = { progress: 0, velocity: 0 }

/* -------------------------------------------------
  GLOBAL STYLES
--------------------------------------------------*/
const GlobalStyles = () => (
  <style>{`
  html { scroll-behavior: auto; }
  body { background:#05060b; color:#e9f2ff; overflow-x:hidden; }
  ::selection { background:#d53aff; color:white; }
  .font-display { font-family: ${display}; }
  .font-monox { font-family: ${mono}; }
  .font-text { font-family: ${text}; }
  .scanlines:before {
    content:""; position:absolute; inset:0;
    background: repeating-linear-gradient(to bottom, rgba(255,255,255,0.023) 0px, rgba(255,255,255,0.023) 1px, transparent 1px, transparent 3px);
    pointer-events:none; mix-blend-mode: screen;
  }
  .hud-grid {
    background-image: 
      linear-gradient(rgba(120,236,255,0.055) 1px, transparent 1px),
      linear-gradient(90deg, rgba(120,236,255,0.045) 1px, transparent 1px);
    background-size: 44px 44px;
  }
  .glass-ui {
    background: linear-gradient(180deg, rgba(255,255,255,0.058), rgba(255,255,255,0.024));
    border: 1px solid rgba(255,255,255,0.15);
    box-shadow: 0 10px 60px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,0.10);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  }
  .glow-cyan { text-shadow: 0 0 24px rgba(39,232,255,.32), 0 0 60px rgba(39,232,255,.14); }
  .glow-purple { text-shadow: 0 0 22px rgba(191,95,255,.28); }
  .glitch-slice { position: relative; }
  .glitch-slice:before,
  .glitch-slice:after {
    content: attr(data-text); position: absolute; inset: 0; pointer-events: none; opacity: 0;
  }
  .glitch-slice:before { color: #38f8ff; transform: translate(1px,-1px); clip-path: inset(0 0 56% 0); }
  .glitch-slice:after { color: #ff5fb8; transform: translate(-1px,1px); clip-path: inset(48% 0 0 0); }
  .glitch-slice:hover:before,
  .glitch-slice:hover:after { opacity: .72; animation: glitch-jitter .58s steps(2,end) infinite; }
  @keyframes glitch-jitter {
    0%,100% { transform: translate(0,0); }
    20% { transform: translate(2px,-1px); }
    45% { transform: translate(-2px,1px); }
    70% { transform: translate(1px,2px); }
  }
  .depth-card { transform-style: preserve-3d; transition: transform .32s cubic-bezier(.16,1,.3,1), border-color .25s ease; }
  .depth-card:hover { transform: perspective(900px) rotateX(2.2deg) rotateY(-4.4deg) translateY(-5px); }
  .depth-card:hover .depth-card-inner { transform: translateZ(22px); }
  .depth-card-inner { transition: transform .32s cubic-bezier(.16,1,.3,1); }
  .vignette-soft {
    background: radial-gradient(1200px 760px at 50% 42%, transparent 32%, rgba(3,3,10,.42) 68%, rgba(3,2,9,.88) 100%);
  }
  /* hide native cursor for scanner feel (desktop only) */
  @media (pointer:fine) {
    html, body, a, button { cursor: none !important; }
  }
  ::-webkit-scrollbar{ width:7px } ::-webkit-scrollbar-track{ background:#0a0b13 } ::-webkit-scrollbar-thumb{ background:#20243a; border-radius:10px }
  `}</style>
)

// -------------------------------------------------
// 3D WORLD
// -------------------------------------------------

// Lightweight star / dust field (slow parallax background)
function DeepSpaceDust() {
  const ref = React.useRef<THREE.Points>(null)
  const positions = React.useMemo(() => {
    const n = 1700
    const arr = new Float32Array(n*3)
    for(let i=0;i<n;i++){
      const r = 28 + Math.random()*42
      const theta = Math.random()*Math.PI*2
      const y = (Math.random()-0.5)*34
      const z = (Math.random()-0.5)*120 - 10
      arr[i*3] = Math.cos(theta)*r*0.5
      arr[i*3+1] = y
      arr[i*3+2] = z
    }
    return arr
  },[])
  useFrame((_,d)=>{
    if(ref.current) ref.current.rotation.y += d*0.012
  })
  return (
    <Points ref={ref} positions={positions} frustumCulled={false}>
      <PointMaterial transparent size={0.035} color="#98d7ff" sizeAttenuation depthWrite={false} opacity={0.78}/>
    </Points>
  )
}

// Cyber tunnel: repeating rings + grid tunnel
function CyberTunnel() {
  const ringGroup = React.useRef<THREE.Group>(null)
  useFrame((state)=>{
    const s = scrollStore.progress
    if(ringGroup.current){
      ringGroup.current.rotation.z = s * 0.65
    }
    // subtle breathing
    const t = state.clock.elapsedTime
    if(ringGroup.current) ringGroup.current.position.x = Math.sin(t*0.31)*0.04
  })

  const rings = React.useMemo(()=>{
    const list = []
    // Z from 74 down to -36 step ~2.85
    for(let z=74; z >= -36; z -= 2.88){
      const idx = Math.round((74-z)/2.88)
      const gate = idx % 7 === 0
      list.push({ z, gate, idx })
    }
    return list
  },[])

  return (
    <group ref={ringGroup}>
      {/* floor / ceiling scan grid */}
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-3.55,-4]}>
        <planeGeometry args={[22, 148, 22, 126]} />
        <meshBasicMaterial color="#00f0cc" wireframe opacity={0.053} transparent />
      </mesh>
      <mesh rotation={[Math.PI/2,0,0]} position={[0,3.55,-4]}>
        <planeGeometry args={[22, 148, 22, 126]} />
        <meshBasicMaterial color="#a45dff" wireframe opacity={0.038} transparent />
      </mesh>

      {/* tunnel rings */}
      {rings.map(r=>(
        <mesh key={r.z.toFixed(2)} position={[0,0,r.z]} rotation={[Math.PI/2,0,0]}>
          <torusGeometry args={[ r.gate ? 3.48 : 2.9, r.gate ? 0.022 : 0.012, 16, 128 ]} />
          <meshBasicMaterial color={ r.gate ? "#ffb95a" : (r.idx%2 ? "#27e8ff" : "#b86bff")} transparent opacity={r.gate ? 0.95 : 0.67}/>
        </mesh>
      ))}

      {/* Side data rails */}
      {[-2.35, 2.35].map(x => (
        <mesh key={x} position={[x,0,-2]}>
          <boxGeometry args={[0.016,0.016,142]} />
          <meshBasicMaterial color="#23ffd0" />
        </mesh>
      ))}
      {/* vertical ribs */}
      {rings.filter(r=>r.gate).map(r=>(
        <group key={"rib"+r.z}>
          <mesh position={[-2.72,0,r.z]}><boxGeometry args={[0.035,3.4,0.035]} /><meshBasicMaterial color="#26e8ff"/></mesh>
          <mesh position={[2.72,0,r.z]}><boxGeometry args={[0.035,3.4,0.035]} /><meshBasicMaterial color="#26e8ff"/></mesh>
        </group>
      ))}
    </group>
  )
}

// Floating data motes streaming toward camera (parallax fast layer)
function DataStream() {
  const ref = React.useRef<THREE.Points>(null)
  const { count, positions, speeds } = React.useMemo(()=>{
    const count = 720
    const positions = new Float32Array(count*3)
    const speeds = new Float32Array(count)
    for(let i=0;i<count;i++){
      positions[i*3] = (Math.random()-0.5)*11
      positions[i*3+1] = (Math.random()-0.5)*6.4
      positions[i*3+2] = Math.random()*130 - 30
      speeds[i] = 0.9 + Math.random()*1.85
    }
    return { count, positions, speeds }
  },[])
  useFrame((_, delta)=>{
    if(!ref.current) return
    const pos = ref.current.geometry.attributes.position.array as Float32Array
    const vel = scrollStore.velocity
    for(let i=0;i<count;i++){
      let z = pos[i*3+2]
      z += (speeds[i] * delta * 7.5) + vel * 5.5
      if(z > 84){ z -= 138 }
      pos[i*3+2] = z
    }
    ref.current.geometry.attributes.position.needsUpdate = true
  })
  return (
    <Points ref={ref} positions={positions} frustumCulled={false}>
      <PointMaterial transparent size={0.034} color="#6dfeff" sizeAttenuation depthWrite={false} opacity={0.95} />
    </Points>
  )
}

// --- HERO: Cyborg AI Face ---
function CyborgFace() {
  const group = React.useRef<THREE.Group>(null)
  const eyeL = React.useRef<THREE.Mesh>(null)
  const eyeR = React.useRef<THREE.Mesh>(null)

  useFrame((state)=>{
    const t = state.clock.elapsedTime
    const recede = THREE.MathUtils.clamp(scrollStore.progress / 0.18, 0, 1)
    if(group.current){
      group.current.rotation.y = Math.sin(t*0.42)*0.16 + recede*0.22
      group.current.rotation.x = Math.sin(t*0.33)*0.055
      group.current.position.y = Math.sin(t*0.95)*0.1
      group.current.position.z = THREE.MathUtils.lerp(76, 59.5, recede)
      const sc = THREE.MathUtils.lerp(1.85, 1.42, recede)
      group.current.scale.setScalar(sc)
    }
    if(eyeL.current && eyeR.current){
      const blink = Math.sin(t*5.7) > 0.985 ? 0.12 : 1
      eyeL.current.scale.y = blink
      eyeR.current.scale.y = blink
    }
  })

  return (
    <group ref={group} position={[0,0.06,76]} scale={1.85}>
      {/* cranial shell */}
      <mesh>
        <sphereGeometry args={[1.28, 96, 96]} />
        <MeshDistortMaterial 
          color="#b8fff5"
          emissive="#00d8b6"
          emissiveIntensity={0.52}
          roughness={0.19}
          metalness={0.53}
          distort={0.17}
          speed={1.9}
        />
      </mesh>
      {/* face plate */}
      <mesh position={[0,-0.05,1.04]}>
        <sphereGeometry args={[0.97, 64, 64, 0, Math.PI*2, 0, Math.PI*0.82]} />
        <meshStandardMaterial color="#0b1017" metalness={0.94} roughness={0.25} transparent opacity={0.96} />
      </mesh>
      {/* neural lattice over face */}
      <mesh position={[0,-0.03,1.14]}>
        <sphereGeometry args={[0.985, 42, 42]} />
        <meshStandardMaterial color="#78fff1" wireframe transparent opacity={0.34} />
      </mesh>

      {/* eyes */}
      <mesh ref={eyeL} position={[-0.345,0.143,1.18]}>
        <sphereGeometry args={[0.123, 32, 32]} />
        <meshStandardMaterial color="#9ffff6" emissive="#00ffd5" emissiveIntensity={2.2} />
      </mesh>
      <mesh ref={eyeR} position={[0.345,0.143,1.18]}>
        <sphereGeometry args={[0.123, 32, 32]} />
        <meshStandardMaterial color="#9ffff6" emissive="#00ffd5" emissiveIntensity={2.2} />
      </mesh>

      {/* eye rings */}
      <mesh position={[-0.345,0.143,1.2]} rotation={[0,0,0]}>
        <ringGeometry args={[0.167,0.18,48]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.96} />
      </mesh>
      <mesh position={[0.345,0.143,1.2]}>
        <ringGeometry args={[0.167,0.18,48]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.96} />
      </mesh>

      {/* jaw / vent */}
      <mesh position={[0,-0.58,0.88]} rotation={[0.3,0,0]}>
        <boxGeometry args={[0.82,0.21,0.52]} />
        <meshStandardMaterial color="#cfe8ff" metalness={0.86} roughness={0.29} />
      </mesh>
      {/* vents */}
      {[-0.22,0,0.22].map((x,i)=>(
        <mesh key={i} position={[x,-0.58,1.15]}>
          <boxGeometry args={[0.11,0.035,0.04]} />
          <meshBasicMaterial color="#00ffc8"/>
        </mesh>
      ))}

      {/* halo / crown rings */}
      <mesh rotation={[Math.PI/2.18,0,0.19]}>
        <torusGeometry args={[1.56, 0.015, 16, 160]} />
        <meshBasicMaterial color="#cdfef8" />
      </mesh>
      <mesh rotation={[1.2,0.6,0]}>
        <torusGeometry args={[1.86, 0.011, 16, 170]} />
        <meshBasicMaterial color="#ff9ac6" transparent opacity={0.88} />
      </mesh>
      <mesh>
        <torusGeometry args={[2.16,0.009,16,180]} />
        <meshBasicMaterial color="#ffe29d" transparent opacity={0.72}/>
      </mesh>

      {/* neural strands */}
      {Array.from({length:14}).map((_,i)=>{
        const a = (i/14)*Math.PI*2
        return (
          <mesh key={i} position={[Math.cos(a)*1.38, Math.sin(a)*0.9-0.18, 0.42]}>
            <sphereGeometry args={[0.027,12,12]} />
            <meshBasicMaterial color={i%3===0 ? "#ff6ea8" : "#6dfff0"}/>
          </mesh>
        )
      })}

      {/* pulsing neural wire bundles */}
      {Array.from({length:12}).map((_,i)=>{
        const a = (i/12)*Math.PI*2
        const x = Math.cos(a)*1.12
        const y = Math.sin(a)*0.52 - 0.18
        return (
          <mesh key={`wire-${i}`} position={[x*0.56, y, 0.02]} rotation={[0.35 + i*0.03, 0.16*Math.sin(a), a]}>
            <cylinderGeometry args={[0.006,0.006,1.25,6]} />
            <meshBasicMaterial color={i%3===0 ? "#ff69b3" : "#49ffe3"} transparent opacity={0.66}/>
          </mesh>
        )
      })}

      <pointLight position={[0,0.2,1.6]} intensity={1.85} distance={6.5} color="#00ffd2" />
    </group>
  )
}

function HeroHolograms() {
  const group = React.useRef<THREE.Group>(null)
  useFrame((state)=>{
    const p = THREE.MathUtils.clamp(scrollStore.progress / 0.22, 0, 1)
    const t = state.clock.elapsedTime
    if(group.current){
      group.current.position.z = THREE.MathUtils.lerp(75.4, 58.8, p)
      group.current.rotation.y = Math.sin(t*0.42)*0.05 + p*0.15
      group.current.children.forEach((child, i)=>{
        child.position.y += Math.sin(t*1.35 + i) * 0.0008
      })
    }
  })
  const panels = [
    { x:-2.55, y:1.15, w:1.24, h:.58, c:"#35f7ff", label:"HUMAN_SCAN" },
    { x:2.42, y:.72, w:1.12, h:.52, c:"#b86bff", label:"MACHINE_SYNC" },
    { x:-2.1, y:-1.2, w:1.04, h:.48, c:"#28ffb6", label:"CONSCIOUSNESS" },
    { x:2.12, y:-1.35, w:1.02, h:.48, c:"#ff6fae", label:"MERGE_READY" },
  ]
  return (
    <group ref={group} position={[0,0,75.4]}>
      {panels.map((p,i)=>(
        <group key={p.label} position={[p.x,p.y,0]} rotation={[0, i%2 ? -0.18 : 0.18, 0]}>
          <mesh>
            <planeGeometry args={[p.w,p.h]} />
            <meshBasicMaterial color={p.c} transparent opacity={0.105} side={THREE.DoubleSide}/>
          </mesh>
          <mesh position={[0,p.h*.36,.01]}>
            <planeGeometry args={[p.w*.88,.015]} />
            <meshBasicMaterial color={p.c} transparent opacity={0.95}/>
          </mesh>
          <Text position={[0,-0.03,.018]} fontSize={0.07} color="#eaffff" anchorX="center" anchorY="middle" maxWidth={p.w*.85} textAlign="center">
            {p.label}
          </Text>
        </group>
      ))}
    </group>
  )
}

// ---- Cyber city monoliths (parallax mid-layer) ----
function CyberCityLayer() {
  const group = React.useRef<THREE.Group>(null)
  const city = React.useMemo(()=> {
    const clusters = []
    const zs = [54.5, 46.8, 39.2, 31.6]
    for(const z of zs){
      for(let side of [-1,1]){
        for(let i=0;i<5;i++){
          clusters.push({
            x: side * (3.9 + Math.random()*1.3 + i*0.52),
            y: -2.2 + Math.random()*0.7,
            z: z + (Math.random()-0.5)*2.7,
            h: 1.05 + Math.random()*2.35,
            w: 0.26 + Math.random()*0.295
          })
        }
      }
    }
    return clusters
  },[])
  useFrame(()=>{
    if(!group.current) return
    const p = THREE.MathUtils.clamp((scrollStore.progress - 0.16) / 0.28, 0, 1)
    group.current.position.z = -p * 10.5
    group.current.scale.setScalar(THREE.MathUtils.lerp(0.94, 1.08, p))
  })
  return (
    <group ref={group}>
      {city.map((b,i)=>(
        <mesh key={i} position={[b.x,b.y + b.h/2, b.z]}>
          <boxGeometry args={[b.w, b.h, b.w]} />
          <meshStandardMaterial color="#0f1726" emissive={ i%3===0 ? "#1dd9ff":"#b964ff"} emissiveIntensity={0.24} metalness={0.6} roughness={0.5}/>
        </mesh>
      ))}
      {/* glowing windows */}
      {city.map((b,i)=>(
        <mesh key={"w"+i} position={[b.x + 0.001, b.y + b.h*0.68, b.z + b.w/2 + 0.001]}>
          <planeGeometry args={[b.w*0.62, 0.06]} />
          <meshBasicMaterial color={i%2 ? "#60fff0" : "#ff9dd0"} transparent opacity={0.9}/>
        </mesh>
      ))}
    </group>
  )
}

// --- Events: 3D holographic cards floating ---
const TF_EVENTS = [
  { id:"CYBR_HACK", name:"Cyborg Hackathon", sub:"48H • Human-Machine Teams", color:"#29eaff"},
  { id:"NEURO_RACE", name:"NeuroDrone Swarm GP", sub:"Vision-only • LED Forest", color:"#ff5ca6"},
  { id:"SYNTH_LAB", name:"Synth-Bio Interface Jam", sub:"EMG • Open BCI • Wetlab", color:"#27ffba"},
  { id:"MECHA_SUMO", name:"Mecha Sumo Arena", sub:"1.5kg • Carbon Cage", color:"#ffc85f"},
  { id:"XR_GHOST", name:"XR Ghost Tag", sub:"Haptics • Mixed Reality", color:"#b97fff"},
  { id:"LIVE_CODE", name:"Neuro-Rave Live Code", sub:"AV • Biosignals • All Night", color:"#6dfff1"},
  { id:"AI_SENTINEL", name:"Autonomous AI Sentinel", sub:"Defense Bots • Edge AI • Vision", color:"#7cff6b"},
  { id:"QUANTUM_GRID", name:"Quantum Grid Challenge", sub:"Optimization • Qubits • Simulation", color:"#58a6ff"},
  { id:"ROBO_SURGE", name:"Robo Surge Arena", sub:"Combat Robotics • Precision Control", color:"#ff7a45"},
]

function EventHolograms() {
  // camera approaches event ring at ~0.44–0.68 scroll
  const g = React.useRef<THREE.Group>(null)
  useFrame((state)=>{
    if(!g.current) return
    const p = THREE.MathUtils.clamp((scrollStore.progress - 0.39) / 0.23, 0, 1)
    g.current.rotation.y += 0.0019
    g.current.position.z = THREE.MathUtils.lerp(28.15, 20.2, p)
    g.current.scale.setScalar(THREE.MathUtils.lerp(1.0, 0.82, p))
    const t = state.clock.elapsedTime
    g.current.children.forEach((c, i)=>{
      c.position.y = Math.sin(t*0.9 + i)*0.07
      c.rotation.y = Math.sin(t*0.55 + i)*0.13
    })
  })
  const radius = 3.25
  return (
    <group ref={g} position={[0,0,28.15]}>
      {TF_EVENTS.map((ev,i)=>{
        const ang = (i/TF_EVENTS.length)*Math.PI*2
        const x = Math.cos(ang)*radius
        const z = Math.sin(ang)*radius*0.45
        return (
          <group key={ev.id} position={[x,0,z]} rotation={[0,-ang,0]}>
            {/* card plate */}
            <mesh>
              <planeGeometry args={[1.62, 0.98]} />
              {/* @ts-ignore */}
              <meshStandardMaterial color="#0a1220" transparent opacity={0.82} emissive={ev.color} emissiveIntensity={0.092} side={THREE.DoubleSide} />
            </mesh>
            {/* border glow */}
            <mesh position={[0,0,0.012]}>
              <planeGeometry args={[1.68,1.04]} />
              <meshBasicMaterial color={ev.color} transparent opacity={0.24} side={THREE.DoubleSide}/>
            </mesh>
            {/* scan line */}
            <mesh position={[0,0.32,0.017]}>
              <planeGeometry args={[1.36,0.018]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.9}/>
            </mesh>
            {/* id */}
            <Text 
              position={[0,0.14,0.022]}
              fontSize={0.124}
              color={ev.color}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0}
            >
              {ev.id}
            </Text>
            <Text 
              position={[0,-0.07,0.022]}
              fontSize={0.104}
              color="#eaffff"
              anchorX="center"
              anchorY="middle"
              maxWidth={1.42}
              textAlign="center"
              outlineWidth={0}
            >
              {ev.name}
            </Text>
            <Text
              position={[0,-0.30,0.022]}
              fontSize={0.064}
              color="#a7d9d8"
              anchorX="center"
              anchorY="middle"
            >
              {ev.sub}
            </Text>
            <pointLight position={[0,0,0.35]} intensity={0.95} distance={2.8} color={ev.color}/>
          </group>
        )
      })}
      {/* central holo projector */}
      <mesh>
        <cylinderGeometry args={[0.27,0.36,0.16,40]} />
        <meshStandardMaterial color="#dffffc" emissive="#2bffda" emissiveIntensity={0.83} metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0,0.28,0]}>
        <coneGeometry args={[0.54,0.51, 48]} />
        <meshBasicMaterial color="#37ffe0" transparent opacity={0.065} wireframe />
      </mesh>
    </group>
  )
}

// ---- Neural / Tech Core ----
function NeuralCore() {
  const group = React.useRef<THREE.Group>(null)
  const pointsRef = React.useRef<THREE.Points>(null)

  const nodePositions = React.useMemo(()=>{
    const arr:number[] = []
    const nodes = 110
    for(let i=0;i<nodes;i++){
      const r = 0.52 + Math.random()*1.28
      const th = Math.random()*Math.PI*2
      const ph = Math.acos(2*Math.random()-1)
      arr.push(
        Math.sin(ph)*Math.cos(th)*r,
        (Math.sin(ph)*Math.sin(th)*r)*0.79,
        Math.cos(ph)*r*0.95
      )
    }
    return new Float32Array(arr)
  },[])

  useFrame((state)=>{
    const t = state.clock.elapsedTime
    const s = scrollStore.progress
    // only animate strongly when near tech section (~0.62–0.84)
    const influence = THREE.MathUtils.clamp((s - 0.59) / 0.28, 0, 1)
    const dissolve = THREE.MathUtils.clamp((s - 0.78) / 0.12, 0, 1)
    if(group.current){
      group.current.rotation.y += 0.0038 + influence*0.0085
      group.current.rotation.x = Math.sin(t*0.33)*0.12
      group.current.scale.setScalar(THREE.MathUtils.lerp(0.82, 1.55, influence) * THREE.MathUtils.lerp(1, 0.13, dissolve))
      group.current.position.z = THREE.MathUtils.lerp(6.2, -3.2, dissolve)
    }
    if(pointsRef.current){
      ;(pointsRef.current.material as THREE.PointsMaterial).opacity = (0.42 + influence*0.55) * THREE.MathUtils.lerp(1, 0.15, dissolve)
    }
  })

  return (
    <group ref={group} position={[0,0.06,6.2]}>
      {/* brain core */}
      <mesh>
        <sphereGeometry args={[0.82, 80, 80]} />
        <MeshDistortMaterial color="#a9fff0" emissive="#00cfa9" emissiveIntensity={0.78} roughness={0.22} distort={0.34} speed={2.45}/>
      </mesh>
      {/* cortex shell */}
      <mesh>
        <icosahedronGeometry args={[1.35, 2]} />
        <meshStandardMaterial color="#95fff0" wireframe transparent opacity={0.185} emissive="#00ffcf" emissiveIntensity={0.33}/>
      </mesh>
      {/* neural nodes */}
      <Points ref={pointsRef} positions={nodePositions} frustumCulled={false}>
        <PointMaterial size={0.039} color="#ffffff" transparent opacity={0.74} sizeAttenuation depthWrite={false}/>
      </Points>
      {/* synaptic rings */}
      <mesh rotation={[Math.PI/2.05,0,0]}>
        <torusGeometry args={[1.68,0.013,16,128]} />
        <meshBasicMaterial color="#c4fff6" />
      </mesh>
      <mesh rotation={[0.74,0.78,0]}>
        <torusGeometry args={[2.01,0.010,16,128]} />
        <meshBasicMaterial color="#ff99c7" transparent opacity={0.9}/>
      </mesh>
      <mesh>
        <torusGeometry args={[2.33,0.009,16,140]} />
        <meshBasicMaterial color="#ffe09d" transparent opacity={0.72}/>
      </mesh>
      <pointLight intensity={2.1} distance={7.5} color="#28ffd2"/>
    </group>
  )
}

function FinalSingularity() {
  const group = React.useRef<THREE.Group>(null)
  const particles = React.useRef<THREE.Points>(null)
  const base = React.useMemo(()=>{
    const count = 520
    const arr = new Float32Array(count*3)
    for(let i=0;i<count;i++){
      const r = 0.65 + Math.random()*4.4
      const a = Math.random()*Math.PI*2
      const y = (Math.random()-0.5)*4.4
      arr[i*3] = Math.cos(a)*r
      arr[i*3+1] = y
      arr[i*3+2] = Math.sin(a)*r
    }
    return arr
  },[])
  const live = React.useMemo(()=> new Float32Array(base), [base])
  useFrame((state)=>{
    const p = THREE.MathUtils.clamp((scrollStore.progress - 0.82) / 0.18, 0, 1)
    const t = state.clock.elapsedTime
    if(group.current){
      group.current.rotation.z = p * 1.9 + t*0.05
      group.current.rotation.y = t*0.18
      group.current.scale.setScalar(THREE.MathUtils.lerp(1.35, 0.32, p))
    }
    if(particles.current){
      const arr = particles.current.geometry.attributes.position.array as Float32Array
      for(let i=0;i<base.length/3;i++){
        const idx = i*3
        const spiral = Math.sin(t*1.2 + i)*0.08*(1-p)
        arr[idx] = THREE.MathUtils.lerp(base[idx] + spiral, 0, p)
        arr[idx+1] = THREE.MathUtils.lerp(base[idx+1], 0, p)
        arr[idx+2] = THREE.MathUtils.lerp(base[idx+2], 0, p)
      }
      particles.current.geometry.attributes.position.needsUpdate = true
      ;(particles.current.material as THREE.PointsMaterial).opacity = THREE.MathUtils.lerp(0.65, 0.18, p)
    }
  })
  return (
    <group ref={group} position={[0,-0.03,-18.3]}>
      <Points ref={particles} positions={live} frustumCulled={false}>
        <PointMaterial size={0.037} color="#8ffff2" transparent opacity={0.65} sizeAttenuation depthWrite={false}/>
      </Points>
      <mesh>
        <sphereGeometry args={[0.48,48,48]} />
        <meshStandardMaterial color="#9ffff5" emissive="#00ffc6" emissiveIntensity={1.38}/>
      </mesh>
      <mesh rotation={[Math.PI/2,0,0]}>
        <ringGeometry args={[0.82,0.839,96]}/>
        <meshBasicMaterial color="#5dffe7" transparent opacity={0.95}/>
      </mesh>
      <mesh rotation={[Math.PI/2,0,0]}>
        <ringGeometry args={[1.23,1.247,96]}/>
        <meshBasicMaterial color="#b780ff" transparent opacity={0.72}/>
      </mesh>
      <pointLight intensity={1.7} distance={8} color="#32ffe2" />
    </group>
  )
}

// --- Camera Rig: scroll-driven cinematic path ---
function CameraRig() {
  const { camera } = useThree()
  const targetZ = React.useRef(84)
  const targetY = React.useRef(0.06)
  const targetLookZ = React.useRef(76)
  const targetRot = React.useRef(0)

  useFrame((_, delta)=>{
    const p = scrollStore.progress

    // Cinematic keyframe path (Z forward through tunnel)
    // Map progress 0..1 to camera positions
    // Section breakpoints: 0 Hero, 0.20 city entry, 0.47 events, 0.68 tech, 0.88 void
    let cz, cy, lz, rot, fov
    if(p < 0.18){
      const t = p/0.18
      cz = THREE.MathUtils.lerp(83.9, 68.4, t)
      cy = THREE.MathUtils.lerp(0.11, 0.02, t)
      lz = THREE.MathUtils.lerp(76.2, 60.5, t)
      rot = Math.sin(t*Math.PI)*0.016
      fov = 51
    } else if(p < 0.40){
      const t = (p-0.18)/0.22
      cz = THREE.MathUtils.lerp(68.4, 44.7, t)
      cy = 0.02 + Math.sin(t*3.3)*0.05
      lz = cz - 7.8
      rot = THREE.MathUtils.lerp(0.016, -0.025, t)
      fov = THREE.MathUtils.lerp(51, 57, t)
    } else if(p < 0.6){
      const t = (p-0.40)/0.20
      cz = THREE.MathUtils.lerp(44.7, 24.6, t)
      cy = THREE.MathUtils.lerp(0.05, -0.01, t)
      lz = cz - 6.7
      rot = THREE.MathUtils.lerp(-0.025, 0.012, t)
      fov = 54
    } else if(p < 0.795){
      const t = (p-0.6)/0.195
      cz = THREE.MathUtils.lerp(24.6, 5.1, t)
      cy = THREE.MathUtils.lerp(-0.01, 0.06, t)
      lz = cz - 5.9
      rot = THREE.MathUtils.lerp(0.012, -0.009, t)
      fov = THREE.MathUtils.lerp(54, 49, t)
    } else {
      const t = (p-0.795)/0.205
      cz = THREE.MathUtils.lerp(5.1, -10.8, t)
      cy = THREE.MathUtils.lerp(0.06, 0.0, t)
      lz = cz - 8.8
      rot = THREE.MathUtils.lerp(-0.009, 0.0, t)
      fov = THREE.MathUtils.lerp(49, 54, t)
    }

    targetZ.current = cz
    targetY.current = cy
    targetLookZ.current = lz
    targetRot.current = rot

    // smooth follow
    camera.position.z += (targetZ.current - camera.position.z) * Math.min(1, delta*3.85)
    camera.position.y += (targetY.current - camera.position.y) * Math.min(1, delta*2.9)
    camera.position.x += (0 - camera.position.x) * Math.min(1, delta*2.2)
    ;(camera as THREE.PerspectiveCamera).fov += (fov - (camera as THREE.PerspectiveCamera).fov) * delta * 2.6
    ;(camera as THREE.PerspectiveCamera).updateProjectionMatrix()

    camera.lookAt(0, 0.05, targetLookZ.current)
    camera.rotation.z += (targetRot.current - camera.rotation.z) * delta * 2.1
  })
  return null
}

function SceneContent() {
  return (
    <>
      <color attach="background" args={['#05060b']} />
      <fog attach="fog" args={['#05060b', 18, 78]} />
      <ambientLight intensity={0.46} />
      <directionalLight position={[3.2,4.4,5]} intensity={1.18} color="#ffffff"/>
      <directionalLight position={[-2.7,-1.6,-2]} intensity={0.48} color="#ff6ea8"/>
      <DeepSpaceDust />
      <CyberTunnel />
      <CyberCityLayer />
      <DataStream />
      <CyborgFace />
      <HeroHolograms />
      <EventHolograms />
      <NeuralCore />
      <FinalSingularity />
      <CameraRig />
      <Environment preset="night" />
      <EffectComposer>
        <Bloom intensity={1.07} luminanceThreshold={0.205} luminanceSmoothing={0.78} mipmapBlur />
        <ChromaticAberration offset={new THREE.Vector2(0.00054, 0.00054)} radialModulation={false} modulationOffset={0} />
        <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.034} />
        <Vignette eskil={false} offset={0.20} darkness={0.78} />
      </EffectComposer>
    </>
  )
}

function Scene() {
  return (
    <Canvas 
      dpr={[1,1.85]} 
      camera={{ position:[0,0.06,83.8], fov:51, near:0.1, far:130 }}
      gl={{ antialias:true, powerPreference:"high-performance" }}
      style={{ position:'fixed', inset:0, zIndex:0}}
    >
      <SceneContent />
    </Canvas>
  )
}

// -------------------------------------------------
// CURSOR SCANNER
// -------------------------------------------------
function CursorScanner() {
  const dot = React.useRef<HTMLDivElement>(null)
  const ring = React.useRef<HTMLDivElement>(null)
  const mouse = React.useRef({x:0, y:0, tx:0, ty:0})
  React.useEffect(()=>{
    const onMove = (e:MouseEvent) => { mouse.current.tx = e.clientX; mouse.current.ty = e.clientY }
    window.addEventListener('mousemove', onMove, { passive:true })
    let raf = 0
    const loop = ()=>{
      mouse.current.x += (mouse.current.tx - mouse.current.x)*0.22
      mouse.current.y += (mouse.current.ty - mouse.current.y)*0.22
      if(dot.current){
        dot.current.style.transform = `translate3d(${mouse.current.x}px,${mouse.current.y}px,0)`
      }
      if(ring.current){
        ring.current.style.transform = `translate3d(${mouse.current.x}px,${mouse.current.y}px,0)`
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return ()=> { window.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf) }
  },[])
  return (
    <div className="pointer-events-none fixed inset-0 z-[80] hidden md:block" aria-hidden>
      <div ref={ring} className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2">
        <div className="w-[34px] h-[34px] rounded-full border border-cyan-300/55 shadow-[0_0_18px_rgba(43,255,230,.25)]" />
        <div className="absolute left-1/2 top-1/2 w-[44px] h-px bg-cyan-300/35 -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute left-1/2 top-1/2 w-px h-[44px] bg-cyan-300/35 -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute -top-[9px] left-1/2 -translate-x-1/2 text-[8.5px] font-monox text-cyan-200/85 tracking-wider">LOCK</div>
      </div>
      <div ref={dot} className="absolute left-0 top-0 w-[4px] h-[4px] rounded-full bg-[#9bffff] -translate-x-1/2 -translate-y-1/2 shadow-[0_0_14px_#2dfff0]" />
    </div>
  )
}

// -------------------------------------------------
// UI HELPERS
// -------------------------------------------------
const Tag = ({children}:{children:React.ReactNode}) => (
  <span className="inline-flex items-center rounded-full border border-white/[0.20] bg-white/[0.042] px-2.5 py-1 text-[10.6px] tracking-wider font-monox text-zinc-200">{children}</span>
)

// Section wrapper with scroll progress mapping to parallax text depth
function ParallaxSection({
  children,
  className = "",
  progressRange = [0,1],
  yRange = [36, -28],
  scaleRange = [0.985, 1.045],
  opacityRange,
  focusBlur = true
}:{
  children: React.ReactNode;
  className?: string;
  progressRange?: [number, number];
  yRange?: [number, number];
  scaleRange?: [number, number];
  opacityRange?: [number, number, number, number];
  focusBlur?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"]})
  const y = useTransform(scrollYProgress, progressRange, yRange)
  const scale = useTransform(scrollYProgress, progressRange, scaleRange)
  const opacity = opacityRange ? useTransform(scrollYProgress, [0,0.15,0.82,1], opacityRange) : 1
  const filter = useTransform(scrollYProgress, [0,0.18,0.82,1], ["blur(14px)", "blur(0px)", "blur(0px)", "blur(8px)"])
  return (
    <div ref={ref} className={className}>
      <motion.div style={{ y, scale, opacity, filter: focusBlur ? filter : "none" }}>
        {children}
      </motion.div>
    </div>
  )
}

// -------------------------------------------------
// PAGE SECTIONS
// -------------------------------------------------

function TopNav({ cyborgMode }:{ cyborgMode: boolean }) {
  return (
    <div className="fixed z-40 top-0 inset-x-0 border-b border-white/[0.11] bg-[#070912]/84 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-5 md:px-10 h-[66px] flex items-center justify-between font-monox text-[11.35px] tracking-wider">
        <div className="flex items-center gap-7">
          <div className="font-display text-[17.8px] tracking-[-0.015em] text-zinc-100">
            TECHFEST<span className="text-[#25f0d8]"> // </span><span className="text-zinc-400 text-[13.8px]">IIT BOMBAY</span>
          </div>
          <div className="hidden lg:flex items-center gap-6 text-zinc-400">
            <a href="#world" className="hover:text-white transition">CYBER WORLD</a>
            <a href="#events" className="hover:text-white transition">EVENTS</a>
            <a href="#tech" className="hover:text-white transition">NEURAL CORE</a>
            <a href="#enter" className="hover:text-white transition">ENTER</a>
          </div>
        </div>
        <div className="flex items-center gap-4 text-zinc-300">
          <span className="hidden sm:inline text-zinc-400">REGISTRATION PORTAL LIVE</span>
          <span className={`px-2.5 py-1 rounded-full text-[10.6px] border ${cyborgMode ? "border-rose-300/40 text-rose-200 bg-rose-400/10" : "border-emerald-300/30 text-emerald-200 bg-emerald-400/10"}`}>
            {cyborgMode ? "CYBORG MODE" : "LINK SYNC"}
          </span>
        </div>
      </div>
    </div>
  )
}

function HeroSection() {
  return (
    <section className="relative min-h-[138vh]">
      {/* Sticky hero content: text comes forward as you scroll through */}
      <div className="sticky top-0 h-[100vh] flex items-center">
        <div className="mx-auto max-w-7xl px-5 md:px-10 w-full pt-16">
          <ParallaxSection progressRange={[0,1]} yRange={[46, -58]} scaleRange={[0.975, 1.072]}>
            <div className="max-w-[980px]">
              <div className="flex flex-wrap gap-2 mb-6 font-monox text-[11px] text-cyan-200/90">
                <Tag>IIT BOMBAY // TECHFEST 2026</Tag>
                <Tag>CYBORG INTELLIGENCE</Tag>
                <Tag>HUMAN + MACHINE CONSCIOUSNESS</Tag>
              </div>
              <h1 className="font-display font-[700] leading-[0.885] tracking-[-0.034em] glow-cyan"
                style={{ fontSize:"clamp(54px, 11vw, 150px)"}}
              >
                <span className="block text-[#e9ffff] glitch-slice" data-text="IIT BOMBAY">IIT BOMBAY</span>
                <span className="block text-transparent" style={{ WebkitTextStroke: "1.35px #bffef7"}}>TECHFEST</span>
                <span className="block text-[#e9ffff]">2026</span>
              </h1>
              <div className="mt-5 font-monox text-[14px] md:text-[16px] tracking-[0.33em] text-[#64ffe5]">
                ENTER THE CYBORG ERA
              </div>
              <div className="mt-7 max-w-xl text-[17.5px] md:text-[19.6px] leading-relaxed text-zinc-300 font-text">
                Step into the Cyborg Intelligence Era. Enter a living cybernetic world where AI, humans, and machines merge into one cinematic system.
              </div>
              <div className="mt-8 flex flex-wrap gap-3 font-monox text-[11.6px]">
                <a href="#world" className="rounded-full px-5 py-3 bg-[#dffffa] text-[#06201b] font-[700] tracking-wide shadow-[0_0_42px_rgba(36,255,222,.19)]">BEGIN DESCENT</a>
                <a href="#events" className="rounded-full px-5 py-3 border border-white/[0.26] text-zinc-100 hover:bg-white/10 transition">Event Arenas</a>
              </div>
              <div className="mt-11 font-monox text-[11px] text-zinc-400 flex flex-wrap gap-x-8 gap-y-2">
                <span>NEURAL FACE RETREATS ON SCROLL</span>
                <span className="text-cyan-200/90">CAMERA DOLLY: ACTIVE</span>
              </div>
            </div>
          </ParallaxSection>
        </div>
        {/* left HUD */}
        <div className="hidden xl:block absolute left-7 bottom-24 font-monox text-[11px] text-zinc-400 space-y-6">
          <div>SYS<br/><span className="text-zinc-200">NEURO_LINK</span></div>
          <div>LATENCY<br/><span className="text-zinc-200">4.1 ms</span></div>
          <div>AUTH<br/><span className="text-cyan-200">HUMAN OK</span></div>
        </div>
        <div className="hidden xl:block absolute right-7 bottom-24 font-monox text-[11px] text-zinc-500 rotate-180 [writing-mode:vertical-rl] tracking-widest">SCROLL TO TRAVEL</div>
      </div>
      {/* spacer to consume scroll for hero */}
      <div className="h-[38vh]" />
    </section>
  )
}

function CyberWorldSection() {
  return (
    <section id="world" className="relative min-h-[168vh] ">
      <div className="sticky top-0 h-[100vh] flex items-center">
        <div className="mx-auto max-w-7xl px-5 md:px-10 w-full grid lg:grid-cols-[1.08fr_.92fr] gap-12 items-center">
          <ParallaxSection yRange={[52, -36]} scaleRange={[0.98,1.045]}>
            <div className="font-monox text-[11px] tracking-widest text-[#65ffde]">CYBER TRANSITION ZONE // AI GRID WORLD</div>
            <h2 className="font-display text-[46px] md:text-[72px] leading-[0.96] tracking-[-0.025em] mt-4 glow-cyan">
              Drift through<br/>a neon city<br/>inside the machine.
            </h2>
            <p className="mt-6 text-[17.6px] leading-relaxed text-zinc-300 font-text max-w-[560px]">
              Scroll equals thrust. Rings rush past, data motes stream at different depths, holographic code flickers in the fog. Background layers retreat while foreground intelligence comes forward.
            </p>
            <div className="mt-7 flex flex-wrap gap-2 font-monox text-[11px] text-zinc-300">
              <Tag>TUNNEL RINGS</Tag>
              <Tag>PARALLAX Z-LAYERS</Tag>
              <Tag>PARTICLE STREAM</Tag>
              <Tag>CITY MONOLITHS</Tag>
            </div>
          </ParallaxSection>

          <ParallaxSection yRange={[18, -44]} scaleRange={[1.0, 1.065]}>
            <div className="glass-ui rounded-[26px] p-6 md:p-8 scanlines relative overflow-hidden">
              <div className="absolute inset-0 hud-grid opacity-[.36] pointer-events-none" />
              <div className="relative">
            <div className="font-monox text-[11px] text-zinc-300">HOLO_TERMINAL // CYBER_CITY_RENDER</div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-[12.4px] font-monox text-zinc-200">
                  <div className="rounded-xl border border-white/[0.14] bg-black/25 px-3.5 py-3">CAM_Z: scroll synced</div>
                  <div className="rounded-xl border border-white/[0.14] bg-black/25 px-3.5 py-3">EASE: gsap scrub 1.15</div>
                  <div className="rounded-xl border border-white/[0.14] bg-black/25 px-3.5 py-3">BLOOM: ON</div>
                  <div className="rounded-xl border border-white/[0.14] bg-black/25 px-3.5 py-3">DPR: adaptive</div>
                </div>
                <div className="mt-5 text-[13.8px] text-zinc-300 font-text">
                  Camera zoom, focus blur, and slight roll activate during section transitions. Floating objects react to scroll velocity.
                </div>
                <div className="mt-5 font-monox text-[11px] text-cyan-200">NEON_CITY_RENDER • 120 FPS • GPU INSTANCED</div>
              </div>
            </div>
          </ParallaxSection>
        </div>
      </div>
      <div className="h-[68vh]" />
    </section>
  )
}

function EventsSection({ registeredEvents, onRegister }: { registeredEvents: string[]; onRegister: (eventId: string, eventName: string) => void }) {
  const events = TF_EVENTS
  return (
    <section id="events" className="relative min-h-[194vh]">
      <div className="sticky top-0 min-h-[100vh] flex items-center py-20">
        <div className="mx-auto max-w-7xl px-5 md:px-10 w-full">
          <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
            <ParallaxSection yRange={[32,-18]} scaleRange={[0.985,1.03]}>
              <div>
                <div className="font-monox text-[11px] tracking-widest text-[#ffa9d8]">EVENTS SHOWCASE // 3D HOLOGRAMS</div>
                <h2 className="font-display text-[44px] md:text-[68px] tracking-[-0.025em] glow-purple">Hyper Reality<br/>Events</h2>
              </div>
            </ParallaxSection>
            <div className="text-zinc-400 font-text">Cards rotate on hover. Descriptions surge forward.</div>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-[17px]">
            {events.map((ev,i)=>(
              <ParallaxSection key={ev.id} yRange={[22 + i*4, -22 - i*3]} scaleRange={[0.985,1.045]}>
                <div
                  className="group depth-card relative rounded-[22px] glass-ui p-[22px] min-h-[232px] transition-transform duration-300"
                  style={{ boxShadow: `0 18px 70px rgba(0,0,0,.45), 0 0 30px ${ev.color}14`}}
                >
                  <div className="absolute inset-0 rounded-[22px] opacity-0 group-hover:opacity-100 transition duration-400 pointer-events-none" style={{ background:`radial-gradient(520px 220px at 90% -12%, ${ev.color}1a, transparent 60%)`}}/>
                  <div className="depth-card-inner relative">
                  <div className="flex items-center justify-between font-monox text-[11px] text-zinc-300">
                    <span style={{color: ev.color}}>{ev.id}</span>
                    <span className="text-zinc-400 group-hover:text-zinc-100 transition">HOLO</span>
                  </div>
                  <div className="mt-7 text-[25px] font-display tracking-[-0.012em]">{ev.name}</div>
                  <p className="mt-2 text-zinc-300 font-text">{ev.sub}</p>
                  <div className="mt-6 font-monox text-[11.2px] text-zinc-300 opacity-90 group-hover:opacity-100 transition">
                    <span className="opacity-80">HOVER: </span>
                    Reveal schematic, slot info, and kit manifest
                  </div>
                  <button
                    onClick={() => onRegister(ev.id, ev.name)}
                    className={`mt-6 rounded-full px-4 py-2.5 font-monox text-[11px] tracking-wider transition ${registeredEvents.includes(ev.id) ? 'bg-[#6bffde]/15 text-[#7ffff0] border border-[#6bffde]/40' : 'bg-[#dcfff8] text-[#05201b] hover:bg-white'}`}
                  >
                    {registeredEvents.includes(ev.id) ? 'REGISTERED' : 'REGISTER FOR EVENT'}
                  </button>
                  </div>
                  {/* hidden holographic data */}
                  <div className="absolute right-4 bottom-4 text-[10.4px] font-monox text-zinc-500 opacity-0 group-hover:opacity-100 transition">
                    SIG {Math.floor(84 + Math.random()*12)}.{Math.floor(Math.random()*99)} // LOCKED
                  </div>
                </div>
              </ParallaxSection>
            ))}
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3 font-monox text-[11.4px] text-zinc-300">
            <span className="text-zinc-400">On scroll: the 3D event ring retreats while event descriptions scale forward in bold futuristic type.</span>
          </div>
        </div>
      </div>
      <div className="h-[94vh]" />
    </section>
  )
}

function TechSection() {
  const [hoverNode, setHoverNode] = React.useState<number | null>(null)
  const nodes = [
    {x:12, y:18, label:"SYNAPSE MAP", v:"12.4 TFlops"},
    {x:74, y:24, label:"NEURO LINK", v:"< 5ms"},
    {x:25, y:74, label:"MEM CORE", v:"192 GB"},
    {x:82, y:68, label:"SENSORY BUS", v:"OPTIC"},
  ]
  return (
    <section id="tech" className="relative min-h-[176vh]">
      <div className="sticky top-0 min-h-[100vh] flex items-center">
        <div className="mx-auto max-w-6xl px-5 md:px-10 w-full">
          <ParallaxSection yRange={[38, -30]} scaleRange={[0.985,1.05]}>
            <div className="text-center max-w-3xl mx-auto">
              <div className="font-monox text-[11px] tracking-widest text-[#6bffcd]">TECHNOLOGY CORE SECTION</div>
              <h2 className="font-display text-[46px] md:text-[74px] tracking-[-0.025em] glow-cyan mt-3">AI Neural Core</h2>
              <p className="mt-5 text-[17.6px] text-zinc-300 font-text">
                Neural connections intensify as you approach. Hover the interactive nodes and they expand with live telemetry. The brain expands forward, then dissolves into particles.
              </p>
            </div>
          </ParallaxSection>

          <div className="mt-12 max-w-4xl mx-auto">
            <div className="glass-ui rounded-[28px] p-[18px] md:p-8 scanlines relative overflow-hidden">
              <div className="absolute inset-0 hud-grid opacity-[.34] pointer-events-none"/>
              {/* fake neural canvas overlay */}
              <div className="relative rounded-[16px] border border-white/[0.14] bg-[#0b1220]/70 h-[260px] md:h-[320px] overflow-hidden">
                <div className="absolute inset-0"
                  style={{
                    background: "radial-gradient(650px 300px at 50% 55%, rgba(35,255,214,0.075), transparent 60%), radial-gradient(520px 240px at 70% 35%, rgba(192,104,255,0.07), transparent)"
                  }}
                />
                {/* nodes */}
                {nodes.map((n, i)=>(
                  <button
                    key={i}
                    onMouseEnter={()=>setHoverNode(i)}
                    onMouseLeave={()=>setHoverNode(null)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform"
                    style={{ left: `${n.x}%`, top: `${n.y}%`, transform: `translate(-50%,-50%) scale(${hoverNode===i ? 1.18 : 1})`}}
                  >
                    <div className="w-[15px] h-[15px] rounded-full bg-[#6bffde] shadow-[0_0_18px_#2affcd]" />
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[36px] h-[36px] rounded-full border border-cyan-300/30 animate-pulse" />
                  </button>
                ))}
                <div className="absolute left-5 top-5 font-monox text-[11px] text-zinc-300">
                  NEURAL_CORE • IITB_TF26<br/>
                  NODES: 110 • LINKS: 482
                </div>
                <div className="absolute right-5 bottom-5 text-right font-monox text-[11px] text-zinc-300">
                  {hoverNode !== null ? (
                    <>
                      <div className="text-cyan-200">{nodes[hoverNode].label}</div>
                      <div>{nodes[hoverNode].v}</div>
                    </>
                  ) : (
                    <>HOVER A NODE</>
                  )}
                </div>
                {/* connecting lines svg */}
                <svg className="absolute inset-0 w-full h-full opacity-[.85] pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <line x1="12" y1="18" x2="74" y2="24" stroke="#2bffd7" strokeOpacity="0.56" strokeWidth="0.22"/>
                  <line x1="12" y1="18" x2="25" y2="74" stroke="#c57bff" strokeOpacity="0.45" strokeWidth="0.22"/>
                  <line x1="74" y1="24" x2="82" y2="68" stroke="#2bffd7" strokeOpacity="0.52" strokeWidth="0.22"/>
                  <line x1="25" y1="74" x2="82" y2="68" stroke="#ff8fc3" strokeOpacity="0.45" strokeWidth="0.22"/>
                </svg>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                  <div className="font-display text-[24px] md:text-[30px] tracking-tight glow-cyan">AI CORE</div>
                  <div className="font-monox text-[11px] text-cyan-200/90">SYNAPSE_ACTIVE</div>
                </div>
              </div>
              <div className="mt-4 text-[13.7px] text-zinc-300 font-text flex flex-wrap gap-4 justify-between">
                <span>Neural connections light up on scroll. Interactive nodes expand on hover.</span>
                <span className="font-monox text-[11px] text-zinc-400">LAT 19.133 // LON 72.915</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="h-[76vh]" />
    </section>
  )
}

function FinalSection({ cyborgMode, setCyborgMode }:{ cyborgMode:boolean; setCyborgMode:(v:boolean)=>void }) {
  return (
    <section id="enter" className="relative min-h-[135vh]">
      <div className="sticky top-0 h-[100vh] flex items-center">
        <div className="mx-auto max-w-5xl px-5 md:px-10 w-full text-center">
          <ParallaxSection yRange={[30, -24]} scaleRange={[0.98,1.055]}>
            <div className="font-monox text-[11px] tracking-widest text-zinc-400">FUTURE VOID // SINGULARITY COLLAPSE</div>
            <h2 className="font-display text-[56px] md:text-[98px] leading-[0.93] tracking-[-0.028em] mt-5 glow-cyan">
              Future<br/>Void
            </h2>
            <p className="mt-5 text-zinc-300 text-[17.8px] font-text max-w-xl mx-auto">
              IIT Bombay Techfest 2026: Cyborg Intelligence. Watch the system collapse into a singularity, then enter the future of human-machine consciousness.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3 font-monox text-[12.2px]">
              <a href="#" className="rounded-full px-6 py-3.5 bg-[#dcfff8] text-[#05201b] font-[700] shadow-[0_0_45px_rgba(51,255,210,.16)]">ENTER THE FUTURE OF INTELLIGENCE</a>
              <button
                onClick={()=>setCyborgMode(!cyborgMode)}
                className="rounded-full px-5 py-3.5 border border-white/[0.26] text-zinc-100 hover:bg-white/10 transition"
              >
                {cyborgMode ? "Deactivate Cyborg Mode" : "Activate Cyborg Mode"}
              </button>
            </div>
            <div className="mt-8 font-monox text-[11.3px] text-zinc-400">
              contact@techfest.iitb.ac.in // Powai, Mumbai // tf26.iitb.ac.in
            </div>
            <div className="mt-14 flex justify-center">
              <div className="glass-ui rounded-full px-5 py-2 font-monox text-[11px] text-cyan-200 tracking-wider">
                TECHFEST // IIT BOMBAY // 2026 // CYBORG INTELLIGENCE
              </div>
            </div>
          </ParallaxSection>
        </div>
      </div>
      <div className="h-[35vh]" />
    </section>
  )
}

function useCyberHum(enabled: boolean) {
  const ctxRef = React.useRef<AudioContext | null>(null)
  const gainRef = React.useRef<GainNode | null>(null)
  const oscRef = React.useRef<OscillatorNode | null>(null)
  const lfoRef = React.useRef<OscillatorNode | null>(null)

  React.useEffect(()=>{
    if(!enabled){
      if(gainRef.current && ctxRef.current){
        gainRef.current.gain.setTargetAtTime(0, ctxRef.current.currentTime, 0.08)
      }
      return
    }
    const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if(!AudioCtor) return
    if(!ctxRef.current){
      const ctx = new AudioCtor()
      const gain = ctx.createGain()
      const osc = ctx.createOscillator()
      const lfo = ctx.createOscillator()
      const lfoGain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 62
      lfo.type = 'sine'
      lfo.frequency.value = 0.18
      lfoGain.gain.value = 10
      lfo.connect(lfoGain)
      lfoGain.connect(osc.frequency)
      osc.connect(gain)
      gain.connect(ctx.destination)
      gain.gain.value = 0
      osc.start()
      lfo.start()
      ctxRef.current = ctx
      gainRef.current = gain
      oscRef.current = osc
      lfoRef.current = lfo
    }
    ctxRef.current.resume()
    gainRef.current?.gain.setTargetAtTime(0.026, ctxRef.current.currentTime, 0.12)
  },[enabled])

  React.useEffect(()=>()=>{
    try { oscRef.current?.stop(); lfoRef.current?.stop(); ctxRef.current?.close() } catch { /* audio context can already be closed */ }
  },[])
}

// -------------------------------------------------
// APP
// -------------------------------------------------
export default function App() {
  const [cyborgMode, setCyborgMode] = React.useState(false)
  const [audioOn, setAudioOn] = React.useState(false)
  const [feedback, setFeedback] = React.useState('SYSTEM ONLINE')
  const [registeredEvents, setRegisteredEvents] = React.useState<string[]>([])
  const appRef = React.useRef<HTMLDivElement>(null)
  useCyberHum(audioOn)

  const notify = React.useCallback((message: string) => {
    setFeedback(message)
    window.setTimeout(()=>setFeedback('NEURAL LINK STABLE'), 1600)
  },[])

  const handleEventRegister = React.useCallback((eventId: string, eventName: string) => {
    setRegisteredEvents(prev => prev.includes(eventId) ? prev : [...prev, eventId])
    notify(`REGISTERED: ${eventName}`)
  },[notify])

  // GSAP ScrollTrigger drive scrollStore.progress (cinematic smoothed)
  React.useEffect(()=>{
    const ctx = gsap.context(()=>{
      ScrollTrigger.create({
        trigger: document.body,
        start: "top top",
        end: "bottom bottom",
        scrub: 1.15,
        onUpdate: (self) => {
          const prev = scrollStore.progress
          scrollStore.progress = self.progress
          scrollStore.velocity = self.getVelocity() / 8000
          // clamp
          if (scrollStore.velocity > 0.7) scrollStore.velocity = 0.7
          if (scrollStore.velocity < -0.7) scrollStore.velocity = -0.7
          // decay a bit (GSAP handles)
          void prev
        }
      })
    }, appRef)
    return () => ctx.revert()
  },[])

  // Easter egg – Konami / "CYBORG"
  React.useEffect(()=>{
    const seq = ['c','y','b','o','r','g']
    let idx = 0
    const onKey = (e:KeyboardEvent)=>{
      if(e.key.toLowerCase() === seq[idx]){ idx++; if(idx===seq.length){ setCyborgMode(v=>{ const next = !v; notify(next ? 'CYBORG MODE ACTIVATED' : 'HUMAN MODE RESTORED'); return next }); idx=0 } } else { idx = 0 }
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  },[notify])

  return (
    <div ref={appRef} className="font-text bg-[#05060b] text-zinc-100 relative" style={{ fontFamily: text }}>
      <GlobalStyles />
      <CursorScanner />
      <Scene />
      {/* screen vignette */}
      <div className="pointer-events-none fixed inset-0 z-[5] vignette-soft" />
      {/* top audio / mode HUD */}
      <div className="fixed right-3 md:right-5 bottom-3 md:bottom-4 z-40 font-monox text-[10.5px] text-zinc-300 flex items-center gap-3">
        <button
          onClick={()=>{ const next = !audioOn; setAudioOn(next); notify(next ? 'AMBIENT AI HUM ENABLED' : 'AUDIO MUTED') }}
          className="glass-ui rounded-full px-3 py-[7px] hover:bg-white/[0.08] transition"
        >
          AUDIO: {audioOn ? "AI_HUM ON" : "MUTED"}
        </button>
        <div className="hidden sm:block glass-ui rounded-full px-3 py-[7px] text-zinc-400">
          SCROLL_TO_TRAVEL • v2.6
        </div>
      </div>

      <div className="pointer-events-none fixed left-1/2 top-[82px] z-40 -translate-x-1/2 glass-ui rounded-full px-4 py-2 font-monox text-[10.6px] tracking-[0.22em] text-cyan-100 shadow-[0_0_36px_rgba(38,255,225,.12)]">
        VOICE_UI: {feedback}
      </div>

      <TopNav cyborgMode={cyborgMode} />

      <main className="relative z-10">
        <HeroSection />
        <CyberWorldSection />
        <EventsSection registeredEvents={registeredEvents} onRegister={handleEventRegister} />
        <TechSection />
        <FinalSection cyborgMode={cyborgMode} setCyborgMode={(v)=>{ setCyborgMode(v); notify(v ? 'CYBORG MODE ACTIVATED' : 'HUMAN MODE RESTORED') }}/>
      </main>

      <footer className="relative z-10 border-t border-white/[0.10] bg-[#06070e]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-5 md:px-10 py-12 flex flex-wrap items-center justify-between gap-6 text-[13.5px] font-text text-zinc-400">
          <div>
            <div className="font-display text-zinc-100 text-[20px]">Techfest • IIT Bombay 2026</div>
            <div className="mt-1">Cyborg Intelligence • Event registrations open • Mumbai</div>
          </div>
          <div className="font-monox text-[11px] text-zinc-400">
            Built with Three.js • R3F • GSAP ScrollTrigger • Framer Motion<br/>
            <span className={cyborgMode ? "text-rose-300" : "text-cyan-200"}>EASTER EGG: {cyborgMode ? "CYBORG MODE ACTIVE" : "type CYBORG"}</span>
          </div>
          <div className="text-right font-monox text-[11px] text-zinc-500">
            © 2026 Techfest, IIT Bombay<br/>Human / Machine
          </div>
        </div>
      </footer>

      {/* Cyborg mode tint */}
      {cyborgMode && (
        <div className="pointer-events-none fixed inset-0 z-[6] mix-blend-screen opacity-[.11]"
          style={{ background: "radial-gradient(900px 520px at 60% 40%, rgba(255,32,92,0.5), transparent), linear-gradient(180deg, rgba(255,74,109,0.068), transparent)"}}
        />
      )}
    </div>
  )
}