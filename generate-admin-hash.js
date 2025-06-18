#!/usr/bin/env node

const bcrypt = require('bcrypt');
const crypto = require('crypto');

// コマンドライン引数からパスワードを取得
const password = process.argv[2];

if (!password) {
  console.log('使用方法: node generate-admin-hash.js <パスワード>');
  console.log('');
  console.log('例: node generate-admin-hash.js MySecurePassword123!');
  console.log('');
  console.log('または、安全なランダムパスワードを生成する場合:');
  console.log('node generate-admin-hash.js --generate');
  process.exit(1);
}

async function generateHash() {
  try {
    let finalPassword = password;
    
    // --generateオプションの場合、ランダムパスワードを生成
    if (password === '--generate') {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      finalPassword = '';
      for (let i = 0; i < 16; i++) {
        finalPassword += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      console.log('🔐 生成されたパスワード:', finalPassword);
      console.log('⚠️  このパスワードを安全な場所に保存してください！');
      console.log('');
    }
    
    // bcryptハッシュを生成
    const saltRounds = 10;
    const hash = await bcrypt.hash(finalPassword, saltRounds);
    
    console.log('📋 Vercel環境変数設定用:');
    console.log('');
    console.log('ADMIN_PASSWORD_HASH=' + hash);
    console.log('');
    console.log('✅ この値をVercelの環境変数に設定してください');
    
  } catch (error) {
    console.error('❌ ハッシュ生成エラー:', error);
    process.exit(1);
  }
}

generateHash();