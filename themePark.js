/**
 * Standalone Theme Park district — isolated from RepoVerse systems.
 * Visual polish only; attraction world positions are unchanged.
 */

import * as THREE from "three";

/** Dedicated world-space bounds (not city grid coordinates). */
export const THEME_PARK_BOUNDS = {
    minX: -46,
    maxX: 56,
    minZ: 46,
    maxZ: 40,
    groundY: 0.06,
};

const FILL_RATIO = 0.85;

/** Minimum gap between decorative props (world units). */
const PROP_SPACING = 3.5;

/** Cohesive family-friendly palette. */
const COLORS = {
    path: 0xd4b896,
    pathBorder: 0xb8956a,
    pathCurb: 0x9a7b56,
    boardBase: 0x7a5c3e,
    plankLight: 0xc9a66b,
    plankDark: 0xa67c52,
    plankGrain: 0xb8956a,
    railWood: 0x6d4c3d,
    grass: 0x52b788,
    grassDark: 0x3d9970,
    fence: 0xe9ecef,
    fencePost: 0x495057,
    coral: 0xff6b6b,
    cherry: 0xff4757,
    sunshine: 0xffd93d,
    tangerine: 0xff922b,
    sky: 0x4dabf7,
    ocean: 0x339af0,
    mint: 0x63e6be,
    lavender: 0xb197fc,
    grape: 0x9775fa,
    cream: 0xfff9db,
    white: 0xfffdf8,
    navy: 0x364fc7,
    teal: 0x20c997,
    pink: 0xff8fab,
    warmWood: 0xa67c52,
    dark: 0x343a40,
    metal: 0x868e96,
    light: 0xffe066,
    soil: 0x6d4c3d,
    bush: 0x40916c,
    tentRed: 0xfa5252,
    tentWhite: 0xfff5f5,
};

let themeParkRoot = null;
const animatables = [];

function innerBounds() {
    const { minX, maxX, minZ, maxZ } = THEME_PARK_BOUNDS;
    const w = maxX - minX;
    const d = maxZ - minZ;
    const mx = (1 - FILL_RATIO) * 0.5;
    return {
        minX: minX + w * mx,
        maxX: maxX - w * mx,
        minZ: minZ + d * mx,
        maxZ: maxZ - d * mx,
        cx: (minX + maxX) * 0.5,
        cz: (minZ + maxZ) * 0.5,
    };
}

function addShadow(mesh, cast = true, receive = true) {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    if (mesh.children) {
        for (const child of mesh.children) addShadow(child, cast, receive);
    }
}

function makeMat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
        color,
        flatShading: true,
        roughness: 0.82,
        metalness: 0.04,
        ...opts,
    });
}

function makeMetal(color = COLORS.metal) {
    return makeMat(color, { roughness: 0.38, metalness: 0.72 });
}

function makeGlow(color, intensity = 0.7) {
    return makeMat(color, {
        emissive: color,
        emissiveIntensity: intensity,
        roughness: 0.35,
    });
}

function getLandBounds() {
    const { minX, maxX, minZ, maxZ } = THEME_PARK_BOUNDS;
    return {
        minX: Math.min(minX, maxX),
        maxX: Math.max(minX, maxX),
        minZ: Math.min(minZ, maxZ),
        maxZ: Math.max(minZ, maxZ),
    };
}

function getAttractionNodes(b) {
    return [
        { x: b.cx, z: b.maxZ - 2.5 },
        { x: b.cx, z: b.minZ + 6 },
        { x: b.maxX - 14, z: b.cz },
        { x: b.minX + 12, z: b.cz - 1 },
        { x: b.maxX - 10, z: b.maxZ - 5 },
        { x: b.minX + 16, z: b.cz + 2 },
    ];
}

function createPathSegment(x, z, w, d) {
    const g = new THREE.Group();
    const walk = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.06, d),
        makeMat(COLORS.path, { roughness: 0.92 }),
    );
    walk.position.y = 0.03;
    g.add(walk);
    const slabW = Math.min(w * 0.92, w - 0.2);
    const slabD = Math.min(d * 0.88, d - 0.2);
    const slab = new THREE.Mesh(
        new THREE.BoxGeometry(slabW, 0.04, slabD),
        makeMat(COLORS.pathBorder, { roughness: 0.88 }),
    );
    slab.position.y = 0.055;
    g.add(slab);
    const curbT = 0.14;
    for (const [ox, oz, cw, cd] of [
        [0, d / 2 - curbT / 2, w, curbT],
        [0, -d / 2 + curbT / 2, w, curbT],
        [w / 2 - curbT / 2, 0, curbT, d],
        [-w / 2 + curbT / 2, 0, curbT, d],
    ]) {
        const curb = new THREE.Mesh(
            new THREE.BoxGeometry(cw, 0.08, cd),
            makeMat(COLORS.pathCurb),
        );
        curb.position.set(ox, 0.04, oz);
        g.add(curb);
    }
    g.position.set(x, THEME_PARK_BOUNDS.groundY + 0.02, z);
    addShadow(g, false, true);
    return g;
}

function addClampedPath(parent, land, cx, cz, sizeX, sizeZ) {
    const pad = 1;
    const halfX = sizeX / 2;
    const halfZ = sizeZ / 2;
    const loX = Math.max(cx - halfX, land.minX + pad);
    const hiX = Math.min(cx + halfX, land.maxX - pad);
    const loZ = Math.max(cz - halfZ, land.minZ + pad);
    const hiZ = Math.min(cz + halfZ, land.maxZ - pad);
    const w = hiX - loX;
    const d = hiZ - loZ;
    if (w < 0.4 || d < 0.4) return;
    parent.add(createPathSegment((loX + hiX) / 2, (loZ + hiZ) / 2, w, d));
}

function addPathBetween(parent, land, x1, z1, x2, z2, thickness = 1.1) {
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    const dx = Math.abs(x2 - x1);
    const dz = Math.abs(z2 - z1);
    if (dx < 0.3 && dz < 0.3) return;
    if (dx >= dz) {
        addClampedPath(parent, land, cx, cz, dx + thickness * 0.5, thickness);
    } else {
        addClampedPath(parent, land, cx, cz, thickness, dz + thickness * 0.5);
    }
}

/** Sand-strip promenade between palm row (beach) and attractions. */
function getPromenadeStrip(land) {
    const padX = 0.5;
    const depth = Math.min(3.6, (land.maxZ - land.minZ) * 0.58);
    return {
        minX: land.minX + padX,
        maxX: land.maxX - padX,
        minZ: land.maxZ - depth,
        maxZ: land.maxZ - 0.25,
        depth,
        cx: (land.minX + land.maxX) / 2,
        cz: land.maxZ - depth / 2 - 0.15,
        width: land.maxX - land.minX - padX * 2,
    };
}

