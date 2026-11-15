import crypto from 'node:crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

const privada = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const publica = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

console.log('LICENSE_PRIVATE_KEY (backend, nunca en el APK ni en git):');
console.log(privada);
console.log('');
console.log('LICENSE_PUBLIC_KEY (app móvil):');
console.log(publica);
