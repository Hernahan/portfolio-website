import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WorldGrid } from './components/WorldGrid';
import gsap from 'gsap';
import './index.css';

function App() {
    const [activeShape, setActiveShape] = useState('plane');
    const [viewMode, setViewMode] = useState('LANDING');
    const [layoutLocked, setLayoutLocked] = useState(false); // Lock layout during exit animation
    const [isExiting, setIsExiting] = useState(false); // Track exit animation
    const headerRef = useRef(null);
    const prevViewModeRef = useRef('LANDING');
    const layoutLockedRef = useRef(false); // Ref to read current value in scroll handler


    // Scroll thresholds
    const heroEnd = 300;           // End of hero header transition
    const aboutStart = 100;        // When About section becomes visible
    const aboutEnd = window.innerHeight * 1.8;  // End of About section
    const projectsStart = window.innerHeight * 2;  // Projects begin

    useEffect(() => {
        const handleScroll = () => {
            const scrollY = window.scrollY;
            const vh = window.innerHeight;

            // Header animation progress (0 to 1)
            const headerProgress = Math.max(0, Math.min(1, scrollY / heroEnd));

            if (headerRef.current) {
                const leftPercent = 50 * (1 - headerProgress);
                const topPercent = 50 * (1 - headerProgress);
                const translateX = -50 * (1 - headerProgress);
                const translateY = -50 * (1 - headerProgress);
                const paddingOffset = headerProgress * 2.5;
                const startFontSize = 4.5;
                const endFontSize = 2.2;
                const currentFontSize = startFontSize - (startFontSize - endFontSize) * headerProgress;
                const duration = scrollY === 0 ? 0 : 0.1;

                gsap.to(headerRef.current, {
                    left: `calc(${leftPercent}% + ${paddingOffset}rem)`,
                    top: `calc(${topPercent}% + ${paddingOffset}rem)`,
                    xPercent: translateX,
                    yPercent: translateY,
                    duration: duration,
                    ease: "none",
                });

                const h1 = headerRef.current.querySelector('h1');
                if (h1) gsap.to(h1, { fontSize: `${currentFontSize}rem`, duration: duration, ease: "none" });

                const divider = headerRef.current.querySelector('.header-divider');
                if (divider) gsap.to(divider, { width: `${5 - 3 * headerProgress}rem`, duration: duration, ease: "none" });

                const contactLinks = headerRef.current.querySelector('.header-contacts');
                if (contactLinks) {
                    // Fade in contacts when header is mostly collapsed (progress > 0.8)
                    const opacity = Math.max(0, (headerProgress - 0.8) * 5);
                    gsap.to(contactLinks, { opacity: opacity, duration: 0.1 });
                    contactLinks.style.pointerEvents = opacity > 0.5 ? 'auto' : 'none';
                }
            }

            // State machine for viewMode and activeShape
            // State 0: LANDING (Hero) - 0 to ~100px
            // State 1: ABOUT - ~100px to ~2vh (full width grid)
            // State 2+: PROJECTS - 2vh+
            // State 4: CONTACT - 4vh+

            let newViewMode, newActiveShape;

            if (scrollY < aboutStart) {
                newViewMode = 'LANDING';
                newActiveShape = 'plane';
            } else if (scrollY < aboutEnd) {
                newViewMode = 'ABOUT';
                newActiveShape = 'plane';
            } else if (scrollY < vh * 3) {
                newViewMode = 'PROJECT';
                newActiveShape = 'gltf';
            } else if (scrollY < vh * 4) {
                newViewMode = 'PROJECT';
                newActiveShape = 'sphere';
            } else {
                newViewMode = 'CONTACT';
                newActiveShape = 'plane';
            }

            // Detect CASE 3: Exiting from PROJECT to full-width mode
            const isFullWidthMode = (mode) => mode === 'LANDING' || mode === 'ABOUT' || mode === 'CONTACT';
            const wasProject = prevViewModeRef.current === 'PROJECT';
            const goingToFullWidth = isFullWidthMode(newViewMode);

            if (wasProject && goingToFullWidth && !layoutLockedRef.current) {
                // CASE 3: Lock the layout at 60% during exit animation
                layoutLockedRef.current = true;
                setLayoutLocked(true);
                setIsExiting(true);
            }

            prevViewModeRef.current = newViewMode;
            setViewMode(newViewMode);
            setActiveShape(newActiveShape);
        };

        handleScroll();
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []); // Empty deps - refs track current values

    // Separate one-time initialization for header position
    useEffect(() => {
        if (headerRef.current) {
            gsap.set(headerRef.current, {
                xPercent: -50,
                yPercent: -50
            });
        }
    }, []);

    // Animation completion callback - releases layout lock
    const handleAnimationComplete = useCallback(() => {
        if (isExiting) {
            layoutLockedRef.current = false;
            setLayoutLocked(false);
            setIsExiting(false);
        }
    }, [isExiting]);

    const isLanding = viewMode === 'LANDING';
    const isAbout = viewMode === 'ABOUT';
    const isContact = viewMode === 'CONTACT';
    const isProject = viewMode === 'PROJECT';
    // Show left panel overlay only in PROJECT mode
    const showLeftPanel = isProject;


    return (
        <>
            {/* 3D MODEL VIEWER - Always 100% width, panel overlays on top */}
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 0,
            }}>
                <WorldGrid activeShape={activeShape} viewMode={viewMode} onAnimationComplete={handleAnimationComplete} />
            </div>

            {/* LEFT PANEL BACKGROUND - Blocks OrbitControls on left 40% */}
            <div style={{
                position: 'fixed', top: 0, left: 0, width: '40vw', height: '100vh',
                backgroundColor: 'rgba(234, 234, 234, 0.3)', backdropFilter: 'blur(2px)',
                zIndex: 5, opacity: showLeftPanel ? 1 : 0,
                pointerEvents: showLeftPanel ? 'auto' : 'none',
                transition: 'opacity 0.3s ease',
            }} />

            {/* ZONE DIVIDER */}
            <div style={{
                position: 'fixed', top: 0, left: '40%', width: '1px', height: '100%',
                background: 'linear-gradient(to bottom, transparent 5%, rgba(0,0,0,0.15) 50%, transparent 95%)',
                zIndex: 15, pointerEvents: 'none', opacity: showLeftPanel ? 1 : 0,
                transition: 'opacity 0.3s ease',
            }} />

            {/* ZONE LABELS */}
            <div style={{
                position: 'fixed', bottom: '1.5rem', left: '1.5rem',
                fontSize: '0.7rem', fontFamily: 'monospace', color: 'rgba(0,0,0,0.4)',
                letterSpacing: '0.1em', textTransform: 'uppercase', zIndex: 25,
                opacity: showLeftPanel ? 1 : 0, transition: 'opacity 0.3s ease', pointerEvents: 'none',
            }}>↕ Scroll</div>

            <div style={{
                position: 'fixed', bottom: '1.5rem', right: '1.5rem',
                fontSize: '0.7rem', fontFamily: 'monospace', color: 'rgba(0,0,0,0.4)',
                letterSpacing: '0.1em', textTransform: 'uppercase', zIndex: 25,
                opacity: showLeftPanel ? 1 : 0, transition: 'opacity 0.3s ease', pointerEvents: 'none',
            }}>⟳ Orbit + Zoom</div>

            {/* SCROLLABLE CONTENT */}
            <div style={{ position: 'relative', zIndex: 10, pointerEvents: 'none' }}>

                {/* === HERO TEXT === */}
                <div
                    ref={headerRef}
                    style={{
                        position: 'fixed', left: '50%', top: '50%',
                        padding: '2rem', zIndex: 20, pointerEvents: 'none', willChange: 'left, top, transform',
                    }}
                >
                    <div style={{
                        pointerEvents: 'auto',
                        backgroundColor: 'rgba(255, 255, 255, 0.85)',
                        backdropFilter: 'blur(4px)',
                        padding: '1.5rem 2rem',
                        borderRadius: '2px',
                    }}>
                        <h1 style={{
                            fontSize: '4.5rem', fontFamily: 'var(--font-header)', letterSpacing: '-0.02em',
                            textTransform: 'uppercase', marginBottom: '0.6rem', fontWeight: 400, whiteSpace: 'nowrap',
                        }}>ASHER BENNETT</h1>
                        <div className="header-divider" style={{ height: '3px', backgroundColor: 'black', width: '5rem', marginBottom: '0.6rem' }}></div>
                        <h2 style={{ fontSize: '0.95rem', fontFamily: 'var(--font-header)', fontWeight: 400, opacity: 0.7, letterSpacing: '0.04em' }}>Mechanical Engineering</h2>

                        {/* Collapsed Header Contacts */}
                        <div className="header-contacts" style={{
                            marginTop: '0.5rem', display: 'flex', gap: '1rem', opacity: 0, pointerEvents: 'none'
                        }}>
                            <a href="mailto:abennett@umass.edu" style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#000', textDecoration: 'none', borderBottom: '1px solid currentColor' }}>EMAIL</a>
                            <a href="#" style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#000', textDecoration: 'none', borderBottom: '1px solid currentColor' }}>GITHUB</a>
                            <a href="#" style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#000', textDecoration: 'none', borderBottom: '1px solid currentColor' }}>LINKEDIN</a>
                        </div>

                        <div style={{
                            overflow: 'hidden', maxHeight: isLanding ? '50px' : '0px', opacity: isLanding ? 1 : 0,
                            marginTop: isLanding ? '2rem' : '0', transition: 'all 0.4s ease',
                        }}>
                            <p style={{ fontSize: '0.75rem', color: '#666' }} className="animate-pulse">↓ SCROLL TO EXPLORE ↓</p>
                        </div>
                    </div>
                </div>

                {/* === SECTION 1: HERO SPACER === */}
                <section style={{ height: '100vh', width: '100%' }}></section>

                {/* === SECTION 2: ABOUT ME === */}
                <section style={{
                    height: '100vh',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4rem',
                }}>
                    <div style={{
                        maxWidth: '600px',
                        textAlign: 'center',
                        pointerEvents: 'auto',
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(8px)',
                        padding: '3rem 4rem',
                        border: '1px solid rgba(0,0,0,0.08)',
                    }}>
                        <span style={{
                            fontFamily: 'monospace',
                            fontSize: '0.65rem',
                            color: '#888',
                            letterSpacing: '0.2em',
                            display: 'block',
                            marginBottom: '0.75rem',
                        }}>01 // INTRODUCTION</span>

                        <h2 style={{
                            fontSize: '2.5rem',
                            fontFamily: 'var(--font-header)',
                            fontWeight: 400,
                            marginBottom: '1.5rem',
                            letterSpacing: '-0.02em',
                            textTransform: 'uppercase',
                        }}>ABOUT</h2>

                        <p style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.85rem',
                            lineHeight: 1.9,
                            color: '#333',
                            marginBottom: '1.5rem',
                        }}>
                            First-year Mechanical Engineering student at <strong>UMass Amherst</strong>,
                            passionate about bridging digital design with real-world applications.
                            Currently serving on the <strong>Payload Mechanical Subteam</strong> for the university rocket program.
                        </p>

                        <p style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.85rem',
                            lineHeight: 1.9,
                            color: '#333',
                            marginBottom: '1.5rem',
                        }}>
                            My work explores the intersection of hands-on fabrication, DIY electronics,
                            and computational simulation—building tools that make complex engineering tangible.
                        </p>

                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            flexWrap: 'wrap',
                            marginTop: '2rem',
                        }}>
                            <span style={{ padding: '0.3rem 0.6rem', background: '#000', color: '#fff', fontSize: '0.6rem', fontFamily: 'monospace' }}>CAD</span>
                            <span style={{ padding: '0.3rem 0.6rem', background: '#f0f0f0', color: '#000', fontSize: '0.6rem', fontFamily: 'monospace' }}>3D PRINTING</span>
                            <span style={{ padding: '0.3rem 0.6rem', background: '#f0f0f0', color: '#000', fontSize: '0.6rem', fontFamily: 'monospace' }}>SIMULATION</span>
                            <span style={{ padding: '0.3rem 0.6rem', background: '#f0f0f0', color: '#000', fontSize: '0.6rem', fontFamily: 'monospace' }}>ELECTRONICS</span>
                        </div>
                    </div>
                </section>

                {/* === SECTION 3: PROJECT 1 (CUBE) === */}
                <section style={{ height: '100vh', width: '100%', display: 'flex', alignItems: 'center', padding: '3rem' }}>
                    <div style={{
                        width: '36%', backgroundColor: 'rgba(255,255,255,0.94)', padding: '2rem', pointerEvents: 'auto',
                        backdropFilter: 'blur(12px)', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 4px 30px rgba(0,0,0,0.04)',
                    }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#888', letterSpacing: '0.15em' }}>PROJECT_01</span>
                        <h3 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-header)', margin: '0.5rem 0 0.75rem', fontWeight: 400 }}>Voxel Engine</h3>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', lineHeight: 1.7, color: '#444' }}>
                            A custom volumetric rendering engine built in React Three Fiber. Demonstrates real-time Manhattan distance pathfinding.
                        </p>
                        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <span style={{ padding: '0.2rem 0.4rem', background: '#000', color: '#fff', fontSize: '0.6rem', fontFamily: 'monospace' }}>THREE.JS</span>
                            <span style={{ padding: '0.2rem 0.4rem', background: '#f0f0f0', color: '#000', fontSize: '0.6rem', fontFamily: 'monospace' }}>GSAP</span>
                        </div>
                    </div>
                </section>

                {/* === SECTION 4: PROJECT 2 (SPHERE) === */}
                <section style={{ height: '100vh', width: '100%', display: 'flex', alignItems: 'center', padding: '3rem' }}>
                    <div style={{
                        width: '36%', backgroundColor: 'rgba(255,255,255,0.94)', padding: '2rem', pointerEvents: 'auto',
                        backdropFilter: 'blur(12px)', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 4px 30px rgba(0,0,0,0.04)',
                    }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#888', letterSpacing: '0.15em' }}>PROJECT_02</span>
                        <h3 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-header)', margin: '0.5rem 0 0.75rem', fontWeight: 400 }}>Sphere Logic</h3>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', lineHeight: 1.7, color: '#444' }}>
                            Exploration of spherical coordinate mapping and radial transitions.
                        </p>
                        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <span style={{ padding: '0.2rem 0.4rem', background: '#000', color: '#fff', fontSize: '0.6rem', fontFamily: 'monospace' }}>WEBGL</span>
                            <span style={{ padding: '0.2rem 0.4rem', background: '#f0f0f0', color: '#000', fontSize: '0.6rem', fontFamily: 'monospace' }}>MATH</span>
                        </div>
                    </div>
                </section>

                {/* === SECTION 5: CONTACT === */}
                <section style={{ height: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
                    <div style={{
                        textAlign: 'center', pointerEvents: 'auto', backgroundColor: 'rgba(255,255,255,0.94)',
                        padding: '4rem', backdropFilter: 'blur(12px)', border: '1px solid rgba(0,0,0,0.08)'
                    }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#888', letterSpacing: '0.2em', display: 'block', marginBottom: '1rem' }}>SAY HELLO</span>
                        <h2 style={{ fontSize: '2.5rem', fontFamily: 'var(--font-header)', marginBottom: '2rem', fontWeight: 400 }}>GET IN TOUCH</h2>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap' }}>
                            <a href="mailto:abennett@umass.edu" style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#000', textDecoration: 'none', borderBottom: '1px solid currentColor', paddingBottom: '0.2em' }}>EMAIL</a>
                            <a href="#" style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#000', textDecoration: 'none', borderBottom: '1px solid currentColor', paddingBottom: '0.2em' }}>GITHUB</a>
                            <a href="#" style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#000', textDecoration: 'none', borderBottom: '1px solid currentColor', paddingBottom: '0.2em' }}>LINKEDIN</a>
                        </div>
                    </div>
                </section>
            </div>
        </>
    );
}

export default App;
