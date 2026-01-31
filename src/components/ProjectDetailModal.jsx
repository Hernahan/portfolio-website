import React, { useRef, useState, Suspense, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, useGLTF, OrthographicCamera, PerspectiveCamera, Environment } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';

/**
 * Loading Overlay with animated dots
 * Cycles: loading → loading. → loading.. → loading...
 */
const LoadingOverlay = ({ isLoading }) => {
    const [dots, setDots] = useState(0);

    useEffect(() => {
        if (!isLoading) return;

        const interval = setInterval(() => {
            setDots(d => (d + 1) % 4);
        }, 400);

        return () => clearInterval(interval);
    }, [isLoading]);

    if (!isLoading) return null;

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(245, 245, 245, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
        }}>
            <span style={{
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                color: '#666',
                letterSpacing: '0.05em',
            }}>
                loading{'.'.repeat(dots)}
            </span>
        </div>
    );
};

/**
 * Calculate bounding box size and center for a 3D object
 */
const getBoundingBoxInfo = (object) => {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    return {
        width: size.x,
        height: size.y,
        depth: size.z,
        center,
        maxDimension: Math.max(size.x, size.y, size.z)
    };
};

/**
 * Calculate grid layout for N parts
 */
const calculateGrid = (partCount) => {
    if (partCount <= 0) return { cols: 1, rows: 1 };
    const cols = Math.ceil(Math.sqrt(partCount));
    const rows = Math.ceil(partCount / cols);
    return { cols, rows };
};

/**
 * Individual Part Component for Grid Layout
 * LIGHT THEME: Dark models on white background
 */