function createBoardwalkSurface(parent, strip) {
    const y = THEME_PARK_BOUNDS.groundY + 0.03;
    const base = new THREE.Mesh(
        new THREE.BoxGeometry(strip.width, 0.07, strip.depth),
        makeMat(COLORS.boardBase, { roughness: 0.92 }),
    );
    base.position.set(strip.cx, y, strip.cz);
    base.receiveShadow = true;
    parent.add(base);

    const plankSpan = strip.depth * 0.94;
    const plankCount = Math.ceil(strip.width / 0.72);
    for (let i = 0; i < plankCount; i++) {
        const px = strip.minX + i * 0.72 + 0.36;
        if (px > strip.maxX) break;
        const plank = new THREE.Mesh(
            new THREE.BoxGeometry(0.68, 0.045, plankSpan),
            makeMat(i % 2 === 0 ? COLORS.plankLight : COLORS.plankDark, {
                roughness: 0.86,
            }),
        );
        plank.position.set(px, y + 0.055, strip.cz);
        plank.receiveShadow = true;
        parent.add(plank);
    }

    for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(
            new THREE.BoxGeometry(strip.width, 0.1, 0.12),
            makeMat(COLORS.railWood, { roughness: 0.8 }),
        );
        rail.position.set(
            strip.cx,
            y + 0.12,
            strip.cz + side * (strip.depth / 2 - 0.08),
        );
        parent.add(rail);
    }
}

function createFlowerPlanter(x, z) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.55, 1.1),
        makeMat(COLORS.railWood),
    );
    box.position.y = 0.28;
    g.add(box);
    const soil = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 0.2, 0.95),
        makeMat(COLORS.soil),
    );
    soil.position.y = 0.52;
    g.add(soil);
    const palette = [COLORS.pink, COLORS.sunshine, COLORS.coral];
    for (let i = 0; i < 5; i++) {
        const flower = new THREE.Mesh(
            new THREE.SphereGeometry(0.11, 5, 5),
            makeMat(palette[i % palette.length]),
        );
        flower.position.set(
            ((i % 3) - 1) * 0.25,
            0.68,
            (Math.floor(i / 3) - 0.5) * 0.25,
        );
        g.add(flower);
    }
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    return g;
}

function createSnackCart(x, z) {
    const g = new THREE.Group();
    const cart = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.9, 1),
        makeMat(COLORS.sunshine),
    );
    cart.position.y = 0.55;
    g.add(cart);
    const umbrella = new THREE.Mesh(
        new THREE.ConeGeometry(1.1, 0.45, 8),
        makeMat(COLORS.cherry),
    );
    umbrella.position.y = 1.35;
    g.add(umbrella);
    for (const side of [-0.45, 0.45]) {
        const wheel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.18, 0.1, 8),
            makeMat(COLORS.dark),
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side, 0.18, 0.35);
        g.add(wheel);
    }
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    return g;
}

function createDirectionSign(x, z, color = COLORS.sky) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.08, 2.4, 6),
        makeMetal(),
    );
    post.position.y = 1.2;
    g.add(post);
    const arrow = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.55, 0.08),
        makeMat(color),
    );
    arrow.position.set(0.35, 2, 0);
    g.add(arrow);
    const arrowHead = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.35, 4),
        makeMat(color),
    );
    arrowHead.rotation.z = -Math.PI / 2;
    arrowHead.position.set(0.85, 2, 0);
    g.add(arrowHead);
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    return g;
}

function buildFrontPromenade(parent, b) {
    const land = getLandBounds();
    const strip = getPromenadeStrip(land);
    createBoardwalkSurface(parent, strip);

    const northZ = strip.minZ + 0.45;
    const southZ = strip.maxZ - 0.35;
    const amenityXs = [];
    for (let x = strip.minX + 4; x < strip.maxX - 2; x += 9) {
        amenityXs.push(x);
    }

    amenityXs.forEach((x, i) => {
        if (i % 3 === 0) parent.add(createLightPole(x, strip.cz));
        if (i % 4 === 1) parent.add(createBench(x, northZ, 0));
        if (i % 4 === 2) parent.add(createFlowerPlanter(x, southZ));
        if (i % 5 === 0) {
            parent.add(createBalloon(x + 1.2, strip.cz, COLORS.coral, 2.8));
        }
        if (i % 6 === 3) parent.add(createSnackCart(x, northZ + 0.3));
        if (i % 7 === 2) parent.add(createTrashCan(x, southZ));
        if (i % 8 === 5) parent.add(createKiosk(x, strip.cz));
        if (i % 9 === 4) parent.add(createTicketBooth(x, northZ));
        if (i % 5 === 2) {
            parent.add(createDirectionSign(x, strip.cz, COLORS.teal));
        }
    });

    parent.add(createDirectionSign(strip.minX + 3, strip.cz, COLORS.cherry));
    parent.add(createDirectionSign(strip.maxX - 3, strip.cz, COLORS.lavender));
}

function buildPathNetwork(parent, b) {
    const land = getLandBounds();
    const pad = 1;
    const landW = land.maxX - land.minX - pad * 2;
    const landD = land.maxZ - land.minZ - pad * 2;
    const nodes = getAttractionNodes(b);
    const strip = getPromenadeStrip(land);

    addClampedPath(
        parent,
        land,
        b.cx,
        b.minZ + landD * 0.35,
        landW * 0.7,
        Math.min(1.2, landD * 0.28),
    );

    for (const node of nodes) {
        if (node.z > strip.minZ - 0.5) continue;
        addPathBetween(parent, land, b.cx, b.cz, node.x, node.z, 0.95);
    }
}

function createBench(x, z, rotY = 0) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.14, 0.55),
        makeMat(COLORS.warmWood),
    );
    seat.position.y = 0.38;
    g.add(seat);
    for (const side of [-0.58, 0.58]) {
        const leg = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.38, 0.48),
            makeMat(COLORS.dark),
        );
        leg.position.set(side, 0.19, 0);
        g.add(leg);
    }
    const back = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.5, 0.1),
        makeMat(COLORS.cherry),
    );
    back.position.set(0, 0.65, -0.22);
    g.add(back);
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    g.rotation.y = rotY;
    addShadow(g);
    return g;
}

function createDecorativeTree(x, z, scale = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14 * scale, 0.2 * scale, 1.4 * scale, 7),
        makeMat(COLORS.warmWood),
    );
    trunk.position.y = 0.7 * scale;
    g.add(trunk);
    const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.75 * scale, 8, 7),
        makeMat(COLORS.grass),
    );
    canopy.position.y = 1.65 * scale;
    canopy.scale.y = 1.15;
    g.add(canopy);
    const canopyHi = new THREE.Mesh(
        new THREE.SphereGeometry(0.5 * scale, 7, 6),
        makeMat(COLORS.bush),
    );
    canopyHi.position.y = 2.1 * scale;
    g.add(canopyHi);
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    return g;
}

