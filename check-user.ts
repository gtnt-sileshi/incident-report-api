import { userRepository } from './src/users/user.repository';
import { testConnection, closePool } from './src/db/index';

async function checkUser() {
  await testConnection();
  const user = await userRepository.findByEmail('admin@examportal.gov.et');
  console.log('User found:', user ? { id: user.id, email: user.email, role: user.role, isActive: user.isActive } : 'NULL');
  await closePool();
}

checkUser().catch(console.error);
