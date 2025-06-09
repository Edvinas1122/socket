import { DurableObject } from "cloudflare:workers";
import type { ZodObject, ZodRawShape, ZodTypeAny, infer as zInfer } from "zod";

type MessageHandler<T> = (ctx: {
	ws: WebSocket;
	data: T;
	connections: WebSocket[];
	tags: string[];
	send: (msg: T) => void;
}) => void | Promise<void>;

type WithMessageType<T> = (handler: MessageHandler<T>) => (ws: WebSocket, message: ArrayBuffer | string) => Promise<void>;

export function WebSocketHBServer<T extends ZodTypeAny>(
	MessageSchema: T
) {
	type Parsed = zInfer<typeof MessageSchema>;

	return class WebSocketHibernationServer extends DurableObject {

		protected onMessage: WithMessageType<Parsed> = (handler) => {
			return async (ws: WebSocket, message: ArrayBuffer | string) => {
				console.log('received a message', message)
				const send = (msg: Parsed) => ws.send(JSON.stringify(msg));
				try {
					const json = JSON.parse(message as string);
					const parsed = MessageSchema.parse(json);
					const connections = this.ctx.getWebSockets();
					const tags = this.ctx.getTags(ws);

					console.log("calling handler")
					await handler({
						ws,
						data: parsed,
						connections,
						tags,
						send,
					});
				} catch (error) {
					console.error("WebSocket error:", error);
					ws.send(JSON.stringify({
						success: false,
						message: "message format error"
					}));
				}
			};
		};

		protected withFetch(handler: (request: Request) => Promise<string[]>): (request: Request) => Promise<Response> {
			return async (request: Request): Promise<Response> => {
				const webSocketPair = new WebSocketPair();
				const [client, server] = Object.values(webSocketPair);
				
				await handler(request).then((tags) => {
					this.ctx.acceptWebSocket(server, tags);
				}).catch((error) => {
					console.log(error);
					this.ctx.abort('bad request');
				})

				return new Response(null, {
					status: 101,
					webSocket: client,
				});
			};
		}

		async webSocketClose(
			ws: WebSocket,
			code: number,
			reason: string,
			wasClean: boolean
		) {
			ws.close(code, "Durable Object is closing WebSocket");
		}
	};
}

import { getCryptoFunctions } from "./crypto";

export function AuthHBWebSocket<T extends ZodTypeAny>(
	MessageSchema: T
) {
	return class AuthHBWebSocket extends WebSocketHBServer(MessageSchema) {
			private crypto = getCryptoFunctions({alg_name: 'RSA-OAEP', hash: 'SHA-256'});
		
			constructor(ctx: DurableObjectState, env: Env) {
				super(ctx, env);
				this.ctx.blockConcurrencyWhile(async () => {
					const {public_key, private_key} = await this.crypto.generateKeyPair();
					await this.ctx.storage.put("rsa_keys", { public_key, private_key });
				})
			}
		
			fetch = this.withFetch(async (request) => {
				const token = new URL(request.url).searchParams.get('token');
				if (!token) throw new Error('must query contain token');
				const email = await this.validate(token);
				// const email = 'test'
				return [email];
			})
		
			async provide_token(email: string) {
				const keys = await this.ctx.storage.get('rsa_keys') as {public_key: JsonWebKey; private_key: JsonWebKey;};
				return await this.crypto.encrypt(email, keys.public_key);
			}
		
			private async validate(hash: string) {
				const keys = await this.ctx.storage.get('rsa_keys') as {public_key: JsonWebKey; private_key: JsonWebKey;};
				const message = await this.crypto.decrypt(hash, keys.private_key);
				return message
			}
	}
}