function createBush(x, z, scale = 1) {
    const g = new THREE.Group();
    const bush = new THREE.Mesh(
        new THREE.SphereGeometry(0.45 * scale, 7, 6),
        makeMat(COLORS.bush),
    );
    bush.position.y = 0.3 * scale;
    bush.scale.y = 0.75;
    g.add(bush);
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    return g;
}

function createFlowerBed(x, z, w = 2, d = 1.2) {
    const g = new THREE.Group();
    const bed = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.1, d),
        makeMat(COLORS.soil),
    );
    bed.position.y = 0.05;
    g.add(bed);
    const rim = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.1, 0.06, d + 0.1),
        makeMat(COLORS.warmWood),
    );
    rim.position.y = 0.02;
    g.add(rim);
    const palette = [
        COLORS.pink,
        COLORS.sunshine,
        COLORS.lavender,
        COLORS.coral,
    ];
    for (let i = 0; i < 10; i++) {
        const flower = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 5, 5),
            makeMat(palette[i % palette.length]),
        );
        const fx = ((i % 5) / 4 - 0.5) * (w - 0.5);
        const fz = (Math.floor(i / 5) - 0.5) * (d - 0.4);
        flower.position.set(fx, 0.2, fz);
        g.add(flower);
    }
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g, false, true);
    return g;
}

function createTicketBooth(x, z) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 1.5, 1.3),
        makeMat(COLORS.sky),
    );
    base.position.y = 0.75;
    g.add(base);
    const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(1.75, 0.25, 1.35),
        makeMat(COLORS.sunshine),
    );
    stripe.position.y = 1.2;
    g.add(stripe);
    const roof = new THREE.Mesh(
        new THREE.ConeGeometry(1.4, 0.9, 4),
        makeMat(COLORS.cherry),
    );
    roof.position.y = 1.85;
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    const window = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.65, 0.06),
        makeMat(COLORS.cream),
    );
    window.position.set(0, 0.9, 0.68);
    g.add(window);
    const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.35, 0.08),
        makeMat(COLORS.sunshine),
    );
    sign.position.set(0, 1.45, 0.72);
    g.add(sign);
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    return g;
}

function createWelcomeArch(x, z) {
    const g = new THREE.Group();
    for (const side of [-2.6, 2.6]) {
        const pillar = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 4.8, 0.6),
            makeMat(COLORS.lavender),
        );
        pillar.position.set(side, 2.4, 0);
        g.add(pillar);
        const base = new THREE.Mesh(
            new THREE.BoxGeometry(0.85, 0.35, 0.85),
            makeMat(COLORS.pathCurb),
        );
        base.position.set(side, 0.18, 0);
        g.add(base);
        const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(0.65, 0.35, 0.65),
            makeMat(COLORS.sunshine),
        );
        stripe.position.set(side, 1.3, 0);
        g.add(stripe);
    }
    const beam = new THREE.Mesh(
        new THREE.BoxGeometry(5.8, 0.75, 0.7),
        makeMat(COLORS.sunshine),
    );
    beam.position.y = 4.6;
    g.add(beam);
    const sign = new THREE.Mesh(
        new THREE.BoxGeometry(3.8, 1.1, 0.2),
        makeMat(COLORS.cherry),
    );
    sign.position.set(0, 3.6, 0);
    g.add(sign);
    const marquee = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 0.25, 0.12),
        makeGlow(COLORS.light, 0.5),
    );
    marquee.position.set(0, 4.1, 0.12);
    g.add(marquee);
    animatables.push({
        type: "pulse",
        material: marquee.material,
        min: 0.35,
        max: 0.9,
        speed: 1.8,
        phase: 0,
    });
    for (const side of [-2.2, 2.2]) {
        const flag = createFlag(0, 0, COLORS.sky);
        flag.position.set(side, 0, 0.5);
        flag.scale.set(1.2, 1.2, 1.2);
        g.add(flag);
    }
    const rope = createQueueRail(3);
    rope.position.set(0, 0, 2.5);
    g.add(rope);
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    return g;
}

function createFlag(x, z, color) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.04, 1.6, 4),
        makeMat(COLORS.metal),
    );
    pole.position.y = 0.8;
    g.add(pole);
    const cloth = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.4, 0.04),
        makeMat(color),
    );
    cloth.position.set(0.35, 1.3, 0);
    g.add(cloth);
    return g;
}

function createQueueRail(length) {
    const g = new THREE.Group();
    for (const side of [-0.55, 0.55]) {
        const rail = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.9, length),
            makeMetal(),
        );
        rail.position.set(side, 0.45, 0);
        g.add(rail);
    }
    for (let i = 0; i < Math.floor(length); i++) {
        const post = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 0.07, 0.07),
            makeMetal(),
        );
        post.position.set(0, 0.55 + (i % 2) * 0.15, -length / 2 + i + 0.5);
        g.add(post);
    }
    return g;
}

function createRideSign(x, z, color = COLORS.cherry) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 2.6, 0.12),
        makeMetal(),
    );
    post.position.y = 1.3;
    g.add(post);
    const board = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.9, 0.1),
        makeMat(color),
    );
    board.position.y = 2.3;
    g.add(board);
    const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 5, 5),
        makeGlow(COLORS.light, 0.5),
    );
    bulb.position.set(0.6, 2.5, 0.08);
    g.add(bulb);
    animatables.push({
        type: "pulse",
        material: bulb.material,
        min: 0.3,
        max: 0.85,
        speed: 2.8,
        phase: x,
    });
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    return g;
}

function createTrashCan(x, z) {
    const g = new THREE.Group();
    const can = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.26, 0.65, 8),
        makeMetal(COLORS.fencePost),
    );
    can.position.y = 0.32;
    g.add(can);
    const lid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.27, 0.27, 0.08, 8),
        makeMat(COLORS.dark),
    );
    lid.position.y = 0.66;
    g.add(lid);
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    return g;
}

