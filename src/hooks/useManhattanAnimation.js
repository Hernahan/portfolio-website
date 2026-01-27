import { useFrame } from '@react-three/fiber';
import { useRef, useEffect, useState } from 'react';

// Axis order permutations for Manhattan movement
const AXIS_ORDERS = [
    [0, 1, 2], // X -> Y -> Z
    [0, 2, 1], // X -> Z -> Y
    [1, 0, 2], // Y -> X -> Z
    [1, 2, 0], // Y -> Z -> X
    [2, 0, 1], // Z -> X -> Y
    [2, 1, 0], // Z -> Y -> X
];

export const useManhattanAnimation = (meshRef, targetPoints, onComplete) => {
    const [animating, setAnimating] = useState(false);
    const animDataRef = useRef(null);
    const startTimeRef = useRef(-1);

    useEffect(() => {
        if (!meshRef.current || !targetPoints) return;

        const geometry = meshRef.current.geometry;
        const currentPositions = geometry.attributes.position.array;
        const currentScales = geometry.attributes.aScale.array;
        const targetCount = targetPoints.length;
        // Process ALL particles to handle entrances and exits
        // Assuming geometry has fixed size POINT_POOL_SIZE (passed via meshRef check? No, array length)
        const totalCount = currentPositions.length / 3;

        // Data layout per particle (13 floats):
        // [sX, sY, sZ, tX, tY, tZ, delay, stepDur, ax0, ax1, ax2, startScale, targetScale]
        const data = new Float32Array(totalCount * 13);

        // Pre-calculate center of TARGETS for stagger
        let centerX = 0, centerY = 0, centerZ = 0;
        if (targetCount > 0) {
            for (let i = 0; i < targetCount; i++) {
                centerX += targetPoints[i].x;
                centerY += targetPoints[i].y;
                centerZ += targetPoints[i].z;
            }
            centerX /= targetCount;
            centerY /= targetCount;
            centerZ /= targetCount;
        }

        // Find max distance
        let maxDist = 1;
        if (targetCount > 0) {
            for (let i = 0; i < targetCount; i++) {
                const dx = targetPoints[i].x - centerX;
                const dy = targetPoints[i].y - centerY;
                const dz = targetPoints[i].z - centerZ;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist > maxDist) maxDist = dist;
            }
        }

        for (let i = 0; i < totalCount; i++) {
            const idx = i * 3;
            const dIdx = i * 13;
            const isVisibleStart = currentScales[i] > 0.5;
            const isVisibleEnd = i < targetCount;

            let sX, sY, sZ, tX, tY, tZ;
            let sScale, tScale;

            if (isVisibleEnd) {
                // TARGET POSITION
                tX = targetPoints[i].x;
                tY = targetPoints[i].y;
                tZ = targetPoints[i].z;

                if (isVisibleStart) {
                    // CASE 1: MOVING (Visible -> Visible)
                    sX = currentPositions[idx];
                    sY = currentPositions[idx + 1];
                    sZ = currentPositions[idx + 2];
                    sScale = 1.0;
                    tScale = 1.0;
                } else {
                    // CASE 2: ENTERING (Hidden -> Visible)
                    // Start AT the target position, scale up from 0
                    sX = tX;
                    sY = tY;
                    sZ = tZ;
                    sScale = 0.0;
                    tScale = 1.0;

                    // Init position immediately to target
                    currentPositions[idx] = sX;
                    currentPositions[idx + 1] = sY;
                    currentPositions[idx + 2] = sZ;
                }
            } else {
                // CASE 3: EXITING (Visible -> Hidden)
                // Stay at current position, scale down to 0
                sX = currentPositions[idx];
                sY = currentPositions[idx + 1];
                sZ = currentPositions[idx + 2];

                // Target is same as start (no movement)
                tX = sX; tY = sY; tZ = sZ;

                sScale = isVisibleStart ? 1.0 : 0.0;
                tScale = 0.0;
            }

            // Populate Data
            data[dIdx] = sX;
            data[dIdx + 1] = sY;
            data[dIdx + 2] = sZ;
            data[dIdx + 3] = tX;
            data[dIdx + 4] = tY;
            data[dIdx + 5] = tZ;

            // STAGGER LOGIC
            // Use target position for entering/moving, current for exiting
            const measureX = tX - centerX;
            const measureY = tY - centerY;
            const measureZ = tZ - centerZ;
            const dist = Math.sqrt(measureX * measureX + measureY * measureY + measureZ * measureZ);
            const delayBase = (dist / maxDist) * 0.25;

            data[dIdx + 6] = delayBase + Math.random() * 0.1;
            data[dIdx + 7] = 0.18; // Step duration

            const axisOrder = AXIS_ORDERS[Math.floor(Math.random() * 6)];
            data[dIdx + 8] = axisOrder[0];
            data[dIdx + 9] = axisOrder[1];
            data[dIdx + 10] = axisOrder[2];

            data[dIdx + 11] = sScale;
            data[dIdx + 12] = tScale;
        }

        animDataRef.current = data;
        startTimeRef.current = -1;
        setAnimating(true);

    }, [targetPoints]);

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
        const count = data.length / 13;

        let active = false;
        const ease = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        // Smoother ease for scale
        const smoothStep = (t) => t * t * (3 - 2 * t);

        for (let i = 0; i < count; i++) {
            const dIdx = i * 13;
            const idx = i * 3;
            const delay = data[dIdx + 6];
            const stepDur = data[dIdx + 7]; // For movement
            const totalDur = stepDur * 3;   // Total movement duration
            // Scale duration can match total movement duration

            let t = elapsed - delay;

            if (t < 0) {
                // Before animation starts
                active = true;
                positions[idx] = data[dIdx];
                positions[idx + 1] = data[dIdx + 1];
                positions[idx + 2] = data[dIdx + 2];
                scales[i] = data[dIdx + 11];
                continue;
            }

            // MOVEMENT ANIMATION
            // If start == target (Appearing/Disappearing), this block effectively keeps it stationary
            const start = [data[dIdx], data[dIdx + 1], data[dIdx + 2]];
            const target = [data[dIdx + 3], data[dIdx + 4], data[dIdx + 5]];
            const axisOrder = [data[dIdx + 8], data[dIdx + 9], data[dIdx + 10]];

            if (t >= totalDur) {
                // Finished
                positions[idx] = target[0];
                positions[idx + 1] = target[1];
                positions[idx + 2] = target[2];
                scales[i] = data[dIdx + 12];
                continue;
            }

            active = true;

            // Calc Position
            const current = [...start];
            const step = Math.min(2, Math.floor(t / stepDur));
            const stepProgress = (t - step * stepDur) / stepDur;
            const k = ease(Math.min(1, stepProgress));

            for (let s = 0; s < step; s++) current[axisOrder[s]] = target[axisOrder[s]];
            const currentAxis = axisOrder[step];
            current[currentAxis] = start[currentAxis] + (target[currentAxis] - start[currentAxis]) * k;

            positions[idx] = current[0];
            positions[idx + 1] = current[1];
            positions[idx + 2] = current[2];

            // SCALE ANIMATION
            const sScale = data[dIdx + 11];
            const tScale = data[dIdx + 12];
            // Animate scale over the full duration
            const scaleProgress = Math.min(1, t / totalDur);
            scales[i] = sScale + (tScale - sScale) * smoothStep(scaleProgress);
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.aScale.needsUpdate = true;

        if (!active) {
            setAnimating(false);
            startTimeRef.current = -1;
            if (onComplete) onComplete();
        }
    });
};