const GridPart = ({ partUrl, gridPosition, cellSize, name, description, onHover, onLoaded }) => {
    const [hovered, setHovered] = useState(false);
    const meshRef = useRef();

    const { scene } = useGLTF(partUrl);

    const { clonedScene, scale, centerOffset } = useMemo(() => {
        const clone = scene.clone();
        clone.traverse((child) => {
            if (child.isMesh) {
                // Dark gray material for light theme
                child.material = new THREE.MeshStandardMaterial({
                    color: '#444444',
                    metalness: 0.3,
                    roughness: 0.5,
                });
            }
        });

        const { maxDimension, center } = getBoundingBoxInfo(clone);
        const targetScale = cellSize > 0 ? (cellSize * 0.75) / maxDimension : 1;
        const centerOffset = center.clone().multiplyScalar(-targetScale);

        return { clonedScene: clone, scale: targetScale, centerOffset };
    }, [scene, cellSize]);

    // Call onLoaded when the scene is ready
    useEffect(() => {
        if (scene) {
            onLoaded?.();
        }
    }, [scene, onLoaded]);

    const handlePointerOver = (e) => {
        e.stopPropagation();
        setHovered(true);
        onHover?.(true);
        document.body.style.cursor = 'pointer';
    };

    const handlePointerOut = (e) => {
        e.stopPropagation();
        setHovered(false);
        onHover?.(false);
        document.body.style.cursor = 'default';
    };

    return (
        <group
            ref={meshRef}
            position={[gridPosition.x, gridPosition.y, 0]}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
        >
            <group position={[centerOffset.x, centerOffset.y, centerOffset.z]}>
                <primitive object={clonedScene} scale={scale} />
            </group>

            {hovered && (
                <Html
                    position={[0, cellSize * 0.4, 0]}
                    center
                    style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
                >
                    <div style={{
                        background: 'rgba(0, 0, 0, 0.85)',
                        color: 'white',
                        padding: '8px 12px',
                        borderRadius: '4px',
                        fontFamily: 'var(--font-body, system-ui)',
                        fontSize: '0.7rem',
                        maxWidth: '180px',
                        textAlign: 'center',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}>
                        <div style={{ fontWeight: 600, marginBottom: '3px', fontFamily: 'var(--font-header, system-ui)', letterSpacing: '0.05em' }}>
                            {name}
                        </div>
                        <div style={{ opacity: 0.8, whiteSpace: 'normal', lineHeight: 1.4, fontSize: '0.6rem' }}>
                            {description}
                        </div>
                    </div>
                </Html>
            )}
        </group>
    );
};

/**
 * Parts Grid Scene with drag-to-spin and auto-pause on hover
 * LIGHT THEME: White background
 */
const PartsGridScene = ({ project, onLoaded }) => {
    const { viewport, gl } = useThree();
    const groupRef = useRef();
    const isDragging = useRef(false);
    const lastX = useRef(0);
    const manualVelocity = useRef(0);
    const pauseUntil = useRef(0);
    const [isHovering, setIsHovering] = useState(false);
    const loadedCountRef = useRef(0);
    const totalPartsRef = useRef(0);

    useEffect(() => {
        const canvas = gl.domElement;

        const handlePointerDown = (e) => {
            isDragging.current = true;
            lastX.current = e.clientX;
            manualVelocity.current = 0;
        };

        const handlePointerMove = (e) => {
            if (isDragging.current && groupRef.current) {
                const deltaX = e.clientX - lastX.current;
                manualVelocity.current = deltaX * 0.005;
                groupRef.current.rotation.y += manualVelocity.current;
                lastX.current = e.clientX;
                pauseUntil.current = Date.now() + 2000;
            }
        };

        const handlePointerUp = () => {
            isDragging.current = false;
        };

        canvas.addEventListener('pointerdown', handlePointerDown);
        canvas.addEventListener('pointermove', handlePointerMove);
        canvas.addEventListener('pointerup', handlePointerUp);
        canvas.addEventListener('pointerleave', handlePointerUp);

        return () => {
            canvas.removeEventListener('pointerdown', handlePointerDown);
            canvas.removeEventListener('pointermove', handlePointerMove);
            canvas.removeEventListener('pointerup', handlePointerUp);
            canvas.removeEventListener('pointerleave', handlePointerUp);
        };
    }, [gl]);

    useFrame((state, delta) => {
        if (groupRef.current) {
            const now = Date.now();
            const shouldPause = isHovering || now < pauseUntil.current;

            if (!isDragging.current && !shouldPause) {
                groupRef.current.rotation.y += delta * 0.15;
            }
        }
    });

    const handlePartHover = useCallback((hovering) => {
        setIsHovering(hovering);
        if (hovering) {
            pauseUntil.current = Date.now() + 2000;
        }
    }, []);

    const handlePartLoaded = useCallback(() => {
        loadedCountRef.current += 1;
        if (loadedCountRef.current >= totalPartsRef.current) {
            onLoaded?.();
        }
    }, [onLoaded]);

    if (!project?.details?.parts) return null;

    const { partsFolder, parts } = project.details;
    const partCount = parts.length;

    // Track total parts for loading callback
    useEffect(() => {
        loadedCountRef.current = 0;
        totalPartsRef.current = partCount;
    }, [partCount]);

    const { cols, rows } = calculateGrid(partCount);

    const padding = Math.min(viewport.width, viewport.height) * 0.1;
    const availableWidth = viewport.width - padding * 2;
    const availableHeight = viewport.height - padding * 2;

    const cellWidth = availableWidth / cols;
    const cellHeight = availableHeight / rows;
    const cellSize = Math.min(cellWidth, cellHeight);

    const gridWidth = cols * cellSize;
    const gridHeight = rows * cellSize;
    const offsetX = -gridWidth / 2 + cellSize / 2;
    const offsetY = gridHeight / 2 - cellSize / 2;

    const partPositions = parts.map((_, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        return { x: offsetX + col * cellSize, y: offsetY - row * cellSize };
    });

    return (
        <>
            {/* Lighting for light theme */}
            <ambientLight intensity={1.2} />
            <directionalLight position={[5, 5, 5]} intensity={0.8} />
            <directionalLight position={[-5, -5, -5]} intensity={0.4} />

            <group ref={groupRef}>
                {parts.map((part, index) => {
                    const partUrl = `/CAD-more-info/${encodeURIComponent(partsFolder)}/${encodeURIComponent(part.file)}`;
                    return (
                        <Suspense key={part.file} fallback={null}>
                            <GridPart
                                partUrl={partUrl}
                                gridPosition={partPositions[index]}
                                cellSize={cellSize}
                                name={part.name}
                                description={part.description}
                                onHover={handlePartHover}
                                onLoaded={handlePartLoaded}
                            />
                        </Suspense>
                    );
                })}
            </group>
        </>
    );
};

/**
 * Solid Assembly Scene
 * LIGHT THEME: Dark models, RMB pan enabled
 */
const SolidAssemblyScene = ({ project, onLoaded }) => {
    const { viewport } = useThree();
    const { scene } = useGLTF(project.modelPath);

    const { clonedScene, scale, centerOffset } = useMemo(() => {
        const clone = scene.clone();
        clone.traverse((child) => {
            if (child.isMesh) {
                // Dark gray material for light theme
                child.material = new THREE.MeshStandardMaterial({
                    color: '#444444',
                    metalness: 0.3,
                    roughness: 0.5,
                });
            }
        });

        const { maxDimension, center } = getBoundingBoxInfo(clone);
        const targetSize = Math.min(viewport.width, viewport.height) * 0.7;
        const targetScale = maxDimension > 0 ? targetSize / maxDimension : 1;
        const centerOffset = center.clone().multiplyScalar(-targetScale);

        return { clonedScene: clone, scale: targetScale, centerOffset };
    }, [scene, viewport.width, viewport.height]);

    // Call onLoaded when the scene is ready
    useEffect(() => {
        if (scene) {
            onLoaded?.();
        }
    }, [scene, onLoaded]);

    return (
        <>
            {/* Lighting for light theme */}
            <ambientLight intensity={1.2} />
            <directionalLight position={[10, 10, 5]} intensity={0.8} />
            <directionalLight position={[-5, 5, -5]} intensity={0.5} />
            <directionalLight position={[0, -5, 0]} intensity={0.3} />

            <group>
                <group position={[centerOffset.x, centerOffset.y, centerOffset.z]}>
                    <primitive object={clonedScene} scale={scale} />
                </group>
            </group>

            {/* OrbitControls with RMB pan enabled */}
            <OrbitControls
                makeDefault
                enablePan={true}
                enableZoom={true}
                enableRotate={true}
                mouseButtons={{
                    LEFT: THREE.MOUSE.ROTATE,
                    MIDDLE: THREE.MOUSE.DOLLY,
                    RIGHT: THREE.MOUSE.PAN,
                }}
                minDistance={1}
                maxDistance={100}
                rotateSpeed={0.5}
                zoomSpeed={0.8}
                panSpeed={0.5}
            />
        </>
    );
};

/**
 * Parts Canvas - Bottom Left quadrant
 * LIGHT THEME: White background
 */
const PartsCanvas = ({ project, instanceId, onLoad }) => {
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
    }, [instanceId]);

    const handleLoaded = useCallback(() => {
        setIsLoading(false);
        onLoad?.();
    }, [onLoad]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <LoadingOverlay isLoading={isLoading} />
            <Canvas
                key={instanceId}
                style={{ width: '100%', height: '100%' }}
                gl={{ antialias: true }}
            >
                <OrthographicCamera
                    makeDefault
                    position={[0, 0, 10]}
                    zoom={50}
                    near={0.1}
                    far={1000}
                />
                <color attach="background" args={['#f5f5f5']} />
                <Suspense fallback={null}>
                    <PartsGridScene project={project} onLoaded={handleLoaded} />
                </Suspense>
            </Canvas>
        </div>
    );
};