function createParkFence(parent, land) {
    const pad = 0.6;
    const y = THEME_PARK_BOUNDS.groundY + 0.14;
    const w = land.maxX - land.minX - pad * 2;
    const d = land.maxZ - land.minZ - pad * 2;
    const cx = (land.minX + land.maxX) / 2;
    const cz = (land.minZ + land.maxZ) / 2;

    for (const [fx, fz, fw, fd] of [
        [cx, land.minZ + pad, w, 0.12],
        [cx, land.maxZ - pad, w, 0.12],
        [land.minX + pad, cz, 0.12, d],
        [land.maxX - pad, cz, 0.12, d],
    ]) {
        const rail = new THREE.Mesh(
            new THREE.BoxGeometry(fw, 0.14, fd),
            makeMat(COLORS.fence),
        );
        rail.position.set(fx, y, fz);
        parent.add(rail);
    }

    const step = 6;
    for (let x = land.minX + pad; x <= land.maxX - pad; x += step) {
        for (const z of [land.minZ + pad, land.maxZ - pad]) {
            const post = new THREE.Mesh(
                new THREE.BoxGeometry(0.14, 0.55, 0.14),
                makeMat(COLORS.fencePost),
            );
            post.position.set(x, y + 0.2, z);
            parent.add(post);
        }
    }
}

function buildParkScenery(parent, b) {
    const land = getLandBounds();
    createParkFence(parent, land);

    const turf = new THREE.Mesh(
        new THREE.BoxGeometry(
            land.maxX - land.minX - 1.5,
            0.03,
            land.maxZ - land.minZ - 1.5,
        ),
        makeMat(COLORS.grassDark, { roughness: 0.95 }),
    );
    turf.position.set(
        (land.minX + land.maxX) / 2,
        THEME_PARK_BOUNDS.groundY + 0.005,
        (land.minZ + land.maxZ) / 2,
    );
    turf.receiveShadow = true;
    parent.add(turf);

    const signSpots = [
        [b.cx, b.maxZ - 4],
        [b.cx, b.minZ + 4],
    ];
    for (const [sx, sz] of signSpots) {
        parent.add(createRideSign(sx + 2.5, sz));
    }

    parent.add(createTrashCan(b.cx - 3, b.cz + 2));
    parent.add(createTrashCan(b.cx + 3, b.cz - 2));

    for (const lx of [b.cx - 18, b.cx + 18]) {
        const lights = createStringLights(3.5);
        lights.position.set(lx, THEME_PARK_BOUNDS.groundY + 3.2, b.cz);
        parent.add(lights);
    }
}

function createStringLights(span) {
    const g = new THREE.Group();
    const cable = new THREE.Mesh(
        new THREE.BoxGeometry(span, 0.04, 0.04),
        makeMetal(COLORS.dark),
    );
    g.add(cable);
    for (let i = 0; i < 6; i++) {
        const bulb = new THREE.Mesh(
            new THREE.SphereGeometry(0.09, 5, 5),
            makeGlow(i % 2 === 0 ? COLORS.light : COLORS.coral, 0.45),
        );
        bulb.position.set(-span / 2 + (i / 5) * span, -0.18, 0);
        g.add(bulb);
        animatables.push({
            type: "pulse",
            material: bulb.material,
            min: 0.25,
            max: 0.75,
            speed: 1.5 + i * 0.3,
            phase: i,
        });
    }
    return g;
}

function createFerrisWheel(x, z) {
    const g = new THREE.Group();
    const R = 6.8;
    const wheel = new THREE.Group();
    wheel.position.y = 9.2;
    wheel.name = "FerrisWheelRotor";

    const rim = new THREE.Mesh(
        new THREE.TorusGeometry(R, 0.26, 10, 32),
        makeMetal(COLORS.white),
    );
    rim.rotation.x = Math.PI / 2;
    wheel.add(rim);

    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const spoke = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, R * 2, 0.12),
            makeMetal(),
        );
        spoke.position.set(
            Math.cos(angle) * R * 0.5,
            Math.sin(angle) * R * 0.5,
            0,
        );
        spoke.rotation.z = angle;
        wheel.add(spoke);
    }

    const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.7, 12),
        makeMetal(),
    );
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);

    const cabinColors = [
        COLORS.coral,
        COLORS.sky,
        COLORS.sunshine,
        COLORS.mint,
    ];
    for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        const cabin = new THREE.Group();
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 1.1, 0.9),
            makeMat(cabinColors[i % cabinColors.length]),
        );
        body.position.y = -0.1;
        cabin.add(body);
        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(1, 0.18, 1),
            makeMat(COLORS.cherry),
        );
        roof.position.y = 0.5;
        cabin.add(roof);
        for (const side of [-0.32, 0.32]) {
            const win = new THREE.Mesh(
                new THREE.BoxGeometry(0.32, 0.42, 0.05),
                makeMat(COLORS.cream, { roughness: 0.2, metalness: 0.1 }),
            );
            win.position.set(side, 0.05, 0.47);
            cabin.add(win);
        }
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, 0.55, 0.05),
            makeMat(COLORS.warmWood),
        );
        door.position.set(0, -0.25, 0.47);
        cabin.add(door);
        cabin.position.set(Math.cos(angle) * R, Math.sin(angle) * R, 0);
        cabin.rotation.z = -angle;
        wheel.add(cabin);
        animatables.push({
            type: "levelCabin",
            cabin,
            wheel,
            offset: angle,
        });
    }

    for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        const bulb = new THREE.Mesh(
            new THREE.SphereGeometry(0.13, 6, 6),
            makeGlow(COLORS.light, 0.55),
        );
        bulb.position.set(
            Math.cos(angle) * (R + 0.15),
            Math.sin(angle) * (R + 0.15),
            0.2,
        );
        wheel.add(bulb);
        animatables.push({
            type: "pulse",
            material: bulb.material,
            min: 0.35,
            max: 1,
            speed: 1.6 + i * 0.07,
            phase: angle,
        });
    }

    g.add(wheel);

    for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 10, 0.5),
            makeMetal(),
        );
        leg.position.set(side * 5, 5, -1.8);
        leg.rotation.z = side * 0.22;
        g.add(leg);
        for (let j = 0; j < 3; j++) {
            const brace = new THREE.Mesh(
                new THREE.BoxGeometry(0.14, 2.8, 0.14),
                makeMetal(),
            );
            brace.position.set(side * (2 + j * 1.4), 3 + j * 2.2, -1.4);
            brace.rotation.z = side * (0.35 - j * 0.08);
            g.add(brace);
        }
    }

    const platform = new THREE.Mesh(
        new THREE.CylinderGeometry(3.6, 3.9, 0.4, 12),
        makeMat(COLORS.pathBorder),
    );
    platform.position.y = 0.2;
    g.add(platform);

    const booth = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.8, 1.4),
        makeMat(COLORS.sky),
    );
    booth.position.set(3.8, 0.9, 1.2);
    g.add(booth);
    const boothRoof = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.15, 1.6),
        makeMat(COLORS.cherry),
    );
    boothRoof.position.set(3.8, 1.85, 1.2);
    g.add(boothRoof);

    const queue = createQueueRail(2.5);
    queue.position.set(2, 0, 2.8);
    g.add(queue);

    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    animatables.push({ type: "rotate", object: wheel, speed: 0.2 });
    return g;
}

