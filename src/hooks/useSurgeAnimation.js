import { useFrame } from '@react-three/fiber';
import { useRef, useEffect, useState } from 'react';

/**
 * Surge Animation Hook
 * 
 * Animates particles outward (surge) or inward (collapse) from/to center.
 * Used for the "Manhattan" page transition when opening/closing the Deep Dive modal.
 * 
 * @param {React.RefObject} meshRef - Reference to the points mesh
 * @param {boolean} surging - True to surge outward, false to collapse inward
 * @param {Function} onComplete - Callback when animation finishes
 */
export const useSurgeAnimation = (meshRef, surging, onComplete) => {
    const [animating, setAnimating] = useState(false);
    const animDataRef = useRef(null);
    const startTimeRef = useRef(-1);
    const prevSurgingRef = useRef(null);

    useEffect(() => {
        // Only trigger when surging state changes
        if (prevSurgingRef.current === surging) return;
        prevSurgingRef.current = surging;

        if (!meshRef.current) return;

        const geometry = meshRef.current.geometry;
        const currentPositions = geometry.attributes.position.array;
        const currentScales = geometry.attributes.aScale.array;
        const totalCount = currentPositions.length / 3;

        // Data layout per particle (8 floats):
        // [sX, sY, sZ, velX, velY, velZ, delay, startScale]
        const data = new Float32Array(totalCount * 8);

        // Center point for radial expansion
        const centerX = 0, centerY = 0, centerZ = 0;

        // Calculate max distance for stagger normalization
        let maxDist = 1;
        for (let i = 0; i < totalCount; i++) {
            const idx = i * 3;
            if (currentScales[i] < 0.1) continue; // Skip invisible particles

            const dx = currentPositions[idx] - centerX;
            const dy = currentPositions[idx + 1] - centerY;
            const dz = currentPositions[idx + 2] - centerZ;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist > maxDist) maxDist = dist;
        }

        const surgeSpeed = 80; // Units per second for surge velocity
        const surgeDuration = 0.8; // Total animation duration

        for (let i = 0; i < totalCount; i++) {
            const idx = i * 3;
            const dIdx = i * 8;

            const x = currentPositions[idx];
            const y = currentPositions[idx + 1];
            const z = currentPositions[idx + 2];
            const scale = currentScales[i];

            // Direction from center
            const dx = x - centerX;
            const dy = y - centerY;
            const dz = z - centerZ;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

            // Normalize direction
            const dirX = dx / dist;
            const dirY = dy / dist;
            const dirZ = dz / dist;

            // Start position
            data[dIdx] = x;
            data[dIdx + 1] = y;
            data[dIdx + 2] = z;

            if (surging) {
                // Surge OUT: velocity pushes away from center
                data[dIdx + 3] = dirX * surgeSpeed;
                data[dIdx + 4] = dirY * surgeSpeed;
                data[dIdx + 5] = dirZ * surgeSpeed;
            } else {
                // Surge IN: velocity pulls toward center (reverse)
                data[dIdx + 3] = -dirX * surgeSpeed * 0.5;
                data[dIdx + 4] = -dirY * surgeSpeed * 0.5;
                data[dIdx + 5] = -dirZ * surgeSpeed * 0.5;
            }

            // Stagger: closer particles start first when surging
            const normalizedDist = dist / maxDist;
            data[dIdx + 6] = surging
                ? (1 - normalizedDist) * 0.2 // Center particles start first on surge
                : normalizedDist * 0.2;      // Edge particles return first on collapse

            // Store starting scale
            data[dIdx + 7] = scale;
        }

        animDataRef.current = data;
        startTimeRef.current = -1;
        setAnimating(true);

    }, [surging, meshRef]);

    useFrame((state) => {
        if (!animating || !animDataRef.current || !meshRef.current) return;

        if (startTimeRef.current === -1) {
            startTimeRef.current = state.clock.elapsedTime;
        }

        const elapsed = state.clock.elapsedTime - startTimeRef.current;
        const data = animDataRef.current;
        const geometry = meshRef.current.geometry;
        const positions = geometry.attributes.position.array;
        const scales = geometry.attributes.aScale.array;
        const count = data.length / 8;

        const totalDuration = 0.8;
        let active = false;

        // Smooth easing
        const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);

        for (let i = 0; i < count; i++) {
            const dIdx = i * 8;
            const idx = i * 3;

            const delay = data[dIdx + 6];
            const startScale = data[dIdx + 7];

            let t = elapsed - delay;

            if (t < 0) {
                // Before animation starts - keep at start position
                active = true;
                continue;
            }

            const progress = Math.min(1, t / (totalDuration - delay));
            const easedProgress = easeOutQuad(progress);

            if (progress >= 1) {
                // Animation complete for this particle
                if (surging) {
                    scales[i] = 0; // Fade out when surging
                } else {
                    scales[i] = startScale; // Restore when collapsing
                }
                continue;
            }

            active = true;

            // Apply velocity-based movement
            const velX = data[dIdx + 3];
            const velY = data[dIdx + 4];
            const velZ = data[dIdx + 5];

            positions[idx] = data[dIdx] + velX * easedProgress * 0.5;
            positions[idx + 1] = data[dIdx + 1] + velY * easedProgress * 0.5;
            positions[idx + 2] = data[dIdx + 2] + velZ * easedProgress * 0.5;

            // Scale animation
            if (surging) {
                scales[i] = startScale * (1 - easedProgress); // Fade out
            } else {
                scales[i] = startScale * easedProgress; // Fade in
            }
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.aScale.needsUpdate = true;

        if (!active) {
            setAnimating(false);
            startTimeRef.current = -1;
            if (onComplete) onComplete();
        }
    });

    return { animating };
};
