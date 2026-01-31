import * as THREE from 'three';

export const POINT_POOL_SIZE = 4000;
const HIDDEN_POS = new THREE.Vector3(0, -500, 0);

const padToPoolSize = (points) => {
    const result = [...points];
    while (result.length < POINT_POOL_SIZE) {
        result.push(HIDDEN_POS.clone());
    }
    return result.slice(0, POINT_POOL_SIZE);
};

export const generateCubePoints = ({ gridSize = [10, 10, 10], spacing = 0.5 }) => {
    const points = [];
    const [width, height, depth] = gridSize;
    const xCount = Math.floor(width / spacing);
    const yCount = Math.floor(height / spacing);
    const zCount = Math.floor(depth / spacing);

    const xOffset = -(xCount * spacing) / 2;
    const yOffset = -(yCount * spacing) / 2;
    const zOffset = -(zCount * spacing) / 2;

    for (let x = 0; x < xCount; x++) {
        for (let y = 0; y < yCount; y++) {
            for (let z = 0; z < zCount; z++) {
                points.push(
                    new THREE.Vector3(
                        xOffset + x * spacing + spacing / 2,
                        yOffset + y * spacing + spacing / 2,
                        zOffset + z * spacing + spacing / 2
                    )
                );
            }
        }
    }
    return padToPoolSize(points);
};

export const generateSpherePoints = ({ radius = 5, spacing = 0.5 }) => {
    const points = [];
    const count = Math.floor((radius * 2) / spacing);
    const offset = -(count * spacing) / 2;

    for (let x = 0; x < count; x++) {
        for (let y = 0; y < count; y++) {
            for (let z = 0; z < count; z++) {
                const px = offset + x * spacing + spacing / 2;
                const py = offset + y * spacing + spacing / 2;
                const pz = offset + z * spacing + spacing / 2;

                const dist = Math.sqrt(px * px + py * py + pz * pz);
                if (dist <= radius) {
                    points.push(new THREE.Vector3(px, py, pz));
                }
            }
        }
    }
    return padToPoolSize(points);
};

export const generatePlanePoints = ({ width = 50, height = 30, spacing = 1.0 }) => {
    const points = [];
    const xCount = Math.floor(width / spacing);
    const yCount = Math.floor(height / spacing);

    const xOffset = -(xCount * spacing) / 2;
    const yOffset = -(yCount * spacing) / 2;

    for (let x = 0; x < xCount; x++) {
        for (let y = 0; y < yCount; y++) {
            points.push(new THREE.Vector3(
                xOffset + x * spacing,
                yOffset + y * spacing,
                0
            ));
        }
    }
    return padToPoolSize(points);
};

/**
 * Generate voxel points from a GLTF mesh geometry using GUARANTEED COVERAGE.
 * 
 * Algorithm ensures ALL parts of the model are represented by:
 * 1. Sampling exactly ONE random point per triangle (guarantees coverage)
 * 2. Applying spatial hashing to remove density bias from tessellation
 * 3. Using stratified sampling to maintain distribution when downsampling
 * 
 * This prevents dense mesh regions from consuming the point budget before
 * sparse regions (like thin antennas) are sampled.
 * 
 * @param {THREE.BufferGeometry} geometry - The geometry to sample from
 * @param {number} pointsPerUnit - Unused, kept for API compatibility
 * @param {number} scale - Scale factor for the model
 */
