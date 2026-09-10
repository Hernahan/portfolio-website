import React, { useMemo, useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { generateCubePoints, generateSpherePoints, generatePlanePoints, generateMeshPoints, POINT_POOL_SIZE, AMBIENT_SPACING, MODEL_FRAME_WIDTH } from './Voxelizer';
import { useManhattanAnimation } from '../hooks/useManhattanAnimation';
import gsap from 'gsap';

// View Offset Rig - Shifts the lens/viewport WITHOUT moving camera or pivot
const ViewOffsetRig = ({ viewMode, isNarrow }) => {
    const { camera, size } = useThree();
    const offsetRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const isProject = viewMode === 'PROJECT';
        // On a phone the copy sits in a sheet along the bottom rather than in a
        // left column, so the model is lifted instead of pushed sideways.
        gsap.to(offsetRef.current, {
            x: isProject && !isNarrow ? -0.2 : 0,
            y: isProject && isNarrow ? 0.17 : 0,
            // Matches the camera: unhurried on the way in, decisive on the way
            // out, so the lens is back to centre before the wall re-forms.
            duration: isProject ? 1.5 : 0.75,
            delay: isProject ? 0 : 0.15,
            ease: "power2.inOut",
        });
    }, [viewMode, isNarrow]);

    useFrame(() => {
        const w = size.width;
        const h = size.height;
        camera.setViewOffset(w, h, offsetRef.current.x * w, offsetRef.current.y * h, w, h);
    });

    return null;
};

/**
 * Lets a project carry a little momentum after an orbit drag without allowing
 * that momentum to leak into the ambient wall. The wall is generated in the
 * current camera frame, so its orientation must be sampled only after any
 * outstanding project-view velocity has been discarded.
 */
const ProjectOrbitControls = ({ viewMode }) => {
    const controlsRef = useRef();
    const isProject = viewMode === 'PROJECT';

    useLayoutEffect(() => {
        if (isProject || !controlsRef.current) return;

        // OrbitControls keeps its inertial rotation in these internal values.
        // Clear them before GridParticles' wall-rebuild effect runs: preserving
        // the current camera angle is intentional, while a post-scroll coast
        // would make the wall appear to rotate beneath the viewer.
        const controls = controlsRef.current;
        controls._sphericalDelta?.set(0, 0, 0);
        controls._panOffset?.set(0, 0, 0);
        controls._scale = 1;
    }, [isProject]);

    return (
        <OrbitControls
            ref={controlsRef}
            enabled={isProject}
            enablePan={false}
            enableZoom={false}
            enableRotate={isProject}
            rotateSpeed={0.6}
            enableDamping={isProject}
            dampingFactor={0.05}
        />
    );
};

/**
 * Processes loaded GLTF and updates cache
 */
const GLTFCacheLoader = ({ project, onCached }) => {
    const gltf = useGLTF(project.modelPath);
    const processedRef = useRef(false);

    useEffect(() => {
        if (!gltf || !gltf.scene || processedRef.current) return;
        processedRef.current = true;

        const geometries = [];
        gltf.scene.traverse((child) => {
            if (child.isMesh && child.geometry) {
                const clonedGeo = child.geometry.clone();
                child.updateMatrixWorld(true);
                clonedGeo.applyMatrix4(child.matrixWorld);
                geometries.push(clonedGeo);
            }
        });

        if (geometries.length > 0) {
            const mergedGeometry = mergeGeometries(geometries, false);

            if (mergedGeometry) {
                const cloud = generateMeshPoints(mergedGeometry, {
                    scale: project.scale ?? 1,
                });
                onCached(project.id, cloud);
                mergedGeometry.dispose();
            }

            geometries.forEach(g => g.dispose());
        }
    }, [gltf, project, onCached]);

    return null;
};

/**
 * Dot material.
 *
 * Three things the original shader did not do, each of which cost legibility:
 *
 *  - Size was a constant 5.0 in FRAMEBUFFER pixels, so on a 2x display every
 *    dot was 2.5 CSS px and the whole cloud read as low-resolution grit.
 *    Size is now specified in CSS pixels and multiplied by the device ratio.
 *
 *  - No perspective attenuation, so near and far dots were identical and the
 *    cloud read as a flat stencil with no depth.
 *
 *  - Every dot drew at full black regardless of which way its surface faced,
 *    so the back of a model punched through the front and dense models
 *    collapsed into a silhouette-shaped blob. Dots now fade and shrink as
 *    their surface turns away from the camera, which is what makes the cloud
 *    read as a lit object rather than a cluster of noise.
 */
