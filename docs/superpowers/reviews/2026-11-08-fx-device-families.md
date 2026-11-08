# FX device families: API fidelity review

Reviewer: Claude, 8 November 2026, at framework `de29b55`. Owner finding: BluetoothFX is one `public.ts` of interfaces, nothing like AnimationFX.

## Verdict

The prefixes are decided and stay: `BTFX`, `NFX`, `SPFX`, `CNFX`, `PKFX`, `XRFX`, `NWFX`, `CRFX`, `CPFX`. The API under them is wrong. AnimationFX is the standard: `CALayer` → `AFXLayer`, `CATransform3D` → `AFXTransform3D`, one class per file, Apple's properties, methods, delegates and enums. The families below were instead designed from the browser APIs they wrap (Web Bluetooth, Web NFC, Web Speech, Contact Picker, Payment Request, WebXR, Network Information) and given Apple-sounding names.

| Family | Apple framework | Verdict |
|---|---|---|
| BluetoothFX | CoreBluetooth | Rebuild. One file of interfaces, Web Bluetooth shape. |
| NFCFX | CoreNFC | Rebuild. One file; scan/write promises instead of a session, delegate and tag. |
| XRFX | ARKit | Rebuild. One file; WebXR modes and reference spaces in public API. |
| SpeechFX | Speech | Restructure. Names partly right; interfaces, no task state, no segments, invented status. |
| ContactsFX | Contacts, ContactsUI | Restructure. `CNFXContact` is three string arrays; no labelled values, no picker delegate. |
| PassFX | PassKit | Restructure. Payment Request descriptors in public API; amounts are strings. |
| NetworkFX | Network | Restructure. Network Information fields on `NWFXPath`; invented authorisation. |
| CryptoFX | CryptoKit | Restructure. Top-level names right; digests, nonces, signatures, key sizes and generic hash functions missing or replaced by strings and raw data. |
| CompressionFX | Compression | Restructure, and a real bug: `zlib` emits zlib-wrapped data, Apple's `zlib` is raw DEFLATE. Web streams instead of Apple's read/write closures; invented free functions and algorithms. |

Not reviewed by today's jobs, and with the same flaw: LocationFX (`current()`/`watch()` instead of `CLLocationManager` with a delegate, `desiredAccuracy`, `distanceFilter`, `requestLocation()`, `startUpdatingLocation()`). MotionFX and MIDIFX need the same review. They follow in a second pass.

## Rules for every family

1. **One class per file**, named after its Apple counterpart: `BTFXPeripheral.ts` holds `class BTFXPeripheral`. `public.ts` only re-exports. Browser adapters stay internal.
2. **Classes, not interfaces**, for every Apple class. Apple protocols become TypeScript interfaces: delegates, and `NFCNDEFTag` → `NFXNDEFTag`.
3. **Apple's members, by Apple's names.** Properties, methods, option sets and enums as in the Apple headers. Swift argument labels fold into the name only where needed to disambiguate, as `NSE` already does.
4. **Delegates as Apple has them.** Delegate methods keep the sender first, as in `applicationDockMenu(application)`: `centralManagerDidUpdateState(central)`, `peripheralDidDiscoverServices(peripheral, error)`, `peripheralDidUpdateValueForCharacteristic(peripheral, characteristic, error)`. Where Apple offers completion handlers (`SFSpeechRecognizer.requestAuthorization`), keep them and also return a Promise only if the existing house style already does so for that pattern.
5. **Apple's availability, not capability objects.** Remove every `getCapabilities()` / `XCapabilities` object. Use what Apple uses: `BTFXManager.state === .unsupported`, `NFXNDEFReaderSession.readingAvailable`, `SPFXSpeechRecognizer.isAvailable`, `XRFXWorldTrackingConfiguration.isSupported`, `PKFXPaymentAuthorizationController.canMakePayments()`.
6. **Apple's authorisation enums**, per framework, with Apple's cases: `BTFXManagerAuthorization` (notDetermined, restricted, denied, allowedAlways), `SPFXSpeechRecognizerAuthorizationStatus` (notDetermined, denied, restricted, authorized), `CNFXAuthorizationStatus` (notDetermined, restricted, denied, authorized, limited). Frameworks with no authorisation API (Network, NFC, PassKit) get none. The shared privacy store stays as the mechanism behind them.
7. **Construction as Apple does it.** `new BTFXCentralManager(delegate)`, `new SPFXSpeechRecognizer(locale)`, `new NWFXPathMonitor()`. Remove the `XClient.createX(signal)` factories from public API. The constructor resolves the mounted application's session (privacy, entitlements, lifetime) internally, the way AnimationFX reaches its host. If a constructor genuinely cannot reach the mounted session, stop and report rather than inventing a factory.
8. **Foundation types.** `NSEData` for bytes, `NSEDecimalNumber` for money, `URL`/`NSEURL` as Foundation does, `NSEUUID` (or the existing UUID type) for identifiers. Matrices use the existing 4×4 type (`AFXTransform3D`) rather than `number[]`.
9. **Browser-only facts stay out of public API.** WebXR modes and reference spaces, Network Information `effectiveType`/`downlink`/`rtt`, Payment Request `supportedMethods` strings, Web NFC `recordType` strings: all internal to adapters. Where the browser cannot do what Apple's API promises, the method exists, fails with the framework's Apple-style error (`BTFXError`, `NFXReaderError`, …) and the limitation is documented. No method is invented to fit the browser.
10. **No aliases.** Old names are deleted, consumers migrated (Gallery, docs, tests, `appkit-counterparts.json`, SDK manifests, developer MCP).

