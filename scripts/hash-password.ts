import { hashPassword } from '../apps/api/src/auth.js';
// Read from stdin to avoid putting the password in shell history/process arguments.
let input = '';
for await (const chunk of process.stdin) input += String(chunk);
if (!input.trim()) throw new Error('Provide a password on stdin.');
console.log(hashPassword(input.trim()));
