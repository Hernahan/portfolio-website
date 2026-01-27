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
 * Generate voxel points from a GLTF mesh geometry using surface sampling.
 * Samples random points on the surface of each triangle.
 * @param {THREE.BufferGeometry} geometry - The geometry to sample from
 * @param {number} pointsPerUnit - Approximate points per unit area
 * @param {number} scale - Scale factor for the model
 */
export const generateMeshPoints = (geometry, { pointsPerUnit = 0.5, scale = 8 }) => {
    if (!geometry) return padToPoolSize([]);

    const points = [];
    const posAttr = geometry.attributes.position;
    if (!posAttr) return padToPoolSize([]);

    // Compute bounding box for centering
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

    // Sample points on each triangle
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

        const v0 = new THREE.Vector3(
            posAttr.getX(i0),
            posAttr.getY(i0),
            posAttr.getZ(i0)
        );
        const v1 = new THREE.Vector3(
            posAttr.getX(i1),
            posAttr.getY(i1),
            posAttr.getZ(i1)
        );
        const v2 = new THREE.Vector3(
            posAttr.getX(i2),
            posAttr.getY(i2),
            posAttr.getZ(i2)
        );

        // Calculate triangle area
        const edge1 = new THREE.Vector3().subVectors(v1, v0);
        const edge2 = new THREE.Vector3().subVectors(v2, v0);
        const cross = new THREE.Vector3().crossVectors(edge1, edge2);
        const area = cross.length() * 0.5;

        // Number of points to sample based on area
        const numSamples = Math.max(1, Math.floor(area * pointsPerUnit * scaleFactor * scaleFactor));

        for (let j = 0; j < numSamples; j++) {
            // Barycentric random sampling
            let r1 = Math.random();
            let r2 = Math.random();
            if (r1 + r2 > 1) {
                r1 = 1 - r1;
                r2 = 1 - r2;
            }
            const r3 = 1 - r1 - r2;

            const px = v0.x * r1 + v1.x * r2 + v2.x * r3;
            const py = v0.y * r1 + v1.y * r2 + v2.y * r3;
            const pz = v0.z * r1 + v1.z * r2 + v2.z * r3;

            // Center and scale the point
            const scaledPoint = new THREE.Vector3(
                (px - center.x) * scaleFactor,
                (py - center.y) * scaleFactor,
                (pz - center.z) * scaleFactor
            );

            points.push(scaledPoint);
        }
    }

    // If we have too few points, add vertex positions too
    if (points.length < 100) {
        for (let i = 0; i < posAttr.count; i++) {
            const px = posAttr.getX(i);
            const py = posAttr.getY(i);
            const pz = posAttr.getZ(i);

            const scaledPoint = new THREE.Vector3(
                (px - center.x) * scaleFactor,
                (py - center.y) * scaleFactor,
                (pz - center.z) * scaleFactor
            );
            points.push(scaledPoint);
        }
    }

    return padToPoolSize(points);
};
