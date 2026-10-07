# ImageFX kernels, processors and graph transport

The built-in [filters](filters.md) cover most work. When you need a per-pixel operation that they lack, ImageFX lets you write a **kernel**: a small program of arithmetic instructions that runs for every output pixel. Kernels are plain data, which is the point. They serialise, they run identically on the main thread, in a worker or on the GPU, and they cannot execute arbitrary code. For larger jobs you can declare a **processor** with typed parameters and a region-of-interest contract. Finally, `IFXFilterGraph` and `IFXGraphCodec` move a whole graph between threads or into storage.

This page belongs to [ImageFX](../image.md).

```ts
import { IFXColourKernel, IFXKernel, IFXProcessorDefinition } from "@syndromatic/syncloudos/fx/image";
```

## Kernels

### `IFXKernel`

A kernel program has a number of input images, a list of instructions and the index of the instruction whose result is the output pixel.

```text
new IFXKernel(program: IFXKernelProgram, kind?: "general" | "colour" | "blend" | "warp", maximumDisplacement?: number)
```

`IFXKernelProgram`:

| Field | Description |
| --- | --- |
| `inputCount` | The number of images the kernel reads, from 0 to 4. |
| `instructions` | 1 to 128 instructions, evaluated in order. |
| `output` | The index of the instruction whose result becomes the pixel. |
| `extent` | An optional finite `GFXRect` for a kernel with no inputs, such as a generator. |

Each instruction produces a vector of four numbers, which are premultiplied red, green, blue and alpha when they represent a pixel. Later instructions refer to earlier ones by index.

| Instruction | Fields | Result |
| --- | --- | --- |
| `sample` | `input`, `offset?` (a point) | The pixel of image `input` at this pixel plus the offset, at most 1,024 pixels away. |
| `constant` | `value` (four numbers) | A fixed vector. |
| `add`, `subtract`, `multiply`, `minimum`, `maximum` | `left`, `right` | The component-wise operation on two earlier results. |
| `mix` | `left`, `right`, `amount` (0 to 1) | A linear blend. |
| `swizzle` | `input`, `channels` (four indexes from 0 to 3) | Reorders or repeats components. |
| `compare` | `relation`, `left`, `right` | 1 where the relation holds and 0 elsewhere. Relations are `"less"`, `"lessOrEqual"`, `"greater"`, `"greaterOrEqual"` and `"equal"`. |
| `select` | `condition`, `whenTrue`, `whenFalse` | Chooses per component. A non-zero condition picks `whenTrue`. |
| `transcendental` | `function`, `input` | `"abs"`, `"sqrt"`, `"sin"` or `"cos"` per component. |

A reference must point to an earlier instruction. The constructor throws `RangeError` for a program outside these limits and `TypeError` for an unknown instruction.

| Member | Description |
| --- | --- |
| `inputCount` | The number of inputs. |
| `apply(...inputs)` | Returns an image with the kernel applied. The number of inputs must equal `inputCount`. |
| `serialize()` | A plain, JSON-safe description of the kernel. |
| static `deserialize(value)` | Rebuilds a kernel, validating everything. |

**Kinds** restrict what a kernel may do, which lets backends run it faster.

- `"general"` may sample any input at offsets.
- `"colour"` (`IFXColourKernel`) has one input and samples only the current pixel, so the output at a pixel depends on that pixel alone.
- `"blend"` (`IFXBlendKernel`) has two inputs and samples only the current pixel of each.
- `"warp"` (`IFXWarpKernel`) has one input. Its first two output components are a displacement in pixels that moves where the image is sampled. The displacement may not exceed `maximumDisplacement`, which lets ImageFX work out how much of the input each output region needs.

### `IFXColourKernel`, `IFXBlendKernel` and `IFXWarpKernel`

Shorthands for the three restricted kinds.

```text
new IFXColourKernel(instructions, output)
new IFXBlendKernel(instructions, output)
new IFXWarpKernel(instructions, output, maximumDisplacement)
```

`IFXKernelInstruction` is the union of the instruction shapes above, and `IFXKernelProgram` is the program type.

