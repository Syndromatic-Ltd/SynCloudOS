/** NFCReaderError with Apple's reader/session/tag error cases. */
export class NFXReaderError extends Error {
  static readonly errorDomain = "NFCErrorDomain";
  constructor(
    readonly code:
      | "readerErrorUnsupportedFeature"
      | "readerErrorSecurityViolation"
      | "readerErrorInvalidParameter"
      | "readerErrorInvalidParameterLength"
      | "readerErrorParameterOutOfBound"
      | "readerErrorRadioDisabled"
      | "readerErrorAccessNotAccepted"
      | "readerErrorIneligible"
      | "readerTransceiveErrorTagConnectionLost"
      | "readerTransceiveErrorRetryExceeded"
      | "readerTransceiveErrorTagResponseError"
      | "readerTransceiveErrorSessionInvalidated"
      | "readerTransceiveErrorTagNotConnected"
      | "readerTransceiveErrorPacketTooLong"
      | "readerSessionInvalidationErrorUserCanceled"
      | "readerSessionInvalidationErrorSessionTimeout"
      | "readerSessionInvalidationErrorSessionTerminatedUnexpectedly"
      | "readerSessionInvalidationErrorSystemIsBusy"
      | "readerSessionInvalidationErrorFirstNDEFTagRead"
      | "tagCommandConfigurationErrorInvalidParameters"
      | "ndefReaderSessionErrorTagNotWritable"
      | "ndefReaderSessionErrorTagUpdateFailure"
      | "ndefReaderSessionErrorTagSizeTooSmall"
      | "ndefReaderSessionErrorZeroLengthMessage",
    message: string = code,
  ) {
    super(message);
    this.name = "NFXReaderError";
  }
}