function createRollerCoaster(x, z, scale = 1) {
    const g = new THREE.Group();
    const trackMat = makeMat(COLORS.cherry);
    const railMat = makeMat(COLORS.sunshine);
    const supportMat = makeMat(COLORS.metal);

    const points = [];
    for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        points.push(
            new THREE.Vector3(
                t * 15 - 7.5,
                Math.sin(t * Math.PI * 2.2) * 3.5 + 2.5 + t * 2.2,
                Math.sin(t * Math.PI * 1.1) * 2.2,
            ),
        );
    }

    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const bPt = points[i + 1];
        const mid = a.clone().add(bPt).multiplyScalar(0.5);
        const len = a.distanceTo(bPt);
        const seg = new THREE.Mesh(
            new THREE.BoxGeometry(len, 0.28, 0.65),
            trackMat,
        );
        seg.position.copy(mid);
        seg.lookAt(bPt);
        g.add(seg);
        const rail = new THREE.Mesh(
            new THREE.BoxGeometry(len, 0.12, 0.15),
            railMat,
        );
        rail.position.copy(mid);
        rail.position.y += 0.22;
        rail.lookAt(bPt);
        g.add(rail);
    }

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (p.y < 0.5) continue;
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.15, p.y, 6),
            supportMat,
        );
        pole.position.set(p.x, p.y / 2, p.z);
        g.add(pole);
        if (i % 2 === 0) {
            const cross = new THREE.Mesh(
                new THREE.BoxGeometry(0.8, 0.08, 0.08),
                supportMat,
            );
            cross.position.set(p.x, p.y * 0.7, p.z);
            g.add(cross);
        }
    }

    const station = new THREE.Group();
    const stationBase = new THREE.Mesh(
        new THREE.BoxGeometry(3, 1.4, 2.4),
        makeMat(COLORS.sky),
    );
    stationBase.position.y = 0.7;
    station.add(stationBase);
    const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 0.12, 2.8),
        makeMat(COLORS.cherry),
    );
    canopy.position.y = 1.55;
    station.add(canopy);
    const gate = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.8, 0.12),
        makeMat(COLORS.sunshine),
    );
    gate.position.set(0, 0.9, 1.3);
    station.add(gate);
    station.position.set(-7.5, 0, 0);
    g.add(station);

    g.scale.setScalar(scale);
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    return g;
}

function createSpinningRide(x, z) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(2.8, 3.1, 0.55, 10),
        makeMat(COLORS.grape),
    );
    base.position.y = 0.28;
    g.add(base);
    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.6, 0.12, 6, 20),
        makeGlow(COLORS.lavender, 0.4),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.55;
    g.add(ring);

    const spinner = new THREE.Group();
    spinner.position.y = 1.6;
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const arm = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.18, 3.4),
            makeMat(COLORS.sunshine),
        );
        arm.position.set(Math.sin(angle) * 1.7, 0, Math.cos(angle) * 1.7);
        arm.rotation.y = angle;
        const seat = new THREE.Mesh(
            new THREE.BoxGeometry(0.65, 0.85, 0.65),
            makeMat(COLORS.mint),
        );
        seat.position.set(Math.sin(angle) * 3.4, 0.45, Math.cos(angle) * 3.4);
        const canopy = new THREE.Mesh(
            new THREE.BoxGeometry(0.75, 0.1, 0.75),
            makeMat(COLORS.coral),
        );
        canopy.position.set(Math.sin(angle) * 3.4, 0.95, Math.cos(angle) * 3.4);
        spinner.add(arm);
        spinner.add(seat);
        spinner.add(canopy);
    }

    g.add(spinner);
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    animatables.push({ type: "rotate", object: spinner, speed: 0.75 });
    return g;
}

function createCarousel(x, z) {
    const g = new THREE.Group();
    const platform = new THREE.Mesh(
        new THREE.CylinderGeometry(3.8, 4.1, 0.45, 14),
        makeMat(COLORS.pink),
    );
    platform.position.y = 0.22;
    g.add(platform);
    const skirt = new THREE.Mesh(
        new THREE.CylinderGeometry(4.2, 4.4, 0.5, 14, 1, true),
        makeMat(COLORS.cherry),
    );
    skirt.position.y = 0.45;
    g.add(skirt);

    const roof = new THREE.Group();
    roof.position.y = 3.8;
    const roofMesh = new THREE.Mesh(
        new THREE.ConeGeometry(4.5, 1.8, 14),
        makeMat(COLORS.cherry),
    );
    roofMesh.position.y = 0.9;
    roof.add(roofMesh);
    const roofStripe = new THREE.Mesh(
        new THREE.ConeGeometry(4.55, 1.8, 14),
        makeMat(COLORS.tentWhite),
    );
    roofStripe.position.y = 0.9;
    roofStripe.scale.set(0.88, 1, 0.88);
    roof.add(roofStripe);
    const finial = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 8, 8),
        makeGlow(COLORS.sunshine, 0.6),
    );
    finial.position.y = 1.85;
    roof.add(finial);
    animatables.push({
        type: "pulse",
        material: finial.material,
        min: 0.4,
        max: 1,
        speed: 2.5,
        phase: 0,
    });

    const carousel = new THREE.Group();
    carousel.position.y = 0.55;
    const centerPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, 3.2, 8),
        makeMat(COLORS.sunshine),
    );
    centerPole.position.y = 1.6;
    carousel.add(centerPole);

    const horseColors = [
        COLORS.white,
        COLORS.sunshine,
        COLORS.sky,
        COLORS.mint,
    ];
    for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        const hx = Math.cos(angle) * 2.7;
        const hz = Math.sin(angle) * 2.7;
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.09, 3.1, 6),
            makeMetal(COLORS.sunshine),
        );
        pole.position.set(hx, 1.55, hz);
        carousel.add(pole);
        const horse = new THREE.Group();
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.55, 0.28),
            makeMat(horseColors[i % horseColors.length]),
        );
        body.position.y = 0.15;
        horse.add(body);
        const head = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 0.28, 0.18),
            makeMat(horseColors[i % horseColors.length]),
        );
        head.position.set(0, 0.42, 0.18);
        head.rotation.x = -0.35;
        horse.add(head);
        const saddle = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, 0.1, 0.3),
            makeMat(COLORS.cherry),
        );
        saddle.position.y = 0.38;
        horse.add(saddle);
        horse.position.set(hx, 0.55, hz);
        horse.rotation.y = -angle + Math.PI / 2;
        carousel.add(horse);
        if (i % 2 === 0) {
            const bulb = new THREE.Mesh(
                new THREE.SphereGeometry(0.1, 5, 5),
                makeGlow(COLORS.light, 0.5),
            );
            bulb.position.set(
                Math.cos(angle) * 3.3,
                2.8,
                Math.sin(angle) * 3.3,
            );
            carousel.add(bulb);
            animatables.push({
                type: "pulse",
                material: bulb.material,
                min: 0.3,
                max: 0.85,
                speed: 2 + i * 0.15,
                phase: angle,
            });
        }
    }

    g.add(roof);
    g.add(carousel);
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    animatables.push({ type: "rotate", object: carousel, speed: 0.32 });
    animatables.push({ type: "rotate", object: roof, speed: 0.12 });
    return g;
}