## Per family

### BluetoothFX ← CoreBluetooth

Files: `BTFXManager`, `BTFXManagerState`, `BTFXManagerAuthorization`, `BTFXCentralManager`, `BTFXCentralManagerDelegate`, `BTFXPeripheral`, `BTFXPeripheralState`, `BTFXPeripheralDelegate`, `BTFXAttribute`, `BTFXService`, `BTFXCharacteristic`, `BTFXCharacteristicProperties`, `BTFXCharacteristicWriteType`, `BTFXDescriptor`, `BTFXUUID`, `BTFXError`, `public`.

- `BTFXManager`: `state`, static `authorization`.
- `BTFXCentralManager extends BTFXManager`: `constructor(delegate?, options?)`, `delegate`, `isScanning`, `scanForPeripherals(withServices, options)`, `stopScan()`, `connect(peripheral, options)`, `cancelPeripheralConnection(peripheral)`, `retrievePeripherals(withIdentifiers)`, `retrieveConnectedPeripherals(withServices)`.
- `BTFXCentralManagerDelegate`: `centralManagerDidUpdateState` (required), `centralManagerDidDiscoverPeripheral(central, peripheral, advertisementData, rssi)`, `centralManagerDidConnect`, `centralManagerDidFailToConnect`, `centralManagerDidDisconnectPeripheral`.
- `BTFXPeripheral`: `identifier`, `name`, `state`, `delegate`, `services`, `discoverServices(uuids)`, `discoverCharacteristics(uuids, service)`, `discoverDescriptors(characteristic)`, `readValue(characteristic)`, `writeValue(data, characteristic, type)`, `setNotifyValue(enabled, characteristic)`, `maximumWriteValueLength(type)`. Values arrive through the delegate and `characteristic.value`, not as returned promises.
- `BTFXCharacteristic`: `uuid`, `service`, `value: NSEData | null`, `properties` (option set: broadcast, read, writeWithoutResponse, write, notify, indicate, authenticatedSignedWrites, extendedProperties), `isNotifying`, `descriptors`.
- Web Bluetooth's chooser is the browser's scan. `scanForPeripherals` presents it and reports the chosen device through `centralManagerDidDiscoverPeripheral`. Document that it discovers one user-chosen peripheral per scan. `readRSSI` and advertisement data fail with `BTFXError` where the browser cannot provide them.

### NFCFX ← CoreNFC

Files: `NFXReaderSession`, `NFXNDEFReaderSession`, `NFXNDEFReaderSessionDelegate`, `NFXNDEFTag`, `NFXNDEFStatus`, `NFXNDEFMessage`, `NFXNDEFPayload`, `NFXTypeNameFormat`, `NFXReaderError`, `public`.

- `NFXNDEFReaderSession(delegate, invalidateAfterFirstRead)`: static `readingAvailable`, `isReady`, `alertMessage`, `begin()`, `invalidate()`, `invalidate(errorMessage)`, `connect(tag)`, `restartPolling()`.
- Delegate: `readerSessionDidInvalidateWithError` (required), `readerSessionDidDetectNDEFs(session, messages)`, `readerSessionDidDetectTags(session, tags)`, `readerSessionDidBecomeActive`.
- `NFXNDEFTag` protocol: `isAvailable`, `queryNDEFStatus()` → status and capacity, `readNDEF()`, `writeNDEF(message)`, `writeLock()`. Web NFC write and makeReadOnly map here.
- `NFXNDEFPayload`: `typeNameFormat`, `type`, `identifier`, `payload` (all `NSEData`), static `wellKnownTypeURIPayload(url)` and `wellKnownTypeTextPayload(string, locale)`, instance `wellKnownTypeURIPayload()` and `wellKnownTypeTextPayload()`. Web NFC `recordType` strings become the adapter's mapping.

