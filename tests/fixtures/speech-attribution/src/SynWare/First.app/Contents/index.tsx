import { NSEApplication } from "@syndromatic/syncloudos";
import { SPFXSpeechRecognizer, SPFXSpeechAudioBufferRecognitionRequest, SPFXSpeechRecognitionResult, SPFXError } from "@syndromatic/syncloudos/fx/speech";
import { AUFXAudioPCMBuffer, AUFXAudioFormat } from "@syndromatic/syncloudos/fx/audio";
export { SPFXSpeechRecognizer, SPFXSpeechAudioBufferRecognitionRequest, SPFXSpeechRecognitionResult, SPFXError, AUFXAudioPCMBuffer, AUFXAudioFormat };
export async function afterAwait() { await Promise.resolve(); return new SPFXSpeechRecognizer(new Intl.Locale("en-GB")); }
export function afterTimer() { return new Promise<SPFXSpeechRecognizer>(resolve => setTimeout(() => resolve(new SPFXSpeechRecognizer()), 0)); }
export function thirdParty(callback: (create: () => SPFXSpeechRecognizer) => void) { callback(() => new SPFXSpeechRecognizer()); }
export default class SpeechApplication extends NSEApplication {}