function createCircusTent(x, z) {
    const g = new THREE.Group();
    const tent = new THREE.Mesh(
        new THREE.ConeGeometry(4.2, 5.2, 10),
        makeMat(COLORS.tentRed),
    );
    tent.position.y = 2.6;
    g.add(tent);
    for (let i = 0; i < 5; i++) {
        const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 5, 0.12),
            makeMat(i % 2 === 0 ? COLORS.tentWhite : COLORS.tentRed),
        );
        stripe.position.y = 2.6;
        stripe.rotation.y = (i / 5) * Math.PI * 2;
        stripe.position.x = Math.sin(stripe.rotation.y) * 1.8;
        stripe.position.z = Math.cos(stripe.rotation.y) * 1.8;
        g.add(stripe);
    }
    const entrance = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 2.6, 0.12),
        makeMat(COLORS.sunshine),
    );
    entrance.position.set(0, 1.3, 2.3);
    g.add(entrance);
    const curtain = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 2.2, 0.08),
        makeMat(COLORS.cherry),
    );
    curtain.position.set(0, 1.1, 2.38);
    g.add(curtain);
    const topFlag = createFlag(0, 0, COLORS.sky);
    topFlag.position.set(0, 5.4, 0);
    topFlag.scale.set(1.3, 1.3, 1.3);
    g.add(topFlag);
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    return g;
}

function createBalloon(x, z, color, height = 3) {
    const g = new THREE.Group();
    const balloon = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 10, 10),
        makeMat(color),
    );
    balloon.position.y = height;
    balloon.scale.y = 1.15;
    g.add(balloon);
    const highlight = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 6, 6),
        makeMat(COLORS.cream),
    );
    highlight.position.set(-0.15, height + 0.2, 0.2);
    g.add(highlight);
    const string = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, height, 4),
        makeMat(COLORS.dark),
    );
    string.position.y = height / 2;
    g.add(string);
    const basket = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.28, 0.35),
        makeMat(COLORS.warmWood),
    );
    basket.position.y = 0.14;
    g.add(basket);
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g, false, true);
    animatables.push({
        type: "float",
        object: balloon,
        baseY: height,
        amplitude: 0.4,
        speed: 1.1,
        phase: Math.random() * Math.PI * 2,
    });
    animatables.push({
        type: "sway",
        object: g,
        amplitude: 0.08,
        speed: 0.9,
        phase: Math.random() * Math.PI * 2,
    });
    return g;
}

function createFoodStall(x, z, color = COLORS.tangerine) {
    const g = new THREE.Group();
    const counter = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 1.35, 1.55),
        makeMat(color),
    );
    counter.position.y = 0.68;
    g.add(counter);
    const service = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.08, 0.9),
        makeMat(COLORS.warmWood),
    );
    service.position.set(0, 1.15, 0.35);
    g.add(service);
    const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(2.25, 0.22, 1.6),
        makeMat(COLORS.cream),
    );
    stripe.position.y = 1.12;
    g.add(stripe);
    const frameL = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 1.6, 0.1),
        makeMetal(),
    );
    frameL.position.set(-1.05, 0.8, 0.7);
    g.add(frameL);
    const frameR = frameL.clone();
    frameR.position.x = 1.05;
    g.add(frameR);
    const awning = new THREE.Mesh(
        new THREE.BoxGeometry(2.7, 0.12, 2.1),
        makeMat(COLORS.cherry),
    );
    awning.position.y = 1.5;
    g.add(awning);
    const awningFront = new THREE.Mesh(
        new THREE.BoxGeometry(2.7, 0.06, 1.05),
        makeMat(COLORS.sunshine),
    );
    awningFront.position.set(0, 1.25, 1);
    awningFront.rotation.x = -0.48;
    g.add(awningFront);
    const sign = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 0.55, 0.1),
        makeMat(COLORS.sunshine),
    );
    sign.position.set(0, 1.82, 0.85);
    g.add(sign);
    const menu = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.9, 0.05),
        makeMat(COLORS.cream),
    );
    menu.position.set(0.75, 1.1, 0.82);
    g.add(menu);
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    return g;
}

function createUmbrellaTable(x, z, color) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.06, 2.2, 5),
        makeMat(COLORS.metal),
    );
    pole.position.y = 1.1;
    g.add(pole);
    const top = new THREE.Mesh(
        new THREE.ConeGeometry(1.1, 0.5, 8),
        makeMat(color),
    );
    top.position.y = 2.2;
    g.add(top);
    const table = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.08, 8),
        makeMat(COLORS.warmWood),
    );
    table.position.y = 0.75;
    g.add(table);
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    return g;
}

function createSeatingArea(x, z) {
    const g = new THREE.Group();
    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 4; col++) {
            const bench = createBench(col * 1.8 - 2.7, row * 1.5, 0);
            g.add(bench);
        }
    }
    g.add(createUmbrellaTable(-1.5, -2.5, COLORS.coral));
    g.add(createUmbrellaTable(1.5, -2.5, COLORS.sky));
    g.position.set(x, 0, z);
    return g;
}

