import { binaryUtils } from './deps.ts'
import { bytesToLength } from './helpers.ts'

export interface MessageReaderParams {
	onMessageReceived(message: Uint8Array): unknown
}

export class MessageReader {
	#params: MessageReaderParams
	#currentMessageChunks: Uint8Array[] = []
	#currentMessageLength = 0
	#currentMessageExpectedLength: number | null = null

	constructor(params: MessageReaderParams) {
		this.#params = params
	}

	#finishMessage() {
		this.#params.onMessageReceived(binaryUtils.joinByteArrays(...this.#currentMessageChunks))
		this.reset()
	}

	reset(): void {
		this.#currentMessageChunks = []
		this.#currentMessageLength = 0
		this.#currentMessageExpectedLength = null
	}

	addBytes(bytes: Uint8Array): void {
		// If there is no expected length, we are starting a new message
		if (this.#currentMessageExpectedLength === null) {
			this.#currentMessageExpectedLength = bytesToLength(bytes.slice(0, 4))

			// But of course, if the length is 0, we should finish directly
			if (!this.#currentMessageExpectedLength) return this.#finishMessage()

			return this.addBytes(bytes.slice(4))
		}

		// Find out how many bytes we have left
		const bytesLeft = this.#currentMessageExpectedLength - this.#currentMessageLength
		const extraBytesWereSent = bytes.byteLength > bytesLeft
		const bytesToProcess = extraBytesWereSent ? bytes.slice(0, bytesLeft) : bytes
		const extraBytes = extraBytesWereSent ? bytes.slice(bytesLeft) : null

		// Add the chunk
		this.#currentMessageChunks.push(bytesToProcess)
		this.#currentMessageLength += bytesToProcess.length

		// If we just finished, finish
		if (this.#currentMessageLength >= this.#currentMessageExpectedLength) this.#finishMessage()

		// If there are extra bytes, add them
		if (extraBytes) this.addBytes(extraBytes)
	}
}
