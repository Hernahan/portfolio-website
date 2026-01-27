import React, { useMemo, useRef, useEffect, useState } from 'react';
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
    const offsetRef = useRef({ x: 0 }); // Proxy for animation

    useEffect(() => {
        const isProject = viewMode === 'PROJECT';
        // -0.2 means shift window LEFT by 20% -> Objects move RIGHT
        // Center of Right 60% is 70%. Center of screen is 50%. Diff is +20%.
        // We want object at 50% to appear at 70%? 
        // No, we want the center of the Right 60% (which is at x=70%) to be the center of the viewport?
        // Wait. 
        // Screen: [0 ... 100]. Center 50.
        // Right Panel: [40 ... 100]. Center 70.
        // We want Model (at strict center) to appear at 70.
        // So we need to shift the image RIGHT by 20.
        // camera.setViewOffset x: 
        // "x: offset of the subwindow". 
        // If x is positive, the subwindow is to the right. 
        // The camera maps the frustum to the subwindow.
        // If we choose a subwindow to the LEFT (negative x), the camera looks left. Objects move RIGHT.
        // So target is -0.15 (tune to taste, -0.2 might be too much if panel is 60%)
        // Let's use -0.1 (10% shift) first, or calculate precisely.
        // To shift image center from 50 to 70 is +20 (of full width).
        // So we need to shift viewport Left by 20%. -> x = -0.2 * width.

        gsap.to(offsetRef.current, {
            x: isProject ? -0.2 : 0,
            duration: 1.5,
            ease: "power2.inOut"
        });
    }, [viewMode]);

    useFrame(() => {
        const w = size.width;
        const h = size.height;
        // Apply view offset (lens shift)
        camera.setViewOffset(w, h, offsetRef.current.x * w, 0, w, h);
    });

    return null;
};

// Camera Rig
const CameraRig = ({ viewMode }) => {
    const { camera } = useThree();

    useEffect(() => {
        if (viewMode === 'LANDING' || viewMode === 'ABOUT' || viewMode === 'CONTACT') {
            // Full-screen centered view for plane
            gsap.to(camera.position, { x: 0, y: 0, z: 20, duration: 1.5, ease: "power2.inOut" });
        } else {
            // Project mode: Camera stays centered (x=0), ViewOffsetRig handles the visual shift
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

// GLTF loader component - collects all meshes
const GLTFPointGenerator = ({ onLoad }) => {
    const gltf = useGLTF('/CAD-files/gltf test file correct orientation.gltf');

    useEffect(() => {
        if (gltf && gltf.scene) {
            // Collect all geometries from the scene
            const geometries = [];
            gltf.scene.traverse((child) => {
                if (child.isMesh && child.geometry) {
                    // Clone and apply world matrix to each geometry
                    const clonedGeo = child.geometry.clone();
                    child.updateMatrixWorld(true);
                    clonedGeo.applyMatrix4(child.matrixWorld);
                    geometries.push(clonedGeo);
                }
            });

            if (geometries.length > 0) {
                // Merge all geometries into one
                const mergedGeometry = mergeGeometries(geometries, false);

                if (mergedGeometry) {
                    const points = generateMeshPoints(mergedGeometry, { pointsPerUnit: 0.3, scale: 8 });
                    onLoad(points);

                    // Cleanup
                    mergedGeometry.dispose();
                }

                // Cleanup cloned geometries
                geometries.forEach(g => g.dispose());
            }
        }
    }, [gltf, onLoad]);

    return null;
};

const GridParticles = ({ activeShape, onAnimationComplete }) => {
    const meshRef = useRef();
    const [gltfPoints, setGltfPoints] = useState(null);

    const shapes = useMemo(() => ({
        plane: generatePlanePoints({ width: 55, height: 28, spacing: 1.0 }),
        cube: generateCubePoints({ gridSize: [8, 8, 8], spacing: 0.6 }),
        sphere: generateSpherePoints({ radius: 5, spacing: 0.55 })
    }), []);

    // Combine static shapes with dynamic GLTF points
    const allShapes = useMemo(() => ({
        ...shapes,
        gltf: gltfPoints || shapes.cube // Fallback to cube while loading
    }), [shapes, gltfPoints]);

    const targetPoints = allShapes[activeShape] || allShapes.plane;

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

    useManhattanAnimation(meshRef, targetPoints, onAnimationComplete);

    return (
        <>
            <GLTFPointGenerator onLoad={setGltfPoints} />
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

export const WorldGrid = ({ activeShape = 'plane', viewMode = 'LANDING', onAnimationComplete }) => {
    return (
        <Canvas camera={{ position: [0, 0, 20], fov: 45 }}>
            <color attach="background" args={['#FFFFFF']} />
            <ViewOffsetRig viewMode={viewMode} />
            <CameraRig viewMode={viewMode} />
            <GridParticles activeShape={activeShape} onAnimationComplete={onAnimationComplete} />
            <ZoomController viewMode={viewMode} />
            <OrbitControls enablePan={false} enableZoom={false} enableRotate={viewMode === 'PROJECT'} />
        </Canvas>
    );
};
