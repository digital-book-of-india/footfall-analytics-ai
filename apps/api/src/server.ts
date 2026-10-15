import { app } from './app.js';
import { config } from './config.js';
import { connectDatabase } from './db/connection.js';
import * as dns from "node:dns";

dns.setServers(["8.8.8.8", "8.8.4.4"]);
async function bootstrap() {
  try {
    await connectDatabase();
    app.listen(config.port, () => {
      console.log(`===============================================`);
      console.log(`🚀 Footfall Core API Server running`);
      console.log(`📍 Port: http://localhost:${config.port}`);
      console.log(`🌐 Base URL: http://localhost:${config.port}/api/v1`);
      console.log(`⚙️  Environment: ${config.env}`);
      console.log(`===============================================`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();