### XRFX ← ARKit

Files: `XRFXSession`, `XRFXSessionDelegate`, `XRFXConfiguration`, `XRFXWorldTrackingConfiguration`, `XRFXOrientationTrackingConfiguration`, `XRFXFrame`, `XRFXCamera`, `XRFXTrackingState`, `XRFXAnchor`, `XRFXPlaneAnchor` (if WebXR plane detection is available), `XRFXRaycastQuery`, `XRFXRaycastResult`, `XRFXError`, `public`.

- `XRFXSession`: `delegate`, `currentFrame`, `configuration`, `run(configuration, options)`, `pause()`, `add(anchor)`, `remove(anchor)`, `raycast(query)`.
- Delegate: `sessionDidUpdateFrame`, `sessionDidAddAnchors`, `sessionDidUpdateAnchors`, `sessionDidRemoveAnchors`, `sessionDidFailWithError`, `sessionWasInterrupted`, `sessionInterruptionEnded`.
- `XRFXConfiguration` (abstract): static `isSupported`, `worldAlignment`, `isLightEstimationEnabled`. World tracking maps to `immersive-ar`, orientation tracking to `inline`; reference spaces are internal.
- `XRFXCamera`: `transform`, `projectionMatrix`, `trackingState`. Transforms use `AFXTransform3D`.
- **Owner question:** ARKit has no VR mode. WebXR `immersive-vr` has no ARKit counterpart. Options: leave VR out of XRFX, or model it on visionOS (`ImmersiveSpace`). Do not ship an invented VR configuration.

### SpeechFX ← Speech

Files: `SPFXSpeechRecognizer`, `SPFXSpeechRecognizerDelegate`, `SPFXSpeechRecognizerAuthorizationStatus`, `SPFXSpeechRecognitionRequest`, `SPFXSpeechAudioBufferRecognitionRequest`, `SPFXSpeechURLRecognitionRequest` (fails with `SPFXError` on the web), `SPFXSpeechRecognitionTask`, `SPFXSpeechRecognitionTaskState`, `SPFXSpeechRecognitionTaskDelegate`, `SPFXSpeechRecognitionResult`, `SPFXTranscription`, `SPFXTranscriptionSegment`, `public`.

- `SPFXSpeechRecognizer(locale?)`: static `supportedLocales()`, static `authorizationStatus()`, static `requestAuthorization(handler)`, `isAvailable`, `locale`, `supportsOnDeviceRecognition`, `delegate`, `recognitionTask(request, resultHandler)`, `recognitionTask(request, delegate)`.
- Request: `shouldReportPartialResults`, `requiresOnDeviceRecognition`, `taskHint`, `contextualStrings`, `addsPunctuation`. Remove `continuous`, `maximumAlternatives` and `signal` from public API.
- Task: `state`, `isFinishing`, `isCancelled`, `error`, `finish()`, `cancel()`. No `result` promise.
- `SPFXTranscription`: `formattedString`, `segments`. `SPFXTranscriptionSegment`: `substring`, `substringRange`, `timestamp`, `duration`, `confidence`, `alternativeSubstrings`.

### ContactsFX ← Contacts, ContactsUI

Files: `CNFXContactStore`, `CNFXEntityType`, `CNFXAuthorizationStatus`, `CNFXContact`, `CNFXMutableContact`, `CNFXContactType`, `CNFXLabeledValue`, `CNFXPhoneNumber`, `CNFXPostalAddress`, `CNFXContactFormatter`, `CNFXContactFetchRequest`, `CNFXContactKeys` (the key constants), `CNFXContactPickerViewController`, `CNFXContactPickerDelegate`, `CNFXError`, `public`.

