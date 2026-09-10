import * as THREE from 'three';

/**
 * Capacity of the GPU particle buffer. Individual shapes may use fewer points;
 * unused slots are held at scale 0 by the animation layer and are never drawn.
 *
 * IMPORTANT: shape generators return their EXACT point count. They must never
 * pad the array, because a padded slot looks like a real target to the morph
 * and gets animated to/from the padding position as a visible dot.
 */
export const POINT_POOL_SIZE = 14000;

/**
 * Spacing of the ambient background lattice, in world units.
 *
 * The morph uses this too: dots entering a model rise out of the nearest
 * intersection of this grid, and dots leaving one settle back onto it, so the
 * field visibly gathers into the object instead of fading in on top of it.
 */
export const AMBIENT_SPACING = 0.62;

/** World-space width every model is fitted into. */
export const MODEL_FRAME_WIDTH = 10.6;

/**
 * Three-quarter presentation, baked into the model rather than staged with the
 * camera.
 *
 * The camera used to swing to an angle to present each model. That works right
 * up until you orbit one: the ambient wall is only perpendicular to the view
 * while the camera is where it started, so returning to it meant watching a
 * flat lattice rotate itself square. Rotating the MODEL instead lets the camera
 * stay a fixed observer, which is the only way the wall can be genuinely static.
 *
 * The rotation is the inverse of the camera placement it replaces, so models
 * present at exactly the angle they did before.
 */
const PRESENTATION_QUAT = (() => {
    const m = new THREE.Matrix4().lookAt(
        new THREE.Vector3(7.6, 6.2, 15.2),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 1, 0)
    );
    return new THREE.Quaternion().setFromRotationMatrix(m).invert();
})();

/** Default number of dots used to represent a model. */
export const MODEL_POINT_BUDGET = 12000;

// ---------------------------------------------------------------------------
// Deterministic RNG. A fixed seed keeps a model's dot cloud identical between
// loads, so the silhouette does not shimmer differently on every visit and
// before/after comparisons are meaningful.
// ---------------------------------------------------------------------------
const mulberry32 = (seed) => () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * Interleave the low 10 bits of x/y/z into a 30-bit Morton code.
 * Sorting points by this key means index i in ANY two clouds refers to roughly
 * the same region of space, which is what lets the morph move each dot a short
 * distance to its target instead of across the whole model.
 */
const part1By2 = (n) => {
    n &= 0x3ff;
    n = (n ^ (n << 16)) & 0xff0000ff;
    n = (n ^ (n << 8)) & 0x0300f00f;
    n = (n ^ (n << 4)) & 0x030c30c3;
    n = (n ^ (n << 2)) & 0x09249249;
    return n;
};
const morton3 = (x, y, z) => part1By2(x) | (part1By2(y) << 1) | (part1By2(z) << 2);

/**
 * Order a cloud along a Z-order curve normalised over its own bounds.
 * Normalising per-cloud (rather than in world units) is deliberate: it makes
 * corresponding features of differently-sized models land on similar indices.
 *
 * Takes and returns a { points, normals } cloud, keeping the two arrays in step.
 */
const sortSpatially = (cloud) => {
    const { points, normals } = cloud;
    if (points.length === 0) return cloud;
    const bb = new THREE.Box3();
    points.forEach((p) => bb.expandByPoint(p));
    const size = new THREE.Vector3();
    bb.getSize(size);
    const sx = size.x > 1e-6 ? 1023 / size.x : 0;
    const sy = size.y > 1e-6 ? 1023 / size.y : 0;
    const sz = size.z > 1e-6 ? 1023 / size.z : 0;

    const order = points.map((p, i) => ({
        i,
        k: morton3(
            Math.min(1023, Math.max(0, Math.round((p.x - bb.min.x) * sx))),
            Math.min(1023, Math.max(0, Math.round((p.y - bb.min.y) * sy))),
            Math.min(1023, Math.max(0, Math.round((p.z - bb.min.z) * sz)))
        ),
    })).sort((a, b) => a.k - b.k);

    return {
        points: order.map((e) => points[e.i]),
        normals: order.map((e) => normals[e.i]),
    };
};