const DotMaterial = () => {
    const matRef = useRef();
    const { camera, gl } = useThree();

    useFrame(() => {
        if (!matRef.current) return;
        const u = matRef.current.uniforms;
        u.uRefDist.value = camera.position.length();
        u.uDpr.value = gl.getPixelRatio();
    });

    const uniforms = useMemo(() => ({
        uSize: { value: 3.0 },
        uDpr: { value: 2 },
        uRefDist: { value: 20 },
        uAtten: { value: 0.55 },
        uBackSize: { value: 0.0 },
        uBackAlpha: { value: 0.55 },
        uColor: { value: new THREE.Color('#0a0a0a') },
    }), []);

    return (
        <shaderMaterial
            ref={matRef}
            uniforms={uniforms}
            transparent
            depthTest={false}
            depthWrite={false}
            vertexShader={`
                attribute float aScale;
                attribute vec3 aNormal;
                uniform float uSize, uDpr, uRefDist, uAtten, uBackSize, uBackAlpha;
                varying float vAlpha;

                void main() {
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mv;

                    float dist = max(0.001, -mv.z);

                    // How squarely does this dot's surface face the camera?
                    vec3 nView = normalize(normalMatrix * aNormal);
                    vec3 toCam = normalize(-mv.xyz);
                    float facing = dot(nView, toCam);
                    // Always on. Each dot carries its own orientation, which is
                    // interpolated from the surface it left to the surface it is
                    // joining while it travels, so there is nothing global to
                    // toggle and no flash when a transition is queued.
                    float w = smoothstep(-0.05, 0.55, facing);

                    // Tone is carried by dot SIZE, the way a halftone does it,
                    // rather than by fading dots to grey. Grey dots on white
                    // read as a washed-out smudge; solid dots that grow and
                    // shrink read as a surface catching light. Surfaces turned
                    // away from the camera shrink to nothing and drop out, so
                    // the back of a model stops showing through the front.
                    float depthScale = mix(1.0, uRefDist / dist, uAtten);
                    gl_PointSize = uSize * uDpr * aScale * depthScale * mix(uBackSize, 1.0, w);
                    vAlpha = aScale * mix(uBackAlpha, 1.0, w);
                }
            `}
            fragmentShader={`
                uniform vec3 uColor;
                varying float vAlpha;

                void main() {
                    float d = length(gl_PointCoord - 0.5);
                    // Antialias the rim instead of hard-discarding it, so small
                    // dots stay round instead of turning into square grit.
                    float aa = fwidth(d) + 0.02;
                    float a = 1.0 - smoothstep(0.5 - aa, 0.5, d);
                    if (a <= 0.002) discard;
                    gl_FragColor = vec4(uColor, a * vAlpha);
                }
            `}
        />
    );
};

