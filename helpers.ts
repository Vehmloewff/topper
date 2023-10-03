import { binaryUtils } from './deps.ts'

const UINT32_MAX = 4294967295

export function buildMessage(data: Uint8Array): Uint8Array {
	return binaryUtils.joinByteArrays(lengthToBytes(data.byteLength), data)
}

export function bytesToLength(bytes: Uint8Array): number {
	if (bytes.byteLength > 4) throw new Error(`Cannot parse a length from bytes. Expected 4 bytes, but got ${bytes.byteLength}`)

	return new Uint32Array(bytes)[0]
}

export function lengthToBytes(length: number): Uint8Array {
	if (length > UINT32_MAX) {
		throw new Error(`Message is too large. The maximum number of bytes is ${UINT32_MAX}, but ${length} bytes were received`)
	}

	return new Uint8Array(new Uint32Array([length]).buffer)
}