// ---------------------------------------------------------------------------
// Primitive shapes
// ---------------------------------------------------------------------------

export const generateCubePoints = ({ gridSize = [10, 10, 10], spacing = 0.5 }) => {
    const points = [];
    const normals = [];
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
                // Shell only: a solid cube wastes the budget on interior dots
                // that can never be seen.
                const nx = (x === 0 ? -1 : x === xCount - 1 ? 1 : 0);
                const ny = (y === 0 ? -1 : y === yCount - 1 ? 1 : 0);
                const nz = (z === 0 ? -1 : z === zCount - 1 ? 1 : 0);
                if (nx === 0 && ny === 0 && nz === 0) continue;
                points.push(new THREE.Vector3(
                    xOffset + x * spacing + spacing / 2,
                    yOffset + y * spacing + spacing / 2,
                    zOffset + z * spacing + spacing / 2
                ));
                normals.push(new THREE.Vector3(nx, ny, nz).normalize());
            }
        }
    }
    return sortSpatially({ points, normals });
};

export const generateSpherePoints = ({ radius = 5, spacing = 0.5 }) => {
    // Fibonacci sphere: even angular coverage, no polar clustering, and the
    // count follows the surface density implied by `spacing`.
    const count = Math.max(64, Math.round((4 * Math.PI * radius * radius) / (spacing * spacing)));
    const points = [];
    const normals = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
        const y = 1 - (i / (count - 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = golden * i;
        const n = new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r);
        points.push(n.clone().multiplyScalar(radius));
        normals.push(n);
    }
    return sortSpatially({ points, normals });
};

/**
 * The ambient wall.
 *
 * `quat` orients the wall to face the viewer. The wall is meant to read as a
 * fixed surface that dots leave and return to, so it is built square to
 * whatever direction the camera is currently looking from rather than being
 * pinned to world axes. Pinned to world axes it appears tilted after you have
 * orbited a model, and squaring it up again is a visible rotation.
 */
export const generatePlanePoints = ({ width = 50, height = 30, spacing = 1.0, quat = null }) => {
    const points = [];
    const normals = [];
    const xCount = Math.floor(width / spacing);
    const yCount = Math.floor(height / spacing);
    const xOffset = -(xCount * spacing) / 2;
    const yOffset = -(yCount * spacing) / 2;
    for (let x = 0; x < xCount; x++) {
        for (let y = 0; y < yCount; y++) {
            const p = new THREE.Vector3(xOffset + x * spacing, yOffset + y * spacing, 0);
            const n = new THREE.Vector3(0, 0, 1);
            if (quat) { p.applyQuaternion(quat); n.applyQuaternion(quat); }
            points.push(p);
            normals.push(n);
        }
    }
    // Z-order, like every other cloud. Index correspondence is what keeps a
    // dot's journey short: slot i in the ambient field and slot i in a model
    // land in comparable regions of their own bounds, so dots drift into place
    // instead of crossing the whole composition to reach an unrelated target.
    const cloud = sortSpatially({ points, normals });
    // Carried so the morph can snap entry and exit points onto this same
    // surface rather than assuming the wall lies on the world XY plane.
    cloud.wallQuat = quat ? quat.clone() : new THREE.Quaternion();
    return cloud;
};

/**
 * Rotate a cloud so its longest axis runs across the screen, its second
 * longest runs vertically, and its shortest points at the camera.
 *
 * Most of these assemblies are modelled along Z, which meant the camera was
 * looking straight down the length of them: the payload assembly is 8 units
 * long and 2.7 across, and it was presenting as a 2.7-unit circle. Choosing
 * the widest face is the difference between reading "an assembly" and reading
 * "a smudge".
 *
 * Only whole-axis swaps are used, never an arbitrary rotation, so the voxel
 * lattice stays aligned to the axes that the Manhattan morph moves along.
 */