/**
 * Assembly Canvas - Top Left quadrant
 * LIGHT THEME: White background
 */
const AssemblyCanvas = ({ project, instanceId, onLoad }) => {
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
    }, [instanceId]);

    const handleLoaded = useCallback(() => {
        setIsLoading(false);
        onLoad?.();
    }, [onLoad]);

    if (!project.modelPath) return null;

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <LoadingOverlay isLoading={isLoading} />
            <Canvas
                key={instanceId}
                style={{ width: '100%', height: '100%' }}
                gl={{ antialias: true }}
            >
                <PerspectiveCamera
                    makeDefault
                    position={[0, 3, 10]}
                    fov={45}
                />
                <color attach="background" args={['#f0f0f0']} />
                <Suspense fallback={null}>
                    <SolidAssemblyScene project={project} onLoaded={handleLoaded} />
                </Suspense>
            </Canvas>
        </div>
    );
};

/**
 * Static media file mappings for each project
 * Since we can't dynamically read directories, we list the files explicitly
 */
const projectMedia = {
    'Excavator V1 Media': [
        { type: 'image', file: 'IMG_8717.PNG' },
        { type: 'image', file: 'IMG_8780.JPEG' },
        { type: 'image', file: 'Screenshot 2026-01-31 162635.png' },
    ],
    'Excavator V2 Media': [
        { type: 'image', file: 'IMG_8790.JPEG' },
        { type: 'image', file: 'IMG_8791.JPEG' },
        { type: 'image', file: 'IMG_8802.JPEG' },
        { type: 'video', file: 'preet example.mp4' },
    ],
    'Freshman Payload Assembly Media': [
        { type: 'image', file: 'IMG_7478.JPEG' },
        { type: 'image', file: 'IMG_7696.JPEG' },
        { type: 'image', file: 'IMG_7708.JPEG' },
        { type: 'image', file: 'IMG_7709.JPEG' },
        { type: 'image', file: 'IMG_7858.JPEG' },
        { type: 'image', file: 'IMG_7876.JPEG' },
        { type: 'image', file: 'IMG_8154.JPEG' },
        { type: 'video', file: 'iqdwejdidjiiqod.mp4' },
    ],
    'Mockup Assembly Media': [
        { type: 'image', file: 'IMG_8943.JPEG' },
        { type: 'video', file: 'cubesat airframe prototype.mp4' },
        { type: 'video', file: 'gemini solidworks help 1.mp4' },
    ],
};