```ts
import { GFXColour } from "@syndromatic/syncloudos/fx/graphics";
import { IFXColourKernel, IFXImage } from "@syndromatic/syncloudos/fx/image";

// Multiplies every channel by 1.5. The alpha channel is left unchanged.
const brighten = new IFXColourKernel(
  [
    { op: "sample", input: 0 },
    { op: "constant", value: [1.5, 1.5, 1.5, 1] },
    { op: "multiply", left: 0, right: 1 },
  ],
  2,
);

export const result = brighten.apply(IFXImage.constant(GFXColour.rgba(0.2, 0.4, 0.6)).cropped({ x: 0, y: 0, width: 8, height: 8 }));
```

### Registering a kernel

`IFXFilterRegistry.register(name, kernel)` stores a kernel under a name that starts with `custom:` (letters, digits, `.`, `_` and `-` after it, at most 64 characters in all). A registry holds at most 64. Registered kernels can be looked up again with `registry.custom(name)`, and a graph codec built with the same registry can rebuild graphs that use them.

```ts
import { IFXColourKernel, IFXFilterRegistry } from "@syndromatic/syncloudos/fx/image";

export const registry = new IFXFilterRegistry();
registry.register("custom:halve", new IFXColourKernel(
  [
    { op: "sample", input: 0 },
    { op: "constant", value: [0.5, 0.5, 0.5, 1] },
    { op: "multiply", left: 0, right: 1 },
  ],
  2,
));
export const halve = registry.custom("custom:halve");
```

## Processors

A kernel is limited to arithmetic. A processor is a more general contract: it has an identity and version, a parameter schema, a declared output extent and a declared region of interest, and an `evaluate` function that computes a pixel. Use a processor when the operation needs branching logic, loops or state that the kernel instructions cannot express.

### `IFXProcessorDefinition`

```text
new IFXProcessorDefinition(options: IFXProcessorDefinitionOptions)
```

| Option | Description |
| --- | --- |
| `id`, `version` | The identity. The id starts with `custom:`, followed by a letter and up to 63 letters, digits, `.`, `_` or `-`. The version is an integer from 1 to 65,535. Two processors with the same id and version collide in a registry. |
| `inputCount` | The number of input images, from 0 to 4. An output of `"first-input"` or `"union"`, or a `"global"` region of interest, needs at least one. |
| `parameters` | A schema of up to 32 named parameters, each an `IFXProcessorParameterRule`. |
| `output` | The extent of the result: `{ kind: "first-input" }`, `{ kind: "union" }` or `{ kind: "finite", rect }`. |
| `roi` | The region of each input that an output region needs: `{ kind: "identity" }` (the same pixels), `{ kind: "support", radius }` (a neighbourhood) or `{ kind: "global" }` (the whole input). |
| `evaluate(position, access, parameters)` | Returns the premultiplied `{ r, g, b, a }` at a position. `access.sample(inputIndex, point)` reads inputs. |
| `prepare(access, parameters)` | Optional. Computes shared state once before evaluation, for example a histogram. |
| `preparation` | Optional `{ scope: "regional" \| "global", scratchBytes, work }`. Declares what `prepare` costs, so a render can be budgeted. |
| `portableProgram` | Optional. A kernel program with parameter bindings that a backend can run without your `evaluate`. |

`IFXProcessorParameterRule` is one of:

| Rule | Fields |
| --- | --- |
| Number | `{ type: "number", default?, minimum?, maximum?, integer? }`. The range defaults to plus or minus one million. |
| Boolean | `{ type: "boolean", default? }`. |
| Enum | `{ type: "enum", values, default? }`, with 1 to 32 unique strings of up to 64 characters. |

Parameter names start with a letter and hold letters, digits and underscores, up to 64 characters.

| Member | Description |
| --- | --- |
| `descriptor` | The identity, schema, output, ROI and preparation declaration, without the functions. `IFXProcessorDescriptor` is its type. |
| `wireName` | The name the processor uses in serialised graphs, `portableProcessor/` followed by the id and version. |
| `normaliseParameters(value)` | Validates a parameter object, fills defaults and rejects unknown fields. |
| `apply(parameters, ...inputs)` | Returns an image. |

