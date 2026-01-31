import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { generateCubePoints, generateSpherePoints, generatePlanePoints, generateMeshPoints, POINT_POOL_SIZE } from './Voxelizer';
import { useManhattanAnimation } from '../hooks/useManhattanAnimation';
import gsap from 'gsap';

// View Offset Rig - Shifts the lens/viewport WITHOUT moving camera or pivot
const ViewOffsetRig = ({ viewMode }) => {
    const { camera, size } = useThree();
    const offsetRef = useRef({ x: 0 });

    useEffect(() => {
        const isProject = viewMode === 'PROJECT';
        gsap.to(offsetRef.current, {
            x: isProject ? -0.2 : 0,
            duration: 1.5,
            ease: "power2.inOut"
        });
    }, [viewMode]);

    useFrame(() => {
        const w = size.width;
        const h = size.height;
        camera.setViewOffset(w, h, offsetRef.current.x * w, 0, w, h);
    });

    return null;
};

// Camera Rig
const CameraRig = ({ viewMode }) => {
    const { camera } = useThree();

    useEffect(() => {
        if (viewMode === 'LANDING' || viewMode === 'ABOUT' || viewMode === 'CONTACT') {
            gsap.to(camera.position, { x: 0, y: 0, z: 20, duration: 1.5, ease: "power2.inOut" });
        } else {
            gsap.to(camera.position, { x: 0, y: 5, z: 18, duration: 1.5, ease: "power2.inOut" });
        }
    }, [viewMode, camera]);
    return null;
};

// Custom zoom handler - only in PROJECT mode
const ZoomController = ({ viewMode }) => {
    const { camera, gl } = useThree();

    useEffect(() => {
        const canvas = gl.domElement;

        const handleWheel = (e) => {
            if (viewMode !== 'PROJECT') return;

            e.preventDefault();
            e.stopPropagation();

            const zoomSpeed = 0.003;
            const delta = e.deltaY * zoomSpeed;
            const newZ = Math.max(10, Math.min(30, camera.position.z + delta * 8));

            gsap.to(camera.position, { z: newZ, duration: 0.15, ease: "power1.out" });
        };

        canvas.addEventListener('wheel', handleWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', handleWheel);
    }, [camera, gl, viewMode]);

    return null;
};

/**
 * Preloads and caches GLTF points for all projects
 * This runs once at mount to ensure points are ready before any transition
 */
const useProjectPointsCache = (projects, shapes) => {
    const [cache, setCache] = useState({});
    const loadingRef = useRef({});

    // Preload all project models on mount
    useEffect(() => {
        if (!projects || projects.length === 0) return;

        projects.forEach((project) => {
            if (!project) return;

            const cacheKey = project.id;

            // Skip if already cached or loading
            if (cache[cacheKey] || loadingRef.current[cacheKey]) return;

            // Handle built-in shapes
            if (!project.modelPath && project.builtInShape) {
                setCache(prev => ({
                    ...prev,
                    [cacheKey]: shapes[project.builtInShape] || shapes.cube
                }));
                return;
            }

            // Load external model
            if (project.modelPath) {
                loadingRef.current[cacheKey] = true;

                // Use useGLTF.preload for caching
                useGLTF.preload(project.modelPath);
            }
        });
    }, [projects, shapes]);

    return cache;
};

/**
 * Processes loaded GLTF and updates cache
 */
const GLTFCacheLoader = ({ project, shapes, onCached }) => {
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
                const points = generateMeshPoints(mergedGeometry, {
                    pointsPerUnit: project.pointsPerUnit || 0.3,
                    scale: project.scale || 8
                });
                onCached(project.id, points);
                mergedGeometry.dispose();
            }

            geometries.forEach(g => g.dispose());
        }
    }, [gltf, project, onCached]);

    return null;
};

