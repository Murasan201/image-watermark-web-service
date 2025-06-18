const crypto = require('crypto');

const password = 'X7AKUJdb';

// bcryptの代替として、より強力なPBKDF2を使用
const salt = crypto.randomBytes(16).toString('hex');
const iterations = 10000;
const keyLength = 64;
const digest = 'sha512';

const hash = crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest).toString('hex');
const combinedHash = `pbkdf2$${iterations}$${salt}$${hash}`;

console.log('🔐 生成されたパスワードハッシュ:');
console.log('ADMIN_PASSWORD_HASH=' + combinedHash);
console.log('');
console.log('📋 Vercel環境変数設定:');
console.log('ADMIN_USERNAME=ml_imageadmin');
console.log('ADMIN_PASSWORD_HASH=' + combinedHash);