// example.ts
import { App, ExpressHttpProvider, UseFilter, Use } from './lotshot';
import { UserController } from './user.controller';
import { GlobalExceptionFilter } from './exception.filter';
import { AuthGuard } from './auth.middleware';

const PORT = 3000;

async function bootstrap() {
    const expressProvider = new ExpressHttpProvider();
    const app = new App(expressProvider);

    // Register global exception filter
    app.registerController(UserController);

    // Start the server
    await app.listen(PORT);

    // Graceful shutdown
    process.on('SIGINT', () => {
        if (app.server) {
            app.server.close(() => {
                console.log('\nLotshot Server shut down gracefully.');
                process.exit(0);
            });
        }
    });
}

bootstrap();