const GridParticles = ({ currentProject, viewMode, onAnimationComplete, allProjects }) => {
    const meshRef = useRef();
    const [pointsCache, setPointsCache] = useState({});
    const prevViewModeRef = useRef(viewMode);

    // Built-in shapes (always available)
    const shapes = useMemo(() => ({
        plane: generatePlanePoints({ width: 55, height: 28, spacing: 1.0 }),
        cube: generateCubePoints({ gridSize: [8, 8, 8], spacing: 0.6 }),
        sphere: generateSpherePoints({ radius: 5, spacing: 0.55 })
    }), []);

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

    // Determine target points - STABLE logic to prevent flashing
    const targetPoints = useMemo(() => {
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

        // Non-PROJECT mode: always plane
        return shapes.plane;
    }, [viewMode, currentProject, pointsCache, shapes]);

    // Use a ref to track the actual target, avoiding null transitions
    const actualTargetRef = useRef(shapes.plane);

    // Only update actual target when we have valid new points
    useEffect(() => {
        if (targetPoints !== null) {
            actualTargetRef.current = targetPoints;
        }
    }, [targetPoints]);

    // The points to animate to - uses ref to avoid flash
    const animationTarget = targetPoints !== null ? targetPoints : actualTargetRef.current;

    const initialPositions = useMemo(() => {
        const arr = new Float32Array(POINT_POOL_SIZE * 3);
        const startPoints = shapes.plane;
        for (let i = 0; i < POINT_POOL_SIZE; i++) {
            const p = startPoints[i] || new THREE.Vector3(0, -500, 0);
            arr[i * 3] = p.x;
            arr[i * 3 + 1] = p.y;
            arr[i * 3 + 2] = p.z;
        }
        return arr;
    }, [shapes]);

    const initialScales = useMemo(() => {
        const arr = new Float32Array(POINT_POOL_SIZE);
        const startPoints = shapes.plane;
        for (let i = 0; i < POINT_POOL_SIZE; i++) {
            arr[i] = startPoints[i] ? 1.0 : 0.0;
        }
        return arr;
    }, [shapes]);

    useManhattanAnimation(meshRef, animationTarget, onAnimationComplete, viewMode);

    return (
        <>
            {/* Load all GLTF models that aren't cached yet */}
            {projectsToLoad.map(project => (
                <GLTFCacheLoader
                    key={project.id}
                    project={project}
                    shapes={shapes}
                    onCached={handleCached}
                />
            ))}
            <points ref={meshRef} frustumCulled={false}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={POINT_POOL_SIZE} array={initialPositions} itemSize={3} />
                    <bufferAttribute attach="attributes-aScale" count={POINT_POOL_SIZE} array={initialScales} itemSize={1} />
                </bufferGeometry>
                <shaderMaterial
                    uniforms={{ pointSize: { value: 5.0 }, color: { value: new THREE.Color('black') } }}
                    vertexShader={`
                        uniform float pointSize;
                        attribute float aScale;
                        void main() {
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                            gl_PointSize = pointSize * aScale;
                        }
                    `}
                    fragmentShader={`
                        uniform vec3 color;
                        void main() {
                            vec2 center = gl_PointCoord - 0.5;
                            if (length(center) > 0.5) discard;
                            gl_FragColor = vec4(color, 1.0);
                        }
                    `}
                    transparent={true}
                />
            </points>
        </>
    );
};

export const WorldGrid = ({ currentProject = null, viewMode = 'LANDING', onAnimationComplete, allProjects = [] }) => {
    return (
        <Canvas camera={{ position: [0, 0, 20], fov: 45 }}>
            <color attach="background" args={['#FFFFFF']} />
            <ViewOffsetRig viewMode={viewMode} />
            <CameraRig viewMode={viewMode} />
            <GridParticles
                currentProject={currentProject}
                viewMode={viewMode}
                onAnimationComplete={onAnimationComplete}
                allProjects={allProjects}
            />
            <ZoomController viewMode={viewMode} />
            <OrbitControls enablePan={false} enableZoom={false} enableRotate={viewMode === 'PROJECT'} />
        </Canvas>
    );
};
