import { WorkerEntrypoint } from "cloudflare:workers";
import { MessageSchema } from "./schema";
import { AuthHBWebSocket } from "./websocket";
import {z} from 'zod'

type AcceptedMessage = z.infer<typeof MessageSchema>;

export class WEBSOCKET extends AuthHBWebSocket(MessageSchema) {
	
	webSocketMessage = this.onMessage(
		async ({data, tags, send}) => {
			if (data.type === 'system') {
				send({
					type: 'system',
					content: {
						info: data.content.info,
						user: tags[0]
					}
				});
			}
		}
	)

	send(users: string[], message: AcceptedMessage) {
		const sockets = users.map((tag) => {
			const socket = this.ctx.getWebSockets(tag);
			return socket;
		}).flat()
		const _message = JSON.stringify(message)
		sockets.forEach((socket) => socket.send(_message))
	}
};

export interface Env {
	WEBSOCKET: DurableObjectNamespace<WEBSOCKET>;
}

export class WebScoketGate extends WorkerEntrypoint<Env> {

	private socket = () => {
		const id = this.env.WEBSOCKET.idFromName('foo');
		return this.env.WEBSOCKET.get(id)
	}

	async token(email: string) {
		return this.socket().provide_token(email);
	}

	send(users: string[], message: AcceptedMessage) {
		this.socket().send(users, message);
	}
}


import { Hono, MiddlewareHandler } from 'hono'

const app = new Hono<{Bindings: Env}>();

app.get('/', (c) => c.json({
	purpose: 'web socket api',
	routes: {
		"/websocket": {
			use: 'establish wss connection'
		},
	}
}));

const requireUpgrade: MiddlewareHandler = async function (c, next) {
	const upgradeHeader = c.req.header('Upgrade')
	if (!upgradeHeader || upgradeHeader !== 'websocket') {
		return c.text('expected Upgrade: websocket', 426);
	}
	return next();
}

app.get('/websocket', requireUpgrade, async (c) => {
	const request = c.req.raw
	const env = c.env

	const id = env.WEBSOCKET.idFromName('foo')
	const stub = env.WEBSOCKET.get(id)

	return stub.fetch(request)
});

app.get('/test', async (c) => {
	const env = c.env
	
	const id = env.WEBSOCKET.idFromName('foo')
	const stub = env.WEBSOCKET.get(id)

	stub.send(['edvinasmomkus@gmail.com'], {type: 'system', content: {
		info: 'trigger from another endpoint'
	}})
	return new Response('event triggered'); 
})

app.notFound((c) => c.json({ message: 'Not Found', ok: false }, 404));

export default app;