# Image shaders in retained layers

`IFXShader`, exported from `@syndromatic/syncloudos/fx/image`, describes a GLSL ES 3 image generator or filter. It owns only immutable source and uniform data. An `AFXRenderer` presents it through the existing browser canvas adapter; the descriptor has no device, clock, worker, animation loop or GPU handles.

```ts
import { IFXShader, IFXFilterRegistry } from '@syndromatic/syncloudos/fx/image';

const generator = new IFXShader(`
vec4 ifxMain(vec2 uv, vec2 size) {
  return vec4(tint * (0.5 + 0.5 * sin(phase + uv.x)), 1.0);
}`, {
  tint: { type: 'vec3', value: [0.2, 0.5, 0.8] },
  phase: { type: 'float', value: 0 },
});
layer.contents = generator;
// The application's scoped scheduler supplies time and requests presentation.
layer.contents = generator.withUniforms({ phase: 0.25 });

layer.filters = [new IFXShader(`
vec4 ifxMain(vec2 uv, vec2 size) {
  vec4 p = texture(ifxInput, uv);
  return vec4(p.a > 0.0 ? p.rgb / p.a : vec3(0.0), p.a);
}`)];
layer.compositingFilter = new IFXFilterRegistry().create('blend', { mode: 'addition' });
```

The source defines `vec4 ifxMain(vec2 uv, vec2 size)` and can include helper functions. The adapter supplies the GLSL version, precision, uniform declarations and entry point. `uv` uses normalized texture coordinates with the origin at the bottom left. `size` is the pass's backing size in pixels, including the renderer's pixel ratio. Filter sampling uses the reserved `uniform sampler2D ifxInput`. Generator recipes have no input image and should not sample it.

Uniform declarations accept `float`, `vec2`, `vec3` and `vec4`; values are finite numbers or arrays with the declared number of components. The descriptor copies and freezes all values. `withUniforms(values)` creates a new descriptor with the same source and type declarations, rejects undeclared names and leaves the previous descriptor unchanged. Names beginning with `ifx` or `gl_` are reserved. Compilation is deferred until submission and reports shader or link errors explicitly.

## Subtrees, pass order and alpha

`AFXLayer.contents` accepts an `IFXShader` generator in addition to image and video content. `AFXLayer.filters` accepts a readonly array of shaders. A filtered layer renders its own content and sublayers into an offscreen image in their retained order, including compact particle batches and nested filtered groups. Each filter consumes the preceding pass; the final image uses the parent layer's transform, opacity, colour modulation and mask once. The offscreen extent is the layer's bounds, so content outside that extent is cropped. Child edge antialiasing is resolved before the filter samples the subtree.

**Filter input contains the actual accumulated RGBA of the previous pass.** Normal subtree rendering produces premultiplied RGB; additive sprites produce accumulated weighted RGB and additive alpha. The adapter does not divide RGB by input alpha before executing a filter. A filter that needs a straight-alpha identity operation must divide by input alpha itself, as in the example. A filter that emits accumulated RGB and a newly computed edge alpha must preserve that RGB directly.

**Shader output is straight alpha.** The output texture is stored without additional blending or premultiplication. Default presentation uses the existing source-over blend. `compositingFilter` accepts `null` or an existing `IFXFilter<'blend'>` with `mode: 'normal'` or `mode: 'addition'`; other modes are rejected. Addition uses WebGL's `SRC_ALPHA, ONE` factors, including alpha: source RGB is weighted once by its output alpha, layer opacity and mask; source alpha contributes its square to destination alpha. This is the canvas layer blend contract; ImageFX graph evaluation retains its existing blend implementation.

An additive particle layer accumulates each sprite in particle order. A compositing layer with sublayers isolates that subtree before blending it with its parent. Unfiltered isolated subtrees containing only normal source-over content are unpremultiplied for final presentation. Unfiltered buffers containing additive content preserve their accumulated weighted RGB, including through nested isolation: RGB is not divided by additive alpha and uses a source blend factor of `ONE`. Layer opacity and masks weight that RGB once; the destination RGB factor remains `ONE_MINUS_SRC_ALPHA` for normal composition or `ONE` for addition. Alpha retains the existing blend contract, including `SRC_ALPHA, ONE` for addition. Shader output textures remain straight alpha. Recipe source, artwork, simulation and timing belong to the application.

## Ownership and limits

Programs are cached by source plus sorted uniform names and types. Uniform values do not affect compilation. Offscreen textures, framebuffers and renderbuffers are reused across unchanged pass sizes. The adapter performs no GPU readback during rendering. A successful submission releases unused pass storage and programs, including after layers are hidden or removed. Aborting or disposing the owning renderer deletes its resources. Context loss discards invalid GPU handles; restoration requests a fresh submission from the current layer tree.

| Resource | Limit |
| --- | --- |
| Source per descriptor | 65,536 characters |
| Uniforms per descriptor | 64 |
| Filters per layer | 8 |
| Active shader programs per canvas | 64 |
| Offscreen pass targets per canvas | 128 |
| Live offscreen storage per canvas | 1 GiB, including depth and multisample attachments |
| Pass dimensions | 16,384 pixels per axis, also bounded by the device's texture and renderbuffer limits |

The storage limit is sized for 6K canvases. A full 6144 × 3456 subtree isolated with 4× multisampling, plus one filter pass, needs about 690 MiB. A limit that is exceeded names itself in the error.

Subtree content, particles and composite quads share the renderer's existing quad budget. Shader source estimates and pass storage appear in the canvas adapter's residency report. Program residency bytes are estimates based on source; drivers do not expose actual compiled-program memory. Superseded storage also counts toward the live allocation quota during resizing. Pass textures are RGBA8; values saturate to their representable range.

Canvas2D explicitly rejects shader generators, filtered subtrees and additive compositing before publishing the visible canvas. Portable CPU composition snapshots report these operations as unsupported. `IFXShader` is executed by the retained AnimationFX canvas adapter; it is not an `IFXContext` graph node.
