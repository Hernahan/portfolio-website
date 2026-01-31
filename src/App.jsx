import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { WorldGrid } from './components/WorldGrid';
import { ProjectDetailModal } from './components/ProjectDetailModal';
import { projects } from './data/projects';
import gsap from 'gsap';
import './index.css';

function App() {
    const [currentProjectIndex, setCurrentProjectIndex] = useState(-1); // -1 = no project active
    const [viewMode, setViewMode] = useState('LANDING');
    const [layoutLocked, setLayoutLocked] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalProject, setModalProject] = useState(null);
    const [emailCopied, setEmailCopied] = useState(false);
    const scrollThumbRef = useRef(null);
    const headerRef = useRef(null);
    const prevViewModeRef = useRef('LANDING');
    const layoutLockedRef = useRef(false);

    // Calculate scroll thresholds dynamically based on project count
    // HTML structure: Hero (100vh) + About (100vh) + Projects (100vh each) + Contact (100vh)
    const scrollConfig = useMemo(() => {
        const vh = window.innerHeight;

        // Hero section: 0 to 1vh
        const heroEnd = vh * 0.5;  // Header animation completes halfway through hero

        // About section: 1vh to 2vh
        const aboutStart = vh * 0.8;  // Start About mode near end of hero
        const aboutEnd = vh * 1.8;    // End About mode near end of About section

        // Projects section: 2vh to (2 + projectCount)vh
        const projectsStart = vh * 2;  // Each project section starts at its natural position

        // Each project takes 1vh of scroll space, aligned to info box centers
        const projectSections = projects.map((_, i) => ({
            start: projectsStart + (i * vh) - (vh * 0.3),  // Trigger slightly before info box center
            end: projectsStart + ((i + 1) * vh) - (vh * 0.3),
        }));

        // Contact section starts after all projects
        const contactStart = projectsStart + ((projects.length - 1) * vh) + (vh * 0.5);

        // Total page height: hero + about + projects + contact
        const totalHeight = vh + vh + (projects.length * vh) + vh;

        return { heroEnd, aboutStart, aboutEnd, projectsStart, projectSections, contactStart, totalHeight, vh };
    }, []);

    useEffect(() => {
        const handleScroll = () => {
            const scrollY = window.scrollY;
            const { heroEnd, aboutStart, aboutEnd, projectSections, contactStart, vh } = scrollConfig;

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
                    const opacity = Math.max(0, (headerProgress - 0.8) * 5);
                    gsap.to(contactLinks, { opacity: opacity, duration: 0.1 });
                    contactLinks.style.pointerEvents = opacity > 0.5 ? 'auto' : 'none';
                }
            }

            // Determine viewMode and current project index
            let newViewMode, newProjectIndex = -1;

            if (scrollY < aboutStart) {
                newViewMode = 'LANDING';
            } else if (scrollY < aboutEnd) {
                newViewMode = 'ABOUT';
            } else if (scrollY < contactStart) {
                // In projects zone - find which project
                newViewMode = 'PROJECT';
                for (let i = 0; i < projectSections.length; i++) {
                    if (scrollY >= projectSections[i].start && scrollY < projectSections[i].end) {
                        newProjectIndex = i;
                        break;
                    }
                }
                // Handle edge case at very start of projects zone
                if (newProjectIndex === -1 && scrollY >= aboutEnd) {
                    newProjectIndex = 0;
                }
            } else {
                newViewMode = 'CONTACT';
            }

            // Detect CASE 3: Exiting from PROJECT to full-width mode
            const isFullWidthMode = (mode) => mode === 'LANDING' || mode === 'ABOUT' || mode === 'CONTACT';
            const wasProject = prevViewModeRef.current === 'PROJECT';
            const goingToFullWidth = isFullWidthMode(newViewMode);

            if (wasProject && goingToFullWidth && !layoutLockedRef.current) {
                layoutLockedRef.current = true;
                setLayoutLocked(true);
                setIsExiting(true);
            }

            prevViewModeRef.current = newViewMode;
            setViewMode(newViewMode);
            setCurrentProjectIndex(newProjectIndex);

            // Update scroll thumb position directly (no React re-render)
            if (scrollThumbRef.current) {
                const totalScrollable = scrollConfig.totalHeight - window.innerHeight;
                const progress = totalScrollable > 0 ? (scrollY / totalScrollable) * 85 : 0;
                scrollThumbRef.current.style.top = `${Math.min(85, Math.max(0, progress))}%`;
            }
        };

        handleScroll();
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [scrollConfig]);

    // One-time header position initialization
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

    // Modal handlers
    const handleOpenModal = useCallback((project) => {
        if (!project.details) return; // Skip projects without details
        setModalProject(project);
        setIsModalOpen(true);
    }, []);

    const handleCloseModal = useCallback(() => {
        setIsModalOpen(false);
        setModalProject(null);
    }, []);

    // Scroll lock when modal is open
    useEffect(() => {
        if (isModalOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isModalOpen]);

    const isLanding = viewMode === 'LANDING';
    const isProject = viewMode === 'PROJECT';
    const showLeftPanel = isProject;

    // Get current project from config
    const currentProject = currentProjectIndex >= 0 ? projects[currentProjectIndex] : null;

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
                <WorldGrid currentProject={currentProject} viewMode={viewMode} onAnimationComplete={handleAnimationComplete} allProjects={projects} />
            </div>

            {/* LEFT PANEL BACKGROUND - Blocks OrbitControls on left 40% */}
            <div style={{
                position: 'fixed', top: 0, left: 0, width: '40vw', height: '100vh',
                backgroundColor: 'rgba(234, 234, 234, 0.3)', backdropFilter: 'blur(2px)',
                zIndex: 5, opacity: showLeftPanel ? 1 : 0,
                pointerEvents: showLeftPanel ? 'auto' : 'none',
                transition: 'opacity 0.3s ease',
            }} />

            {/* ZONE DIVIDER with Scroll Indicator */}
            <div style={{
                position: 'fixed', top: 0, left: '40%', width: '1px', height: '100%',
                background: 'linear-gradient(to bottom, transparent 5%, rgba(0,0,0,0.15) 50%, transparent 95%)',
                zIndex: 15, pointerEvents: 'none', opacity: showLeftPanel ? 1 : 0,
                transition: 'opacity 0.3s ease',
            }} />

            {/* Scroll Track - Visual scrollbar on left panel edge */}
            <div style={{
                position: 'fixed',
                top: '10%',
                left: 'calc(40% - 6px)',
                width: '4px',
                height: '80%',
                background: 'rgba(0,0,0,0.08)',
                borderRadius: '2px',
                zIndex: 16,
                pointerEvents: 'none',
                opacity: showLeftPanel ? 1 : 0,
                transition: 'opacity 0.3s ease',
            }}>
                {/* Scroll Thumb - Indicates current scroll position */}
                <div
                    ref={scrollThumbRef}
                    style={{
                        position: 'absolute',
                        top: '0%',
                        left: 0,
                        width: '100%',
                        height: '15%',
                        background: 'rgba(0,0,0,0.35)',
                        borderRadius: '2px',
                    }}
                />
            </div>

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
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText('bennettasher7@gmail.com');
                                    setEmailCopied(true);
                                    setTimeout(() => setEmailCopied(false), 2000);
                                }}
                                style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#000', background: 'none', border: 'none', borderBottom: '1px solid currentColor', cursor: 'pointer', padding: 0 }}
                            >{emailCopied ? 'COPIED!' : 'EMAIL'}</button>
                            <a href="https://github.com/Hernahan" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#000', textDecoration: 'none', borderBottom: '1px solid currentColor' }}>GITHUB</a>
                            <a href="https://linkedin.com/in/asherbennett1" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#000', textDecoration: 'none', borderBottom: '1px solid currentColor' }}>LINKEDIN</a>
                            <a href="/Asher_Bennett_Resume (13).pdf" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#000', textDecoration: 'none', borderBottom: '1px solid currentColor' }}>RESUME</a>
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
                            Second-year Mechanical Engineering student at <strong>UMass Amherst</strong> passionate about <em style={{ textDecoration: 'underline' }}>humanoid robotics</em> and <em style={{ textDecoration: 'underline' }}>aerospace</em>. Currently developing a humanoid hand as an interest-based challenge project.
                        </p>

                        <p style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.85rem',
                            lineHeight: 1.9,
                            color: '#333',
                            marginBottom: '1.5rem',
                        }}>
                            I focus on hands-on prototyping to gain the technical skills needed to move a project from a design to a finished, working system.
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

                {/* === DYNAMIC PROJECT SECTIONS === */}
                {projects.map((project, index) => (
                    <section
                        key={project.id}
                        style={{ height: '100vh', width: '100%', display: 'flex', alignItems: 'center', padding: '3rem' }}
                    >
                        <div style={{
                            width: '36%', backgroundColor: 'rgba(255,255,255,0.94)', padding: '2rem', pointerEvents: 'auto',
                            backdropFilter: 'blur(12px)', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 4px 30px rgba(0,0,0,0.04)',
                        }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#888', letterSpacing: '0.15em' }}>
                                PROJECT_{String(index + 1).padStart(2, '0')}
                            </span>
                            <h3 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-header)', margin: '0.5rem 0 0.75rem', fontWeight: 400 }}>
                                {project.title}
                            </h3>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', lineHeight: 1.7, color: '#444' }}>
                                {project.description}
                            </p>
                            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                {project.tags.map((tag, tagIndex) => (
                                    <span
                                        key={tag}
                                        style={{
                                            padding: '0.2rem 0.4rem',
                                            background: tagIndex === 0 ? '#000' : '#f0f0f0',
                                            color: tagIndex === 0 ? '#fff' : '#000',
                                            fontSize: '0.6rem',
                                            fontFamily: 'monospace'
                                        }}
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>

                            {/* More Information Button */}
                            {project.details && (
                                <button
                                    onClick={() => handleOpenModal(project)}
                                    style={{
                                        marginTop: '1.5rem',
                                        padding: '0.6rem 1.2rem',
                                        background: '#000',
                                        color: '#fff',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontFamily: 'monospace',
                                        fontSize: '0.7rem',
                                        letterSpacing: '0.1em',
                                        transition: 'all 0.2s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.target.style.background = '#333';
                                        e.target.style.transform = 'translateY(-1px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.background = '#000';
                                        e.target.style.transform = 'translateY(0)';
                                    }}
                                >
                                    MORE INFORMATION →
                                </button>
                            )}
                        </div>
                    </section>
                ))}

                {/* === CONTACT SECTION === */}
                <section style={{ height: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
                    <div style={{
                        textAlign: 'center', pointerEvents: 'auto', backgroundColor: 'rgba(255,255,255,0.94)',
                        padding: '4rem', backdropFilter: 'blur(12px)', border: '1px solid rgba(0,0,0,0.08)'
                    }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#888', letterSpacing: '0.2em', display: 'block', marginBottom: '1rem' }}>SAY HELLO</span>
                        <h2 style={{ fontSize: '2.5rem', fontFamily: 'var(--font-header)', marginBottom: '2rem', fontWeight: 400 }}>GET IN TOUCH</h2>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText('bennettasher7@gmail.com');
                                    setEmailCopied(true);
                                    setTimeout(() => setEmailCopied(false), 2000);
                                }}
                                style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#000', background: 'none', border: 'none', borderBottom: '1px solid currentColor', cursor: 'pointer', padding: 0, paddingBottom: '0.2em' }}
                            >{emailCopied ? 'COPIED!' : 'EMAIL'}</button>
                            <a href="https://github.com/Hernahan" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#000', textDecoration: 'none', borderBottom: '1px solid currentColor', paddingBottom: '0.2em' }}>GITHUB</a>
                            <a href="https://linkedin.com/in/asherbennett1" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#000', textDecoration: 'none', borderBottom: '1px solid currentColor', paddingBottom: '0.2em' }}>LINKEDIN</a>
                            <a href="/Asher_Bennett_Resume (13).pdf" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#000', textDecoration: 'none', borderBottom: '1px solid currentColor', paddingBottom: '0.2em' }}>RESUME</a>
                        </div>
                    </div>
                </section>
            </div>

            {/* Deep Dive Modal */}
            <ProjectDetailModal
                project={modalProject}
                isOpen={isModalOpen}
                onClose={handleCloseModal}
            />
        </>
    );
}

export default App;
