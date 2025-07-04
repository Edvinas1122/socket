import { WorkerEntrypoint } from "cloudflare:workers";
import { MessageSchema } from "./schema";
import { AuthHBWebSocket } from "./websocket";
import {z} from 'zod'
import * as queries from "./sql"

export type AcceptedMessage = z.infer<typeof MessageSchema>;


export interface Env {
	MY_DURABLE_OBJECT: DurableObjectNamespace;
}

export class WEBSOCKET extends AuthHBWebSocket(MessageSchema) {
	private sql: SqlStorage;
	constructor(ctx: DurableObjectState, env: Env) {
			super(ctx, env);
			this.sql = ctx.storage.sql;
			this.sql.exec(queries.CREATE_LOGS_TABLE_SQL)
	}

	fetch = this.withAuthFetch((req, email) => {
		this.sql.exec(queries.UPSERT_LOG_SQL, email, Date.now(), 1);
	});

	webSocketMessage = this.onMessage(
		({data, tags, send}) => {
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

	webSocketClose = this.withAuthClose((email) => {
		this.sql.exec(queries.SET_OFFLINE_SQL, email);
	})

	async distribute(e: string[], m: AcceptedMessage) {
		console.log('socket rpc called', e)
		const distributedTo: string[] = [];
		const handler = this.withDistribute((dis, m) => {
			distributedTo.push(...dis);
			console.log('distributed online to:', dis);
		});
		handler(e, m);
		return distributedTo;
	}


	async logs() {
		const data = await this.sql.exec(queries.SELECT_ALL_LOGS)	
			.toArray()
		return data;
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

	async send(users: string[], message: AcceptedMessage) {
		console.log('rpc send called');
		const socket = this.socket();
		const prom = socket.distribute(users, message);
		// this.ctx.waitUntil(prom);
		return await prom;
	}

	async logs() {
		return await this.socket().logs()
	}

	online() {
		return this.socket().online()
	}
}

export type WebSocketGateService = InstanceType<typeof WebScoketGate>;


import { Hono, MiddlewareHandler, Handler, Context } from 'hono'
import { InstanceOf } from "ts-morph";

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

const wihError: MiddlewareHandler = async function (c, next) {
	try {
		return next();
	} catch (e: any) {
		console.error("error:", e.message);
		return new Response('Error: ' + e.message);
	}
}

function withSocket(
	handler: (socket: InstanceType<typeof WEBSOCKET>, c: Context) => Promise<Response>
): Handler {
	return async (c) => {
		const env = c.env;
	
		const id = env.WEBSOCKET.idFromName('foo');
		const stub = env.WEBSOCKET.get(id) as InstanceType<typeof WEBSOCKET>;
		return await handler(stub, c);
	}
}

app.get('/websocket', requireUpgrade, async (c) => {
	const request = c.req.raw
	const env = c.env

	const id = env.WEBSOCKET.idFromName('foo')
	const stub = env.WEBSOCKET.get(id)

	return stub.fetch(request)
});

app.get('/logs', wihError, withSocket(async (socket, c) => {
	const data = await socket.logs();
	return new Response(JSON.stringify(data));
}))

app.get('/test', async (c) => {
	const env = c.env;
	
	const id = env.WEBSOCKET.idFromName('foo')
	const stub = env.WEBSOCKET.get(id)

	const chat_id = c.req.query('chat');
	const message = c.req.query('message');

	if (!chat_id || !message) return new Response('chat id and message required');

	stub.distribute(['edvinasmomkus@gmail.com'], {type: 'chat', content: {
		content: message,
		id: 'edvinasmomkus@gmail.com:short:1751036551178',
		chat: chat_id,
		member: "edvinasmomkus@gmail.com:short:1751036551178",
		sent: Date.now().toLocaleString()
	}})
	return new Response('event triggered'); 
})

app.notFound((c) => c.json({ message: 'Not Found', ok: false }, 404));

export default app;