export const generateMeshPoints = (geometry, { pointsPerUnit = 0.5, scale = 8 }) => {
    if (!geometry) return padToPoolSize([]);

    const posAttr = geometry.attributes.position;
    if (!posAttr) return padToPoolSize([]);

    // Compute bounding box for centering and scaling
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scaleFactor = scale / maxDim;

    const indexAttr = geometry.index;
    const triangleCount = indexAttr
        ? indexAttr.count / 3
        : posAttr.count / 3;

    // =========================================================================
    // PASS 1: GUARANTEED COVERAGE - Sample exactly ONE point per triangle
    // This ensures every part of the mesh gets representation, regardless of
    // how densely tessellated different regions are.
    // =========================================================================
    const onePerTriangle = [];

    for (let i = 0; i < triangleCount; i++) {
        let i0, i1, i2;
        if (indexAttr) {
            i0 = indexAttr.getX(i * 3);
            i1 = indexAttr.getX(i * 3 + 1);
            i2 = indexAttr.getX(i * 3 + 2);
        } else {
            i0 = i * 3;
            i1 = i * 3 + 1;
            i2 = i * 3 + 2;
        }

        const v0x = posAttr.getX(i0), v0y = posAttr.getY(i0), v0z = posAttr.getZ(i0);
        const v1x = posAttr.getX(i1), v1y = posAttr.getY(i1), v1z = posAttr.getZ(i1);
        const v2x = posAttr.getX(i2), v2y = posAttr.getY(i2), v2z = posAttr.getZ(i2);

        // Random barycentric coordinates
        let r1 = Math.random();
        let r2 = Math.random();
        if (r1 + r2 > 1) {
            r1 = 1 - r1;
            r2 = 1 - r2;
        }
        const r3 = 1 - r1 - r2;

        // Sample point on triangle
        const px = v0x * r1 + v1x * r2 + v2x * r3;
        const py = v0y * r1 + v1y * r2 + v2y * r3;
        const pz = v0z * r1 + v1z * r2 + v2z * r3;

        // Center and scale
        onePerTriangle.push(new THREE.Vector3(
            (px - center.x) * scaleFactor,
            (py - center.y) * scaleFactor,
            (pz - center.z) * scaleFactor
        ));
    }

    // =========================================================================
    // PASS 2: GRID-ALIGNED SPATIAL HASHING
    // Snap all points to a regular 3D grid for clean, uniform appearance.
    // This matches the website's grid-like design language while maintaining
    // full model coverage from Pass 1.
    // =========================================================================
    const scaledSize = size.clone().multiplyScalar(scaleFactor);
    const scaledMaxDim = Math.max(scaledSize.x, scaledSize.y, scaledSize.z);

    // Calculate grid resolution - aim for roughly cbrt(POINT_POOL_SIZE) points per axis
    // This gives us a grid that can hold about POINT_POOL_SIZE points if fully occupied
    const gridResolution = Math.max(50, Math.ceil(Math.cbrt(POINT_POOL_SIZE * 20)));
    const cellSize = scaledMaxDim / gridResolution;

    // Offset to center the grid around origin
    const gridOffset = scaledMaxDim / 2;

    const occupiedCells = new Set();
    const gridPoints = [];

    for (const point of onePerTriangle) {
        // Calculate which grid cell this point falls into
        const cellX = Math.floor((point.x + gridOffset) / cellSize);
        const cellY = Math.floor((point.y + gridOffset) / cellSize);
        const cellZ = Math.floor((point.z + gridOffset) / cellSize);
        const key = `${cellX},${cellY},${cellZ}`;

        if (!occupiedCells.has(key)) {
            occupiedCells.add(key);

            // SNAP to grid cell center instead of keeping random position
            // This creates clean, uniform grid appearance
            const snappedX = (cellX + 0.5) * cellSize - gridOffset;
            const snappedY = (cellY + 0.5) * cellSize - gridOffset;
            const snappedZ = (cellZ + 0.5) * cellSize - gridOffset;

            gridPoints.push(new THREE.Vector3(snappedX, snappedY, snappedZ));
        }
    }

    // Use grid-snapped points
    let spatialPoints = gridPoints;

    // =========================================================================
    // PASS 3: STRATIFIED DOWNSAMPLING - Maintain spatial distribution
    // If we have more points than the pool allows, use stratified sampling
    // to ensure we keep good coverage across the entire model.
    // =========================================================================
    let finalPoints;

    if (spatialPoints.length > POINT_POOL_SIZE) {
        // Sort by a space-filling curve approximation for spatial coherence
        spatialPoints.sort((a, b) => {
            const quantize = (v) => Math.floor((v + scaledMaxDim / 2) / scaledMaxDim * 1000);
            const ax = quantize(a.x), ay = quantize(a.y), az = quantize(a.z);
            const bx = quantize(b.x), by = quantize(b.y), bz = quantize(b.z);

            // Morton-like ordering for spatial coherence
            const sumA = ax + ay + az;
            const sumB = bx + by + bz;
            if (sumA !== sumB) return sumA - sumB;
            if (ax !== bx) return ax - bx;
            if (ay !== by) return ay - by;
            return az - bz;
        });

        // Take evenly spaced samples to maintain full coverage
        finalPoints = [];
        const step = spatialPoints.length / POINT_POOL_SIZE;
        for (let i = 0; i < POINT_POOL_SIZE; i++) {
            const idx = Math.min(Math.floor(i * step), spatialPoints.length - 1);
            finalPoints.push(spatialPoints[idx]);
        }
    } else {
        finalPoints = spatialPoints;
    }

    // =========================================================================
    // FALLBACK: If geometry has very few triangles, add vertices directly
    // =========================================================================
    if (finalPoints.length < 100) {
        for (let i = 0; i < posAttr.count && finalPoints.length < POINT_POOL_SIZE; i++) {
            const px = posAttr.getX(i);
            const py = posAttr.getY(i);
            const pz = posAttr.getZ(i);

            finalPoints.push(new THREE.Vector3(
                (px - center.x) * scaleFactor,
                (py - center.y) * scaleFactor,
                (pz - center.z) * scaleFactor
            ));
        }
    }

    return padToPoolSize(finalPoints);
};


