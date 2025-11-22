import app from "./app";
import { PORT } from "./config";

const server = app.listen(PORT, () => {
  console.log(`[auth-api] Server running on port ${PORT} (env: ${process.env.NODE_ENV ?? "development"})`);
});

const closeServer = () => {
  server.close(() => {
    console.log("[auth-api] Server stopped");
  });
};

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
