import { buildMessage } from './helpers.ts'
import { MessageReader } from './message_reader.ts'

export interface TopperClientParams {
	onConnectivityChange(): unknown
	onServerChanged(): unknown
	onMessageReceived(message: Uint8Array): unknown
}

export interface ServerInfo {
	pingMs: number | null
	lastPingAt: number | null
	connectedSince: number | null
}

export class TopperClient {
	PING_TIMEOUT = 1000 * 60

	#params: TopperClientParams
	#serverInfo = new Map<string, ServerInfo>()
	#serverConnections = new Map<string, Deno.TcpConn>()
	#ongoingPings = new Map<string, VoidFunction>()
	#connectedServer: string | null = null

	constructor(params: TopperClientParams) {
		this.#params = params
	}

	addServer(address: string): Promise<void> {
	}

	removeServer(address: string): void {}

	connect(): Promise<void> {}

	disconnect(): void {}

	getConnectedServer(): string | null {}

	getServerInfo(): ServerInfo {}

	async #createConnection(address: string) {
		const [hostname, portRaw] = address.split(':')

		const port = portRaw ? parseInt(portRaw) : 7459
		if (isNaN(port)) throw new Error(`Cannot parse port part of address, "${portRaw}"`)

		const conn = await Deno.connect({ hostname, port })
		const messageReader = new MessageReader({
			onMessageReceived: (bytes) => this.#handleIncomingMessage(address, bytes),
		})

		0 // We want to read incoming messages without blocking the rest of the function
		;(async () => {
			const packetReader = conn.readable.getReader()
			while (true) {
				const res = await packetReader.read()
				if (res.done) break

				messageReader.addBytes(res.value)
			}
		})()

		this.#serverConnections.set(address, conn)
	}

	#closeConnection(address: string) {
		const conn = this.#serverConnections.get(address)
		if (!conn) throw new Error('Logical error: cannot close because no connection exists')

		conn.close()

		this.#serverConnections.delete(address)
		this.#ongoingPings.delete(address)

		if (this.#connectedServer === address) this.#connectedServer = null
	}

	async #sendBytes(address: string, bytes: Uint8Array) {
		const connection = this.#serverConnections.get(address)
		if (!connection) throw new Error('Logical error: cannot send bytes because no connection exists')

		await connection.write(bytes)
	}

	async #ping(address: string) {
		const startTime = Date.now()

		await new Promise<boolean>((resolve) => {
			const finish = (success: boolean) => {
				this.#ongoingPings.delete(address)
				resolve(success)
			}

			this.#ongoingPings.set(address, () => finish(true))
			setTimeout(() => finish(false), this.PING_TIMEOUT)

			this.#sendBytes(address, buildMessage(new Uint8Array()))
		})

		return Date.now() - startTime
	}

	#handleIncomingMessage(address: string, bytes: Uint8Array) {
		// If there is no bytes length, it is a pong
		if (!bytes.length) {
			const listeningFn = this.#ongoingPings.get(address)
			if (!listeningFn) return // Ignore un-requested pongs

			listeningFn()
		}

		if (address !== this.#connectedServer) return // Also ignore messages from a server we haven't connected to

		this.#params.onMessageReceived(bytes)
	}
}