/**
 * Single Media Item Component
 */
const MediaItem = ({ mediaFolder, item, onClick }) => {
    const mediaUrl = `/CAD-more-info/${encodeURIComponent(mediaFolder)}/${encodeURIComponent(item.file)}`;

    if (item.type === 'video') {
        return (
            <div
                onClick={() => onClick(mediaUrl, 'video')}
                style={{
                    position: 'relative',
                    width: '100%',
                    paddingBottom: '75%',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    background: '#f0f0f0',
                }}
            >
                <video
                    src={mediaUrl}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                    }}
                    muted
                />
                {/* Play button overlay */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '48px',
                    height: '48px',
                    background: 'rgba(0,0,0,0.7)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                }}>
                    <div style={{
                        width: 0,
                        height: 0,
                        borderTop: '10px solid transparent',
                        borderBottom: '10px solid transparent',
                        borderLeft: '16px solid white',
                        marginLeft: '4px',
                    }} />
                </div>
            </div>
        );
    }

    return (
        <div
            onClick={() => onClick(mediaUrl, 'image')}
            style={{
                position: 'relative',
                width: '100%',
                paddingBottom: '75%',
                borderRadius: '8px',
                overflow: 'hidden',
                cursor: 'pointer',
                background: '#f0f0f0',
            }}
        >
            <img
                src={mediaUrl}
                alt={item.file}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transition: 'transform 0.3s ease',
                }}
                onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
            />
        </div>
    );
};

/**
 * Media Lightbox Component for fullscreen viewing
 */
const MediaLightbox = ({ src, type, onClose }) => {
    if (!src) return null;

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                background: 'rgba(0,0,0,0.95)',
                zIndex: 2000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
            }}
        >
            <button
                onClick={onClose}
                style={{
                    position: 'absolute',
                    top: '1.5rem',
                    right: '1.5rem',
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    color: '#fff',
                    padding: '0.6rem 1.2rem',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    fontSize: '0.7rem',
                    letterSpacing: '0.1em',
                    zIndex: 2001,
                }}
            >
                ✕ CLOSE
            </button>
            {type === 'video' ? (
                <video
                    src={src}
                    controls
                    autoPlay
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        maxWidth: '90vw',
                        maxHeight: '90vh',
                        borderRadius: '8px',
                    }}
                />
            ) : (
                <img
                    src={src}
                    alt="Fullscreen view"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        maxWidth: '90vw',
                        maxHeight: '90vh',
                        objectFit: 'contain',
                        borderRadius: '8px',
                    }}
                />
            )}
        </div>
    );
};

/**
 * Description Panel - Right 50% with media gallery
 * LIGHT THEME: White background, dark text
 */