const orientToWidestFace = ({ points, normals }) => {
    if (points.length === 0) return { points, normals };

    const bb = new THREE.Box3();
    points.forEach((p) => bb.expandByPoint(p));
    const size = new THREE.Vector3();
    bb.getSize(size);

    const perm = [0, 1, 2].sort((a, b) => size.getComponent(b) - size.getComponent(a));
    if (perm[0] === 0 && perm[1] === 1) return { points, normals };

    // An odd permutation mirrors the model; flip one axis to keep it a rotation.
    const parity = (perm[0] * 4 + perm[1] * 2 + perm[2]);
    const odd = ![0 * 4 + 1 * 2 + 2, 1 * 4 + 2 * 2 + 0, 2 * 4 + 0 * 2 + 1].includes(parity);
    const flip = odd ? -1 : 1;

    const apply = (v) => new THREE.Vector3(
        v.getComponent(perm[0]),
        v.getComponent(perm[1]),
        v.getComponent(perm[2]) * flip
    );

    return { points: points.map(apply), normals: normals.map(apply) };
};

// ---------------------------------------------------------------------------
// Mesh voxelisation
// ---------------------------------------------------------------------------

/**
 * Convert a mesh into a grid-snapped dot cloud that fills the point budget.
 *
 * The previous implementation had three compounding faults, all fixed here:
 *
 *  1. Fixed 50x50x50 grid normalised to the model's LONGEST axis. Slender
 *     models (the mockup assembly is 10:1) got ~6 cells across their short
 *     axes and collapsed into a dotted line. Now cells are cubic and their
 *     size is solved for, so resolution follows surface area, not aspect ratio.
 *
 *  2. One sample per triangle regardless of triangle size. CAD exports have
 *     wildly uneven tessellation, so large flat plates were represented by a
 *     handful of dots while fillets got hundreds. Now sampling is weighted by
 *     triangle area.
 *
 *  3. Downsampling by sorting on (x+y+z) and taking every Nth point. That is a
 *     diagonal plane sweep, and striding it produced the regular vertical
 *     banding that made models read as scribble. Now the cell size itself is
 *     tuned to hit the budget, so no striding is needed.
 */
