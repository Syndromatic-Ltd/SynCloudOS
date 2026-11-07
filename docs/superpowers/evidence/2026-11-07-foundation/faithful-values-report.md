# Faithful Foundation values — partial handoff

## Completed: NSEValueTransformer

Commits `dad243c` and `cbc82e5` replace the internal closure registry with a subclassable Foundation transformer. The named registry is shared, registration replaces or removes a name, and lookup returns the registered instance. `transformedValue` is subclass responsibility; `reverseTransformedValue` rejects non-reversible classes and, for a reversible class, defaults to the forward transform. Built-in boolean negation and nil checks use the standard Foundation names and are represented by `NSENegateBooleanTransformerName`, `NSEIsNilTransformerName`, and `NSEIsNotNilTransformerName`. Null and undefined both bridge nil. Archive transformers and dynamic class lookup by string are not implemented. The runtime object controller and its test now use `transformedValue`; the internal predecessor was removed without a shim.

Public integration still required: export `NSEValueTransformer` and the three named constants from `src/Foundation/public.ts`; add the NSValueTransformer counterpart catalogue entry; document class methods, built-ins, reverse behavior and JavaScript bridging. The class registry does not instantiate classes by name, and archive transformers are absent because no keyed-archiving equivalent exists here.

## Remaining

`NSEDateFormatter` and `NSEDecimalNumber` are **not implemented**. Their existing internal predecessors remain in `src/SynCloudOS/Models` and their existing consumers/tests are unchanged. A provisional decimal implementation was discarded: its fixed-scale default could lose small values or overflow representable division results, and had not established faithful precision-reduction and handler semantics. Localized date parsing, calendar and time-zone ambiguity similarly need a tested design. Do not claim the three-value migration complete or remove those predecessors until those contracts are implemented and tested.

`ChangeSet` and `SelectionModel` remain internal application models; neither is an Apple Foundation counterpart and neither should gain a fabricated public analogue.

## Evidence

`faithful-values-red.log`, `faithful-values-reverse-red.log`, and `faithful-values-builtins-red.log` record failing test stages. `faithful-values-builtins-green.log` records 18 passing tests across the transformer, controller and formatter test files. `faithful-values-transformer-typecheck.log` records a passing whole-source typecheck at the initial transformer commit. A subsequent `faithful-values-final-typecheck.log` fails in concurrently modified FX and AppSDK code; no final whole-source pass is claimed. No full suite, SDK build, adoption or browser test was run in this worker.
