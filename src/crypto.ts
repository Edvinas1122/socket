type JWKKey = JsonWebKey;

type CryptoFunctionProps = {
  alg_name: 'RSA-OAEP';
  hash: 'SHA-256' | 'SHA-1';
};

export function getCryptoFunctions(config: CryptoFunctionProps = { alg_name: 'RSA-OAEP', hash: 'SHA-256' }) {
  const { alg_name, hash } = config;

  async function generateKeyPair() {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: alg_name,
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash,
      },
      true,
      ['encrypt', 'decrypt']
    );

	//@ts-ignore
    const public_key = await crypto.subtle.exportKey('jwk', keyPair.publicKey as CryptoKey);
    //@ts-ignore
	const private_key = await crypto.subtle.exportKey('jwk', keyPair.privateKey as CryptoKey);

    return { public_key, private_key };
  }

  async function importKey(jwk: JWKKey, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
    return crypto.subtle.importKey(
      'jwk',
      jwk,
      {
        name: alg_name,
        hash,
      },
      true,
      [usage]
    );
  }

  async function encrypt(plainText: string, publicKeyJwk: JWKKey): Promise<string> {
    const publicKey = await importKey(publicKeyJwk, 'encrypt');
    const encoded = new TextEncoder().encode(plainText);
    const encrypted = await crypto.subtle.encrypt({ name: alg_name }, publicKey, encoded);
    return arrayBufferToBase64(encrypted); // 🔑 Return a short base64 string
  }

  async function decrypt(base64CipherText: string, privateKeyJwk: JWKKey): Promise<string> {
    const privateKey = await importKey(privateKeyJwk, 'decrypt');
    const cipherBuffer = base64ToArrayBuffer(base64CipherText);
    const decrypted = await crypto.subtle.decrypt({ name: alg_name }, privateKey, cipherBuffer);
    return new TextDecoder().decode(decrypted); // 🔓 Return plaintext
  }

  return {
    generateKeyPair,
    encrypt,
    decrypt,
    importKey,
  };
}


function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}