const GridParticles = ({ currentProject, viewMode, onAnimationComplete, allProjects }) => {
    const meshRef = useRef();
    const { camera } = useThree();
    const [pointsCache, setPointsCache] = useState({});

    // Built-in shapes (always available)
    const shapes = useMemo(() => ({
        cube: generateCubePoints({ gridSize: [8, 8, 8], spacing: 0.18 }),
        sphere: generateSpherePoints({ radius: 3.5, spacing: 0.115 })
    }), []);

    // The ambient wall, rebuilt square to the camera each time we return to it.
    //
    // Orbiting a model turns the camera, so a wall pinned to world axes would
    // be seen at an angle afterwards and would have to rotate itself flat while
    // you watched. Rebuilding it in the camera's frame means it is already
    // square: dots travel to it and from it, and it never turns.
    const makeWall = useCallback(() => generatePlanePoints({
        width: 64, height: 34, spacing: AMBIENT_SPACING, quat: camera.quaternion,
    }), [camera]);

    const [wall, setWall] = useState(makeWall);

    useEffect(() => {
        if (viewMode !== 'PROJECT') setWall(makeWall());
    }, [viewMode, makeWall]);

    // Callback to cache points when loaded
    const handleCached = useCallback((id, points) => {
        setPointsCache(prev => ({ ...prev, [id]: points }));
    }, []);

    // Get projects that need GLTF loading (have modelPath and not yet cached)
    const projectsToLoad = useMemo(() => {
        if (!allProjects) return [];
        return allProjects.filter(p =>
            p && p.modelPath && !pointsCache[p.id]
        );
    }, [allProjects, pointsCache]);

    // Pre-cache built-in shapes immediately
    useEffect(() => {
        if (!allProjects) return;

        allProjects.forEach(project => {
            if (project && !project.modelPath && project.builtInShape) {
                const shapePoints = shapes[project.builtInShape];
                if (shapePoints && !pointsCache[project.id]) {
                    setPointsCache(prev => ({ ...prev, [project.id]: shapePoints }));
                }
            }
        });
    }, [allProjects, shapes, pointsCache]);

    // Determine target cloud - STABLE logic to prevent flashing
    const targetCloud = useMemo(() => {
        // In PROJECT mode with a current project
        if (viewMode === 'PROJECT' && currentProject) {
            const cached = pointsCache[currentProject.id];
            if (cached) {
                return cached;
            }
            // Model not yet loaded - stay on current points (don't change)
            // Return null to signal "keep current"
            return null;
        }

        // Non-PROJECT mode: the ambient wall.
        return wall;
    }, [viewMode, currentProject, pointsCache, wall]);

    // Remember the last valid cloud so a model that is still loading does not
    // blank the field. Held in state rather than a ref because reading a ref
    // during render is not safe under concurrent rendering.
    const [lastCloud, setLastCloud] = useState(wall);

    useEffect(() => {
        if (targetCloud !== null) setLastCloud(targetCloud);
    }, [targetCloud]);

    const animationTarget = targetCloud !== null ? targetCloud : lastCloud;

    // Buffers are allocated at pool capacity. Slots beyond the starting shape's
    // real point count begin hidden (scale 0) and are never drawn until a
    // denser target brings them in.
    const initialBuffers = useMemo(() => {
        const positions = new Float32Array(POINT_POOL_SIZE * 3);
        const normals = new Float32Array(POINT_POOL_SIZE * 3);
        const scales = new Float32Array(POINT_POOL_SIZE);
        const start = wall;
        for (let i = 0; i < POINT_POOL_SIZE; i++) {
            const p = start.points[i];
            const n = start.normals[i];
            if (p) {
                positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z;
                normals[i * 3] = n.x; normals[i * 3 + 1] = n.y; normals[i * 3 + 2] = n.z;
                scales[i] = 1.0;
            } else {
                normals[i * 3 + 2] = 1.0;
                scales[i] = 0.0;
            }
        }
        return { positions, normals, scales };
        // Only the very first frame uses this; later states come from the morph.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Models are voxelised into a fixed world-space frame. A portrait phone
    // viewport is far narrower than that frame, so without this the assembly
    // simply ran off both edges. Scaling the whole cloud is cheaper and more
    // stable than re-voxelising per breakpoint.
    const { size: canvasSize } = useThree();
    const fitScale = useMemo(() => {
        if (viewMode !== 'PROJECT') return 1;
        const aspect = canvasSize.width / Math.max(1, canvasSize.height);
        const dist = camera.position.length() || 18;
        const visibleWidth = 2 * dist * Math.tan((camera.fov * Math.PI) / 360) * aspect;
        return Math.min(1, visibleWidth / (MODEL_FRAME_WIDTH * 1.25));
    }, [viewMode, canvasSize.width, canvasSize.height, camera]);

    useManhattanAnimation(meshRef, animationTarget, onAnimationComplete, viewMode, wall.wallQuat);

    return (
        <>
            {/* Load all GLTF models that aren't cached yet */}
            {projectsToLoad.map(project => (
                <GLTFCacheLoader
                    key={project.id}
                    project={project}
                    onCached={handleCached}
                />
            ))}
            <group scale={fitScale}>
            <points ref={meshRef} frustumCulled={false}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={POINT_POOL_SIZE} array={initialBuffers.positions} itemSize={3} />
                    <bufferAttribute attach="attributes-aNormal" count={POINT_POOL_SIZE} array={initialBuffers.normals} itemSize={3} />
                    <bufferAttribute attach="attributes-aScale" count={POINT_POOL_SIZE} array={initialBuffers.scales} itemSize={1} />
                </bufferGeometry>
                <DotMaterial />
            </points>
            </group>
        </>
    );
};

/**
 * The camera here is a fixed observer. It is never animated and never dollied:
 * models present themselves through a rotation baked into their point clouds,
 * and the ambient wall is built square to the current view. Anything that moves
 * the camera on its own reintroduces the wall rotation this design exists to
 * avoid.
 */
export const WorldGrid = ({ currentProject = null, viewMode = 'LANDING', onAnimationComplete, allProjects = [], isNarrow = false }) => {
    return (
        <Canvas camera={{ position: [0, 0, 20], fov: 45 }}>
            <color attach="background" args={['#FFFFFF']} />
            <ViewOffsetRig viewMode={viewMode} isNarrow={isNarrow} />
            <GridParticles
                currentProject={currentProject}
                viewMode={viewMode}
                onAnimationComplete={onAnimationComplete}
                allProjects={allProjects}
            />
            <ProjectOrbitControls viewMode={viewMode} />
        </Canvas>
    );
};
