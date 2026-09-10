import { useFrame } from '@react-three/fiber';
import { useRef, useEffect, useState } from 'react';
import { AMBIENT_SPACING } from '../components/Voxelizer';

// Nearest intersection of the ambient background lattice.
const snapToAmbient = (v) => Math.round(v / AMBIENT_SPACING) * AMBIENT_SPACING;

// Axis order permutations for Manhattan movement
const AXIS_ORDERS = [
    [0, 1, 2], // X -> Y -> Z
    [0, 2, 1], // X -> Z -> Y
    [1, 0, 2], // Y -> X -> Z
    [1, 2, 0], // Y -> Z -> X
    [2, 0, 1], // Z -> X -> Y
    [2, 1, 0], // Z -> Y -> X
];

export const useManhattanAnimation = (meshRef, targetCloud, onComplete, viewMode, facingRef) => {
    const [animating, setAnimating] = useState(false);
    const animDataRef = useRef(null);
    const startTimeRef = useRef(-1);
    const spanRef = useRef(1);

    useEffect(() => {
        if (!meshRef.current || !targetCloud || !targetCloud.points) return;

        const targetPoints = targetCloud.points;
        const targetNormals = targetCloud.normals;

        const geometry = meshRef.current.geometry;
        const currentPositions = geometry.attributes.position.array;
        const currentScales = geometry.attributes.aScale.array;
        const currentNormals = geometry.attributes.aNormal.array;
        const targetCount = targetPoints.length;
        // Process ALL particles to handle entrances and exits.
        const totalCount = currentPositions.length / 3;

        // Surface orientation is adopted immediately rather than interpolated.
        // Dots are in flight during the morph, so nobody can perceive the
        // shading being "early", and this keeps the per-frame loop to position
        // and scale only.
        for (let i = 0; i < targetCount && i < totalCount; i++) {
            const n = targetNormals[i];
            currentNormals[i * 3] = n.x;
            currentNormals[i * 3 + 1] = n.y;
            currentNormals[i * 3 + 2] = n.z;
        }
        geometry.attributes.aNormal.needsUpdate = true;

        // Data layout per particle (13 floats):
        // [sX, sY, sZ, tX, tY, tZ, delay, stepDur, ax0, ax1, ax2, startScale, targetScale]
        const data = new Float32Array(totalCount * 13);

        // Pre-calculate center of TARGETS for stagger.
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

        // Radius of the target cloud, used to normalise the stagger.
        //
        // This used to be corrupted by the point-pool padding: unused slots sat
        // at y = -500, so maxDist came out around 500 and every real dot got a
        // delay of ~0.002s. The stagger existed in the code but was invisible,
        // which is why the morph read as one undifferentiated lurch.
        let maxDist = 1e-3;
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
                    //
                    // These dots used to appear at their destination and fade
                    // up in place. Because a model needs far more dots than the
                    // ambient field has, that meant most of the cloud simply
                    // materialised and the Manhattan travel was only visible on
                    // a small minority. The morph read as a pop.
                    //
                    // Now they rise out of the nearest intersection of the
                    // ambient lattice and travel to their place in the form, so
                    // the whole field visibly gathers into the object.
                    sX = snapToAmbient(tX);
                    sY = snapToAmbient(tY);
                    sZ = 0;
                    sScale = 0.0;
                    tScale = 1.0;

                    currentPositions[idx] = sX;
                    currentPositions[idx + 1] = sY;
                    currentPositions[idx + 2] = sZ;
                }
            } else {
                // CASE 3: EXITING (Visible -> Hidden)
                // Settle back down onto the ambient lattice while fading, so
                // leaving a project is the same gesture played backwards.
                sX = currentPositions[idx];
                sY = currentPositions[idx + 1];
                sZ = currentPositions[idx + 2];

                tX = snapToAmbient(sX);
                tY = snapToAmbient(sY);
                tZ = 0;

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
            // Ordered sweep from the middle of the form outwards, with only a
            // little jitter. Too much randomness reads as noise settling; too
            // little reads as a rigid expanding shell.
            const delayBase = (dist / maxDist) * 0.50;

            data[dIdx + 6] = delayBase + Math.random() * 0.07;
            data[dIdx + 7] = 0.19; // Per-axis step duration

            const axisOrder = AXIS_ORDERS[Math.floor(Math.random() * 6)];
            data[dIdx + 8] = axisOrder[0];
            data[dIdx + 9] = axisOrder[1];
            data[dIdx + 10] = axisOrder[2];

            data[dIdx + 11] = sScale;
            data[dIdx + 12] = tScale;
        }

        // Longest delay + travel time, so the shader knows when the cloud has
        // finished arriving and the facing cull can be brought back in.
        let span = 0;
        for (let i = 0; i < totalCount; i++) {
            const end = data[i * 13 + 6] + data[i * 13 + 7] * 3;
            if (end > span) span = end;
        }
        spanRef.current = Math.max(0.001, span);

        if (facingRef) facingRef.current = 0;
        animDataRef.current = data;
        startTimeRef.current = -1;
        setAnimating(true);

    }, [targetCloud, viewMode]);

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
            // Resolve size over the first half of the journey rather than the
            // whole of it. Spread across the full duration, arriving dots were
            // still near-invisible for most of their travel and the frame went
            // briefly empty mid-transition.
            const scaleProgress = Math.min(1, t / (totalDur * 0.5));
            scales[i] = sScale + (tScale - sScale) * smoothStep(scaleProgress);
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.aScale.needsUpdate = true;

        if (facingRef) {
            // Resolve the surface over the back half of the morph.
            const p = elapsed / spanRef.current;
            const f = Math.min(1, Math.max(0, (p - 0.45) / 0.55));
            facingRef.current = f * f * (3 - 2 * f);
        }

        if (!active) {
            setAnimating(false);
            startTimeRef.current = -1;
            if (facingRef) facingRef.current = 1;
            if (onComplete) onComplete();
        }
    });
};
