/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import type { NSEPageCurlCylinder, NSEPageSize, NSEPageTearPose } from "./nsePageTypes";

/** One frame of a 3D page curl. */
export interface NSEPageCurlFrame {
  readonly cylinder: NSEPageCurlCylinder;
  /** The page's untransformed size, in CSS px. */
  readonly size: NSEPageSize;
  /** How far the canvas reaches past the page on each side, in CSS px. */
  readonly margin: NSEPageCurlMargin;
  /** Camera distance for the roll's foreshortening, in CSS px. */
  readonly perspective: number;
  /** 0–1: how dark the lifted paper's shadow is. */
  readonly shadowStrength: number;
  /**
   * What the paper's underside shows: the page's own print back to front
   * through blank paper, as a single page in iBooks does, or the back surface
   * (the reverse page of a two-page spread).
   */
  readonly underside: "print-through" | "back";
  /** A sheet tearing from its binding: its ragged stub and its flight. */
  readonly tear?: NSEPageTearPose | null;
}

/** How far a curl's canvas reaches past the page on each side, in CSS px. */
export interface NSEPageCurlMargin {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

// The page as a grid in page px, rolled over the curl. Paper past the bend
// line follows the curl's profile: a tight crest, then an ever looser turn
// to its tip, the same all along the bend line so the paper never stretches.
// This mapping matches projectNSEPageCurlPoint in nsePageGeometry.
//
// The same mesh draws the shadow mask (uPass 1): each lifted point is cast
// onto the page from a light just above and behind the camera, so the shadow
// stays consistent with the perspective the paper itself is drawn in.
// Lifted paper writes its height into the mask, sorted into three bands, so
// each band can be blurred by its own penumbra: paper near the page casts a
// crisp shadow, paper held high a broad faint one.
const paperVertexSource = `#version 300 es
in vec2 aPage;
uniform vec2 uSize;
uniform vec2 uBend;
uniform vec2 uNormal;
uniform float uRadius;
uniform float uSweep;
uniform float uFocal;
uniform float uDepthRange;
uniform vec4 uCanvas;
uniform float uPass;
uniform vec3 uLight;
uniform float uStub;
uniform vec3 uFlight;
uniform vec3 uFlightTurn;
out vec2 vUv;
out vec2 vPage;
out float vAngle;
out float vAlong;
out float vHeight;
out vec3 vNormal;
const float CREST = 1.7278760; // 0.55π
const float OPEN = 3.0;
const float GROWTH = 1.0;
// The open turn: a spiral whose radius grows with the paper, at u = 1 + g·s/open.
vec3 spiral(float u, float crest, float cx, float cz, float open) {
  float k = 1.0 / GROWTH;
  float scale = open / GROWTH / (1.0 + k * k);
  float a = crest + k * log(u);
  float c = cos(a);
  float s = sin(a);
  return vec3(
    cx + scale * (u * (c + k * s) - (cos(crest) + k * sin(crest))),
    cz + scale * (u * (s - k * c) - (sin(crest) - k * cos(crest))),
    a
  );
}
vec3 profile(float s, float r, float sweep) {
  if (r <= 0.5) return vec3(s * cos(sweep), max(s * sin(sweep), 0.5), sweep);
  float crest = min(sweep, CREST);
  if (s < r * crest) {
    float a = s / r;
    return vec3(r * sin(a), r * (1.0 - cos(a)), a);
  }
  float cx = r * sin(crest);
  float cz = r * (1.0 - cos(crest));
  float open = r * OPEN;
  float rest = s - r * crest;
  float end = exp((sweep - crest) * GROWTH);
  float openLength = open * (end - 1.0) / GROWTH;
  if (rest < openLength) return spiral(1.0 + GROWTH * rest / open, crest, cx, cz, open);
  vec3 last = spiral(end, crest, cx, cz, open);
  float straight = rest - openLength;
  return vec3(last.x + straight * cos(sweep), max(last.y + straight * sin(sweep), 0.5), sweep);
}
void main() {
  float along = dot(aPage - uBend, uNormal);
  vec3 position = vec3(aPage, 0.0);
  float angle = 0.0;
  // A torn sheet's stub stays flat where it is bound.
  if (uStub < 0.5 && along > 0.0) {
    vec2 base = aPage - uNormal * along;
    vec3 p = profile(along, uRadius, uSweep);
    position = vec3(base + uNormal * p.x, p.y);
    angle = p.z;
  }
  vec2 facing = -uNormal * sin(angle);
  if (uStub < 0.5) {
    // A sheet torn free is carried off, turning about the corner it was held by.
    float c = cos(uFlightTurn.z);
    float s = sin(uFlightTurn.z);
    mat2 turn = mat2(c, s, -s, c);
    position.xy = uFlightTurn.xy + turn * (position.xy - uFlightTurn.xy) + uFlight.xy;
    position.z += uFlight.z;
    facing = turn * facing;
  }
  vNormal = vec3(facing, cos(angle));
  vHeight = position.z;
  vUv = aPage / uSize;
  vPage = aPage;
  vAngle = angle;
  vAlong = along;
  vec2 projected;
  float depth;
  if (uPass > 0.5) {
    projected = uLight.xy + (position.xy - uLight.xy) * (uLight.z / max(uLight.z - position.z, 1.0));
    depth = 0.0;
  } else {
    float scale = uFocal / max(uFocal - position.z, 1.0);
    vec2 centre = uSize * 0.5;
    projected = centre + (position.xy - centre) * scale;
    depth = -position.z / uDepthRange;
  }
  vec2 clip = (projected - uCanvas.xy) / uCanvas.zw * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, depth, 1.0);
}`;

const paperFragmentSource = `#version 300 es
precision highp float;
uniform sampler2D uFront;
uniform sampler2D uBack;
uniform vec2 uSize;
uniform vec2 uNormal;
uniform float uRadius;
uniform float uPrint;
uniform float uPrintThrough;
uniform vec3 uPaper;
uniform float uPass;
uniform vec3 uBands;
uniform sampler2D uShadow;
uniform vec3 uShadowWeights;
uniform vec2 uViewport;
uniform float uStub;
uniform float uOpacity;
uniform float uTear;
uniform vec4 uTearAxis;
uniform vec2 uTearOffset;
uniform vec3 uTearLine;
uniform vec2 uTorn;
in vec2 vUv;
in vec2 vPage;
in float vAngle;
in float vAlong;
in float vHeight;
in vec3 vNormal;
out vec4 outColour;
// Light from almost straight ahead, a touch above, as iBooks lights its pages:
// the roll darkens as it turns away from the reader, wherever it lies.
const vec3 LIGHT = vec3(-0.1, -0.2, 1.0);
// How much of the lifted paper's shadow falls here: the blurred bands, each
// weighted by how dark its shadow is.
float shadowAt(vec2 fragment) {
  return dot(texture(uShadow, fragment / uViewport).rgb, uShadowWeights);
}
// The ragged line a sheet tears along, below its binding: coarse and fine
// wander at once, as torn paper has. tearLine in nsePageGeometry matches it.
float tearHash(float i, float seed) {
  return fract(sin(i * 12.9898 + seed * 78.233) * 43758.5453);
}
float tearNoise(float x, float seed) {
  float i = floor(x);
  float f = x - i;
  return mix(tearHash(i, seed), tearHash(i + 1.0, seed), f * f * (3.0 - 2.0 * f)) * 2.0 - 1.0;
}
float tearLine(float s) {
  return uTearLine.x + uTearLine.y * (
    0.6 * tearNoise(s / 41.0, uTearLine.z) +
    0.28 * tearNoise(s / 12.5, uTearLine.z + 1.7) +
    0.12 * tearNoise(s / 3.4, uTearLine.z + 3.1));
}
void main() {
  // A tearing page: the stub is the paper above the tear line, the sheet the
  // paper below it. Along the torn stretch each keeps a ragged, fibrous edge;
  // where the paper is still whole, the stub reaches under the sheet's edge.
  float coverage = 1.0;
  float rim = 0.0;
  float contact = 0.0;
  if (uTear > 0.5) {
    float along = dot(vPage, uTearAxis.xy) + uTearOffset.x;
    float depth = dot(vPage, uTearAxis.zw) + uTearOffset.y;
    float beyond = depth - tearLine(along);
    float pixel = max(fwidth(beyond), 1e-3);
    float torn = uTorn.y > uTorn.x + 0.5
      ? smoothstep(uTorn.x - 2.0, uTorn.x + 2.0, along) * (1.0 - smoothstep(uTorn.y - 2.0, uTorn.y + 2.0, along))
      : 0.0;
    // Torn paper splits into a fringe of pale fibres a pixel or two deep.
    float fibres = 0.55 + 0.45 * tearNoise(along / 1.3, uTearLine.z + 7.0);
    float fringe = 1.0 - smoothstep(0.0, 2.4, abs(beyond));
    rim = torn * fringe;
    if (uStub > 0.5) {
      float edge = clamp(0.5 - beyond / pixel, 0.0, 1.0);
      coverage = mix(beyond < 2.0 ? 1.0 : 0.0, edge, torn) * (1.0 - rim * (1.0 - fibres) * 0.6);
      // The stub's own faint shadow on the page it lies over.
      contact = torn * 0.3 * (1.0 - smoothstep(0.0, 2.6, beyond)) * step(0.0, beyond);
    } else {
      coverage = clamp(0.5 + beyond / pixel, 0.0, 1.0) * (1.0 - rim * (1.0 - fibres) * 0.6);
    }
    if (uPass > 0.5 && beyond < 0.0) discard;
  }
  if (uPass > 0.5) {
    // Shadow mask. Paper still touching the page casts nothing it doesn't
    // cover itself; above that, each height feeds the band nearest to it.
    if (vHeight <= 0.0) discard;
    float z = vHeight;
    float low = smoothstep(0.0, uBands.x, z) * (1.0 - smoothstep(uBands.x, uBands.y, z));
    float mid = smoothstep(uBands.x, uBands.y, z) * (1.0 - smoothstep(uBands.y, uBands.z, z));
    float high = smoothstep(uBands.y, uBands.z, z);
    outColour = vec4(vec3(low, mid, high) * uOpacity, 1.0);
    return;
  }
  if (coverage <= 0.0 && contact <= 0.0) discard;
  vec3 light = normalize(LIGHT);
  float c = cos(vAngle);
  vec3 frontNormal = vNormal;
  vec4 front = texture(uFront, vUv);
  vec3 ink = front.a > 0.001 ? front.rgb / front.a : vec3(1.0);
  vec3 colour;
  float alpha;
  if (c >= 0.0) {
    // The printed side, falling into shade as it rolls away towards the crest.
    float diffuse = clamp(dot(frontNormal, light) / light.z, 0.0, 1.0);
    float shade = mix(0.38, 1.0, pow(diffuse, 1.25));
    colour = ink * shade;
    alpha = front.a;
  } else {
    // The underside: thin paper, its own print reading back to front through
    // it. Dark where it turns edge on at the crest, brightest where it faces
    // the reader, with a soft sheen between.
    vec3 normal = -frontNormal;
    float diffuse = clamp(dot(normal, light) / light.z, 0.0, 1.0);
    float shade = mix(0.66, 0.99, pow(diffuse, 0.7));
    vec3 halfway = normalize(light + vec3(0.0, 0.0, 1.0));
    float sheen = pow(max(dot(normal, halfway), 0.0), 30.0) * 0.03;
    vec3 paper;
    if (uPrintThrough > 0.5) {
      paper = uPaper * vec3(0.985, 0.988, 0.995);
      alpha = 1.0;
    } else {
      vec4 back = texture(uBack, vUv);
      paper = back.a > 0.001 ? back.rgb / back.a : uPaper;
      alpha = back.a;
    }
    colour = paper * mix(vec3(1.0), ink, uPrint) * shade + sheen;
  }
  // The lifted paper's shadow darkens the paper lying on the page, fading out
  // as the paper itself lifts, so it never meets the roll in a hard line.
  colour *= 1.0 - shadowAt(gl_FragCoord.xy) * (1.0 - smoothstep(0.0, uBands.x, vHeight));
  // The torn edge shows the paper's pale fibres, whatever is printed there.
  colour = mix(colour, min(uPaper * 1.04 + 0.02, vec3(1.0)), rim * 0.85);
  // Soften the paper's cut edges, which the roll turns towards the viewer.
  float edge = min(min(vPage.x, vPage.y), min(uSize.x - vPage.x, uSize.y - vPage.y));
  alpha *= clamp(edge / max(fwidth(edge), 1e-4) + 0.5, 0.0, 1.0) * coverage * uOpacity;
  float shade = contact * (1.0 - alpha);
  outColour = vec4(colour * alpha, alpha + shade);
}`;

// One triangle covering the whole target; uv runs 0–1 across it.
const screenVertexSource = `#version 300 es
uniform float uDepth;
out vec2 vUv;
void main() {
  vec2 corner = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vUv = corner * 0.5 + 0.5;
  gl_Position = vec4(corner, uDepth, 1.0);
}`;

// A separable Gaussian per band: 25 taps each, spaced so they span three of
// that band's deviations.
const blurFragmentSource = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform vec2 uDirection;
uniform vec3 uSpacing;
in vec2 vUv;
out vec4 outColour;
void main() {
  vec3 total = vec3(0.0);
  float weights = 0.0;
  for (int i = -12; i <= 12; i++) {
    float weight = exp(-float(i * i) / 32.0);
    vec3 offset = uSpacing * float(i);
    total.r += texture(uSource, vUv + uDirection * offset.r).r * weight;
    total.g += texture(uSource, vUv + uDirection * offset.g).g * weight;
    total.b += texture(uSource, vUv + uDirection * offset.b).b * weight;
    weights += weight;
  }
  outColour = vec4(total / weights, 1.0);
}`;

// The shadow over the page revealed beneath: drawn only where no paper lies,
// as the paper already carries its own share.
const shadowFragmentSource = `#version 300 es
precision highp float;
uniform sampler2D uShadow;
uniform vec3 uShadowWeights;
in vec2 vUv;
out vec4 outColour;
void main() {
  outColour = vec4(0.0, 0.0, 0.0, dot(texture(uShadow, vUv).rgb, uShadowWeights));
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("NSEPage curl shader allocation failed.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`NSEPage curl shader failed to compile: ${log ?? "unknown error"}`);
  }
  return shader;
}

interface Program {
  readonly program: WebGLProgram;
  readonly uniforms: Record<string, WebGLUniformLocation | null>;
}

function link(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string, uniforms: readonly string[]): Program {
  const program = gl.createProgram();
  if (!program) throw new Error("NSEPage curl program allocation failed.");
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "aPage");
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`NSEPage curl program failed to link: ${gl.getProgramInfoLog(program) ?? "unknown error"}`);
  }
  return { program, uniforms: Object.fromEntries(uniforms.map((name) => [name, gl.getUniformLocation(program, name)])) };
}

