/*
 * Seranova Infra — self-contained scroll-driven WebGL architectural scene.
 * No external 3D CDN or runtime package is required. If WebGL is unavailable,
 * the styled CSS fallback stays visible and the rest of the site remains usable.
 */
(() => {
  "use strict";

  const section = document.getElementById("seranova-architecture");
  const stage = document.getElementById("seranova-3d-stage");
  const canvas = document.getElementById("seranova-3d-canvas");
  const progressFill = document.getElementById("seranova-3d-progress-fill");
  if (!section || !stage || !canvas) return;

  const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const SKYSCRAPER_FLOOR_COUNT = 24;
  const SKYSCRAPER_PREBUILT_LEVELS = 8;
  const SKYSCRAPER_FLOOR_HEIGHT = 0.43;
  const SKYSCRAPER_SVG_CENTER_X = 543.25;
  const footprintScaleAt = (floorIndex) => {
    if (floorIndex < 7) return 1;
    if (floorIndex < 13) return 0.94;
    if (floorIndex < 18) return 0.86;
    if (floorIndex < 22) return 0.76;
    return 0.65;
  };
  const smooth = (value) => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const vecAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const vecSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const vecScale = (a, n) => [a[0] * n, a[1] * n, a[2] * n];
  const vecDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const vecCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const vecNorm = (a) => {
    const length = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / length, a[1] / length, a[2] / length];
  };
  const colorRGB = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

  let gl = null;
  let meshProgram = null;
  let lineProgram = null;
  let sceneLines = null;
  let ghostLines = null;
  let particleBuffer = null;
  let staticMesh = null;
  let craneMesh = null;
  let trolleyMesh = null;
  let cableMesh = null;
  let hookMesh = null;
  let roofMesh = null;
  let roofLines = null;
  let floors = [];
  let isVisible = false;
  let rafId = 0;
  let lastFrame = 0;
  let targetProgress = 0;
  let animatedProgress = 0;
  let pointerX = 0;
  let pointerY = 0;
  let activePointerX = 0;
  let activePointerY = 0;
  let sceneFailed = false;
  let canvasWidth = 1;
  let canvasHeight = 1;
  let pixelRatio = 1;
  let resizeObserver = null;

  const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const matMultiply = (a, b) => {
    const out = new Array(16).fill(0);
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        for (let k = 0; k < 4; k += 1) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
      }
    }
    return out;
  };
  const matTranslate = (x, y, z) => {
    const out = identity();
    out[12] = x; out[13] = y; out[14] = z;
    return out;
  };
  const matScale = (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
  const matRotateY = (angle) => {
    const c = Math.cos(angle); const s = Math.sin(angle);
    return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  };
  const matRotateZ = (angle) => {
    const c = Math.cos(angle); const s = Math.sin(angle);
    return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  };
  const matPerspective = (fovRadians, aspect, near, far) => {
    const f = 1 / Math.tan(fovRadians / 2);
    const nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  };
  const matLookAt = (eye, center, up) => {
    const z = vecNorm(vecSub(eye, center));
    const x = vecNorm(vecCross(up, z));
    const y = vecCross(z, x);
    return [
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -vecDot(x, eye), -vecDot(y, eye), -vecDot(z, eye), 1,
    ];
  };
  const normalMatrixFromModel = (model) => {
    // Normal vectors require inverse-transpose when the model uses the tower's
    // non-uniform Y scale and stepped X/Z footprints.
    const a = model[0], b = model[4], c = model[8];
    const d = model[1], e = model[5], f = model[9];
    const g = model[2], h = model[6], i = model[10];
    const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g;
    const D = c * h - b * i, E = a * i - c * g, F = b * g - a * h;
    const G = b * f - c * e, H = c * d - a * f, I = a * e - b * d;
    const determinant = a * A + b * B + c * C || 1;
    return [A / determinant, D / determinant, G / determinant,
      B / determinant, E / determinant, H / determinant,
      C / determinant, F / determinant, I / determinant];
  };

  function createBuilder() {
    return { positions: [], normals: [], colors: [] };
  }

  function pushTriangle(builder, a, b, c, color) {
    const normal = vecNorm(vecCross(vecSub(b, a), vecSub(c, a)));
    [a, b, c].forEach((point) => {
      builder.positions.push(point[0], point[1], point[2]);
      builder.normals.push(normal[0], normal[1], normal[2]);
      builder.colors.push(color[0], color[1], color[2]);
    });
  }

  function pushQuad(builder, a, b, c, d, color) {
    pushTriangle(builder, a, b, c, color);
    pushTriangle(builder, a, c, d, color);
  }

  function pushBox(builder, center, size, hexColor) {
    const color = Array.isArray(hexColor) ? hexColor : colorRGB(hexColor);
    const [cx, cy, cz] = center;
    const [hx, hy, hz] = size.map((dimension) => dimension / 2);
    const vertices = [
      [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz],
      [cx - hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz - hz],
      [cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz],
      [cx - hx, cy + hy, cz + hz], [cx + hx, cy + hy, cz + hz],
    ];
    [[0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3], [0, 2, 3, 1], [4, 5, 7, 6]]
      .forEach((face) => pushQuad(builder, vertices[face[0]], vertices[face[1]], vertices[face[2]], vertices[face[3]], color));
  }

  function pushOrientedBox(builder, center, axes, size, color) {
    const [hx, hy, hz] = size.map((dimension) => dimension / 2);
    const corners = [];
    for (let i = 0; i < 8; i += 1) {
      let point = center.slice();
      point = vecAdd(point, vecScale(axes[0], i & 1 ? hx : -hx));
      point = vecAdd(point, vecScale(axes[1], i & 2 ? hy : -hy));
      point = vecAdd(point, vecScale(axes[2], i & 4 ? hz : -hz));
      corners.push(point);
    }
    [[0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3], [0, 2, 3, 1], [4, 5, 7, 6]]
      .forEach((face) => pushQuad(builder, corners[face[0]], corners[face[1]], corners[face[2]], corners[face[3]], color));
  }

  function pushBeam(builder, from, to, thickness, color) {
    const direction = vecNorm(vecSub(to, from));
    const reference = Math.abs(direction[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
    const axisX = vecNorm(vecCross(direction, reference));
    const axisZ = vecNorm(vecCross(axisX, direction));
    const center = vecScale(vecAdd(from, to), 0.5);
    const length = Math.hypot(...vecSub(to, from));
    pushOrientedBox(builder, center, [axisX, direction, axisZ], [thickness, length, thickness], color);
  }

  function pushLineToBuilder(builder, a, b, hexColor) {
    const color = Array.isArray(hexColor) ? hexColor : colorRGB(hexColor);
    builder.positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    builder.colors.push(...color, ...color);
  }

  function buildSiteGeometry() {
    const staticBuilder = createBuilder();
    const lines = { positions: [], colors: [] };
    const ghost = { positions: [], colors: [] };
    const particles = { positions: [], colors: [] };
    const roof = createBuilder();
    const roofLineBuilder = { positions: [], colors: [] };
    const concrete = 0x424945;
    const darkConcrete = 0x222b27;
    const steel = 0x7b887e;
    const steelDark = 0x39433d;
    const gold = 0xd0a84f;
    const goldLight = 0xe3c778;
    const glassTints = [0x20767b, 0x285e91, 0x3c83b8, 0x278e83, 0x5f70a8, 0x8b71b7, 0xc28c4a];
    const buildingWidth = 5.45;
    const buildingDepth = 4.25;
    const floorHeight = SKYSCRAPER_FLOOR_HEIGHT;
    const floorCount = SKYSCRAPER_FLOOR_COUNT;
    const baseY = 0.50;
    const buildingHeight = floorCount * floorHeight;

    // Larger podium and raised tower plinth give the high-rise a believable base.
    pushBox(staticBuilder, [0, 0.05, 0], [17.0, 0.24, 13.8], darkConcrete);
    pushBox(staticBuilder, [0, 0.19, 0], [16.0, 0.055, 12.8], concrete);
    pushBox(staticBuilder, [0, 0.305, 0], [7.35, 0.22, 5.95], 0x23352f);
    pushBox(staticBuilder, [0, 0.425, 0], [6.82, 0.045, 5.43], 0x5a6956);
    pushBox(staticBuilder, [0, 0.457, 0], [6.15, 0.025, 4.9], 0x263c36);
    // Warm entry lights along the podium perimeter.
    [-2.8, -1.4, 0, 1.4, 2.8].forEach((x) => {
      pushBox(staticBuilder, [x, 0.47, 2.76], [0.075, 0.035, 0.035], 0xe7c36a);
      pushBox(staticBuilder, [x, 0.47, -2.76], [0.075, 0.035, 0.035], 0x54d8cc);
    });

    // A richer but deliberately secondary skyline keeps the central tower dominant.
    const contextTowers = [
      { x: -6.65, z: -4.45, w: 1.02, d: 1.32, h: 5.25, body: 0x153437, glass: 0x288d91 },
      { x: -4.85, z: -5.00, w: 0.82, d: 1.08, h: 3.95, body: 0x242c3e, glass: 0x4d82c8 },
      { x: 6.35, z: -4.45, w: 1.18, d: 1.5, h: 6.65, body: 0x172b3e, glass: 0x477fc4 },
      { x: 4.85, z: -5.05, w: 0.78, d: 1.08, h: 4.75, body: 0x302437, glass: 0x986bb7 },
      { x: 6.25, z: 1.85, w: 0.86, d: 0.9, h: 3.05, body: 0x1d3834, glass: 0x37a79a },
      { x: -6.85, z: 1.65, w: 0.75, d: 0.9, h: 3.45, body: 0x28352d, glass: 0x9e8b4f },
      { x: 4.95, z: 0.1, w: 0.78, d: 0.86, h: 2.7, body: 0x1e2f40, glass: 0x5c8fd0 },
    ];
    contextTowers.forEach((tower, towerIndex) => {
      pushBox(staticBuilder, [tower.x, 0.25 + tower.h / 2, tower.z], [tower.w, tower.h, tower.d], tower.body);
      const floorCount = Math.max(2, Math.floor(tower.h / 0.52));
      for (let floor = 0; floor < floorCount; floor += 1) {
        const y = 0.39 + floor * (tower.h - 0.35) / floorCount;
        for (let bay = 0; bay < 2; bay += 1) {
          const x = tower.x - tower.w * 0.25 + bay * tower.w * 0.5;
          const tint = (towerIndex + floor + bay) % 4 === 0 ? 0xd3a84f : ((towerIndex + bay) % 2 ? tower.glass : (towerIndex % 2 ? 0x376da9 : 0x2d9c94));
          pushBox(staticBuilder, [x, y, tower.z + tower.d / 2 + 0.012], [tower.w * 0.24, 0.18, 0.024], tint);
        }
      }
      pushBox(staticBuilder, [tower.x, 0.25 + tower.h, tower.z], [tower.w + 0.08, 0.045, tower.d + 0.08], towerIndex % 2 ? 0x578dd2 : 0x4ecfc3);
    });

    // Site set-out grid and the gold surveying datum rings.
    for (let coordinate = -8; coordinate <= 8; coordinate += 1) {
      pushLineToBuilder(lines, [-8, 0.226, coordinate], [8, 0.226, coordinate], coordinate % 3 === 0 ? 0x625a42 : 0x2c3a32);
      pushLineToBuilder(lines, [coordinate, 0.226, -8], [coordinate, 0.226, 8], coordinate % 3 === 0 ? 0x625a42 : 0x2c3a32);
    }
    [4.5, 5.7, 6.8].forEach((radius, ringIndex) => {
      let previous = null;
      for (let i = 0; i <= 180; i += 1) {
        const angle = (i / 180) * Math.PI * 2;
        const point = [Math.cos(angle) * radius, 0.247 + ringIndex * 0.006, Math.sin(angle) * radius];
        if (previous) pushLineToBuilder(lines, previous, point, ringIndex === 1 ? 0xb38c3d : 0x705d34);
        previous = point;
      }
    });
    const footprint = [[-2.85, 0.255, -2.25], [2.85, 0.255, -2.25], [2.85, 0.255, 2.25], [-2.85, 0.255, 2.25], [-2.85, 0.255, -2.25]];
    for (let i = 0; i < footprint.length - 1; i += 1) pushLineToBuilder(lines, footprint[i], footprint[i + 1], 0xb99142);

    // Initial ghost volume, including the tower datum levels.
    const minX = -buildingWidth / 2;
    const maxX = buildingWidth / 2;
    const minZ = -buildingDepth / 2;
    const maxZ = buildingDepth / 2;
    const topY = baseY + buildingHeight;
    const corners = [[minX, baseY, minZ], [maxX, baseY, minZ], [maxX, baseY, maxZ], [minX, baseY, maxZ]];
    for (let i = 0; i < 4; i += 1) {
      const next = (i + 1) % 4;
      pushLineToBuilder(ghost, corners[i], corners[next], goldLight);
      pushLineToBuilder(ghost, [corners[i][0], topY, corners[i][2]], [corners[next][0], topY, corners[next][2]], goldLight);
      pushLineToBuilder(ghost, corners[i], [corners[i][0], topY, corners[i][2]], goldLight);
    }
    for (let floor = 3; floor < floorCount; floor += 3) {
      const y = baseY + floor * floorHeight;
      const scale = footprintScaleAt(floor);
      const level = corners.map((corner) => [corner[0] * scale, y, corner[2] * scale]);
      for (let i = 0; i < 4; i += 1) pushLineToBuilder(ghost, level[i], level[(i + 1) % 4], 0x9b824c);
    }

    // Twenty-four distinct storeys make a proper high-rise. The top tiers step inward
    // to create sky gardens and a slim, elegant crown rather than a plain rectangular box.
    floors = [];
    for (let floor = 0; floor < floorCount; floor += 1) {
      const structure = createBuilder();
      const glass = createBuilder();
      const windowY = 0.52;
      const skyGarden = [6, 12, 17, 21].includes(floor);
      const slabColor = skyGarden ? 0x4d6859 : concrete;
      pushBox(structure, [0, 0.045, 0], [buildingWidth + (skyGarden ? 0.12 : 0), 0.09, buildingDepth + (skyGarden ? 0.12 : 0)], slabColor);
      const xPosts = [-buildingWidth / 2 + 0.09, -buildingWidth / 6, buildingWidth / 6, buildingWidth / 2 - 0.09];
      xPosts.forEach((x, index) => {
        [-buildingDepth / 2 + 0.055, buildingDepth / 2 - 0.055].forEach((z) => {
          const outer = index === 0 || index === xPosts.length - 1;
          const postColor = outer && (floor % 6 === 0) ? gold : steelDark;
          pushBox(structure, [x, 0.50, z], [0.052, 0.84, 0.052], postColor);
        });
      });
      [-buildingWidth / 2 + 0.09, buildingWidth / 2 - 0.09].forEach((x) => {
        [-buildingDepth / 6, buildingDepth / 6].forEach((z) => pushBox(structure, [x, 0.50, z], [0.05, 0.84, 0.05], steelDark));
      });
      pushBox(structure, [0.10, 0.50, -0.08], [0.62, 0.82, 0.72], darkConcrete);

      // A slim projecting slab marks periodic sky-garden / transfer levels.
      if (skyGarden) {
        pushBox(structure, [0, 0.91, 0], [buildingWidth + 0.20, 0.045, buildingDepth + 0.20], 0x2e5852);
        pushBox(structure, [0, 0.93, buildingDepth / 2], [buildingWidth + 0.22, 0.022, 0.035], 0x5ae0d2);
        // Elevated planting beds at every transfer level make the setbacks read as sky gardens.
        pushBox(structure, [0, 0.83, buildingDepth / 2 + 0.10], [buildingWidth * 0.76, 0.085, 0.28], 0x18392c);
        [-1.75, -0.92, -0.10, 0.78, 1.62].forEach((x, plantIndex) => {
          const foliage = plantIndex % 3 === 0 ? 0x4eb87d : (plantIndex % 3 === 1 ? 0x2f9167 : 0x70c58a);
          pushBox(structure, [x, 0.95, buildingDepth / 2 + 0.095], [0.28, 0.16 + (plantIndex % 2) * 0.045, 0.18], foliage);
          pushBox(structure, [x + 0.03, 1.035, buildingDepth / 2 + 0.11], [0.07, 0.12, 0.07], 0x9cd99b);
        });
        [-2.1, 2.1].forEach((x) => pushBox(structure, [x, 0.94, buildingDepth / 2 + 0.13], [0.06, 0.12, 0.06], 0x55e0d3));
      }
      const fasciaFront = floor % 6 === 0 ? gold : steel;
      pushBox(structure, [0, 0.925, buildingDepth / 2], [buildingWidth, 0.045, 0.055], fasciaFront);
      pushBox(structure, [0, 0.925, -buildingDepth / 2], [buildingWidth, 0.045, 0.055], steel);
      pushBox(structure, [buildingWidth / 2, 0.925, 0], [0.055, 0.045, buildingDepth], steel);
      pushBox(structure, [-buildingWidth / 2, 0.925, 0], [0.055, 0.045, buildingDepth], steel);

      const longBay = buildingWidth / 4;
      for (let bay = 0; bay < 4; bay += 1) {
        const x = -buildingWidth / 2 + longBay * (bay + 0.5);
        [-buildingDepth / 2 - 0.024, buildingDepth / 2 + 0.024].forEach((z, faceIndex) => {
          const tintIndex = (floor * 3 + bay + faceIndex) % glassTints.length;
          pushBox(glass, [x, windowY, z], [longBay - 0.10, 0.63, 0.028], glassTints[tintIndex]);
          pushBox(structure, [x, 0.16, z], [longBay - 0.10, 0.035, 0.04], floor % 6 === 0 ? 0x75bdb3 : steelDark);
        });
        if (bay > 0) {
          [-buildingDepth / 2 - 0.025, buildingDepth / 2 + 0.025].forEach((z) => pushBox(structure, [x - longBay / 2, 0.52, z], [0.026, 0.67, 0.035], floor % 6 === 0 ? gold : steel));
        }
      }
      const sideBay = buildingDepth / 3;
      for (let bay = 0; bay < 3; bay += 1) {
        const z = -buildingDepth / 2 + sideBay * (bay + 0.5);
        [-buildingWidth / 2 - 0.024, buildingWidth / 2 + 0.024].forEach((x, sideIndex) => {
          pushBox(glass, [x, windowY, z], [0.028, 0.63, sideBay - 0.10], glassTints[(floor + bay + sideIndex + 2) % glassTints.length]);
        });
        if (bay > 0) [-buildingWidth / 2 - 0.02, buildingWidth / 2 + 0.02].forEach((x) => pushBox(structure, [x, 0.52, z - sideBay / 2], [0.035, 0.67, 0.026], steel));
      }
      // Signature vertical light fins create a continuous high-rise silhouette across tiers.
      const finColor = floor % 6 === 0 ? goldLight : (floor % 3 === 0 ? 0x4acfc3 : 0x42564f);
      [-buildingWidth / 2 + 0.065, 0, buildingWidth / 2 - 0.065].forEach((x, finIndex) => {
        pushBox(structure, [x, 0.51, buildingDepth / 2 + 0.052], [finIndex === 1 ? 0.038 : 0.026, 0.72, 0.025], finIndex === 1 ? finColor : steelDark);
      });
      [-buildingDepth / 2 + 0.06, buildingDepth / 2 - 0.06].forEach((z) => {
        pushBox(structure, [buildingWidth / 2 + 0.052, 0.51, z], [0.026, 0.72, 0.038], floor % 6 === 0 ? gold : steelDark);
      });
      floors.push({ structure, glass, finalY: baseY + floor * floorHeight, floor, height: floorHeight, footprintScale: footprintScaleAt(floor) });
    }

    // Crown deck, sky lounge volume, illuminated fins and a tapered antenna spire.
    const crownY = baseY + buildingHeight + 0.10;
    pushBox(roof, [0, crownY, 0], [buildingWidth + 0.24, 0.075, buildingDepth + 0.24], 0x4a5c4c);
    pushBox(roof, [0, crownY + 0.20, 0], [buildingWidth * 0.32, 0.32, buildingDepth * 0.34], 0x204a49);
    pushBox(roof, [0, crownY + 0.37, 0], [buildingWidth * 0.34, 0.035, buildingDepth * 0.36], gold);
    const roofCorners = [[minX - 0.12, crownY + 0.05, minZ - 0.12], [maxX + 0.12, crownY + 0.05, minZ - 0.12], [maxX + 0.12, crownY + 0.05, maxZ + 0.12], [minX - 0.12, crownY + 0.05, maxZ + 0.12]];
    for (let i = 0; i < 4; i += 1) {
      pushLineToBuilder(roofLineBuilder, roofCorners[i], roofCorners[(i + 1) % 4], goldLight);
      pushBeam(roof, [roofCorners[i][0], crownY, roofCorners[i][2]], [roofCorners[i][0] * 0.78, crownY + 0.9, roofCorners[i][2] * 0.78], 0.028, i % 2 ? 0x56d9ce : gold);
    }
    pushBeam(roof, [0, crownY + 0.38, 0], [0, crownY + 2.35, 0], 0.032, goldLight);
    pushBeam(roof, [0, crownY + 0.72, 0], [0, crownY + 1.28, 0], 0.12, 0x5adbd0);
    pushBeam(roof, [0, crownY + 1.28, 0], [0, crownY + 1.75, 0], 0.075, gold);

    // Tall lattice tower crane, proportioned to the new skyline and independently animated trolley.
    const crane = createBuilder();
    const mastHalf = 0.22;
    const mastHeight = 13.45;
    const mastCorners = [[-mastHalf, 0, -mastHalf], [mastHalf, 0, -mastHalf], [mastHalf, 0, mastHalf], [-mastHalf, 0, mastHalf]];
    for (let i = 0; i < 4; i += 1) {
      const next = (i + 1) % 4;
      pushBeam(crane, mastCorners[i], [mastCorners[i][0], mastHeight, mastCorners[i][2]], 0.065, steelDark);
      for (let level = 0; level < 17; level += 1) {
        const y0 = level * mastHeight / 17;
        const y1 = (level + 1) * mastHeight / 17;
        const p1 = [mastCorners[i][0], y0, mastCorners[i][2]];
        const p2 = [mastCorners[next][0], y0, mastCorners[next][2]];
        const p3 = [mastCorners[i][0], y1, mastCorners[i][2]];
        const p4 = [mastCorners[next][0], y1, mastCorners[next][2]];
        pushBeam(crane, p1, p4, 0.026, level % 2 ? steel : gold);
        pushBeam(crane, p2, p3, 0.026, level % 2 ? gold : steel);
        pushBeam(crane, p1, p2, 0.032, steelDark);
      }
    }
    pushBox(crane, [0, mastHeight + 0.1, 0], [0.72, 0.32, 0.68], steelDark);
    pushBox(crane, [0, mastHeight + 0.29, 0], [0.82, 0.07, 0.75], gold);
    const boomY = mastHeight + 0.37;
    pushBeam(crane, [-2.0, boomY, 0], [6.35, boomY, 0], 0.09, steelDark);
    pushBeam(crane, [-2.0, boomY + 0.07, 0], [6.35, boomY + 0.07, 0], 0.032, goldLight);
    pushBeam(crane, [-2.0, boomY, 0], [0, boomY - 0.8, 0], 0.045, steel);
    pushBeam(crane, [0, boomY - 0.8, 0], [6.35, boomY, 0], 0.045, steel);
    for (let x = -1.7; x < 6.0; x += 0.62) {
      const nextX = Math.min(x + 0.62, 6.35);
      const y1 = x < 0 ? boomY - (x + 2) * 0.4 : boomY - 0.8 * (1 - x / 6.35);
      const y2 = nextX < 0 ? boomY - (nextX + 2) * 0.4 : boomY - 0.8 * (1 - nextX / 6.35);
      pushBeam(crane, [x, y1, 0], [nextX, y2, 0], 0.022, steel);
    }
    pushBeam(crane, [-1.85, boomY, 0], [-1.85, boomY + 0.22, 0], 0.04, gold);

    const trolley = createBuilder();
    pushBox(trolley, [0, 0, 0], [0.65, 0.19, 0.32], gold);
    pushBox(trolley, [0.16, 0.11, 0], [0.2, 0.1, 0.36], steelDark);
    const cable = createBuilder();
    pushBox(cable, [0, -0.5, 0], [0.022, 1, 0.022], goldLight);
    const hook = createBuilder();
    pushBeam(hook, [0, 0, 0], [0, -0.18, 0], 0.04, gold);
    pushBeam(hook, [0, -0.18, 0], [0.12, -0.26, 0], 0.036, gold);
    pushBeam(hook, [0.12, -0.26, 0], [0.2, -0.18, 0], 0.032, gold);

    // Gold drafting motes, deliberately sparse so the model stays crisp.
    for (let i = 0; i < 95; i += 1) {
      const angle = i * 2.399963229728653;
      const radius = 3.6 + ((i * 17) % 45) / 10;
      particles.positions.push(Math.cos(angle) * radius, 0.45 + ((i * 37) % 86) / 10, Math.sin(angle) * radius * 0.68);
      const particlePalette = [0xe2c16a, 0x52d8cb, 0x6299ed, 0xb08ad8, 0xe9917c, 0x84cbd5];
      const shade = particlePalette[i % particlePalette.length];
      particles.colors.push(...colorRGB(shade));
    }

    return {
      staticMesh: staticBuilder, sceneLines: lines, ghostLines: ghost, particleData: particles,
      floors, craneMesh: crane, trolleyMesh: trolley, cableMesh: cable, hookMesh: hook,
      roofMesh: roof, roofLines: roofLineBuilder, floorHeight, baseY, buildingHeight, boomY,
    };
  }

  function buildFallbackSvg() {
    const svg = stage.querySelector(".seranova-architecture-svg");
    if (!svg) return;
    const ns = "http://www.w3.org/2000/svg";
    const fmt = (number) => Number(number).toFixed(2);
    const pt = (point) => `${fmt(point[0])},${fmt(point[1])}`;
    const pts = (points) => points.map(pt).join(" ");
    const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
    const quadPoint = (topLeft, topRight, bottomLeft, bottomRight, u, v) => mix(mix(topLeft, topRight, u), mix(bottomLeft, bottomRight, u), v);
    const line = (a, b, stroke, width = 1, opacity = 1, extra = "") => `<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(b[0])}" y2="${fmt(b[1])}" stroke="${stroke}" stroke-width="${width}" opacity="${opacity}" stroke-linecap="round" ${extra}/>`;
    const polygon = (points, fill, stroke = "none", width = 1, opacity = 1, extra = "") => `<polygon points="${pts(points)}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" opacity="${opacity}" stroke-linejoin="round" ${extra}/>`;
    const markup = [];

    const ground = [[208, 470], [594, 574], [850, 444], [500, 346]];
    const base = [[405, 462], [590, 514], [682, 466], [496, 414]];
    const floorHeight = 13.25;
    const svgFloorCount = SKYSCRAPER_FLOOR_COUNT;
    const centerX = base.reduce((sum, point) => sum + point[0], 0) / base.length;
    const centerY = base.reduce((sum, point) => sum + point[1], 0) / base.length;
    const svgScaleAt = (level) => {
      if (level < 7) return 1;
      if (level < 13) return 0.94;
      if (level < 18) return 0.86;
      if (level < 22) return 0.76;
      return 0.65;
    };
    const svgLevelCorners = (level, scaleOverride = svgScaleAt(level)) => base.map(([x, y]) => [
      centerX + (x - centerX) * scaleOverride,
      centerY + (y - centerY) * scaleOverride - floorHeight * level,
    ]);
    const towerTop = svgLevelCorners(svgFloorCount);

    markup.push(`<defs>
      <radialGradient id="seranova-svg-ambient"><stop offset="0" stop-color="#b88d3a" stop-opacity=".19"/><stop offset=".52" stop-color="#344e40" stop-opacity=".12"/><stop offset="1" stop-color="#07100c" stop-opacity="0"/></radialGradient>
      <linearGradient id="seranova-svg-front" x1="0" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#25443a" stop-opacity=".91"/><stop offset="1" stop-color="#101b16" stop-opacity=".98"/></linearGradient>
      <linearGradient id="seranova-svg-side" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#42564a" stop-opacity=".94"/><stop offset="1" stop-color="#101712" stop-opacity=".98"/></linearGradient>
      <linearGradient id="seranova-svg-slab" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d3b267" stop-opacity=".44"/><stop offset=".38" stop-color="#35473b" stop-opacity=".96"/><stop offset="1" stop-color="#18231d" stop-opacity=".98"/></linearGradient>
      <linearGradient id="seranova-svg-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#89aaa0" stop-opacity=".36"/><stop offset=".45" stop-color="#284e43" stop-opacity=".54"/><stop offset="1" stop-color="#12221b" stop-opacity=".84"/></linearGradient>
      <linearGradient id="seranova-svg-glass-aqua" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a8fff1" stop-opacity=".88"/><stop offset=".3" stop-color="#35cfc3" stop-opacity=".64"/><stop offset="1" stop-color="#12353b" stop-opacity=".92"/></linearGradient>
      <linearGradient id="seranova-svg-glass-blue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b0d4ff" stop-opacity=".86"/><stop offset=".38" stop-color="#568de5" stop-opacity=".65"/><stop offset="1" stop-color="#142b49" stop-opacity=".93"/></linearGradient>
      <linearGradient id="seranova-svg-glass-amber" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b5" stop-opacity=".9"/><stop offset=".35" stop-color="#e7b958" stop-opacity=".63"/><stop offset="1" stop-color="#49351b" stop-opacity=".94"/></linearGradient>
      <linearGradient id="seranova-svg-glass-violet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e4c6ff" stop-opacity=".82"/><stop offset=".42" stop-color="#a47de0" stop-opacity=".6"/><stop offset="1" stop-color="#302345" stop-opacity=".92"/></linearGradient>
      <linearGradient id="seranova-svg-glass-coral" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd1b7" stop-opacity=".84"/><stop offset=".35" stop-color="#e58d78" stop-opacity=".61"/><stop offset="1" stop-color="#402a2b" stop-opacity=".93"/></linearGradient>
      <linearGradient id="seranova-svg-gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#92702e"/><stop offset=".5" stop-color="#f0d07d"/><stop offset="1" stop-color="#96702b"/></linearGradient>
      <linearGradient id="seranova-svg-scan" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#45d8cb" stop-opacity="0"/><stop offset=".5" stop-color="#6be7de" stop-opacity=".7"/><stop offset="1" stop-color="#7ba9ff" stop-opacity="0"/></linearGradient>
      <clipPath id="seranova-svg-ground-clip"><polygon points="${pts(ground)}"/></clipPath>
    </defs>`);
    markup.push(`<g id="seranova-svg-composition">`);
    markup.push(`<ellipse cx="535" cy="330" rx="350" ry="260" fill="url(#seranova-svg-ambient)"/>`);

    // Low-contrast Bengaluru-inspired skyline massing adds context and depth.
    markup.push(`<g id="seranova-svg-skyline" stroke-width="1" stroke-linejoin="round" opacity=".78">`);
    const skylineBlocks = [
      { x: 92, y: 232, w: 48, h: 190, fill: "#12302e", edge: "#2f8f89", light: "#40c9bc" },
      { x: 145, y: 202, w: 45, h: 220, fill: "#172a3d", edge: "#447ab8", light: "#5e9fe7" },
      { x: 194, y: 265, w: 33, h: 157, fill: "#253328", edge: "#92824b", light: "#d9b45f" },
      { x: 228, y: 292, w: 29, h: 130, fill: "#302333", edge: "#916b9a", light: "#c29ad2" },
      { x: 724, y: 250, w: 43, h: 172, fill: "#182a3c", edge: "#4775b4", light: "#6e9ee7" },
      { x: 770, y: 196, w: 56, h: 226, fill: "#12302e", edge: "#327e81", light: "#4bd4c8" },
      { x: 830, y: 272, w: 35, h: 150, fill: "#302333", edge: "#916b9a", light: "#c29ad2" },
    ];
    skylineBlocks.forEach((block, blockIndex) => {
      markup.push(`<rect x="${block.x}" y="${block.y}" width="${block.w}" height="${block.h}" fill="${block.fill}" stroke="${block.edge}" stroke-opacity=".48"/>`);
      for (let row = 0; row < Math.floor(block.h / 17); row += 1) {
        for (let col = 0; col < Math.max(2, Math.floor(block.w / 13)); col += 1) {
          const wx = block.x + 5 + col * ((block.w - 10) / Math.max(1, Math.floor(block.w / 13)));
          const wy = block.y + 7 + row * 17;
          const lit = (row * 3 + col * 5 + blockIndex) % 4 !== 0;
          markup.push(`<rect x="${fmt(wx)}" y="${fmt(wy)}" width="4" height="7" fill="${block.light}" opacity="${lit ? ".35" : ".08"}"/>`);
        }
      }
      markup.push(`<path d="M ${block.x + 4} ${block.y + 5} H ${block.x + block.w - 4}" stroke="${block.light}" stroke-opacity=".52"/>`);
    });
    markup.push(`</g>`);

    // Isometric site platform and precise surveying grid.
    markup.push(polygon(ground, "#101a15", "#a8843c", 1.2, 0.92));
    markup.push(`<g clip-path="url(#seranova-svg-ground-clip)" opacity=".46">`);
    for (let t = 0.04; t < 1; t += 0.075) {
      markup.push(line(mix(ground[0], ground[3], t), mix(ground[1], ground[2], t), t % 0.15 < 0.04 ? "#8d7747" : "#53634e", 0.8, 0.62));
      markup.push(line(mix(ground[0], ground[1], t), mix(ground[3], ground[2], t), t % 0.15 < 0.04 ? "#8d7747" : "#53634e", 0.8, 0.62));
    }
    markup.push(`</g>`);
    markup.push(`<g id="seranova-svg-datum-rings" fill="none" stroke="#b68e3f" stroke-width="1" opacity=".27">
      <ellipse class="svg-ring" cx="525" cy="456" rx="265" ry="74" transform="rotate(-7 525 456)"/>
      <ellipse class="svg-ring" cx="525" cy="456" rx="220" ry="59" transform="rotate(8 525 456)" stroke-dasharray="3 7"/>
      <ellipse class="svg-ring" cx="525" cy="456" rx="174" ry="46" transform="rotate(-11 525 456)"/>
    </g>`);
    [[ground[0][0], ground[0][1]], [ground[1][0], ground[1][1]], [ground[2][0], ground[2][1]], [ground[3][0], ground[3][1]]].forEach(([x, y]) => {
      markup.push(`<path d="M ${fmt(x - 5)} ${fmt(y)} L ${fmt(x + 5)} ${fmt(y)} M ${fmt(x)} ${fmt(y - 5)} L ${fmt(x)} ${fmt(y + 5)}" stroke="#d8b45e" stroke-width="1.2" opacity=".65"/>`);
    });

    // A restrained ghost silhouette previews the full 24-storey massing during construction.
    markup.push(`<g id="seranova-svg-ghost" fill="none" stroke="#d5b664" stroke-width="1.0" opacity=".38">`);
    for (let i = 0; i < 4; i += 1) {
      const next = (i + 1) % 4;
      markup.push(line(base[i], base[next], "#d5b664", 1.1, 0.72));
      markup.push(line(towerTop[i], towerTop[next], "#dfc273", 1.2, 0.82));
      markup.push(line(base[i], towerTop[i], "#dfc273", 1.2, 0.85));
    }
    for (let floor = 4; floor < 24; floor += 4) {
      const level = base.map(([x, y]) => { const scale = svgScaleAt(floor); return [centerX + (x - centerX) * scale, centerY + (y - centerY) * scale - floorHeight * floor]; });
      for (let i = 0; i < 4; i += 1) markup.push(line(level[i], level[(i + 1) % 4], "#9f884e", 0.8, 0.5));
    }
    markup.push(`</g>`);

    // Detailed tower crane: lattice mast, jib, tie rods and counterweight.
    markup.push(`<g id="seranova-svg-crane" stroke-linejoin="round" stroke-linecap="round">`);
    const mastLeft = 267; const mastRight = 287; const mastTop = 65; const mastBottom = 493;
    markup.push(line([mastLeft, mastTop], [mastLeft, mastBottom], "#a9843b", 5, 0.9));
    markup.push(line([mastRight, mastTop], [mastRight, mastBottom], "url(#seranova-svg-gold)", 4, 1, `class="svg-glow-line"`));
    markup.push(line([mastLeft + 2, mastTop], [mastRight - 2, mastTop], "#edcd77", 4, 0.92));
    for (let y = mastTop + 7; y < mastBottom; y += 24) {
      const nextY = Math.min(y + 24, mastBottom);
      markup.push(line([mastLeft, y], [mastRight, nextY], "#bca05d", 1.4, 0.8));
      markup.push(line([mastRight, y], [mastLeft, nextY], "#7d8068", 1.4, 0.83));
      markup.push(line([mastLeft, y], [mastRight, y], "#7d8068", 1, 0.7));
    }
    markup.push(polygon([[258, 487], [296, 487], [304, 501], [250, 501]], "#222f27", "#9e803d", 1, 0.9));
    markup.push(line([274, 64], [158, 91], "#8a7137", 5, 0.95));
    markup.push(line([274, 58], [713, 94], "url(#seranova-svg-gold)", 6, 1, `class="svg-glow-line"`));
    markup.push(line([274, 65], [713, 101], "#746239", 2, 0.95));
    markup.push(line([273, 42], [392, 75], "#d0ad5a", 2, 0.9));
    markup.push(line([392, 75], [713, 94], "#d0ad5a", 1.8, 0.82));
    markup.push(line([158, 91], [158, 100], "#c3a04f", 2, 0.9));
    for (let x = 174; x < 268; x += 19) {
      const y = 87 + (x - 174) * 0.08;
      markup.push(line([x, y], [x + 18, y + 2], "#9b8955", 1.2, 0.86));
    }
    markup.push(`<g id="seranova-svg-trolley" transform="translate(430 82)">
      <path d="M 0 5 L 0 143" stroke="#e2bf6a" stroke-width="1.5" opacity=".9"/>
      <rect x="-17" y="-1" width="35" height="10" rx="1" fill="#d0a84f" stroke="#f0d17b" stroke-width="1"/>
      <rect x="-12" y="-6" width="7" height="5" fill="#75603a"/><rect x="7" y="-6" width="7" height="5" fill="#75603a"/>
      <circle cx="0" cy="145" r="4.2" fill="#0d1712" stroke="#e2bf6a" stroke-width="1.5"/>
      <path d="M 0 149 L 0 160 Q 0 168 8 163 L 13 159" fill="none" stroke="#e2bf6a" stroke-width="2.5"/>
    </g>`);
    markup.push(`</g>`);

    // A tapered 24-storey glass tower. Setback levels create sky gardens and a stepped crown.
    const svgGlassSchemes = ["aqua", "blue", "amber", "violet", "coral"];
    const svgGlassStrokes = ["#68e4d8", "#84b5fb", "#f2cc74", "#c8a2ed", "#f1a28d"];
    for (let floor = 0; floor < svgFloorCount; floor += 1) {
      const bottom = svgLevelCorners(floor);
      const top = svgLevelCorners(floor + 1);
      const floorContent = [];
      floorContent.push(polygon([top[1], top[2], bottom[2], bottom[1]], "url(#seranova-svg-side)", "#a98b4c", 0.75, 0.98));
      floorContent.push(polygon([top[0], top[1], bottom[1], bottom[0]], "url(#seranova-svg-front)", "#c4a153", 0.75, 0.99));
      // Four front-facing window bays with reflective mullions.
      for (let bay = 0; bay < 4; bay += 1) {
        const u0 = 0.055 + bay * 0.245;
        const u1 = u0 + 0.19;
        const v0 = 0.17; const v1 = 0.80;
        const windowPoints = [
          quadPoint(top[0], top[1], bottom[0], bottom[1], u0, v0),
          quadPoint(top[0], top[1], bottom[0], bottom[1], u1, v0),
          quadPoint(top[0], top[1], bottom[0], bottom[1], u1, v1),
          quadPoint(top[0], top[1], bottom[0], bottom[1], u0, v1),
        ];
        const glassIndex = (floor * 2 + bay) % svgGlassSchemes.length;
        const glassFill = `url(#seranova-svg-glass-${svgGlassSchemes[glassIndex]})`;
        const glassStroke = svgGlassStrokes[glassIndex];
        floorContent.push(polygon(windowPoints, glassFill, glassStroke, 0.55, 0.92, `class="svg-glass-pane svg-window-${svgGlassSchemes[glassIndex]}"`));
        floorContent.push(line(windowPoints[0], windowPoints[2], glassStroke, 0.42, 0.42));
        floorContent.push(line(windowPoints[3], windowPoints[2], "#e9f8f5", 0.55, 0.28));
      }
      // Narrower side glazing preserves the isometric view.
      for (let bay = 0; bay < 3; bay += 1) {
        const u0 = 0.11 + bay * 0.30;
        const u1 = u0 + 0.21;
        const windowPoints = [
          quadPoint(top[1], top[2], bottom[1], bottom[2], u0, 0.18),
          quadPoint(top[1], top[2], bottom[1], bottom[2], u1, 0.18),
          quadPoint(top[1], top[2], bottom[1], bottom[2], u1, 0.80),
          quadPoint(top[1], top[2], bottom[1], bottom[2], u0, 0.80),
        ];
        const sideIndex = (floor + bay + 1) % svgGlassSchemes.length;
        floorContent.push(polygon(windowPoints, `url(#seranova-svg-glass-${svgGlassSchemes[sideIndex]})`, svgGlassStrokes[sideIndex], 0.5, 0.82, `class="svg-glass-pane svg-window-${svgGlassSchemes[sideIndex]}"`));
      }
      floorContent.push(polygon(top, "url(#seranova-svg-slab)", "#e0bf6e", 0.75, 1));
      floorContent.push(line(top[0], top[1], "#f0ce78", floor % 6 === 0 ? 1.6 : 1.0, 0.95, `class="svg-glow-line"`));
      floorContent.push(line(top[1], top[2], "#d2ad58", 0.9, 0.8));
      floorContent.push(line(top[3], top[0], "#b2934b", 0.75, 0.75));
      // Overhanging terrace plates mark each architectural setback.
      if ([6, 12, 17, 21].includes(floor)) {
        const terrace = svgLevelCorners(floor, svgScaleAt(floor));
        const raisedTerrace = terrace.map(([x, y]) => [x, y - floorHeight]);
        floorContent.push(polygon(raisedTerrace, "url(#seranova-svg-slab)", "#62dcd0", 1.0, 0.96));
        const gardenA = mix(raisedTerrace[0], raisedTerrace[1], 0.12);
        const gardenB = mix(raisedTerrace[0], raisedTerrace[1], 0.88);
        const gardenTopA = [gardenA[0], gardenA[1] - 6.2];
        const gardenTopB = [gardenB[0], gardenB[1] - 6.2];
        floorContent.push(polygon([gardenA, gardenB, gardenTopB, gardenTopA], "#17392d", "#55d9bf", 0.8, 0.98));
        for (let plant = 0; plant < 5; plant += 1) {
          const t = 0.12 + plant * 0.19;
          const stemBase = mix(gardenTopA, gardenTopB, t);
          const plantHeight = 5.4 + (plant % 3) * 1.8;
          const leafColor = plant % 2 ? "#58b77e" : "#8bd49a";
          floorContent.push(polygon([[stemBase[0] - 4.2, stemBase[1]], [stemBase[0], stemBase[1] - plantHeight], [stemBase[0] + 4.2, stemBase[1]]], leafColor, "#b6edb6", 0.38, 0.96));
          floorContent.push(`<circle cx="${fmt(stemBase[0])}" cy="${fmt(stemBase[1] - plantHeight + 1.2)}" r="1.15" fill="#64e5d5" opacity=".86"/>`);
        }
      }
      const initialLift = floor < SKYSCRAPER_PREBUILT_LEVELS ? 0 : 52 + (floor - (SKYSCRAPER_PREBUILT_LEVELS - 1)) * 2.0;
      floorContent.push(line(top[0], bottom[0], "#c7a65d", 0.55, 0.42));
      markup.push(`<g id="seranova-svg-floor-${floor}" class="svg-storey" data-svg-floor="${floor}" opacity="${floor < SKYSCRAPER_PREBUILT_LEVELS ? "0.98" : "0"}" transform="translate(0 ${initialLift})">${floorContent.join("")}</g>`);
    }

    // Crown lounge, illuminated crown fins and an elegant antenna spire.
    const roof = towerTop.map(([x, y]) => [x, y - 1]);
    const roofCenterX = roof.reduce((sum, point) => sum + point[0], 0) / roof.length;
    const roofCenterY = roof.reduce((sum, point) => sum + point[1], 0) / roof.length;
    markup.push(`<g id="seranova-svg-roof" opacity="0" transform="translate(0 86)">
      ${polygon(roof, "url(#seranova-svg-slab)", "#e8c76f", 1.5, 1)}
      ${polygon([[roofCenterX-22,roofCenterY-3],[roofCenterX+20,roofCenterY-8],[roofCenterX+17,roofCenterY-25],[roofCenterX-18,roofCenterY-21]], "#153b3a", "#69dacf", 1.1, 0.96)}
      ${line([roofCenterX, roofCenterY-20], [roofCenterX, roofCenterY-97], "url(#seranova-svg-gold)", 3.0, 1, `class="svg-glow-line"`)}
      ${line([roofCenterX+5, roofCenterY-25], [roofCenterX+5, roofCenterY-79], "#5fe2d6", 1.2, 0.95)}
      ${line([roofCenterX-8, roofCenterY-38], [roofCenterX+8, roofCenterY-38], "#e8c76f", 1.4, 1)}
      ${line([roofCenterX-5, roofCenterY-57], [roofCenterX+5, roofCenterY-57], "#e8c76f", 1.1, 0.9)}
      ${line([roofCenterX-3, roofCenterY-76], [roofCenterX+3, roofCenterY-76], "#e8c76f", 1.0, 0.9)}
      <circle cx="${fmt(roofCenterX)}" cy="${fmt(roofCenterY-97)}" r="3.2" fill="#6ef4e6" stroke="#e9d084" stroke-width="1.2"/>
    </g>`);

    // Fine measuring ticks and small warm drafting points add scale without clutter.
    markup.push(`<g fill="#d9b45d" opacity=".62">`);
    for (let i = 0; i < 24; i += 1) {
      const x = 145 + (i * 71) % 720;
      const y = 70 + (i * 53) % 490;
      markup.push(`<circle cx="${x}" cy="${y}" r="${i % 4 === 0 ? 1.7 : 0.8}"/>`);
    }
    markup.push(`</g>`);

    markup.push(`</g>`);

    // Technical callouts, level indexing and cyan survey paths make the rendering feel like a live design instrument.
    markup.push(`<g id="seranova-svg-blueprint-hud" fill="none" stroke-linecap="round" stroke-linejoin="round">`);
    markup.push(`<path d="M 324 176 H 286 V 224 M 324 176 l -7 -4 M 324 176 l -7 4" stroke="#5bd9cf" stroke-width="1.2" opacity=".82"/>`);
    markup.push(`<path d="M 687 258 H 735 V 305 M 735 305 l -4 -7 M 735 305 l 4 -7" stroke="#7aa8f0" stroke-width="1.2" opacity=".84"/>`);
    markup.push(`<path d="M 375 475 V 527 H 438 M 438 527 l -7 -4 M 438 527 l -7 4" stroke="#e7bd62" stroke-width="1.2" opacity=".84"/>`);
    markup.push(`<path d="M 183 238 H 222 M 183 247 H 211 M 183 256 H 222" stroke="#4ac8bd" stroke-width="1" opacity=".5"/>`);
    markup.push(`<path d="M 787 341 H 823 M 787 350 H 814 M 787 359 H 823" stroke="#7aa8f0" stroke-width="1" opacity=".56"/>`);
    markup.push(`<text x="286" y="166" fill="#80e7de" stroke="none" font-size="9" letter-spacing="1.8" opacity=".82">FRAME / S-24</text>`);
    markup.push(`<text x="740" y="322" fill="#9dbcf2" stroke="none" font-size="8" letter-spacing="1.5" opacity=".8">GLAZING STUDY</text>`);
    markup.push(`<text x="440" y="531" fill="#e8c16b" stroke="none" font-size="8" letter-spacing="1.5" opacity=".84">FOUNDATION DATUM</text>`);
    markup.push(`<path id="seranova-svg-light-trail" d="M 185 394 C 290 330 354 355 429 290 S 595 220 733 178" stroke="url(#seranova-svg-scan)" stroke-width="3" opacity=".54"/>`);
    markup.push(`</g>`);

    // Fine measuring ticks and small warm drafting points add scale without clutter.
    markup.push(`<g class="svg-particle-field" fill="#d9b45d" opacity=".62">`);
    for (let i = 0; i < 24; i += 1) {
      const x = 145 + (i * 71) % 720;
      const y = 70 + (i * 53) % 490;
      const colors = ["#d9b45d", "#53d6cb", "#78a9f0", "#c89fe3", "#e8947d"];
      markup.push(`<circle class="svg-particle svg-particle-${i % 5}" cx="${x}" cy="${y}" r="${i % 4 === 0 ? 1.7 : 0.8}" fill="${colors[i % colors.length]}" data-particle="${i}"/>`);
    }
    markup.push(`</g>`);

    svg.innerHTML = markup.join("");
    stage.classList.add("has-svg-fallback");
    resizeFallbackSvgLayout();
  }

  function resizeFallbackSvgLayout() {
    const svg = stage.querySelector(".seranova-architecture-svg");
    const composition = svg && svg.querySelector("#seranova-svg-composition");
    if (!svg || !composition) return;
    const aspect = Math.max(0.35, stage.clientWidth / Math.max(1, stage.clientHeight));
    if (window.innerWidth <= 900) {
      // Reframe the wide isometric composition for portrait phones and tablets
      // so the building, crane mast and site plinth all stay in frame.
      const viewWidth = clamp(aspect * 600, 300, 1000);
      const horizontalScale = (viewWidth * 0.92) / 760;
      svg.setAttribute("viewBox", `${(500 - viewWidth / 2).toFixed(2)} 0 ${viewWidth.toFixed(2)} 600`);
      composition.setAttribute("transform", `translate(500 0) scale(${horizontalScale.toFixed(4)} 1) translate(-500 0)`);
    } else {
      svg.setAttribute("viewBox", "0 0 1000 600");
      composition.removeAttribute("transform");
    }
  }

  function updateFallbackSvg(progress) {
    const svg = stage.querySelector(".seranova-architecture-svg");
    if (!svg || !stage.classList.contains("has-svg-fallback")) return;
    svg.querySelectorAll("[data-svg-floor]").forEach((floorElement) => {
      const index = Number(floorElement.getAttribute("data-svg-floor"));
      const build = index < SKYSCRAPER_PREBUILT_LEVELS ? 1 : smooth((progress - (0.02 + (index - SKYSCRAPER_PREBUILT_LEVELS) * 0.028)) / 0.48);
      const lift = (1 - build) * (52 + Math.max(0, index - (SKYSCRAPER_PREBUILT_LEVELS - 1)) * 2.0);
      const tilt = (1 - build) * (index % 2 === 0 ? -0.55 : 0.55);
      floorElement.setAttribute("transform", `translate(0 ${lift.toFixed(2)}) rotate(${tilt.toFixed(2)} ${SKYSCRAPER_SVG_CENTER_X.toFixed(2)} 330)`);
      floorElement.setAttribute("opacity", (0.98 * build).toFixed(3));
    });
    const roof = svg.querySelector("#seranova-svg-roof");
    if (roof) {
      const crown = smooth((progress - 0.76) / 0.22);
      roof.setAttribute("transform", `translate(0 ${((1 - crown) * 86).toFixed(2)})`);
      roof.setAttribute("opacity", (0.98 * crown).toFixed(3));
    }
    const trolley = svg.querySelector("#seranova-svg-trolley");
    if (trolley) trolley.setAttribute("transform", `translate(${(350 + progress * 290).toFixed(2)} ${(82 + progress * 8).toFixed(2)})`);
    const rings = svg.querySelectorAll(".svg-ring");
    rings.forEach((ring, index) => ring.setAttribute("transform", `rotate(${(index % 2 ? -1 : 1) * progress * (12 + index * 4)} 525 456)`));
    const ghost = svg.querySelector("#seranova-svg-ghost");
    if (ghost) ghost.setAttribute("opacity", (0.18 * (1 - smooth(progress / 0.20))).toFixed(3));
    const trail = svg.querySelector("#seranova-svg-light-trail");
    if (trail) trail.setAttribute("opacity", (0.14 + 0.56 * Math.sin(progress * Math.PI)).toFixed(3));
    const blueprint = svg.querySelector("#seranova-svg-blueprint-hud");
    if (blueprint) blueprint.setAttribute("opacity", (0.22 + 0.22 * Math.sin(progress * Math.PI)).toFixed(3));
    svg.querySelectorAll("[data-particle]").forEach((particle) => {
      const index = Number(particle.getAttribute("data-particle"));
      const drift = Math.sin(progress * Math.PI * 2 + index * 0.7) * (2.2 + (index % 4));
      particle.setAttribute("transform", `translate(${(Math.cos(progress * 2.4 + index) * 2.2).toFixed(2)} ${drift.toFixed(2)})`);
      particle.setAttribute("opacity", (0.25 + 0.66 * (0.5 + 0.5 * Math.sin(progress * 3 + index))).toFixed(3));
    });
  }

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader) || "Shader compilation failed";
      gl.deleteShader(shader);
      throw new Error(error);
    }
    return shader;
  }

  function createProgram(vertexSource, fragmentSource) {
    const program = gl.createProgram();
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "WebGL program link failed");
    return program;
  }

  function initialiseShaders() {
    const meshVertex = `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      attribute vec3 aColor;
      uniform mat4 uModel;
      uniform mat4 uView;
      uniform mat4 uProjection;
      uniform mat3 uNormalMatrix;
      varying vec3 vColor;
      varying vec3 vNormal;
      void main() {
        vec4 worldPosition = uModel * vec4(aPosition, 1.0);
        gl_Position = uProjection * uView * worldPosition;
        vColor = aColor;
        vNormal = normalize(uNormalMatrix * aNormal);
      }
    `;
    const meshFragment = `
      precision mediump float;
      uniform float uAlpha;
      uniform float uEmissive;
      uniform vec3 uLightDirection;
      varying vec3 vColor;
      varying vec3 vNormal;
      void main() {
        vec3 normal = normalize(vNormal);
        float diffuse = max(dot(normal, normalize(uLightDirection)), 0.0);
        float rim = pow(1.0 - abs(normal.z), 2.0) * 0.12;
        vec3 lit = vColor * (0.38 + diffuse * 0.78) + vColor * uEmissive + vec3(rim * 0.18);
        gl_FragColor = vec4(lit, uAlpha);
      }
    `;
    const lineVertex = `
      attribute vec3 aPosition;
      attribute vec3 aColor;
      uniform mat4 uModel;
      uniform mat4 uView;
      uniform mat4 uProjection;
      uniform float uPointSize;
      varying vec3 vColor;
      void main() {
        gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
        gl_PointSize = uPointSize;
        vColor = aColor;
      }
    `;
    const lineFragment = `
      precision mediump float;
      uniform float uAlpha;
      varying vec3 vColor;
      void main() { gl_FragColor = vec4(vColor, uAlpha); }
    `;
    meshProgram = createProgram(meshVertex, meshFragment);
    lineProgram = createProgram(lineVertex, lineFragment);
    meshProgram.locations = {
      position: gl.getAttribLocation(meshProgram, "aPosition"),
      normal: gl.getAttribLocation(meshProgram, "aNormal"),
      color: gl.getAttribLocation(meshProgram, "aColor"),
      model: gl.getUniformLocation(meshProgram, "uModel"),
      view: gl.getUniformLocation(meshProgram, "uView"),
      projection: gl.getUniformLocation(meshProgram, "uProjection"),
      normalMatrix: gl.getUniformLocation(meshProgram, "uNormalMatrix"),
      alpha: gl.getUniformLocation(meshProgram, "uAlpha"),
      emissive: gl.getUniformLocation(meshProgram, "uEmissive"),
      light: gl.getUniformLocation(meshProgram, "uLightDirection"),
    };
    lineProgram.locations = {
      position: gl.getAttribLocation(lineProgram, "aPosition"),
      color: gl.getAttribLocation(lineProgram, "aColor"),
      model: gl.getUniformLocation(lineProgram, "uModel"),
      view: gl.getUniformLocation(lineProgram, "uView"),
      projection: gl.getUniformLocation(lineProgram, "uProjection"),
      alpha: gl.getUniformLocation(lineProgram, "uAlpha"),
      pointSize: gl.getUniformLocation(lineProgram, "uPointSize"),
    };
  }

  function uploadMesh(builder) {
    if (!builder || !builder.positions.length) return null;
    const result = { count: builder.positions.length / 3 };
    result.position = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, result.position);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(builder.positions), gl.STATIC_DRAW);
    result.normal = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, result.normal);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(builder.normals), gl.STATIC_DRAW);
    result.color = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, result.color);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(builder.colors), gl.STATIC_DRAW);
    return result;
  }

  function uploadLines(builder, mode) {
    if (!builder || !builder.positions.length) return null;
    const result = { count: builder.positions.length / 3, mode: mode || gl.LINES };
    result.position = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, result.position);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(builder.positions), gl.STATIC_DRAW);
    result.color = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, result.color);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(builder.colors), gl.STATIC_DRAW);
    return result;
  }

  function bindAttribute(buffer, location, size) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }

  function drawMesh(mesh, model, view, projection, alpha = 1, emissive = 0) {
    if (!mesh || alpha <= 0.002) return;
    const loc = meshProgram.locations;
    gl.useProgram(meshProgram);
    bindAttribute(mesh.position, loc.position, 3);
    bindAttribute(mesh.normal, loc.normal, 3);
    bindAttribute(mesh.color, loc.color, 3);
    gl.uniformMatrix4fv(loc.model, false, new Float32Array(model));
    gl.uniformMatrix4fv(loc.view, false, new Float32Array(view));
    gl.uniformMatrix4fv(loc.projection, false, new Float32Array(projection));
    gl.uniformMatrix3fv(loc.normalMatrix, false, new Float32Array(normalMatrixFromModel(model)));
    gl.uniform1f(loc.alpha, alpha);
    gl.uniform1f(loc.emissive, emissive);
    gl.uniform3f(loc.light, -0.42, 0.84, 0.35);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }

  function drawLines(mesh, model, view, projection, alpha = 1, pointSize = 1.0) {
    if (!mesh || alpha <= 0.002) return;
    const loc = lineProgram.locations;
    gl.useProgram(lineProgram);
    bindAttribute(mesh.position, loc.position, 3);
    bindAttribute(mesh.color, loc.color, 3);
    gl.uniformMatrix4fv(loc.model, false, new Float32Array(model));
    gl.uniformMatrix4fv(loc.view, false, new Float32Array(view));
    gl.uniformMatrix4fv(loc.projection, false, new Float32Array(projection));
    gl.uniform1f(loc.alpha, alpha);
    gl.uniform1f(loc.pointSize, pointSize);
    gl.drawArrays(mesh.mode, 0, mesh.count);
  }

  function resizeRenderer() {
    if (!gl) return;
    const rect = stage.getBoundingClientRect();
    canvasWidth = Math.max(1, Math.round(rect.width));
    canvasHeight = Math.max(1, Math.round(rect.height));
    pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.15 : 1.5);
    canvas.width = Math.max(1, Math.floor(canvasWidth * pixelRatio));
    canvas.height = Math.max(1, Math.floor(canvasHeight * pixelRatio));
    gl.viewport(0, 0, canvas.width, canvas.height);
    requestRender();
  }

  function updateScrollProgress() {
    const rect = section.getBoundingClientRect();
    const scrollableDistance = Math.max(1, section.offsetHeight - window.innerHeight);
    targetProgress = clamp(-rect.top / scrollableDistance);
    section.style.setProperty("--scene-progress", targetProgress.toFixed(4));
    stage.style.setProperty("--scene-progress", targetProgress.toFixed(4));
    stage.style.setProperty("--scene-turn", `${-24 + targetProgress * 19}deg`);
    stage.style.setProperty("--scene-rise", `${(1 - targetProgress) * 18}px`);
    stage.style.setProperty("--scanline-position", `${8 + targetProgress * 82}%`);
    const scanline = document.getElementById("seranova-3d-scanline");
    if (scanline) scanline.style.top = `${8 + targetProgress * 82}%`;
    const hudLevel = document.getElementById("seranova-3d-hud-level");
    const hudPercent = document.getElementById("seranova-3d-hud-percent");
    const hudMeter = document.getElementById("seranova-3d-hud-meter-fill");
    const hudPhase = document.getElementById("seranova-3d-hud-phase");
    if (hudLevel) hudLevel.textContent = `${String(SKYSCRAPER_PREBUILT_LEVELS + Math.round(targetProgress * (SKYSCRAPER_FLOOR_COUNT - SKYSCRAPER_PREBUILT_LEVELS))).padStart(2, "0")} / ${String(SKYSCRAPER_FLOOR_COUNT).padStart(2, "0")}`;
    if (hudPercent) hudPercent.textContent = `${String(Math.round(targetProgress * 100)).padStart(2, "0")}%`;
    if (hudMeter) hudMeter.style.transform = `scaleX(${targetProgress})`;
    if (hudPhase) hudPhase.textContent = targetProgress < 0.16 ? "PODIUM + CORE" : targetProgress < 0.43 ? "TOWER FRAME" : targetProgress < 0.72 ? "FACADE LIGHTING" : targetProgress < 0.91 ? "CROWN + SKY GARDENS" : "STRUCTURE COMPLETE";
    if (progressFill) progressFill.style.transform = `scaleX(${targetProgress})`;
    const progressBar = section.querySelector(".seranova-3d-progress");
    if (progressBar) progressBar.setAttribute("aria-valuenow", String(Math.round(targetProgress * 100)));
    updateFallbackSvg(targetProgress);

    // Keep the visual alive without WebGL: the layered CSS fallback settles into place,
    // while the crane hook travels across its jib as the visitor scrolls.
    const fallbackFloors = stage.querySelectorAll(".fallback-floor");
    fallbackFloors.forEach((floorElement, index) => {
      const build = index < SKYSCRAPER_PREBUILT_LEVELS ? 1 : smooth((targetProgress - (0.02 + (index - SKYSCRAPER_PREBUILT_LEVELS) * 0.028)) / 0.48);
      const lift = (1 - build) * (52 + Math.max(0, index - (SKYSCRAPER_PREBUILT_LEVELS - 1)) * 2.0);
      const tilt = (1 - build) * (index % 2 === 0 ? -8 : 8);
      floorElement.style.transform = `translate3d(0, ${lift.toFixed(1)}px, 43px) rotateX(${tilt.toFixed(2)}deg)`;
      floorElement.style.opacity = (build * 0.98).toFixed(3);
      floorElement.style.boxShadow = `0 0 ${Math.round(4 + build * 13)}px rgba(209, 167, 77, ${(0.05 + build * 0.2).toFixed(3)}), inset 0 0 12px rgba(227, 190, 102, 0.1)`;
    });
    const fallbackCable = stage.querySelector(".fallback-crane .crane-cable");
    if (fallbackCable) fallbackCable.style.left = `${48 + targetProgress * 31}%`;
    requestRender();
  }

  function requestRender() {
    if (!rafId && gl && isVisible && !sceneFailed) rafId = window.requestAnimationFrame(renderFrame);
  }

  function renderFrame(timestamp) {
    rafId = 0;
    if (!gl || !isVisible || sceneFailed) return;
    const elapsed = timestamp * 0.001;
    // Cap mobile rendering to a stable 30 fps to reduce heat and battery use.
    // Keep lastFrame at the last rendered frame when a frame is skipped.
    if (window.innerWidth < 700 && lastFrame && elapsed - lastFrame < 1 / 30) {
      rafId = window.requestAnimationFrame(renderFrame);
      return;
    }
    const delta = lastFrame ? Math.min(0.05, elapsed - lastFrame) : 0.016;
    lastFrame = elapsed;
    const ease = reduceMotionQuery.matches ? 1 : 1 - Math.pow(0.0008, delta);
    animatedProgress = lerp(animatedProgress, targetProgress, ease);
    activePointerX = lerp(activePointerX, pointerX, reduceMotionQuery.matches ? 1 : 0.055);
    activePointerY = lerp(activePointerY, pointerY, reduceMotionQuery.matches ? 1 : 0.055);
    try {
      renderScene(elapsed);
    } catch (error) {
      sceneFailed = true;
      stage.classList.remove("is-3d-ready");
      stage.classList.add("is-3d-fallback");
      console.warn("Seranova 3D rendering stopped; showing the scroll-driven SVG scene instead:", error);
      return;
    }
    if (!reduceMotionQuery.matches) rafId = window.requestAnimationFrame(renderFrame);
  }

  function renderScene(elapsed) {
    const progress = animatedProgress;
    const viewWidth = Math.max(1, canvasWidth);
    const viewHeight = Math.max(1, canvasHeight);
    const compactViewport = viewWidth / viewHeight < 1.12;
    const orbit = -0.46 + progress * 1.46 + activePointerX * (reduceMotionQuery.matches ? 0 : 0.10);
    const radius = (compactViewport ? 19.0 : 20.4) - progress * 0.9;
    const eye = [Math.sin(orbit) * radius, 9.35 + Math.sin(progress * Math.PI) * 0.52 + activePointerY * (reduceMotionQuery.matches ? 0 : 0.28), Math.cos(orbit) * radius];
    const view = matLookAt(eye, [0, 6.05 + progress * 0.34, 0], [0, 1, 0]);
    const projection = matPerspective((compactViewport ? 43 : 41) * Math.PI / 180, viewWidth / viewHeight, 0.1, 140);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    drawMesh(staticMesh, identity(), view, projection, 1, 0.015);
    drawLines(sceneLines, identity(), view, projection, compactViewport ? 0.24 : 0.33, 1);

    const structureProgress = smooth((progress - 0.015) / 0.78);
    drawLines(ghostLines, identity(), view, projection, (compactViewport ? 0.10 : 0.16) * (1 - smooth(progress / 0.22)), 0.9);

    const craneRotation = -0.055 + progress * 0.24 + activePointerX * (reduceMotionQuery.matches ? 0 : 0.025);
    const craneModel = matMultiply(matTranslate(-5.45, 0.22, 0.1), matRotateY(craneRotation));
    drawMesh(craneMesh, craneModel, view, projection, 1, 0.08);

    const boomY = 13.45 + 0.37;
    const trolleyX = -1.55 + progress * 7.1;
    const cableLength = 0.72 + (1 - smooth((progress - 0.12) / 0.78)) * 2.15;
    const trolleyModel = matMultiply(craneModel, matTranslate(trolleyX, boomY, 0));
    drawMesh(trolleyMesh, trolleyModel, view, projection, 1, 0.08);
    const cableModel = matMultiply(trolleyModel, matScale(1, cableLength, 1));
    drawMesh(cableMesh, cableModel, view, projection, 1, 0.08);
    const hookModel = matMultiply(trolleyModel, matTranslate(0, -cableLength - 0.12, 0));
    drawMesh(hookMesh, hookModel, view, projection, 1, 0.1);

    // Floor plates and supports rise into place one level at a time.
    const assembledFloors = [];
    floors.forEach((floor) => {
      // Eight lower tower levels establish the skyscraper silhouette; the remaining floors assemble on scroll.
      const build = floor.floor < SKYSCRAPER_PREBUILT_LEVELS ? 1 : smooth((progress - (0.02 + (floor.floor - SKYSCRAPER_PREBUILT_LEVELS) * 0.028)) / 0.48);
      if (build > 0.008) {
        const offset = floor.finalY - (1 - build) * 1.85;
        const tilt = (1 - build) * (floor.floor % 2 === 0 ? -0.012 : 0.012);
        const model = matMultiply(matTranslate(0, offset, 0), matMultiply(matRotateZ(tilt), matScale(floor.footprintScale, floor.height, floor.footprintScale)));
        drawMesh(uploadedFloorStructure(floor), model, view, projection, 1, floor.floor % 6 === 0 ? 0.05 : 0.022);
        assembledFloors.push({ floor, model, build });
      }
    });

    // Glass is blended after the structural frame; color tones vary gently by tower tier.
    gl.depthMask(false);
    assembledFloors.forEach(({ floor, model }) => {
      const glazing = floor.floor < SKYSCRAPER_PREBUILT_LEVELS ? 0.9 : smooth((progress - (0.10 + Math.max(0, floor.floor - SKYSCRAPER_PREBUILT_LEVELS) * 0.026)) / 0.36);
      drawMesh(uploadedFloorGlass(floor), model, view, projection, 0.10 + glazing * 0.66, 0.075 + (floor.floor % 6 === 0 ? 0.035 : 0));
    });
    gl.depthMask(true);

    const roofProgress = smooth((progress - 0.76) / 0.22);
    const crownScale = footprintScaleAt(floors.length - 1);
    const crownModel = matMultiply(matTranslate(0, (1 - roofProgress) * 1.65, 0), matScale(crownScale, 1, crownScale));
    drawMesh(roofMesh, crownModel, view, projection, roofProgress, 0.12);
    drawLines(roofLines, crownModel, view, projection, 0.10 + roofProgress * 0.9, 1.5);

    // Particles remain subtle and slow; reduced-motion switches them to static.
    if (particleBuffer) {
      const particleModel = reduceMotionQuery.matches ? identity() : matRotateY(elapsed * 0.012 + progress * 0.22);
      drawLines(particleBuffer, particleModel, view, projection, 0.25 + structureProgress * 0.28, 1.4 * pixelRatio);
    }
  }

  const floorUploadCache = new WeakMap();
  function uploadedFloorStructure(floor) {
    if (!floorUploadCache.has(floor.structure)) floorUploadCache.set(floor.structure, uploadMesh(floor.structure));
    return floorUploadCache.get(floor.structure);
  }
  const glassUploadCache = new WeakMap();
  function uploadedFloorGlass(floor) {
    if (!glassUploadCache.has(floor.glass)) glassUploadCache.set(floor.glass, uploadMesh(floor.glass));
    return glassUploadCache.get(floor.glass);
  }

  function onPointerMove(event) {
    if (reduceMotionQuery.matches || window.innerWidth < 760) return;
    const rect = stage.getBoundingClientRect();
    pointerX = clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
    pointerY = clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
  }

  function onPointerLeave() {
    pointerX = 0;
    pointerY = 0;
  }

  function initScene() {
    try {
      gl = canvas.getContext("webgl", { alpha: true, antialias: true, depth: true, powerPreference: "high-performance" })
        || canvas.getContext("experimental-webgl", { alpha: true, antialias: true, depth: true });
      if (!gl) throw new Error("WebGL is not available in this browser.");
      initialiseShaders();
      const scene = buildSiteGeometry();
      staticMesh = uploadMesh(scene.staticMesh);
      sceneLines = uploadLines(scene.sceneLines, gl.LINES);
      ghostLines = uploadLines(scene.ghostLines, gl.LINES);
      particleBuffer = uploadLines(scene.particleData, gl.POINTS);
      craneMesh = uploadMesh(scene.craneMesh);
      trolleyMesh = uploadMesh(scene.trolleyMesh);
      cableMesh = uploadMesh(scene.cableMesh);
      hookMesh = uploadMesh(scene.hookMesh);
      roofMesh = uploadMesh(scene.roofMesh);
      roofLines = uploadLines(scene.roofLines, gl.LINES);
      floors = scene.floors;
      // Warm ambient glow and crisp material edges: depth testing is retained while glass blends.
      gl.clearDepth(1);
      resizeRenderer();
      stage.classList.add("is-3d-ready");
      stage.classList.remove("is-3d-fallback", "has-svg-fallback");
      canvas.setAttribute("aria-label", "Interactive three-dimensional 24-storey skyscraper with stepped sky gardens, glass façade, illuminated crown, tower crane and architectural lighting");
      requestRender();
    } catch (error) {
      sceneFailed = true;
      stage.classList.add("is-3d-fallback");
      stage.classList.remove("is-3d-ready");
      // Leave a useful fallback rather than hiding the experience if WebGL is unavailable.
      console.warn("Seranova 3D scene fell back to its CSS illustration:", error);
    }
  }

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    sceneFailed = true;
    stage.classList.remove("is-3d-ready");
    stage.classList.add("is-3d-fallback", "has-svg-fallback");
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
  });

  function syncStickyHeaderOffset() {
    const header = document.querySelector(".header");
    if (!header) {
      section.style.setProperty("--seranova-header-offset", "0px");
      return;
    }
    const rect = header.getBoundingClientRect();
    const headerHeight = Math.ceil(rect.height);
    const stickyHeaderVisible = getComputedStyle(header).position === "sticky" && rect.top >= -1 && rect.bottom > 0;
    // Only reserve header space when it is actually on-screen. Once a non-sticky
    // header has scrolled away, the full viewport belongs to the cinematic tower.
    section.style.setProperty("--seranova-header-offset", `${stickyHeaderVisible ? headerHeight : 0}px`);
  }

  section.addEventListener("pointermove", onPointerMove, { passive: true });
  section.addEventListener("pointerleave", onPointerLeave, { passive: true });
  window.addEventListener("scroll", () => {
    syncStickyHeaderOffset();
    updateScrollProgress();
  }, { passive: true });
  window.addEventListener("resize", () => {
    syncStickyHeaderOffset();
    resizeRenderer();
    resizeFallbackSvgLayout();
    updateScrollProgress();
  }, { passive: true });

  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(() => {
      resizeRenderer();
      resizeFallbackSvgLayout();
    });
    resizeObserver.observe(stage);
  }

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      isVisible = entries.some((entry) => entry.isIntersecting);
      if (isVisible) requestRender();
      else if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
        lastFrame = 0;
      }
    }, { rootMargin: "120px 0px" });
    observer.observe(section);
  } else {
    isVisible = true;
  }

  syncStickyHeaderOffset();
  buildFallbackSvg();
  updateScrollProgress();
  initScene();
})();
