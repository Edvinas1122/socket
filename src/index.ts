import { WorkerEntrypoint } from "cloudflare:workers";
import { MessageSchema } from "./schema";
import { AuthHBWebSocket } from "./websocket";

export class WebSocketHibernationServer extends AuthHBWebSocket(MessageSchema) {
	
	webSocketMessage = this.withMessage(
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

	async subscribe(email: string, event: string) {
		await this.updateSubscribers(event, (list) =>
			list.includes(email) ? list : [...list, email]
		);
	}

	async unsubscribe(email: string, event: string) {
		await this.updateSubscribers(event, (list) =>
			list.filter((e) => e !== email)
		);
	}

	async notify(event: string, data: any, except: string[] = []) {
		const consumers: string[] = await this.ctx.storage.get(event) || [];
		const sockets = consumers
			.filter((email) => !except.includes(email))
			.map((email) => this.ctx.getWebSockets(email)[0]);
		sockets.forEach((ws) => ws.send(data));
	}

	private async updateSubscribers(
		event: string, updater: (current: string[]) => string[]
	) {
		const consumers: string[] = await this.ctx.storage.get(event) || [];
		const updated = updater(consumers);
		await this.ctx.storage.put(event, updated);
	}
};

export interface Env {
	WEBSOCKET: DurableObjectNamespace<WebSocketHibernationServer>;
}

export class WebScoketGate extends WorkerEntrypoint<Env> {
	async token(email: string) {
		const id = this.env.WEBSOCKET.idFromName('foo');
		return this.env.WEBSOCKET.get(id).provide_token(email);
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


app.notFound((c) => c.json({ message: 'Not Found', ok: false }, 404));

export default app;