/** The shadow mask is drawn and blurred at a quarter of the canvas's resolution. */
const SHADOW_SCALE = 0.25;
/**
 * The heights, as shares of the page's diagonal, that the shadow's three
 * bands centre on; each band's penumbra widens with its height, and its
 * shadow pales with it.
 */
const SHADOW_BANDS = Object.freeze([0.012, 0.06, 0.2] as const);
const SHADOW_PENUMBRA = 0.16;
/** How dark each band's shadow falls on the page beneath, the curl lifted from it. */
const SHADOW_DARKNESS = Object.freeze([0.55, 0.48, 0.36] as const);
/**
 * How dark each band's shadow falls on the curling page itself: paper rolled
 * back over its own page shades it deeply, as a hand-held leaf does.
 */
const SELF_SHADOW_DARKNESS = Object.freeze([0.85, 0.8, 0.7] as const);
/**
 * The shadow light sits this far up and to the left of the camera, as a share
 * of the camera's distance, so shadows fall just below and right of the paper.
 */
const SHADOW_LIGHT = Object.freeze({ x: 0, y: -0.06 });

/**
 * Draws a curling page in WebGL: the page's snapshot rolled over the curl,
 * lit so the roll darkens as it turns from the reader, its underside showing
 * the print faintly through the paper, and the lifted paper's soft shadow
 * cast onto whatever lies flat beneath. Areas the page has lifted away from
 * stay transparent, so the live content underneath shows through.
 */