function createStage(x, z) {
    const g = new THREE.Group();
    const platform = new THREE.Mesh(
        new THREE.BoxGeometry(6.5, 0.55, 4.2),
        makeMat(COLORS.navy),
    );
    platform.position.y = 0.28;
    g.add(platform);
    const frontTrim = new THREE.Mesh(
        new THREE.BoxGeometry(6.6, 0.15, 0.2),
        makeMat(COLORS.sunshine),
    );
    frontTrim.position.set(0, 0.45, 2.1);
    g.add(frontTrim);

    for (const side of [-3.5, 3.5]) {
        const tower = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 2.8, 0.6),
            makeMat(COLORS.metal),
        );
        tower.position.set(side, 1.4, -1.6);
        g.add(tower);
        const speaker = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 1.4, 0.45),
            makeMat(COLORS.dark),
        );
        speaker.position.set(side, 0.7, -1.6);
        g.add(speaker);
    }

    const truss = new THREE.Mesh(
        new THREE.BoxGeometry(6.8, 0.2, 0.2),
        makeMat(COLORS.metal),
    );
    truss.position.set(0, 3.2, 0);
    g.add(truss);
    for (const side of [-2.5, 0, 2.5]) {
        const spot = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.25, 0.25),
            makeGlow(COLORS.light, 0.55),
        );
        spot.position.set(side, 3, 0.5);
        g.add(spot);
        animatables.push({
            type: "pulse",
            material: spot.material,
            min: 0.35,
            max: 0.9,
            speed: 2.2 + side,
            phase: side,
        });
    }

    const backdrop = new THREE.Mesh(
        new THREE.BoxGeometry(6.8, 3.8, 0.22),
        makeMat(COLORS.grape),
    );
    backdrop.position.set(0, 2.1, -1.9);
    g.add(backdrop);
    for (const side of [-2, 2]) {
        const banner = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 2.2, 0.08),
            makeMat(side < 0 ? COLORS.coral : COLORS.sky),
        );
        banner.position.set(side, 2, -1.75);
        g.add(banner);
    }

    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    return g;
}

function createLightPole(x, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.12, 3.8, 6),
        makeMat(COLORS.metal),
    );
    pole.position.y = 1.9;
    g.add(pole);
    const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.08, 0.08),
        makeMat(COLORS.metal),
    );
    arm.position.set(0.25, 3.6, 0);
    g.add(arm);
    const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 8, 8),
        makeGlow(COLORS.light, 0.65),
    );
    bulb.position.set(0.5, 3.55, 0);
    g.add(bulb);
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.25, 0.15, 6),
        makeMat(COLORS.dark),
    );
    base.position.y = 0.08;
    g.add(base);
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    animatables.push({
        type: "pulse",
        material: bulb.material,
        min: 0.35,
        max: 0.95,
        speed: 2 + Math.random(),
        phase: Math.random() * Math.PI * 2,
    });
    return g;
}

function createFountain(x, z) {
    const g = new THREE.Group();
    const basin = new THREE.Mesh(
        new THREE.CylinderGeometry(2.4, 2.7, 0.65, 12),
        makeMat(COLORS.metal),
    );
    basin.position.y = 0.32;
    g.add(basin);
    const water = new THREE.Mesh(
        new THREE.CylinderGeometry(2.1, 2.1, 0.18, 12),
        makeMat(COLORS.ocean, { transparent: true, opacity: 0.85 }),
    );
    water.position.y = 0.58;
    g.add(water);

    const jets = new THREE.Group();
    jets.position.y = 0.72;
    for (let i = 0; i < 6; i++) {
        const jet = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.14, 1.3, 6),
            makeMat(COLORS.sky, { transparent: true, opacity: 0.75 }),
        );
        jet.position.set(
            Math.cos((i / 6) * Math.PI * 2) * 0.9,
            0.65,
            Math.sin((i / 6) * Math.PI * 2) * 0.9,
        );
        jets.add(jet);
    }
    const centerJet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.18, 2, 6),
        makeMat(COLORS.mint, { transparent: true, opacity: 0.85 }),
    );
    centerJet.position.y = 1;
    jets.add(centerJet);
    g.add(jets);

    const sparkle = createSparkleCluster(6);
    sparkle.position.set(0, 1.2, 0);
    g.add(sparkle);

    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    animatables.push({ type: "fountain", object: jets, speed: 1.6 });
    return g;
}

function createParkSign(x, z) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 2.4, 0.16),
        makeMat(COLORS.warmWood),
    );
    post.position.y = 1.2;
    g.add(post);
    const board = new THREE.Mesh(
        new THREE.BoxGeometry(2, 1.2, 0.12),
        makeMat(COLORS.sunshine),
    );
    board.position.y = 2.15;
    g.add(board);
    const trim = new THREE.Mesh(
        new THREE.BoxGeometry(2.1, 0.15, 0.14),
        makeMat(COLORS.cherry),
    );
    trim.position.y = 2.75;
    g.add(trim);
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    return g;
}

function createKiosk(x, z) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 1.6, 1.4),
        makeMat(COLORS.teal),
    );
    base.position.y = 0.8;
    g.add(base);
    const roof = new THREE.Mesh(
        new THREE.ConeGeometry(1.2, 0.7, 4),
        makeMat(COLORS.cherry),
    );
    roof.position.y = 1.75;
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    return g;
}

function createSculpture(x, z) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.8, 0.45, 8),
        makeMat(COLORS.metal),
    );
    base.position.y = 0.22;
    g.add(base);
    const art = new THREE.Mesh(
        new THREE.TorusKnotGeometry(0.5, 0.14, 48, 8),
        makeMat(COLORS.lavender),
    );
    art.position.y = 1.55;
    g.add(art);
    g.position.set(x, THEME_PARK_BOUNDS.groundY, z);
    addShadow(g);
    animatables.push({ type: "rotate", object: art, speed: 0.35 });
    return g;
}

function createSparkleCluster(count = 8) {
    const g = new THREE.Group();
    for (let i = 0; i < count; i++) {
        const sparkle = new THREE.Mesh(
            new THREE.PlaneGeometry(0.1, 0.1),
            makeMat(COLORS.sunshine, {
                emissive: COLORS.cream,
                emissiveIntensity: 0.9,
                transparent: true,
                opacity: 0.85,
                side: THREE.DoubleSide,
                depthWrite: false,
            }),
        );
        sparkle.position.set(
            ((i % 4) - 1.5) * 0.5,
            0.5 + (i % 3) * 0.6,
            (Math.floor(i / 4) - 0.5) * 0.5,
        );
        g.add(sparkle);
        animatables.push({
            type: "sparkle",
            object: sparkle,
            baseY: sparkle.position.y,
            phase: i * 0.8,
        });
    }
    return g;
}

function buildZoneAEntrance(parent, b) {
    const z = b.maxZ - 2.5;
    parent.add(createWelcomeArch(b.cx, z));
    parent.add(createTicketBooth(b.cx - 6, z + 0.5));
    parent.add(createTicketBooth(b.cx + 6, z + 0.5));
    for (const x of [b.cx - 9, b.cx + 9]) {
        parent.add(createBench(x, z - 2, Math.PI));
    }
    parent.add(createDecorativeTree(b.cx - 11, z - 2.5));
    parent.add(createFlowerBed(b.cx + 10, z - 3, 1.6, 0.9));
}

function buildZoneBLandmark(parent, b) {
    parent.add(createFerrisWheel(b.cx, b.minZ + 6));
}

