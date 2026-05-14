import { startServer } from './server.js';

startServer().catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});