A processor with a `portableProgram` (`IFXProcessorPortableKernelProgram`) is called portable. It carries a kernel `program` and `bindings` that connect named parameters to constant instructions (`parameter`, `instruction` and `components`). Such a processor can run in a real worker or on an accelerated backend, because the backend executes the program and never calls your function. Without one, the processor runs where your code runs.

```ts
import { IFXFilterRegistry, IFXProcessorDefinition } from "@syndromatic/syncloudos/fx/image";

// A portable processor that scales colour by a "gain" parameter.
const gain = new IFXProcessorDefinition({
  id: "custom:example.gain",
  version: 1,
  inputCount: 1,
  parameters: { gain: { type: "number", default: 1, minimum: 0, maximum: 4 } },
  output: { kind: "first-input" },
  roi: { kind: "identity" },
  evaluate: (position, access, parameters) => {
    const pixel = access.sample(0, position);
    const g = parameters.gain as number;
    return { r: pixel.r * g, g: pixel.g * g, b: pixel.b * g, a: pixel.a };
  },
  portableProgram: {
    kind: "kernel",
    version: 1,
    program: {
      inputCount: 1,
      instructions: [
        { op: "sample", input: 0 },
        { op: "constant", value: [1, 1, 1, 1] },
        { op: "multiply", left: 0, right: 1 },
      ],
      output: 2,
    },
    bindings: [{ parameter: "gain", instruction: 1, components: [0, 1, 2] }],
  },
});

export const registry = new IFXFilterRegistry();
registry.registerProcessor(gain);
```

Then `registry.processor("custom:example.gain", 1).apply({ gain: 2 }, image)` builds the image.

## Graph analysis and transport

### `IFXFilterGraph`

A handle on a finished graph, rooted at an output image.

```text
new IFXFilterGraph(output: IFXImage)
```

| Member | Description |
| --- | --- |
| `output` | The root image. |
| `regionsOfInterest(bounds)` | For an output region, the region of each source pixel image that is needed, as `{ image, region }` entries. Use it to fetch or decode only the part of a large image a render needs. Throws `RangeError` for a graph beyond its analysis budget (4,096 nodes visited or 128 levels deep). |
| `serialize()` | Returns an `IFXSerializedGraph` (version 1) with plain data nodes. |
| static `deserialize(value)` | Rebuilds a graph from serialised data. |

### `IFXGraphCodec`

Encodes and decodes graphs for storage and for exchange between versions of ImageFX.

```text
new IFXGraphCodec(registry?: IFXFilterRegistry)
```

| Member | Description |
| --- | --- |
| `registry` | The registry used to resolve custom kernels and processors when decoding. |
| `encode(graph)` | Returns an `IFXPortableGraph`, currently version 3. Pixels become plain numeric arrays so the result survives `JSON.stringify`. |
| `decode(value)` | Validates and rebuilds an `IFXFilterGraph`. |
| `migrate(value)` | Upgrades an older version to the current one without building a graph. |

`IFXSerializedGraphV2`, `IFXSerializedGraphV3` and `IFXPortableGraph` (their union) are the data types. The codec is the interchange format for persistence, debugging and cross-version exchange. Workers receive a separate binary form with typed buffers, which the framework manages for you. Decoding rejects malformed data with `TypeError` and graphs whose pixels exceed the budget with `RangeError`.

```ts
import { GFXImage } from "@syndromatic/syncloudos/fx/graphics";
import { IFXFilter, IFXFilterGraph, IFXGraphCodec, IFXImage } from "@syndromatic/syncloudos/fx/image";

export function roundTrip(pixels: GFXImage) {
  const blurred = new IFXFilter("gaussianBlur", { sigma: 2 }).apply(IFXImage.fromPixels(pixels).clampedToExtent());
  const codec = new IFXGraphCodec();
  const text = JSON.stringify(codec.encode(new IFXFilterGraph(blurred)));
  return codec.decode(JSON.parse(text)); // an equivalent graph
}
```

## Related

- [ImageFX](../image.md)
- [Filter catalogue](filters.md)
- [Analysis and RAW](analysis-and-raw.md)