function buildZoneCThrill(parent, b) {
    const x = b.minX + 12;
    const z = b.cz - 1;
    parent.add(createRollerCoaster(x, z, 1));
    parent.add(createRollerCoaster(x + 9, b.minZ + 9, 0.6));
    parent.add(createSpinningRide(x + 3, b.maxZ - 7));
}

function buildZoneDFamily(parent, b) {
    const x = b.maxX - 14;
    parent.add(createCarousel(x, b.cz));
    parent.add(createCircusTent(x - 9, b.minZ + 8));
    const balloonColors = [COLORS.coral, COLORS.sky, COLORS.sunshine];
    for (let i = 0; i < 3; i++) {
        parent.add(
            createBalloon(
                x - 4 + i * 2.8,
                b.maxZ - 4.5,
                balloonColors[i],
                2.4 + i * 0.25,
            ),
        );
    }
}

function buildZoneEFood(parent, b) {
    const x = b.maxX - 10;
    const z = b.maxZ - 5;
    parent.add(createFoodStall(x, z, COLORS.tangerine));
    parent.add(createFoodStall(x - 4.5, z + 2, COLORS.cherry));
    parent.add(createFoodStall(x + 4.5, z + 2, COLORS.sunshine));
    parent.add(createSeatingArea(x - 7, z - 2));
}

function buildZoneFEntertainment(parent, b) {
    const x = b.minX + 16;
    parent.add(createStage(x, b.cz + 2));
    for (const [lx, lz] of [
        [x - 6, b.cz - 2],
        [x + 6, b.cz - 2],
    ]) {
        parent.add(createLightPole(lx, lz));
    }
    parent.add(createFlowerBed(x, b.cz - 5, 2.2, 1.2));
}

function buildZoneGRelaxation(parent, b) {
    const x = b.minX + 10;
    const z = b.minZ + 5;
    const fx = x + 8;
    parent.add(createFountain(fx, z));
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        parent.add(
            createBench(
                fx + Math.cos(angle) * 5.5,
                z + Math.sin(angle) * 5.5,
                angle + Math.PI / 2,
            ),
        );
    }
    for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
        parent.add(
            createDecorativeTree(
                fx + Math.cos(angle) * 8,
                z + Math.sin(angle) * 8,
                0.75,
            ),
        );
    }
    parent.add(createFlowerBed(fx - 3, z + 6, 1.8, 1));
    parent.add(createFlowerBed(fx + 3, z + 6, 1.8, 1));
}

function buildAmbientDetails(parent, b) {
    buildPathNetwork(parent, b);

    const lightStep = PROP_SPACING * 4;
    for (let x = b.minX + 6; x < b.maxX - 6; x += lightStep) {
        parent.add(createLightPole(x, b.cz));
    }

    const treeSpots = [
        [b.cx - 24, b.cz],
        [b.cx + 24, b.cz],
        [b.cx, b.cz + 3],
    ];
    for (const [tx, tz] of treeSpots) {
        parent.add(createDecorativeTree(tx, tz, 0.85));
    }

    const bushSpots = [
        [b.cx - 16, b.cz - 2],
        [b.cx + 16, b.cz + 2],
        [b.maxX - 24, b.cz],
    ];
    for (const [bx, bz] of bushSpots) {
        parent.add(createBush(bx, bz, 0.8));
    }

    parent.add(createKiosk(b.cx + 18, b.cz - 3));

    for (const [sx, sz] of [
        [b.cx - 10, b.cz - 2],
        [b.cx + 12, b.cz + 2],
    ]) {
        parent.add(createParkSign(sx, sz));
    }

    parent.add(createSculpture(b.cx - 20, b.cz));

    const flowerSpots = [
        [b.minX + 18, b.cz],
        [b.maxX - 18, b.cz],
        [b.cx, b.minZ + 3],
    ];
    for (const [fx, fz] of flowerSpots) {
        parent.add(createFlowerBed(fx, fz, 1.4, 0.9));
    }

    const hubSparkle = createSparkleCluster(5);
    hubSparkle.position.set(b.cx, THEME_PARK_BOUNDS.groundY + 1.8, b.cz);
    parent.add(hubSparkle);
}

function buildThemePark() {
    const root = new THREE.Group();
    root.name = "ThemePark";

    const b = innerBounds();
    buildZoneAEntrance(root, b);
    buildZoneBLandmark(root, b);
    buildZoneCThrill(root, b);
    buildZoneDFamily(root, b);
    buildZoneEFood(root, b);
    buildZoneFEntertainment(root, b);
    buildZoneGRelaxation(root, b);
    buildParkScenery(root, b);
    buildFrontPromenade(root, b);
    buildAmbientDetails(root, b);

    return root;
}

export function initThemePark(scene) {
    if (themeParkRoot) return;
    animatables.length = 0;
    themeParkRoot = buildThemePark();
    scene.add(themeParkRoot);
}

export function updateThemePark(delta) {
    if (!themeParkRoot) return;
    const t = performance.now() * 0.001;
    for (const anim of animatables) {
        switch (anim.type) {
            case "rotate":
                anim.object.rotation.y += anim.speed * delta;
                break;
            case "levelCabin":
                anim.cabin.rotation.z = -anim.offset - anim.wheel.rotation.y;
                break;
            case "float":
                anim.object.position.y =
                    anim.baseY +
                    Math.sin(t * anim.speed + anim.phase) * anim.amplitude;
                break;
            case "sway":
                anim.object.rotation.z =
                    Math.sin(t * anim.speed + anim.phase) * anim.amplitude;
                break;
            case "pulse":
                anim.material.emissiveIntensity =
                    anim.min +
                    (anim.max - anim.min) *
                        (0.5 + 0.5 * Math.sin(t * anim.speed + anim.phase));
                break;
            case "fountain":
                anim.object.children.forEach((jet, i) => {
                    const scale =
                        0.55 + 0.45 * Math.sin(t * anim.speed * 2 + i * 1.2);
                    jet.scale.y = scale;
                });
                break;
            case "sparkle":
                anim.object.position.y =
                    anim.baseY + Math.sin(t * 2.5 + anim.phase) * 0.35;
                anim.object.material.opacity =
                    0.45 + 0.4 * Math.sin(t * 3 + anim.phase);
                anim.object.rotation.z = t * 1.5 + anim.phase;
                break;
            default:
                break;
        }
    }
}

export function disposeThemePark(scene) {
    if (!themeParkRoot) return;
    scene.remove(themeParkRoot);
    themeParkRoot.traverse((child) => {
        if (child.isMesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) {
                child.material.forEach((m) => m.dispose());
            } else {
                child.material?.dispose();
            }
        }
    });
    themeParkRoot = null;
    animatables.length = 0;
}
