import type {
  MessageEnvelope,
  RuntimeRequest,
  RuntimeResponse,
} from '@/video_downloader_types_skeleton';
import type {
  RuntimeErrorResponse,
  RuntimeRequestOf,
  RuntimeRequestType,
  RuntimeResponseOf,
  RuntimeResponseType,
} from './runtime';

type RuntimeRequestPayloadMap = {
  [TType in RuntimeRequestType]: RuntimeRequestOf<TType>['payload'];
};

type RuntimeResponsePayloadMap = {
  [TType in RuntimeResponseType]: RuntimeResponseOf<TType>['payload'];
};

let requestSequence = 0;

function fallbackRequestId(): string {
  requestSequence += 1;

  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);

  return `req-${Date.now()}-${requestSequence}-${randomPart}`;
}

export function createMessageEnvelope<TType extends string, TPayload>(
  type: TType,
  payload: TPayload,
  requestId = fallbackRequestId(),
): MessageEnvelope<TType, TPayload> {
  return {
    type,
    requestId,
    payload,
  };
}

export function createRuntimeRequest<TType extends RuntimeRequestType>(
  type: TType,
  payload: RuntimeRequestPayloadMap[TType],
  requestId = fallbackRequestId(),
): MessageEnvelope<TType, RuntimeRequestPayloadMap[TType]> {
  return createMessageEnvelope(type, payload, requestId);
}

export function createRuntimeResponse<TType extends RuntimeResponseType>(
  type: TType,
  payload: RuntimeResponsePayloadMap[TType],
  requestId: RuntimeResponse['requestId'],
): MessageEnvelope<TType, RuntimeResponsePayloadMap[TType]> {
  return createMessageEnvelope(type, payload, requestId);
}

export function createRuntimeErrorResponse(
  code: RuntimeErrorResponse['payload']['code'],
  message: RuntimeErrorResponse['payload']['message'],
  requestId: RuntimeResponse['requestId'],
  detail?: RuntimeErrorResponse['payload']['detail'],
): RuntimeErrorResponse {
  return createRuntimeResponse('ERROR', { code, message, detail }, requestId);
}

export type { RuntimeRequest, RuntimeResponse };