export const generateMeshPoints = (geometry, {
    scale = 1,
    budget = MODEL_POINT_BUDGET,
    autoOrient = true,
    fitWidth = MODEL_FRAME_WIDTH,
    fitHeight = 6.2,
    jitter = 0.34,
    shellOnly = true,
    present = true,
} = {}) => {
    const EMPTY = { points: [], normals: [] };
    if (!geometry) return EMPTY;
    const posAttr = geometry.attributes.position;
    if (!posAttr) return EMPTY;

    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const k = 10 / maxDim; // working size; final size is set by the fit step below

    const indexAttr = geometry.index;
    const triCount = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;
    if (triCount < 1) return EMPTY;

    // --- Pass 1: triangle vertices, face normals and areas, in scaled space ---
    const cum = new Float64Array(triCount);
    const tri = new Float32Array(triCount * 9);
    const nrm = new Float32Array(triCount * 3);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), cross = new THREE.Vector3();
    let total = 0;

    for (let i = 0; i < triCount; i++) {
        const i0 = indexAttr ? indexAttr.getX(i * 3) : i * 3;
        const i1 = indexAttr ? indexAttr.getX(i * 3 + 1) : i * 3 + 1;
        const i2 = indexAttr ? indexAttr.getX(i * 3 + 2) : i * 3 + 2;

        a.set((posAttr.getX(i0) - center.x) * k, (posAttr.getY(i0) - center.y) * k, (posAttr.getZ(i0) - center.z) * k);
        b.set((posAttr.getX(i1) - center.x) * k, (posAttr.getY(i1) - center.y) * k, (posAttr.getZ(i1) - center.z) * k);
        c.set((posAttr.getX(i2) - center.x) * k, (posAttr.getY(i2) - center.y) * k, (posAttr.getZ(i2) - center.z) * k);

        const o = i * 9;
        tri[o] = a.x; tri[o + 1] = a.y; tri[o + 2] = a.z;
        tri[o + 3] = b.x; tri[o + 4] = b.y; tri[o + 5] = b.z;
        tri[o + 6] = c.x; tri[o + 7] = c.y; tri[o + 8] = c.z;

        ab.subVectors(b, a); ac.subVectors(c, a);
        cross.crossVectors(ab, ac);
        const len = cross.length();
        const n = i * 3;
        if (len > 1e-12) {
            nrm[n] = cross.x / len; nrm[n + 1] = cross.y / len; nrm[n + 2] = cross.z / len;
        }
        total += len * 0.5;
        cum[i] = total;
    }
    if (total <= 0) return { points: [], normals: [] };

    // --- Pass 2: stratified, area-weighted surface samples ---
    const rand = mulberry32(0x5EED);
    const sampleCount = Math.min(240000, Math.max(40000, budget * 10));
    const sx = new Float32Array(sampleCount);
    const sy = new Float32Array(sampleCount);
    const sz = new Float32Array(sampleCount);
    const snx = new Float32Array(sampleCount);
    const sny = new Float32Array(sampleCount);
    const snz = new Float32Array(sampleCount);

    let cursor = 0;
    for (let s = 0; s < sampleCount; s++) {
        // Stratified position along the cumulative-area axis: one sample per
        // equal slice of surface area, jittered inside its slice.
        const target = ((s + rand()) / sampleCount) * total;
        while (cursor < triCount - 1 && cum[cursor] < target) cursor++;
        const o = cursor * 9;
        const n = cursor * 3;

        let r1 = rand(), r2 = rand();
        if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
        const r0 = 1 - r1 - r2;

        sx[s] = tri[o] * r0 + tri[o + 3] * r1 + tri[o + 6] * r2;
        sy[s] = tri[o + 1] * r0 + tri[o + 4] * r1 + tri[o + 7] * r2;
        sz[s] = tri[o + 2] * r0 + tri[o + 5] * r1 + tri[o + 8] * r2;
        snx[s] = nrm[n]; sny[s] = nrm[n + 1]; snz[s] = nrm[n + 2];
    }

    // Integer cell key. Keeps the hot loops off string allocation, which is
    // what made the original voxelisation cost hundreds of milliseconds.
    const B = 4096, HALF = 2048;
    const keyOf = (cx, cy, cz) => ((cx + HALF) * B + (cy + HALF)) * B + (cz + HALF);

    // --- Pass 3: voxelise at a given cell size, keeping only the outer shell ---
    //
    // These are assemblies, not hollow shells: the excavator alone is 234
    // meshes, most of them buried inside the frame. Sampling every surface
    // means interior geometry is drawn on top of the exterior, and the result
    // reads as a cloud of noise rather than a machine.
    //
    // A cell is kept when it is the first thing an axis-aligned ray from
    // outside would hit, along any of the six axis directions. That keeps the
    // outer surface and anything genuinely visible down a bore or channel,
    // while discarding structure sealed inside. Three linear sweeps, so it
    // costs essentially nothing.
    const buildEntries = (cellSize) => {
        const cells = new Map();
        const iv = 1 / cellSize;
        for (let s = 0; s < sampleCount; s++) {
            const cx = Math.floor(sx[s] * iv);
            const cy = Math.floor(sy[s] * iv);
            const cz = Math.floor(sz[s] * iv);
            const key = keyOf(cx, cy, cz);
            const hit = cells.get(key);
            if (hit) {
                hit[3] += snx[s]; hit[4] += sny[s]; hit[5] += snz[s];
            } else {
                cells.set(key, [cx, cy, cz, snx[s], sny[s], snz[s]]);
            }
        }
        if (!shellOnly) return [...cells.values()];

        // Extremes along each axis line through the volume.
        const lineX = new Map(), lineY = new Map(), lineZ = new Map();
        const track = (map, key, v) => {
            const e = map.get(key);
            if (e) { if (v < e[0]) e[0] = v; if (v > e[1]) e[1] = v; }
            else map.set(key, [v, v]);
        };
        for (const [cx, cy, cz] of cells.values()) {
            track(lineX, cy * B + cz, cx);
            track(lineY, cx * B + cz, cy);
            track(lineZ, cx * B + cy, cz);
        }

        const kept = [];
        for (const e of cells.values()) {
            const [cx, cy, cz] = e;
            const ex = lineX.get(cy * B + cz);
            const ey = lineY.get(cx * B + cz);
            const ez = lineZ.get(cx * B + cy);
            if (cx === ex[0] || cx === ex[1] ||
                cy === ey[0] || cy === ey[1] ||
                cz === ez[0] || cz === ez[1]) kept.push(e);
        }
        return kept;
    };

    // Solve for the cell size that puts the KEPT count near the budget. For a
    // surface, count ~ area / cell^2, so each step scales by sqrt(count/budget).
    let cell = Math.sqrt(total / budget);
    let entries = buildEntries(cell);
    for (let iter = 0; iter < 4; iter++) {
        const ratio = entries.length / budget;
        if (entries.length === 0) { cell *= 0.5; entries = buildEntries(cell); continue; }
        if (ratio > 0.90 && ratio < 1.10) break;
        cell *= Math.sqrt(ratio);
        entries = buildEntries(cell);
    }

    // Trim any overshoot by uniform random removal. Never stride a sorted list:
    // that is what produced the banding in the original implementation.
    if (entries.length > budget) {
        for (let i = entries.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [entries[i], entries[j]] = [entries[j], entries[i]];
        }
        entries = entries.slice(0, budget);
    }

    const points = [];
    const normals = [];
    // A perfectly regular lattice projects into strong moire banding once the
    // cell spacing approaches the dot spacing on screen. A small deterministic
    // offset inside each cell keeps the grid character while removing the
    // interference pattern.
    const j = cell * jitter;
    for (const [cx, cy, cz, nx, ny, nz] of entries) {
        points.push(new THREE.Vector3(
            (cx + 0.5) * cell + (rand() - 0.5) * j,
            (cy + 0.5) * cell + (rand() - 0.5) * j,
            (cz + 0.5) * cell + (rand() - 0.5) * j
        ));
        const n = new THREE.Vector3(nx, ny, nz);
        // A cell straddling a thin wall averages to ~zero; fall back to radial.
        normals.push(n.lengthSq() > 1e-8 ? n.normalize() : new THREE.Vector3(0, 0, 1));
    }

    const oriented = autoOrient ? orientToWidestFace({ points, normals }) : { points, normals };

    // Re-centre: cell snapping shifts the cloud by up to half a cell.
    const bb = new THREE.Box3();
    oriented.points.forEach((p) => bb.expandByPoint(p));
    const mid = new THREE.Vector3();
    bb.getCenter(mid);
    oriented.points.forEach((p) => p.sub(mid));

    // Fit the presented face into a fixed frame, rather than normalising the
    // longest axis to a hand-tuned per-project number. Models here range from a
    // squat gearbox to a 10:1 tube; normalising the long axis made the squat
    // ones tiny. Fitting the frame gives every project the same visual weight
    // as you scroll, which is what makes the sequence feel authored.
    const box = new THREE.Vector3();
    bb.getSize(box);
    if (box.x > 1e-6 && box.y > 1e-6) {
        const s = Math.min(fitWidth / box.x, fitHeight / box.y) * scale;
        oriented.points.forEach((p) => p.multiplyScalar(s));
    }

    if (present) {
        oriented.points.forEach((p) => p.applyQuaternion(PRESENTATION_QUAT));
        oriented.normals.forEach((n) => n.applyQuaternion(PRESENTATION_QUAT));
    }

    return sortSpatially(oriented);
};
