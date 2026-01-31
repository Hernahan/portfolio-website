/**
 * Project Configuration
 * 
 * Add new projects by adding objects to this array.
 * Place your .glb files in /public/models/ and reference them with modelPath.
 * 
 * For "Deep Dive" modal:
 * - details.partsFolder: exact folder name in public/CAD-more-info/
 * - details.parts: array of part objects with:
 *   - file: GLB filename
 *   - name: Display name for the part
 *   - description: Description shown on hover
 *   - position: Optional [x, y, z] offset for exploded view (defaults to [0, 0, 0])
 */

export const projects = [
    {
        id: 'freshman-payload',
        title: 'Freshman Year Payload Assembly',
        description: 'My first major CAD project from freshman year - a payload assembly design.',
        expandedDescription: 'The first major CAD project I did in college as apart of the UMass rocketry team. Completed with the intended purpose of winning NASA\'s USLI 2024-2025 competition.\n\nOur payload transmitted basic telemetry data throughout the flight, landed <5Gs, and then transmitted a morse code "ALL OK" signal to a NASA ground station. Everything worked as intended, and we were awarded top 6th nationally for USLI 2024-2025.',
        tags: ['CAD', 'SOLIDWORKS'],
        modelPath: '/CAD-files/Freshman year payload assembly.gltf',
        scale: 8,
        pointsPerUnit: 0.3,
        details: {
            partsFolder: 'Freshman Payload Assembly Parts',
            mediaFolder: 'Freshman Payload Assembly Media',
            parts: [
                { file: 'Sled.glb', name: 'Sled', description: 'Base platform for payload electronics', position: [0, -2, 0] },
                { file: 'Sled_electronics_WithDomering.glb', name: 'Electronics Bay', description: 'Houses main electronics with dome ring mount', position: [0, -1, 0] },
                { file: 'Internal_Ring.glb', name: 'Internal Ring', description: 'Structural ring connecting components', position: [0, 0, 0] },
                { file: 'STEMnaught prototype dome base.glb', name: 'Dome Base', description: 'Protective dome structure for payload', position: [0, 1, 0] },
                { file: 'Flinging antenna walkie talkie.glb', name: 'Walkie Talkie Antenna', description: 'Communication antenna for telemetry', position: [1.5, 1.5, 0] },
                { file: 'Flinging antenna Antenna.glb', name: 'Main Antenna', description: 'Primary antenna for long-range communication', position: [-1.5, 1.5, 0] },
            ]
        }
    },
    {
        id: 'excavator-v1',
        title: 'Excavator V1',
        description: 'First iteration of an excavator mechanism design created for USLI 2025-2026.',
        expandedDescription: 'First iteration of an excavator mechanism design created for USLI 2025-2026. Utilized an extracted drill motor to drive a belt (intended to have scoopers attached) with the intended purpose of extracting soil from the landing site.\n\nDropped in favor of a more powerful, less spacially efficient design since space constraints onboard were not as severe as previously observed.',
        tags: ['CAD', 'MECHANICAL'],
        modelPath: '/CAD-files/excavator v1.gltf',
        scale: 8,
        pointsPerUnit: 0.3,
        details: {
            partsFolder: 'Excavator V1 Parts',
            mediaFolder: 'Excavator V1 Media',
            parts: [
                { file: 'belt arm.glb', name: 'Belt Arm', description: 'Main articulated arm with belt drive', position: [0, 0, 0] },
                { file: 'Belt2-6^excavator.glb', name: 'Belt Assembly', description: 'Secondary belt mechanism', position: [2, 0, 0] },
                { file: 'drill motor.glb', name: 'Drill Motor', description: 'Motor powering the excavation drill', position: [-2, 0, 0] },
                { file: 'chuck shaft.glb', name: 'Chuck Shaft', description: 'Shaft connecting motor to drill bit', position: [0, 1.5, 0] },
                { file: 'spur gear_am1.glb', name: 'Experimental FDM Gear', description: 'Gear mechanism for torque transfer', position: [0, -1.5, 0] },
                { file: 'Part15^excavator.glb', name: 'Experimental FDM Belt Tooth', description: 'Structural support component', position: [0, 0, 2] },
            ]
        }
    },
    {
        id: 'excavator-v2',
        title: 'Excavator V2',
        description: 'A more powerful, less spatially efficient version of Excavator V1.',
        expandedDescription: 'A more powerful, less spatially efficient version of Excavator V1. The main difference is the incorporation of the **entire drill**, allowing for the motor be used as a power input as well as an axis of rotation.\n\nLarger, dedicated scoopers for larger extraction volume in the given time limit. Dedicated conveyor belt for soil transport. Double-axis system provides power input to the scooper + belt from a single power source.',
        tags: ['CAD', 'MECHANICAL'],
        modelPath: '/CAD-files/excavator v2.gltf',
        scale: 8,
        pointsPerUnit: 0.3,
        details: {
            partsFolder: 'Excavator V2 Parts',
            mediaFolder: 'Excavator V2 Media',
            parts: [
                { file: 'scooper.glb', name: 'Scooper', description: 'Material collection bucket', position: [0, 2, 0] },
                { file: 'Belt1-7^test excavator.glb', name: 'Soil Transport Belt', description: 'Improved belt drive system', position: [0, 0.5, 0] },
                { file: 'bandbmnfg_17h150-6fs8_.prt.glb', name: 'Custom Timing Gear', description: 'High-torque motor unit', position: [-2, 0, 0] },
                { file: 'milwaukee timing shaft.glb', name: 'Powered Timing Shaft', description: 'Main powered timing shaft', position: [2, 0, 0] },
                { file: 'milwaukee timing shaft (unpowered).glb', name: 'Unpowered Timing Shaft', description: 'Secondary timing shaft', position: [2, -1, 0] },
                { file: 'belt shaft unpowered.glb', name: 'Belt Shaft', description: 'Unpowered belt guide shaft', position: [0, -1, 0] },
                { file: 'unpowered shaft stand.glb', name: 'Shaft Stand', description: 'Support stand for shafts; designed to rotate up/down with the drill serving as the axis of rotation', position: [0, -2, 0] },
            ]
        }
    },
    {
        id: 'mockup-full',
        title: 'Full Mockup Assembly',
        description: 'Supersonic payload design v1, full assembly.',
        expandedDescription: 'Supersonic payload design v1, full assembly. Vibration isolator houses the IMU, with passage for wires from vibration module → communication module. Machined aluminum rails + guider for maximum precision.\n\nAble to achieve trans/low supersonic speeds while delivering accurate telemetry data.',
        tags: ['CAD', 'ASSEMBLY'],
        modelPath: '/CAD-files/MockupFullCAD2USkeletons web file.gltf',
        scale: 12,
        pointsPerUnit: 0.3,
        details: {
            partsFolder: 'Mockup Assembly Parts',
            mediaFolder: 'Mockup Assembly Media',
            parts: [
                { file: 'Tube.glb', name: 'Main Tube', description: 'Primary structural tube housing components', position: [0, 0, 0] },
                { file: 'PayloadRailsTop.glb', name: 'Top Rails', description: 'Upper payload mounting rails', position: [0, 3, 0] },
                { file: 'PayloadRailsBottom.glb', name: 'Bottom Rails', description: 'Lower payload mounting rails', position: [0, -3, 0] },
                { file: '1UCubeSatV.2.glb', name: '1U CubeSat', description: 'Placeholder volume for intended design, final iteration not 100% done yet', position: [0, 0, 2] },
            ]
        }
    },
    {
        id: 'robot-hand',
        title: 'Robotic Hand (In Progress)',
        description: 'Currently in development - an articulated robotic hand project.',
        tags: ['CAD', 'ROBOTICS', 'WIP'],
        // Placeholder - model not yet available
        modelPath: null,
        builtInShape: 'sphere', // Using sphere as placeholder until model is ready
        scale: 5,
        pointsPerUnit: 0.55,
        isPlaceholder: true, // Flag to indicate this is a work-in-progress
        details: null // No deep dive available for placeholder projects
    },
];
