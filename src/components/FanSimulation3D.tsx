import React, { useEffect, useRef, useState } from 'react';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  PointerEventTypes,
  TransformNode,
  Mesh,
  ParticleSystem,
  Texture,
  ShadowGenerator,
  Matrix,
} from '@babylonjs/core';
import { FanState, SPEED_PRESETS } from '../types';

interface FanSimulation3DProps {
  fanState: FanState;
  onStateChange: (updates: Partial<FanState>) => void;
  isNightMode: boolean;
}

export default function FanSimulation3D({ fanState, onStateChange, isNightMode }: FanSimulation3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);

  // Refs for real-time physics variables to avoid React re-render lag inside the Babylon render loop
  const stateRef = useRef<FanState>(fanState);
  stateRef.current = fanState;

  // Track manual blade drag state
  const isDraggingBlades = useRef(false);
  const lastDragAngle = useRef(0);
  const dragVelocity = useRef(0); // angular velocity in rad/ms
  const manualRotation = useRef(0); // current manual rotation angle in radians

  // Active physics calculations in render loop
  const currentMotorSpeed = useRef(0); // current physical speed [0, 1]
  const currentOscillationPhase = useRef(0);

  // Refs to 3D meshes for dynamic updates
  const bladeParentRef = useRef<TransformNode | null>(null);
  const headPivotRef = useRef<TransformNode | null>(null);
  const baseLEDMaterialRef = useRef<StandardMaterial | null>(null);
  const fanBodyMaterialRef = useRef<StandardMaterial | null>(null);
  const fanBladeMaterialRef = useRef<StandardMaterial | null>(null);
  const windParticlesRef = useRef<ParticleSystem | null>(null);
  const streamerLinesRef = useRef<Mesh[]>([]);

  // Local state to track loading
  const [isReady, setIsReady] = useState(false);

  // Re-create blades when count changes
  const buildBlades = (scene: Scene, parent: TransformNode, count: number, material: StandardMaterial) => {
    // Clear old blades
    const children = parent.getChildren();
    for (let i = children.length - 1; i >= 0; i--) {
      if (children[i].name.startsWith('blade_') || children[i].name === 'bladeHub') {
        children[i].dispose();
      }
    }

    // Hub
    const hub = MeshBuilder.CreateCylinder('bladeHub', {
      diameter: 0.32,
      height: 0.22,
      tessellation: 24,
    }, scene);
    hub.rotation.x = Math.PI / 2;
    hub.material = material;
    hub.parent = parent;

    // Create custom angled blades
    const angleStep = (Math.PI * 2) / count;
    for (let i = 0; i < count; i++) {
      const angle = i * angleStep;

      // Container for blade rotation positioning
      const bladeContainer = new TransformNode(`blade_container_${i}`, scene);
      bladeContainer.parent = parent;
      bladeContainer.rotation.z = angle;

      // The actual blade mesh
      const blade = MeshBuilder.CreateBox(`blade_${i}`, {
        width: 0.16,
        height: 1.1,
        depth: 0.02,
      }, scene);
      
      // Offset and tilt for aerodynamic realism
      blade.position.y = 0.6; // move outward from hub
      blade.rotation.y = 0.3; // pitch angle (tilt)
      blade.parent = bladeContainer;
      blade.material = material;
    }
  };

  // Re-apply materials color on changes
  useEffect(() => {
    if (fanBodyMaterialRef.current) {
      fanBodyMaterialRef.current.diffuseColor = Color3.FromHexString(fanState.bodyColor);
      fanBodyMaterialRef.current.specularColor = new Color3(0.3, 0.3, 0.3);
    }
    if (fanBladeMaterialRef.current) {
      fanBladeMaterialRef.current.diffuseColor = Color3.FromHexString(fanState.bladeColor);
    }
    if (baseLEDMaterialRef.current) {
      if (fanState.preset === 0) {
        baseLEDMaterialRef.current.emissiveColor = Color3.FromHexString('#EF4444').scale(0.3); // dim red
        baseLEDMaterialRef.current.diffuseColor = Color3.FromHexString('#EF4444');
      } else {
        baseLEDMaterialRef.current.emissiveColor = Color3.FromHexString(fanState.ledColor).scale(1.2); // glowing
        baseLEDMaterialRef.current.diffuseColor = Color3.FromHexString(fanState.ledColor);
      }
    }
  }, [fanState.bodyColor, fanState.bladeColor, fanState.ledColor, fanState.preset]);

  // Handle grill visibility toggle
  useEffect(() => {
    const scene = sceneRef.current;
    if (scene) {
      const backGrill = scene.getMeshByName('grillBack');
      const frontGrill = scene.getMeshByName('grillFront');
      const grillSpokes = scene.meshes.filter(m => m.name === 'grillSpoke');

      if (backGrill) backGrill.visibility = fanState.showGrill ? 0.35 : 0;
      if (frontGrill) frontGrill.visibility = fanState.showGrill ? 0.35 : 0;
      grillSpokes.forEach(m => {
        m.visibility = fanState.showGrill ? 0.15 : 0;
      });
    }
  }, [fanState.showGrill]);

  // Handle blade count rebuild
  useEffect(() => {
    if (sceneRef.current && bladeParentRef.current && fanBladeMaterialRef.current) {
      buildBlades(sceneRef.current, bladeParentRef.current, fanState.bladeCount, fanBladeMaterialRef.current);
    }
  }, [fanState.bladeCount]);

  // Handle oscillation restart phase if toggled
  useEffect(() => {
    if (!fanState.isOscillating && headPivotRef.current) {
      // Smooth return to center when oscillation is turned off
      headPivotRef.current.rotation.y = 0;
      currentOscillationPhase.current = 0;
    }
  }, [fanState.isOscillating]);

  // Handle Night Mode room dimming
  useEffect(() => {
    const scene = sceneRef.current;
    if (scene) {
      const ambientLight = scene.getLightByName('ambientLight');
      const dirLight = scene.getLightByName('dirLight');
      
      if (ambientLight && dirLight) {
        if (isNightMode) {
          // Dim the lights
          ambientLight.intensity = 0.08;
          dirLight.intensity = 0.12;
          scene.clearColor = Color3.FromHexString('#070709').toColor4(1.0); // pitch dark room background
        } else {
          // Restore standard studio lights
          ambientLight.intensity = 0.55;
          dirLight.intensity = 0.85;
          scene.clearColor = Color3.FromHexString('#121216').toColor4(1.0); // slate background
        }
      }
    }
  }, [isNightMode]);

  // Main Babylon Scene Initialization
  useEffect(() => {
    if (!canvasRef.current) return;

    // Create Engine and Scene
    const engine = new Engine(canvasRef.current, true, { preserveDrawingBuffer: true, stencil: true });
    engineRef.current = engine;

    const scene = new Scene(engine);
    sceneRef.current = scene;
    scene.clearColor = Color3.FromHexString('#070709').toColor4(1.0);

    // Camera
    const camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2.2, // alpha: horizontal angle
      Math.PI / 2.3,  // beta: vertical tilt
      4.8,            // radius: distance
      new Vector3(0, 1.4, 0), // target: center of the fan height
      scene
    );
    camera.attachControl(canvasRef.current, true);
    camera.lowerRadiusLimit = 2.0;
    camera.upperRadiusLimit = 10.0;
    camera.lowerBetaLimit = 0.1;
    camera.upperBetaLimit = Math.PI / 2.1; // prevent camera going below floor level

    // Lights
    const ambientLight = new HemisphericLight('ambientLight', new Vector3(0, 1, 0), scene);
    ambientLight.intensity = 0.55;
    ambientLight.diffuse = new Color3(0.9, 0.95, 1);

    const dirLight = new DirectionalLight('dirLight', new Vector3(1, -2, 1.5), scene);
    dirLight.position = new Vector3(-2, 5, -2);
    dirLight.intensity = 0.85;

    // Materials Initialization
    const fanBodyMat = new StandardMaterial('fanBodyMat', scene);
    fanBodyMat.diffuseColor = Color3.FromHexString(stateRef.current.bodyColor);
    fanBodyMat.specularColor = new Color3(0.4, 0.4, 0.4);
    fanBodyMat.roughness = 0.2;
    fanBodyMaterialRef.current = fanBodyMat;

    const fanBladeMat = new StandardMaterial('fanBladeMat', scene);
    fanBladeMat.diffuseColor = Color3.FromHexString(stateRef.current.bladeColor);
    fanBladeMat.specularColor = new Color3(0.2, 0.2, 0.2);
    fanBladeMaterialRef.current = fanBladeMat;

    const metalChromeMat = new StandardMaterial('metalChromeMat', scene);
    metalChromeMat.diffuseColor = new Color3(0.7, 0.73, 0.77);
    metalChromeMat.specularColor = new Color3(0.9, 0.9, 0.9);
    metalChromeMat.specularPower = 32;

    const baseLEDMat = new StandardMaterial('baseLEDMat', scene);
    baseLEDMat.diffuseColor = Color3.FromHexString(stateRef.current.ledColor);
    baseLEDMat.emissiveColor = Color3.FromHexString(stateRef.current.ledColor).scale(1.2);
    baseLEDMaterialRef.current = baseLEDMat;

    // Shadows
    const shadowGenerator = new ShadowGenerator(1024, dirLight);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 32;

    // --- Build Floor (Panggung) ---
    const floor = MeshBuilder.CreatePlane('floor', { size: 30 }, scene);
    floor.rotation.x = Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadows = true;

    const floorMat = new StandardMaterial('floorMat', scene);
    floorMat.diffuseColor = Color3.FromHexString('#111827');
    floorMat.specularColor = new Color3(0.05, 0.05, 0.05);
    floor.material = floorMat;

    // Floor accent grid
    const floorGrid = MeshBuilder.CreatePlane('floorGrid', { size: 30 }, scene);
    floorGrid.rotation.x = Math.PI / 2;
    floorGrid.position.y = 0.001; // slightly above floor
    const gridMat = new StandardMaterial('gridMat', scene);
    gridMat.diffuseColor = Color3.FromHexString('#1F2937');
    gridMat.wireframe = true;
    floorGrid.material = gridMat;

    // --- Build Fan 3D Assembly ---
    const fanRoot = new TransformNode('fanRoot', scene);

    // Base (Dudukan Kipas)
    const base = MeshBuilder.CreateCylinder('fanBase', {
      diameter: 1.2,
      height: 0.12,
      tessellation: 32,
    }, scene);
    base.position.y = 0.06;
    base.parent = fanRoot;
    base.material = fanBodyMat;
    shadowGenerator.addShadowCaster(base);

    // Beveled accent ring for base
    const baseRing = MeshBuilder.CreateTorus('baseRing', {
      diameter: 1.18,
      thickness: 0.06,
      tessellation: 32,
    }, scene);
    baseRing.position.y = 0.06;
    baseRing.scaling.y = 0.3;
    baseRing.parent = fanRoot;
    baseRing.material = metalChromeMat;

    // Physical LED Indicator on base
    const led = MeshBuilder.CreateSphere('baseLED', { diameter: 0.04 }, scene);
    led.position.set(0, 0.12, 0.45);
    led.parent = fanRoot;
    led.material = baseLEDMat;

    // Vertical Stand Pole (Tiang)
    const pole = MeshBuilder.CreateCylinder('fanPole', {
      diameter: 0.07,
      height: 2.1,
      tessellation: 20,
    }, scene);
    pole.position.y = 1.1; // centered at half height + base
    pole.parent = fanRoot;
    pole.material = metalChromeMat;
    shadowGenerator.addShadowCaster(pole);

    // Stand extension sleeve
    const poleSleeve = MeshBuilder.CreateCylinder('poleSleeve', {
      diameter: 0.1,
      height: 0.6,
      tessellation: 20,
    }, scene);
    poleSleeve.position.y = 0.4;
    poleSleeve.parent = fanRoot;
    poleSleeve.material = fanBodyMat;

    // --- Head Pivot (oscillating section) ---
    const headPivot = new TransformNode('headPivot', scene);
    headPivot.position.set(0, 2.15, 0); // At top of the pole
    headPivot.parent = fanRoot;
    headPivotRef.current = headPivot;

    // Motor Housing (Rumah Motor)
    const motor = MeshBuilder.CreateCylinder('motorHousing', {
      diameter: 0.36,
      height: 0.55,
      tessellation: 24,
    }, scene);
    motor.rotation.x = Math.PI / 2;
    motor.position.set(0, 0, -0.1);
    motor.parent = headPivot;
    motor.material = fanBodyMat;
    shadowGenerator.addShadowCaster(motor);

    // Back dome of motor
    const motorDome = MeshBuilder.CreateSphere('motorDome', { diameter: 0.36 }, scene);
    motorDome.scaling.z = 0.6;
    motorDome.position.set(0, 0, -0.375);
    motorDome.parent = headPivot;
    motorDome.material = fanBodyMat;

    // Rear oscillation joint box
    const jointBox = MeshBuilder.CreateBox('jointBox', { size: 0.15 }, scene);
    jointBox.position.set(0, -0.15, -0.1);
    jointBox.parent = headPivot;
    jointBox.material = fanBodyMat;

    // --- Fan Guard (Pelindung / Grill) ---
    const backGrill = MeshBuilder.CreateSphere('grillBack', { diameter: 2.3 }, scene);
    backGrill.scaling.z = 0.12;
    backGrill.position.set(0, 0, -0.05);
    backGrill.parent = headPivot;
    backGrill.material = metalChromeMat;
    backGrill.material.wireframe = true;
    backGrill.visibility = stateRef.current.showGrill ? 0.35 : 0;

    const frontGrill = MeshBuilder.CreateSphere('grillFront', { diameter: 2.3 }, scene);
    frontGrill.scaling.z = 0.12;
    frontGrill.position.set(0, 0, 0.1);
    frontGrill.parent = headPivot;
    frontGrill.material = metalChromeMat;
    frontGrill.material.wireframe = true;
    frontGrill.visibility = stateRef.current.showGrill ? 0.35 : 0;

    // Custom grill spokes for high fidelity wireframe style
    const spokeCount = 24;
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i * Math.PI * 2) / spokeCount;
      const spoke = MeshBuilder.CreateBox('grillSpoke', {
        width: 0.008,
        height: 2.26,
        depth: 0.005,
      }, scene);
      spoke.parent = headPivot;
      spoke.position.set(0, 0, 0.025);
      spoke.rotation.z = angle;
      spoke.material = metalChromeMat;
      spoke.metadata = { tag: 'grillSpoke' };
      spoke.visibility = stateRef.current.showGrill ? 0.15 : 0;
    }

    // Grill logo badge (center center)
    const badge = MeshBuilder.CreateCylinder('grillBadge', {
      diameter: 0.32,
      height: 0.02,
      tessellation: 24,
    }, scene);
    badge.rotation.x = Math.PI / 2;
    badge.position.set(0, 0, 0.12);
    badge.parent = headPivot;
    badge.material = fanBodyMat;

    // --- Spinning Shaft & Blades ---
    const bladePivot = new TransformNode('bladePivot', scene);
    bladePivot.position.set(0, 0, 0.05); // slightly forward from motor
    bladePivot.parent = headPivot;
    bladeParentRef.current = bladePivot;

    // Generate Initial Blades
    buildBlades(scene, bladePivot, stateRef.current.bladeCount, fanBladeMat);

    // --- Interactive 3D Speed Control Knob on base ---
    const knobPivot = new TransformNode('knobPivot', scene);
    knobPivot.position.set(0, 0.1, 0.28);
    knobPivot.parent = fanRoot;

    const knob = MeshBuilder.CreateCylinder('knob', {
      diameter: 0.18,
      height: 0.06,
      tessellation: 16,
    }, scene);
    knob.position.y = 0.03;
    knob.parent = knobPivot;
    knob.material = metalChromeMat;

    const knobIndicator = MeshBuilder.CreateBox('knobIndicator', {
      width: 0.02,
      height: 0.02,
      depth: 0.09,
    }, scene);
    knobIndicator.position.set(0, 0.065, -0.045);
    knobIndicator.parent = knobPivot;
    knobIndicator.material = fanBodyMat;

    // Map current target speed to knob angle
    knobPivot.rotation.y = -Math.PI / 1.5 + (stateRef.current.targetSpeed * (Math.PI * 1.33));

    // --- Streamers (Pita Kertas) ---
    // Create 3 wind ribbon streamers attached to the front grill showing the wind direction
    const streamerColors = [
      Color3.FromHexString('#38BDF8'), // Blue
      Color3.FromHexString('#F43F5E'), // Red
      Color3.FromHexString('#FBBF24'), // Gold/Yellow
    ];
    const streamerOffsets = [
      new Vector3(-0.4, 0.2, 0.12),
      new Vector3(0.0, -0.3, 0.12),
      new Vector3(0.4, 0.3, 0.12),
    ];

    const streamers: Mesh[] = [];
    const streamerSegmentsCount = 10;
    const segmentLength = 0.14;

    for (let s = 0; s < 3; s++) {
      // We will model each streamer as a tube or line mesh that fluctuates frame by frame
      // Create path nodes
      const pathPoints: Vector3[] = [];
      const origin = streamerOffsets[s];
      for (let i = 0; i < streamerSegmentsCount; i++) {
        pathPoints.push(new Vector3(origin.x, origin.y, origin.z + i * segmentLength));
      }

      const streamer = MeshBuilder.CreateTube(`streamer_${s}`, {
        path: pathPoints,
        radius: 0.015,
        updatable: true,
      }, scene);
      
      const strMat = new StandardMaterial(`streamer_mat_${s}`, scene);
      strMat.diffuseColor = streamerColors[s];
      strMat.specularColor = Color3.Black();
      strMat.emissiveColor = streamerColors[s].scale(0.1);
      streamer.material = strMat;
      streamer.parent = headPivot; // Moves along with head oscillation
      streamers.push(streamer);
    }
    streamerLinesRef.current = streamers;

    // --- Wind Particle System ---
    const particleSystem = new ParticleSystem('windParticles', 300, scene);
    particleSystem.particleTexture = new Texture('https://assets.babylonjs.com/textures/flare.png', scene);
    particleSystem.emitter = headPivot as any; // emits from fan head
    particleSystem.minEmitBox = new Vector3(-0.8, -0.8, 0.15);
    particleSystem.maxEmitBox = new Vector3(0.8, 0.8, 0.25);
    
    // Direction & Flow
    particleSystem.direction1 = new Vector3(-0.05, -0.05, 1);
    particleSystem.direction2 = new Vector3(0.05, 0.05, 1.2);
    
    // Sizing
    particleSystem.minSize = 0.05;
    particleSystem.maxSize = 0.3;
    particleSystem.minLifeTime = 0.2;
    particleSystem.maxLifeTime = 0.7;

    // Color gradient - amber and orange glow
    particleSystem.color1 = new Color3(1.0, 0.55, 0.2).toColor4(0.25);
    particleSystem.color2 = new Color3(1.0, 0.4, 0.1).toColor4(0.12);
    particleSystem.colorDead = new Color3(0.6, 0.2, 0.0).toColor4(0.0);

    // Gravity & speed
    particleSystem.gravity = new Vector3(0, -0.05, 0);
    particleSystem.emitRate = 0; // Off initially
    particleSystem.minEmitPower = 1.0;
    particleSystem.maxEmitPower = 3.0;
    
    particleSystem.start();
    windParticlesRef.current = particleSystem;

    // --- Setup Interactive Drag & Drop / Click Mechanics ---
    // Scene Pointer Observables for drag interactions
    scene.onPointerObservable.add((pointerInfo) => {
      const pickResult = pointerInfo.pickInfo;
      const evt = pointerInfo.event;

      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        if (pickResult && pickResult.hit && pickResult.pickedMesh) {
          const name = pickResult.pickedMesh.name;

          // 1. Dragging Blades (Can spin them manually!)
          if (name.startsWith('blade_') || name === 'bladeHub') {
            isDraggingBlades.current = true;
            // Disable camera rotation while dragging blades to prevent fighting
            camera.detachControl();

            // Calculate starting angle in screen space relative to fan hub
            const hubPos = Vector3.Project(
              bladePivot.absolutePosition,
              Matrix.Identity(),
              scene.getTransformMatrix(),
              camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
            );

            const dx = evt.clientX - hubPos.x;
            const dy = evt.clientY - hubPos.y;
            lastDragAngle.current = Math.atan2(dy, dx);
            dragVelocity.current = 0;
          }

          // 2. Click on Speed Buttons in 3D (Fan Base buttons)
          if (name === 'knob' || name === 'knobIndicator') {
            // We'll support rotating the 3D knob by dragging
            camera.detachControl();
            isDraggingBlades.current = false; // reset
            (knob.metadata as any) = { dragging: true };
          }
        }
      }

      if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
        // Handle Blade Manual Drag
        if (isDraggingBlades.current && pickResult) {
          const hubPos = Vector3.Project(
            bladePivot.absolutePosition,
            Matrix.Identity(),
            scene.getTransformMatrix(),
            camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
          );

          const dx = evt.clientX - hubPos.x;
          const dy = evt.clientY - hubPos.y;
          const currentAngle = Math.atan2(dy, dx);
          
          let deltaAngle = currentAngle - lastDragAngle.current;

          // Normalize angle wraps
          if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
          if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;

          // Update rotation
          manualRotation.current -= deltaAngle; // subtract because of perspective direction
          bladePivot.rotation.z = manualRotation.current;

          // Calculate dragging angular velocity (deltaAngle / delta time in ms)
          const dt = engine.getDeltaTime() || 16;
          dragVelocity.current = -deltaAngle / dt;

          lastDragAngle.current = currentAngle;
        }

        // Handle Base Knob Drag
        if (knob.metadata && (knob.metadata as any).dragging) {
          const basePos = Vector3.Project(
            knobPivot.absolutePosition,
            Matrix.Identity(),
            scene.getTransformMatrix(),
            camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
          );

          const dx = evt.clientX - basePos.x;
          const dy = evt.clientY - basePos.y;
          const angle = Math.atan2(dy, dx); // Angle of mouse dragging relative to knob

          // Convert angle range to speed level
          // Map slider rotation from -Math.PI / 1.5 to Math.PI / 1.5
          let normalizedAngle = angle + Math.PI / 2; // offset to top vertical
          if (normalizedAngle > Math.PI) normalizedAngle -= Math.PI * 2;
          if (normalizedAngle < -Math.PI) normalizedAngle += Math.PI * 2;

          // Clamp angle range
          const minAng = -Math.PI / 1.5;
          const maxAng = Math.PI / 1.5;
          let clampedAngle = Math.max(minAng, Math.min(maxAng, normalizedAngle));

          // Set rotation
          knobPivot.rotation.y = clampedAngle;

          // Set speed value accordingly (0.0 to 1.0)
          const ratio = (clampedAngle - minAng) / (maxAng - minAng);
          const targetSpeedVal = Math.round(ratio * 100) / 100;

          // Determine closest preset
          let nextPreset: 0 | 1 | 2 | 3 = 0;
          let minDiff = 999;
          (Object.keys(SPEED_PRESETS) as unknown as Array<0 | 1 | 2 | 3>).forEach(p => {
            const diff = Math.abs(SPEED_PRESETS[p].speedVal - targetSpeedVal);
            if (diff < minDiff) {
              minDiff = diff;
              nextPreset = p;
            }
          });

          onStateChange({
            targetSpeed: targetSpeedVal,
            preset: nextPreset,
            speed: targetSpeedVal, // match speeds immediately on drag
          });
        }
      }

      if (pointerInfo.type === PointerEventTypes.POINTERUP) {
        if (isDraggingBlades.current) {
          isDraggingBlades.current = false;
          // Re-attach camera controls
          camera.attachControl(canvasRef.current, true);
        }

        if (knob.metadata && (knob.metadata as any).dragging) {
          (knob.metadata as any).dragging = false;
          camera.attachControl(canvasRef.current, true);
        }
      }
    });

    // --- Main Render Loop Physics Engine ---
    let lastTime = performance.now();
    
    scene.registerBeforeRender(() => {
      const now = performance.now();
      const deltaTime = now - lastTime;
      lastTime = now;

      const state = stateRef.current;

      // 1. Interpolate current motor speed towards target speed for realistic physical inertia!
      let speedAcceleration = 0.001; // basic build up speed
      if (state.targetSpeed < currentMotorSpeed.current) {
        speedAcceleration = 0.0006; // slower friction-based deceleration
      }

      // Handle Natural Breeze Mode
      let actualTargetSpeed = state.targetSpeed;
      if (state.mode === 'natural' && state.preset > 0) {
        // Overlay smooth low-frequency sine waves to simulate wind gusting
        const gust = 0.15 * Math.sin(now * 0.0015) + 0.08 * Math.cos(now * 0.0004);
        actualTargetSpeed = Math.max(0.1, Math.min(1.0, state.targetSpeed + gust));
      } else if (state.mode === 'sleep' && state.preset > 0) {
        // Slow decay of target speed over time if active
        // Just gradual decrease
      }

      // Smooth step
      const speedDiff = actualTargetSpeed - currentMotorSpeed.current;
      currentMotorSpeed.current += speedDiff * speedAcceleration * deltaTime;

      // Ensure clamp
      if (Math.abs(speedDiff) < 0.005) {
        currentMotorSpeed.current = actualTargetSpeed;
      }

      // 2. Rotate Blades
      if (isDraggingBlades.current) {
        // Blades rotation updated onpointermove, do nothing, just decay drag velocity slightly
        dragVelocity.current *= Math.exp(-0.005 * deltaTime);
      } else {
        // Motor-driven rotation + drag inertia if fan was spun manually when off
        if (state.preset === 0 && Math.abs(dragVelocity.current) > 0.0001) {
          // Decay manual spin due to bearing friction
          const frictionDecay = 0.0012; 
          dragVelocity.current *= Math.exp(-frictionDecay * deltaTime);
          manualRotation.current += dragVelocity.current * deltaTime;
          bladePivot.rotation.z = manualRotation.current;
        } else {
          // Driven by electrical motor
          // Max rotation speed: 0.12 radians per ms
          const spinSpeed = currentMotorSpeed.current * 0.09 * deltaTime;
          manualRotation.current += spinSpeed;
          bladePivot.rotation.z = manualRotation.current;
          
          // Keep drag velocity matched to motor speed
          dragVelocity.current = currentMotorSpeed.current * 0.09;
        }
      }

      // 3. Update stats back to parent component (Throttled to avoid react lag)
      if (Math.random() < 0.06) {
        // Estimate RPM
        const calculatedRpm = Math.max(0, Math.round(currentMotorSpeed.current * 1450 + (state.preset === 0 ? Math.abs(dragVelocity.current) * 8000 : 0)));
        const powerEst = state.preset === 0 ? 0 : Math.round(currentMotorSpeed.current * currentMotorSpeed.current * 55 + 2);
        const windEst = Math.round((currentMotorSpeed.current * 8.5) * 10) / 10;
        const airflowEst = Math.round(currentMotorSpeed.current * 1650);

        onStateChange({
          speed: currentMotorSpeed.current,
          rpm: calculatedRpm,
          powerUsage: powerEst,
          windSpeed: windEst,
          airflow: airflowEst,
        });
      }

      // 4. Oscillation logic
      if (state.isOscillating) {
        // Swing angle speed scales with fan operating speed slightly for mechanical sensation
        const swingSpeed = 0.0007 + (currentMotorSpeed.current * 0.0003);
        currentOscillationPhase.current += swingSpeed * deltaTime;
        
        // Oscillation span: 50 degrees left/right (0.87 radians)
        const angle = Math.sin(currentOscillationPhase.current) * 0.85;
        headPivot.rotation.y = angle;

        onStateChange({ oscillationAngle: angle });
      }

      // 5. Physical knob rotation (Sync knob with target speed if changed externally)
      if (!knob.metadata || !(knob.metadata as any).dragging) {
        const minAng = -Math.PI / 1.5;
        const maxAng = Math.PI / 1.5;
        const targetKnobAng = minAng + (state.targetSpeed * (maxAng - minAng));
        knobPivot.rotation.y += (targetKnobAng - knobPivot.rotation.y) * 0.15;
      }

      // 6. Dynamic LED pulse when running
      if (state.preset > 0 && baseLEDMaterialRef.current) {
        const ledPulse = 1.0 + 0.3 * Math.sin(now * 0.005 * state.preset);
        baseLEDMaterialRef.current.emissiveColor = Color3.FromHexString(state.ledColor).scale(ledPulse);
      }

      // 7. Streamers (Pita Kertas) flutter simulation
      if (state.showStreamers) {
        for (let s = 0; s < 3; s++) {
          const streamer = streamers[s];
          if (!streamer) continue;

          streamer.visibility = 1.0;

          const origin = streamerOffsets[s];
          const pathPoints: Vector3[] = [];
          
          // Streamers fly back or fall down depending on current speed
          const windPower = currentMotorSpeed.current; // [0, 1]
          
          for (let i = 0; i < streamerSegmentsCount; i++) {
            const progress = i / (streamerSegmentsCount - 1);
            
            // X-Y offset fluctuation based on wind speed and math waves
            const flutterX = windPower > 0.05 
              ? Math.sin(now * 0.02 * windPower - i * 0.8) * 0.1 * windPower * progress
              : 0;

            const flutterY = windPower > 0.05
              ? Math.cos(now * 0.015 * windPower - i * 0.6) * 0.1 * windPower * progress
              : -progress * 0.9; // hang down under gravity when fan is off

            const offsetZ = progress * (1.2 + windPower * 0.6); // stream blows forward under wind

            pathPoints.push(new Vector3(
              origin.x + flutterX,
              origin.y + (windPower > 0.05 ? flutterY : -progress * 0.7), // droop when slow
              origin.z + offsetZ
            ));
          }

          // Update existing tube with new deformed path
          MeshBuilder.CreateTube(null, {
            path: pathPoints,
            instance: streamer,
          });
        }
      } else {
        streamers.forEach(str => { str.visibility = 0; });
      }

      // 8. Dynamic Wind Particles Update
      if (windParticlesRef.current) {
        if (currentMotorSpeed.current > 0.05) {
          windParticlesRef.current.emitRate = Math.round(currentMotorSpeed.current * 180);
          windParticlesRef.current.minEmitPower = 1.0 + currentMotorSpeed.current * 3.5;
          windParticlesRef.current.maxEmitPower = 2.5 + currentMotorSpeed.current * 5.0;
          windParticlesRef.current.updateSpeed = 0.01 + currentMotorSpeed.current * 0.015;
        } else {
          windParticlesRef.current.emitRate = 0;
        }
      }
    });

    // Register Resize Event
    const resizeObserver = new ResizeObserver(() => {
      engine.resize();
    });
    resizeObserver.observe(canvasRef.current);

    // Run Engine Render
    engine.runRenderLoop(() => {
      scene.render();
    });

    setIsReady(true);

    // Cleanups
    return () => {
      resizeObserver.disconnect();
      scene.dispose();
      engine.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-[#0b0f19] rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
      {/* 3D Canvas rendering Babylon scene */}
      <canvas
        id="babylon-canvas"
        ref={canvasRef}
        className="w-full h-full block focus:outline-none touch-none"
      />

      {/* Loading Overlay */}
      {!isReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 bg-opacity-90 text-white z-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mb-4" />
          <p className="text-sm font-mono text-cyan-300">Menginisialisasi Engine Babylon 3D...</p>
        </div>
      )}

      {/* Interactive Floating Drag Guide Helper */}
      {isReady && (
        <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-700 pointer-events-none transition-all">
          <div className="flex items-center space-x-2 text-xs text-slate-300">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <p className="font-sans">
              <strong className="text-white">Tips Interaksi:</strong> Drag kipas untuk memutar kamera. Saat fan mati, <span className="text-cyan-400">drag baling-baling</span> atau <span className="text-cyan-400">tombol putar di bawah</span> untuk interaksi real-time.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