export class NSEPageCurlRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #gl: WebGL2RenderingContext;
  readonly #paper: Program;
  readonly #blur: Program;
  readonly #shadow: Program;
  readonly #vao: WebGLVertexArrayObject;
  readonly #screenVao: WebGLVertexArrayObject;
  readonly #vertices: WebGLBuffer;
  readonly #indices: WebGLBuffer;
  readonly #front: WebGLTexture;
  readonly #back: WebGLTexture;
  readonly #framebuffer: WebGLFramebuffer;
  /** Shadow mask, blur scratch and the blurred shadow. */
  readonly #shadowTextures: readonly [WebGLTexture, WebGLTexture, WebGLTexture];
  #shadowSize = { width: 0, height: 0 };
  #meshSize: NSEPageSize | null = null;
  #indexCount = 0;
  #hasSurfaces = false;
  #paperColour: readonly [number, number, number] = [0.97, 0.96, 0.94];
  #frontSource: TexImageSource | null = null;
  #backSource: TexImageSource | null = null;
  #disposed = false;

  /** Returns null where WebGL 2 is unavailable; the CSS curl then stands in. */
  static create(canvas: HTMLCanvasElement): NSEPageCurlRenderer | null {
    if (typeof WebGL2RenderingContext === "undefined") return null;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true, depth: true });
    if (!gl) return null;
    try {
      return new NSEPageCurlRenderer(canvas, gl);
    } catch {
      return null;
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.#canvas = canvas;
    this.#gl = gl;
    this.#paper = link(gl, paperVertexSource, paperFragmentSource, [
      "uSize", "uBend", "uNormal", "uRadius", "uSweep", "uFocal", "uDepthRange", "uCanvas",
      "uPass", "uLight", "uFront", "uBack", "uPrint", "uPrintThrough", "uPaper",
      "uBands", "uShadow", "uShadowWeights", "uViewport",
      "uStub", "uFlight", "uFlightTurn", "uOpacity", "uTear", "uTearAxis", "uTearOffset", "uTearLine", "uTorn",
    ]);
    this.#blur = link(gl, screenVertexSource, blurFragmentSource, ["uDepth", "uSource", "uDirection", "uSpacing"]);
    this.#shadow = link(gl, screenVertexSource, shadowFragmentSource, ["uDepth", "uShadow", "uShadowWeights"]);
    const vao = gl.createVertexArray();
    const screenVao = gl.createVertexArray();
    const vertices = gl.createBuffer();
    const indices = gl.createBuffer();
    const front = gl.createTexture();
    const back = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    const shadowTextures = [gl.createTexture(), gl.createTexture(), gl.createTexture()];
    if (!vao || !screenVao || !vertices || !indices || !front || !back || !framebuffer || shadowTextures.some((texture) => !texture)) {
      throw new Error("NSEPage curl buffers could not be allocated.");
    }
    this.#vao = vao;
    this.#screenVao = screenVao;
    this.#vertices = vertices;
    this.#indices = indices;
    this.#front = front;
    this.#back = back;
    this.#framebuffer = framebuffer;
    this.#shadowTextures = shadowTextures as unknown as readonly [WebGLTexture, WebGLTexture, WebGLTexture];
  }

  /**
   * The page's printed side and underside, each drawn at the page's size, and
   * the colour of its blank paper for a print-through underside.
   */
  setSurfaces(front: TexImageSource, back: TexImageSource, paper?: readonly [number, number, number]): void {
    if (this.#disposed) return;
    if (paper) this.#paperColour = paper;
    const gl = this.#gl;
    // Upload only what changed; a print-through underside reads the front.
    const uploads: Array<readonly [WebGLTexture, TexImageSource]> = [];
    if (front !== this.#frontSource) uploads.push([this.#front, front]);
    if (back !== front && back !== this.#backSource) uploads.push([this.#back, back]);
    this.#frontSource = front;
    this.#backSource = back;
    for (const [texture, source] of uploads) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    this.#hasSurfaces = true;
  }

  get ready(): boolean {
    return this.#hasSurfaces && !this.#disposed && !this.#gl.isContextLost();
  }

  #ensureMesh(size: NSEPageSize) {
    if (this.#meshSize && this.#meshSize.width === size.width && this.#meshSize.height === size.height) return;
    const gl = this.#gl;
    // Dense enough that the roll stays round on a large page.
    const columns = Math.max(24, Math.min(160, Math.round(size.width / 7)));
    const rows = Math.max(24, Math.min(200, Math.round(size.height / 7)));
    const vertices = new Float32Array((columns + 1) * (rows + 1) * 2);
    let offset = 0;
    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= columns; column += 1) {
        vertices[offset++] = (column / columns) * size.width;
        vertices[offset++] = (row / rows) * size.height;
      }
    }
    const indices = new Uint32Array(columns * rows * 6);
    offset = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const topLeft = row * (columns + 1) + column;
        const bottomLeft = topLeft + columns + 1;
        indices.set([topLeft, bottomLeft, topLeft + 1, topLeft + 1, bottomLeft, bottomLeft + 1], offset);
        offset += 6;
      }
    }
    gl.bindVertexArray(this.#vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#vertices);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.#indexCount = indices.length;
    this.#meshSize = { width: size.width, height: size.height };
  }

  #ensureShadowTargets(width: number, height: number) {
    if (this.#shadowSize.width === width && this.#shadowSize.height === height) return;
    const gl = this.#gl;
    for (const texture of this.#shadowTextures) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    this.#shadowSize = { width, height };
  }

  #renderInto(texture: WebGLTexture) {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, this.#shadowSize.width, this.#shadowSize.height);
  }

  /** Blurs each band of `source` into `target`, by its own deviation in mask px. */
  #blurInto(source: WebGLTexture, target: WebGLTexture, sigmas: readonly [number, number, number]) {
    const gl = this.#gl;
    const [, scratch] = this.#shadowTextures;
    const u = this.#blur.uniforms;
    // The shader's 25 taps, spaced at σ/4, reach three deviations either side.
    const [r, g, b] = sigmas.map((sigma) => Math.max(sigma / 4, 0.25));
    gl.useProgram(this.#blur.program);
    gl.uniform1f(u.uDepth!, 0);
    gl.uniform1i(u.uSource!, 0);
    gl.uniform3f(u.uSpacing!, r, g, b);
    gl.activeTexture(gl.TEXTURE0);
    for (const [from, to, direction] of [
      [source, scratch, [1 / this.#shadowSize.width, 0]],
      [scratch, target, [0, 1 / this.#shadowSize.height]],
    ] as const) {
      this.#renderInto(to);
      gl.bindTexture(gl.TEXTURE_2D, from);
      gl.uniform2f(u.uDirection!, direction[0], direction[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  draw(frame: NSEPageCurlFrame): void {
    if (!this.ready) return;
    const gl = this.#gl;
    const { size, margin, cylinder } = frame;
    const tear = frame.tear ?? null;
    const cssWidth = size.width + margin.left + margin.right;
    const cssHeight = size.height + margin.top + margin.bottom;
    const ratio = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
    const width = Math.max(1, Math.round(cssWidth * ratio));
    const height = Math.max(1, Math.round(cssHeight * ratio));
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
    }
    this.#ensureMesh(size);
    // A distant camera, as iBooks frames its pages: the raised leaf arcs up
    // with a gentle foreshortening rather than ballooning towards the reader.
    const focal = Math.max(frame.perspective, Math.max(size.width, size.height) * 2.6);
    const diagonal = Math.hypot(size.width, size.height);
    const depthRange = diagonal * 2 + 1;
    const opacity = tear ? Math.max(0, Math.min(1, tear.flight.opacity)) : 1;
    // A torn sheet that has flown out of sight leaves only its stub.
    const sheetShown = opacity > 0.001;
    const strength = sheetShown ? Math.max(0, Math.min(1, frame.shadowStrength)) : 0;
    const bands = SHADOW_BANDS.map((share) => share * diagonal) as unknown as readonly [number, number, number];
    const weights = SHADOW_DARKNESS.map((darkness) => darkness * strength) as unknown as readonly [number, number, number];
    const selfWeights = SELF_SHADOW_DARKNESS.map((darkness) => darkness * strength) as unknown as readonly [number, number, number];

    const paper = this.#paper.uniforms;
    gl.useProgram(this.#paper.program);
    gl.uniform2f(paper.uSize!, size.width, size.height);
    gl.uniform2f(paper.uBend!, cylinder.bendX, cylinder.bendY);
    gl.uniform2f(paper.uNormal!, cylinder.normalX, cylinder.normalY);
    gl.uniform1f(paper.uRadius!, cylinder.radius);
    gl.uniform1f(paper.uSweep!, cylinder.sweep);
    gl.uniform1f(paper.uFocal!, focal);
    gl.uniform1f(paper.uDepthRange!, depthRange);
    gl.uniform3f(paper.uLight!, size.width / 2 + SHADOW_LIGHT.x * focal, size.height / 2 + SHADOW_LIGHT.y * focal, focal);
    gl.uniform1f(paper.uPrintThrough!, frame.underside === "print-through" ? 1 : 0);
    gl.uniform3f(paper.uPaper!, ...this.#paperColour);
    gl.uniform4f(paper.uCanvas!, -margin.left, -margin.top, cssWidth, cssHeight);
    gl.uniform1f(paper.uOpacity!, opacity);
    gl.uniform1f(paper.uStub!, 0);
    const flight = tear?.flight;
    gl.uniform3f(paper.uFlight!, flight?.x ?? 0, flight?.y ?? 0, flight?.z ?? 0);
    gl.uniform3f(paper.uFlightTurn!, flight?.pivotX ?? 0, flight?.pivotY ?? 0, flight?.spin ?? 0);
    gl.uniform1f(paper.uTear!, tear ? 1 : 0);
    if (tear) {
      // Positions along the binding and depths in from it.
      const axes = {
        top: [1, 0, 0, 1, 0, 0],
        bottom: [1, 0, 0, -1, 0, size.height],
        left: [0, 1, 1, 0, 0, 0],
        right: [0, 1, -1, 0, 0, size.width],
      }[tear.binding];
      gl.uniform4f(paper.uTearAxis!, axes[0], axes[1], axes[2], axes[3]);
      gl.uniform2f(paper.uTearOffset!, axes[4], axes[5]);
      gl.uniform3f(paper.uTearLine!, tear.depth, tear.roughness, tear.seed);
      gl.uniform2f(paper.uTorn!, tear.tornFrom, tear.tornTo);
    }
    gl.uniform1f(paper.uPrint!, frame.underside === "print-through" ? 0.3 : 0.12);
    gl.uniform1i(paper.uFront!, 0);
    gl.uniform1i(paper.uBack!, 1);
    gl.uniform1i(paper.uShadow!, 2);
    gl.uniform3f(paper.uBands!, ...bands);
    gl.uniform2f(paper.uViewport!, width, height);
    gl.uniform3f(paper.uShadowWeights!, ...(strength > 0 ? selfWeights : [0, 0, 0] as const));
    gl.disable(gl.CULL_FACE);

    const [mask, , shadowTexture] = this.#shadowTextures;
    this.#ensureShadowTargets(Math.max(1, Math.round(width * SHADOW_SCALE)), Math.max(1, Math.round(height * SHADOW_SCALE)));
    if (strength > 0) {
      // The lifted paper's shadow, cast onto the page, each band blurred by a
      // penumbra in proportion to its height, so the shadow is crisp where
      // the paper nears the page and melts away where it is held high.
      this.#renderInto(mask);
      gl.disable(gl.DEPTH_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.MAX);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform1f(paper.uPass!, 1);
      gl.bindVertexArray(this.#vao);
      gl.drawElements(gl.TRIANGLES, this.#indexCount, gl.UNSIGNED_INT, 0);
      gl.blendEquation(gl.FUNC_ADD);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(this.#screenVao);
      const toMask = ratio * SHADOW_SCALE;
      const sigmas = bands.map((height) => Math.max(1, (1 + height * SHADOW_PENUMBRA) * toMask)) as unknown as readonly [number, number, number];
      this.#blurInto(mask, shadowTexture, sigmas);
    }

    // The paper, carrying the shadow where it lies on the page.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.#paper.program);
    gl.uniform1f(paper.uPass!, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#front);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.#backSource === this.#frontSource ? this.#front : this.#back);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, shadowTexture);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.bindVertexArray(this.#vao);
    if (tear) {
      // The stub first, flat where it is bound; the sheet then lies over the
      // paper they still share.
      gl.uniform1f(paper.uStub!, 1);
      gl.uniform1f(paper.uOpacity!, 1);
      gl.drawElements(gl.TRIANGLES, this.#indexCount, gl.UNSIGNED_INT, 0);
      gl.uniform1f(paper.uStub!, 0);
      gl.uniform1f(paper.uOpacity!, opacity);
    }
    if (sheetShown) gl.drawElements(gl.TRIANGLES, this.#indexCount, gl.UNSIGNED_INT, 0);

    if (strength > 0) {
      // The page revealed beneath: the shadow goes only where the canvas is
      // still empty, and in part through the paper's softened edges.
      const shadow = this.#shadow.uniforms;
      gl.useProgram(this.#shadow.program);
      gl.uniform1f(shadow.uDepth!, 0);
      gl.uniform1i(shadow.uShadow!, 0);
      gl.uniform3f(shadow.uShadowWeights!, ...weights);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shadowTexture);
      gl.disable(gl.DEPTH_TEST);
      gl.blendFunc(gl.ONE_MINUS_DST_ALPHA, gl.ONE);
      gl.bindVertexArray(this.#screenVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const gl = this.#gl;
    for (const { program } of [this.#paper, this.#blur, this.#shadow]) gl.deleteProgram(program);
    gl.deleteVertexArray(this.#vao);
    gl.deleteVertexArray(this.#screenVao);
    gl.deleteBuffer(this.#vertices);
    gl.deleteBuffer(this.#indices);
    gl.deleteTexture(this.#front);
    gl.deleteTexture(this.#back);
    for (const texture of this.#shadowTextures) gl.deleteTexture(texture);
    gl.deleteFramebuffer(this.#framebuffer);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