- `CNFXContact`: `identifier`, `contactType`, `givenName`, `familyName`, `organizationName`, `emailAddresses: CNFXLabeledValue<string>[]`, `phoneNumbers: CNFXLabeledValue<CNFXPhoneNumber>[]`, `postalAddresses`, `isKeyAvailable(key)`, `mutableCopy()`.
- `CNFXContactStore`: static `authorizationStatus(entityType)`, `requestAccess(entityType, completion)`, `unifiedContacts(predicate, keysToFetch)`, `enumerateContacts(fetchRequest, block)`. The web has no contact database: these fail with `CNFXError` (`authorizationDenied` or `featureNotAvailable`), documented. Access on the web is the picker only.
- `CNFXContactPickerViewController`: `delegate`, `displayedPropertyKeys`, presented with NSE's view controller presentation. Delegate: `contactPickerDidSelectContact`, `contactPickerDidSelectContacts`, `contactPickerDidCancel`. The Contact Picker API's display name splits into given and family names through `CNFXContactFormatter`'s inverse where possible; otherwise `givenName` holds it, documented.

### PassFX ← PassKit

Files: `PKFXPaymentRequest`, `PKFXPaymentSummaryItem`, `PKFXPaymentSummaryItemType`, `PKFXPaymentNetwork`, `PKFXMerchantCapability`, `PKFXContactField`, `PKFXShippingMethod`, `PKFXPaymentAuthorizationController`, `PKFXPaymentAuthorizationControllerDelegate`, `PKFXPayment`, `PKFXPaymentToken`, `PKFXPaymentMethod`, `PKFXContact`, `PKFXPaymentAuthorizationResult`, `PKFXPaymentAuthorizationStatus`, `PKFXPaymentButton`, `PKFXPaymentButtonType`, `PKFXPaymentButtonStyle`, `PKFXError`, `public`.

- `PKFXPaymentRequest`: `merchantIdentifier`, `countryCode`, `currencyCode`, `supportedNetworks`, `merchantCapabilities`, `paymentSummaryItems`, `requiredBillingContactFields`, `requiredShippingContactFields`, `shippingMethods`, `applicationData`. `paymentMethodData`/`supportedMethods` become adapter internals.
- `PKFXPaymentSummaryItem`: `label`, `amount: NSEDecimalNumber`, `type` (final, pending). Not a string amount.
- `PKFXPaymentAuthorizationController(paymentRequest)`: static `canMakePayments()`, static `canMakePayments(usingNetworks)`, `delegate`, `present(completion)`, `dismiss(completion)`. Delegate: `paymentAuthorizationControllerDidAuthorizePayment(controller, payment, handler)`, `paymentAuthorizationControllerDidFinish(controller)`. The handler takes a `PKFXPaymentAuthorizationResult`; this replaces `payment.complete("success")`.
- `PKFXPayment`: `token` (`paymentMethod`, `transactionIdentifier`, `paymentData: NSEData`), `billingContact`, `shippingContact`, `shippingMethod`.
- `PKFXPaymentButton(type, style)`: this answers the open payment-button question. PassKit has `PKPaymentButton`, so the control is `PKFXPaymentButton`, an NSE control whose appearance comes from Atmo. Its artwork needs owner approval before it ships.

### NetworkFX ← Network

Files: `NWFXPathMonitor`, `NWFXPath`, `NWFXPathStatus`, `NWFXPathUnsatisfiedReason`, `NWFXInterface`, `NWFXInterfaceType`, `public`.

