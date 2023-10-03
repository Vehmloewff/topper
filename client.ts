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
	LATENCY_SEARCH_INTERVAL = 1000 * 60

	#params: TopperClientParams
	#serverInfo = new Map<string, ServerInfo>()
	#serverConnections = new Map<string, Deno.TcpConn>()
	#ongoingPings = new Map<string, VoidFunction>()
	#connectedServer: string | null = null
	#interval: unknown = null

	constructor(params: TopperClientParams) {
		this.#params = params
	}

	addServer(address: string): void {
		this.#serverInfo.set(address, { connectedSince: null, lastPingAt: null, pingMs: null })
	}

	removeServer(address: string): void {
		if (this.#serverConnections.has(address)) this.#closeConnection(address)

		this.#serverInfo.delete(address)
	}

	async connect(): Promise<void> {
		await this.pingAllServers()

		this.#interval = setInterval(() => {
			this.pingAllServers()
		}, this.LATENCY_SEARCH_INTERVAL)

		// TODO: find server with lowest latency, set it as primary connection
	}

	// TODO: findServerWithLowestLatency, primaryConnectToServer, sendMessage

	async pingAllServers(): Promise<void> {
		const pingedServers = new Set<string>()

		const getServerToBePinged = () => {
			for (const server of this.getServers()) {
				if (!pingedServers.has(server)) return server
			}

			return null
		}

		while (true) {
			const server = getServerToBePinged()
			if (!server) break

			await this.#ping(server)
		}
	}

	disconnect(): void {}

	getConnectedServer(): string | null {
		return this.#connectedServer
	}

	getServers(): string[] {
		return [...this.#serverInfo.keys()]
	}

	getServerInfo(address: string): ServerInfo {
		const info = this.#serverInfo.get(address)
		if (!info) throw new Error(`No server exists for address "${address}"`)

		return info
	}

	async #createConnection(address: string) {
		// Don't create a new connection if the connection already exists
		if (this.#serverConnections.has(address)) return

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
		// Don't close the connection if it already exists
		if (!this.#serverConnections.has(address)) return

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
		await this.#createConnection(address)
		await this.#pingConnection(address)

		if (this.#connectedServer !== address) this.#closeConnection(address)
	}

	async #pingConnection(address: string) {
		const startTime = Date.now()

		const success = await new Promise<boolean>((resolve) => {
			const finish = (success: boolean) => {
				this.#ongoingPings.delete(address)
				resolve(success)
			}

			this.#ongoingPings.set(address, () => finish(true))
			setTimeout(() => finish(false), this.PING_TIMEOUT)

			this.#sendBytes(address, buildMessage(new Uint8Array()))
		})

		if (!success) return

		const existingServerInfo = this.#serverInfo.get(address)
		const lastPingAt = Date.now()
		const pingMs = lastPingAt - startTime
		const connectedSince = existingServerInfo?.connectedSince ?? null

		this.#serverInfo.set(address, { lastPingAt, pingMs, connectedSince })
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