const DescriptionPanel = ({ project }) => {
    const [lightbox, setLightbox] = useState({ src: null, type: null });
    const mediaFolder = project.details?.mediaFolder;
    const mediaItems = mediaFolder ? projectMedia[mediaFolder] || [] : [];

    const openLightbox = (src, type) => {
        setLightbox({ src, type });
    };

    const closeLightbox = () => {
        setLightbox({ src: null, type: null });
    };

    return (
        <>
            <MediaLightbox src={lightbox.src} type={lightbox.type} onClose={closeLightbox} />
            <div style={{
                width: '100%',
                height: '100%',
                padding: '4rem 3rem',
                overflowY: 'auto',
                color: '#1a1a1a',
                fontFamily: 'var(--font-body, system-ui)',
                background: '#ffffff',
            }}>
                {/* Project Title */}
                <span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.6rem',
                    color: 'rgba(0,0,0,0.4)',
                    letterSpacing: '0.15em',
                }}>
                    PROJECT OVERVIEW
                </span>
                <h2 style={{
                    fontFamily: 'var(--font-header, system-ui)',
                    fontSize: '2rem',
                    fontWeight: 400,
                    marginTop: '0.5rem',
                    marginBottom: '1.5rem',
                    letterSpacing: '-0.01em',
                    color: '#000',
                }}>
                    {project.title}
                </h2>

                {/* Description */}
                {(project.expandedDescription || project.description).split('\n\n').map((paragraph, idx) => (
                    <p key={idx} style={{
                        fontSize: '0.9rem',
                        lineHeight: 1.8,
                        color: 'rgba(0,0,0,0.7)',
                        marginBottom: '1rem',
                    }}
                        dangerouslySetInnerHTML={{
                            __html: paragraph.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        }}
                    />
                ))}

                {/* Media Gallery */}
                {mediaItems.length > 0 ? (
                    <>
                        <span style={{
                            fontFamily: 'monospace',
                            fontSize: '0.6rem',
                            color: 'rgba(0,0,0,0.4)',
                            letterSpacing: '0.15em',
                        }}>
                            MEDIA GALLERY
                        </span>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: '1rem',
                            marginTop: '0.75rem',
                            marginBottom: '2rem',
                        }}>
                            {mediaItems.map((item, index) => (
                                <MediaItem
                                    key={`${item.file}-${index}`}
                                    mediaFolder={mediaFolder}
                                    item={item}
                                    onClick={openLightbox}
                                />
                            ))}
                        </div>
                    </>
                ) : (
                    <div style={{
                        background: 'rgba(0,0,0,0.03)',
                        border: '1px dashed rgba(0,0,0,0.2)',
                        borderRadius: '4px',
                        padding: '2rem',
                        textAlign: 'center',
                        marginBottom: '1.5rem',
                    }}>
                        <span style={{
                            fontFamily: 'monospace',
                            fontSize: '0.7rem',
                            color: 'rgba(0,0,0,0.4)',
                        }}>
                            📷 No media available
                        </span>
                    </div>
                )}

                {/* Parts List */}
                {project.details?.parts && (
                    <>
                        <h3 style={{
                            fontFamily: 'var(--font-header, system-ui)',
                            fontSize: '1rem',
                            fontWeight: 400,
                            marginBottom: '1rem',
                            color: 'rgba(0,0,0,0.8)',
                        }}>
                            Components ({project.details.parts.length})
                        </h3>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: '0.75rem',
                        }}>
                            {project.details.parts.map((part) => (
                                <div
                                    key={part.file}
                                    style={{
                                        background: 'rgba(0,0,0,0.02)',
                                        padding: '0.75rem',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(0,0,0,0.08)',
                                    }}
                                >
                                    <div style={{
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        marginBottom: '0.25rem',
                                        color: '#000',
                                    }}>
                                        {part.name}
                                    </div>
                                    <div style={{
                                        fontSize: '0.65rem',
                                        color: 'rgba(0,0,0,0.5)',
                                        lineHeight: 1.4,
                                    }}>
                                        {part.description}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* Tags */}
                {project.tags && (
                    <div style={{ marginTop: '2rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {project.tags.map((tag) => (
                            <span
                                key={tag}
                                style={{
                                    padding: '0.3rem 0.6rem',
                                    background: '#000',
                                    color: '#fff',
                                    fontSize: '0.6rem',
                                    fontFamily: 'monospace',
                                    borderRadius: '2px',
                                }}
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
};

/**
 * Project Detail Modal - LIGHT THEME
 * - Top Left (25%): Assembly with orbit controls (LMB orbit, RMB pan, scroll zoom)
 * - Bottom Left (25%): Parts grid with drag-to-spin
 * - Right (50%): Text/media description
 */
export const ProjectDetailModal = ({ project, onClose, isOpen }) => {
    const overlayRef = useRef(null);
    const contentRef = useRef(null);
    const hasAnimatedRef = useRef(false);
    const [instanceId, setInstanceId] = useState(0);

    useEffect(() => {
        if (isOpen) {
            setInstanceId(prev => prev + 1);
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && !hasAnimatedRef.current) {
            hasAnimatedRef.current = true;
            const timer = setTimeout(() => {
                if (overlayRef.current) {
                    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.out" });
                }
                if (contentRef.current) {
                    gsap.fromTo(contentRef.current, { scale: 0.95, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "power2.out" });
                }
            }, 50);
            return () => clearTimeout(timer);
        }
        if (!isOpen) {
            hasAnimatedRef.current = false;
        }
    }, [isOpen]);

    const handleClose = useCallback(() => {
        if (overlayRef.current && contentRef.current) {
            gsap.to(overlayRef.current, { opacity: 0, duration: 0.3, ease: "power2.in" });
            gsap.to(contentRef.current, { scale: 0.95, opacity: 0, duration: 0.3, ease: "power2.in", onComplete: onClose });
        } else {
            onClose();
        }
    }, [onClose]);

    if (!isOpen || !project || !project.details) return null;

    return (
        <div
            ref={overlayRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 1000,
                background: 'rgba(255, 255, 255, 0.98)',
                opacity: 0,
            }}
        >
            <div
                ref={contentRef}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'row',
                    opacity: 0,
                    transform: 'scale(0.95)',
                }}
            >
                {/* Close Button - Dark on light */}
                <button
                    onClick={handleClose}
                    style={{
                        position: 'absolute',
                        top: '1.5rem',
                        right: '1.5rem',
                        zIndex: 1010,
                        background: 'rgba(0,0,0,0.08)',
                        border: '1px solid rgba(0,0,0,0.15)',
                        color: '#000',
                        padding: '0.6rem 1.2rem',
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                        fontSize: '0.7rem',
                        letterSpacing: '0.1em',
                        transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(0,0,0,0.15)'}
                    onMouseLeave={(e) => e.target.style.background = 'rgba(0,0,0,0.08)'}
                >
                    ✕ CLOSE
                </button>

                {/* LEFT 50%: 3D Views stacked vertically */}
                <div style={{
                    width: '50%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRight: '1px solid rgba(0,0,0,0.1)',
                }}>
                    {/* Top Left: Assembly View */}
                    <div style={{
                        position: 'relative',
                        width: '100%',
                        height: '50%',
                        borderBottom: '1px solid rgba(0,0,0,0.1)',
                    }}>
                        <div style={{
                            position: 'absolute',
                            top: '1rem',
                            left: '1rem',
                            zIndex: 1010,
                            color: 'rgba(0,0,0,0.4)',
                            fontFamily: 'monospace',
                            fontSize: '0.55rem',
                            letterSpacing: '0.15em',
                        }}>
                            ASSEMBLY • LMB ORBIT • RMB PAN • SCROLL ZOOM
                        </div>
                        <AssemblyCanvas project={project} instanceId={`assembly-${project.id}-${instanceId}`} />
                    </div>

                    {/* Bottom Left: Parts Grid View */}
                    <div style={{
                        position: 'relative',
                        width: '100%',
                        height: '50%',
                    }}>
                        <div style={{
                            position: 'absolute',
                            top: '1rem',
                            left: '1rem',
                            zIndex: 1010,
                            color: 'rgba(0,0,0,0.4)',
                            fontFamily: 'monospace',
                            fontSize: '0.55rem',
                            letterSpacing: '0.15em',
                        }}>
                            COMPONENTS • DRAG TO SPIN • HOVER FOR DETAILS
                        </div>
                        <PartsCanvas project={project} instanceId={`parts-${project.id}-${instanceId}`} />
                    </div>
                </div>

                {/* RIGHT 50%: Description Panel */}
                <div style={{
                    width: '50%',
                    height: '100%',
                    background: '#ffffff',
                }}>
                    <DescriptionPanel project={project} />
                </div>
            </div>
        </div>
    );
};