- `NWFXPathMonitor()`, `NWFXPathMonitor(requiredInterfaceType)`, `NWFXPathMonitor(prohibitedInterfaceTypes)`: `pathUpdateHandler`, `currentPath`, `start()`, `cancel()`.
- `NWFXPath`: `status`, `unsatisfiedReason`, `availableInterfaces: NWFXInterface[]`, `isExpensive`, `isConstrained`, `supportsIPv4`, `supportsIPv6`, `supportsDNS`, `usesInterfaceType(type)`.
- Mapping: Save-Data → `isConstrained` (Apple's Low Data Mode), metered or cellular → `isExpensive`. `effectiveType`, `downlinkMegabitsPerSecond`, `roundTripTimeMilliseconds` and `source` leave public API. Network has no authorisation: remove `authorizationStatus`/`requestAuthorization`.

### CryptoFX ← CryptoKit

A first pass called this faithful from its export names. Reading `CRFXCrypto.ts` in full shows otherwise.

| CryptoKit | CryptoFX today | Required |
|---|---|---|
| `SHA256.hash(data:)` → `SHA256Digest` (bytes, hex `description`, constant-time `==`) | returns raw `NSEData` | `CRFXSHA256Digest` etc.; `CRFXSHA256()` instance with `update(data)` and `finalize()` for streaming |
| `HMAC<SHA256>` generic over the hash function | `CRFXHMAC` with a `"SHA-256"` string argument | the hash function type selects the algorithm (`CRFXHMAC(CRFXSHA256)` or the house generic pattern); `authenticationCode(data, key)` → `CRFXHashedAuthenticationCode`; instance `update`/`finalize` |
| `HKDF<SHA256>.deriveKey(…)`, `extract`, `expand` | string algorithm; no `extract`/`expand` | as CryptoKit |
| `SymmetricKey(size: .bits256)`, `SymmetricKeySize` | invented `generate(bitCount)` | `new CRFXSymmetricKey(size)` with `CRFXSymmetricKeySize` |
| `AES.GCM.seal(_:using:nonce:authenticating:)` with `AES.GCM.Nonce` | options object, nonce as raw data | `CRFXAESGCMNonce` type; `SealedBox(combined:)` as a constructor, not `fromCombined` |
| `P256.Signing.PrivateKey()` and `signature(for:)` → `ECDSASignature` (`rawRepresentation`, `derRepresentation`) | static `generate()`; signatures are raw `NSEData`; `rawRepresentation()` is a method; public key init is static | `CRFXP256SigningECDSASignature`; key representations (`raw`, `x963`, `compressed`, `der`, `pem`) as properties or methods where async is forced; constructors as CryptoKit |
| `SharedSecret.hkdfDerivedSymmetricKey(using: SHA256.self, …)`, `x963DerivedSymmetricKey` | string algorithm; no X9.63 | as CryptoKit |
| `ChaChaPoly`, `Curve25519`, `P384`, `P521`, `Insecure` | missing | add what Web Crypto supports (Ed25519/X25519, P-384, P-521, SHA-1 under `Insecure`); others fail with `CryptoKitError`-shaped `CRFXError` |
| errors: `CryptoKitError` | `RangeError`/`TypeError` | `CRFXError` |

`CRFXHashFunction` (string union) and `CRFXCapabilities.query()` are invented; remove them. Web Crypto forces asynchronous results; that is the one permitted deviation, documented per member. One file per type.

### CompressionFX ← Compression

| Compression | CompressionFX today | Required |
|---|---|---|
| `Algorithm`: `lzfse`, `lz4`, `lzma`, `zlib` (and `brotli` where Apple provides it) | `CPFXAlgorithm` is an alias of `NSEDataCompressionAlgorithm` with `zlib`, `gzip`, `brotli`, `zstd` | its own `CPFXAlgorithm` with Apple's cases; `gzip` and `zstd` have no Apple counterpart and leave public API; cases the browser lacks fail with `CPFXFilterError` |
| `zlib` is raw DEFLATE (RFC 1951, no header) | maps `zlib` to the browser's `"deflate"`, which is zlib-wrapped (RFC 1950) | **bug:** use `"deflate-raw"`. Data compressed here does not decompress with Apple's `zlib`, and the reverse. Applies to `NSEData.compressed(.zlib)` too, since both use `Foundation/internal/compression.ts` |
| `FilterOperation` | `CPFXOperation` | `CPFXFilterOperation` |
| `InputFilter(operation, using: algorithm, bufferCapacity:, readingFrom: (Int) -> Data?)` | takes a `ReadableStream` | a read closure (async where forced); `bufferCapacity` |
| `OutputFilter(operation, using:, bufferCapacity:, writingTo: (Data?) -> Void)`, `write(_:)`, `finalize()` | takes a `WritableStream`; adds `abort()` | a write closure; `write(nil)` finalises as Apple's does; no `abort` |
| `FilterError` (`invalidState`, `invalidData`) | `TypeError`/`RangeError` | `CPFXFilterError` |
| none | `CPFXCompress`/`CPFXDecompress` free functions, `CPFXCapabilities` | remove; one-shot compression is Foundation's `NSEData.compressed(using:)`, which already exists |

The `NSEData` compression algorithm enum needs the same check against `NSData.CompressionAlgorithm` (`lzfse`, `lz4`, `lzma`, `zlib`). One file per type.

## Hooks and the Gallery

React hooks (`useBluetooth()` etc.) may stay as conveniences that create and dispose the Apple-shaped objects, but they must return those objects, not a separate API. The Gallery's Device & Data Capabilities section is rewritten on the new classes.

## What Claude reviews before any push

For each family: the file list against this document; every public member against the Apple header named here; no browser-only names in public API; `appkit-counterparts.json` entries; no aliases left; tests that exercise the delegate flow; the Gallery in the browser.
