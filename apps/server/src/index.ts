import { DI } from "./bootstrap";

if (require.main === module) {
  async function startServer() {
    await DI.API.start();
  }

  startServer();
}
