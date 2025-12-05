# Lotshot

## 📄 Lotshot Framework Documentation
*Apache License 2.0*

### Lotshot: A Decoupled API Framework

**Lotshot** is a minimalist, decorator-based framework for building robust and structured APIs using Node.js and the Express HTTP server, inspired by the architecture of established frameworks like NestJS. It emphasizes decoupling the core application logic from the underlying HTTP and WebSocket providers using clear interfaces.

### Features

  * **Decorator-based Routing:** Define routes, methods, and paths using `@Controller`, `@Get`, `@Post`, etc.
  * **Parameter Validation:** Seamless integration with `class-validator` and `class-transformer` for request body, query, and path parameter validation.
  * **Middleware and Exception Filters:** Apply class-level or method-level middleware and custom exception filters using `@Use` and `@UseFilter`.
  * **Decoupled Architecture:** Core logic is independent of Express via the `HttpProvider` interface.
  * **Basic Dependency Injection (DI):** Uses reflection metadata for basic service registration and injection.

### Setup and Installation

Lotshot requires the following dependencies for its full functionality (excluding `reflect-metadata` for brevity):

```bash
npm install express reflect-metadata class-validator class-transformer socket.io @types/express @types/socket.io
```

tsconfig.json:
```js
{
  "compilerOptions": {
    // 1. Enables the use of the @decorator syntax
    "experimentalDecorators": true,

    // 2. Enables the TypeScript compiler to emit type metadata 
    // (design:type, design:paramtypes, etc.) when a decorator is present.
    // This metadata is read by 'reflect-metadata' at runtime.
    "emitDecoratorMetadata": true,
    
    // It's also typical to include "moduleResolution": "node" for a Node.js project.
    "moduleResolution": "node"
  }
}
```

> import 'reflect-metadata'; // <-- This must be included at the top of the application entry point

### Core Concepts

#### 1\. Controllers and Routing

Controllers are classes decorated with `@Controller(basePath)`. Methods within the controller are decorated with HTTP method decorators (`@Get`, `@Post`, etc.) to define the route handler.

```typescript
// user.controller.ts
import { Controller, Get, Post, Body } from './lotshot.ts';

// 1. Define a DTO for validation (optional)
import { IsNotEmpty, IsEmail } from 'class-validator';
class CreateUserDto {
    @IsNotEmpty()
    username!: string;

    @IsEmail()
    email!: string;
}

@Controller('/users') // Base path for all routes in this controller
export class UserController {

    // Example: GET /users/
    @Get()
    public async findAll() {
        // Imagine fetching all users from a database
        return [{ id: 1, username: 'testuser' }, { id: 2, username: 'admin' }];
    }

    // Example: POST /users/
    @Post()
    public async create(@Body(CreateUserDto) body: CreateUserDto) {
        console.log('Creating user:', body);
        return { message: 'User created successfully', user: body };
    }

    // Example: GET /users/123
    @Get('/:id')
    public async findOne(@Param('id') userId: string) {
        // The userId parameter is automatically extracted from req.params.id
        return { id: userId, username: `user_${userId}` };
    }
}
```

#### 2\. Services and Dependency Injection

Services are plain classes decorated with `@Injectable()`. They are registered in the DI container and can be injected into other services or controllers using the `@Inject(token)` decorator.

```typescript
// user.service.ts
import { Injectable, DIContainer } from './lotshot.ts';

// The DI container is used to manage services
@Injectable()
export class UserService {
    private users: any[] = [];

    public findUsers() {
        return this.users;
    }

    public addUser(user: any) {
        this.users.push(user);
    }
}
```

**Using the Service in a Controller:**

```typescript
// user.controller.ts (Updated)
import { Controller, Get, Inject } from './lotshot.ts';
import { UserService } from './user.service.ts'; // Import the service

@Controller('/users')
export class UserController {

    // Inject the service using its registered token (UserService.name)
    // NOTE: The DI implementation in Lotshot requires the token to be the Class.name by convention.
    @Inject(UserService.name)
    private readonly userService!: UserService;

    @Get()
    public async findAll() {
        return this.userService.findUsers();
    }
    // ... other methods
}
```

### 3\. Application Bootstrap

The application is bootstrapped by creating an `App` instance with a concrete `HttpProvider` (e.g., `ExpressHttpProvider`), registering controllers, and starting the server.

```typescript
// main.ts - Application Entry Point
import { App, ExpressHttpProvider, SimpleDIContainer } from './lotshot.ts';
import { UserController } from './user.controller.ts';
import { UserService } from './user.service.ts';

const PORT = 3000;

async function bootstrap() {
    // 1. Initialize the DI Container
    const container = new SimpleDIContainer();
    
    // 2. Register Services as Singletons
    // The token for injection is typically the class name string
    container.registerSingleton(UserService.name, new UserService());

    // 3. Create the App instance
    const app = new App(new ExpressHttpProvider(), container);
    
    // 4. Register all Controllers
    app.registerController(UserController);

    // 5. Start the HTTP server
    await app.listen(PORT);
    
    // 6. Optionally, enable WebSockets
    // app.enableWebSockets(app.server!);
    // app.getWebSocketProvider()!.on('connection', (socket) => { ... });
}

bootstrap();
```

---

## 🎯 Top 10 Lotshot Usecases

### 1. Simple CRUD API Endpoint
* **Usecase:** Creating a standard **RESTful API** for managing a resource, like **Products**.
* **Lotshot Feature:** Use `@Controller('/products')` and map basic methods: `@Get()`, `@Post()`, `@Put('/:id')`, `@Delete('/:id')`.

### 2. Request Body Validation
* **Usecase:** Ensuring a new user registration request contains required fields and correct formats (e.g., a valid email).
* **Lotshot Feature:** Pass a `class-validator` **DTO** to the `@Body()` decorator: `@Post() async register(@Body(RegisterDto) data: RegisterDto)`.

### 3. Service Layer Injection
* **Usecase:** Decoupling the controller (HTTP handling) from the business logic (database calls, calculations).
* **Lotshot Feature:** Define a `DatabaseService` with `@Injectable()` and inject it into the `Controller` using `@Inject('DatabaseService')`.

### 4. Authentication Middleware
* **Usecase:** Protecting specific routes (e.g., `/admin`) by checking for a valid authorization token.
* **Lotshot Feature:** Apply a custom middleware function at the **class level** via `@Use(AuthMiddleware)` on the controller.

### 5. Role-Based Authorization
* **Usecase:** Restricting access to a specific method (e.g., `deleteUser`) to only users with the "Admin" role.
* **Lotshot Feature:** Apply a custom middleware function at the **method level** via `@Use(AdminGuard)` on the `delete` method.

### 6. Centralized Error Handling
* **Usecase:** Catching a custom `UserNotFoundException` thrown by a service and automatically returning a `404 Not Found` response.
* **Lotshot Feature:** Implement and apply an `ExceptionFilter` using the `@UseFilter(NotFoundFilter)` decorator.

### 7. Path Parameter Handling
* **Usecase:** Retrieving a specific article using the ID from the URL path, e.g., `/articles/42`.
* **Lotshot Feature:** Use the `@Param('id')` decorator in the method signature: `@Get('/:id') async getArticle(@Param('id') id: string)`.

### 8. Query Parameter Filtering
* **Usecase:** Handling optional search terms or pagination parameters from the URL query string, e.g., `/users?limit=10`.
* **Lotshot Feature:** Use the `@Query('limit')` decorator to extract the specific parameter value.

### 9. Provider Agnostic API
* **Usecase:** Switching the underlying HTTP server from **Express** to another provider (e.g., Fastify) without changing the Controller code.
* **Lotshot Feature:** Replace `ExpressHttpProvider` with a custom provider that implements the `HttpProvider` interface during application bootstrap.

### 10. WebSocket Integration
* **Usecase:** Setting up real-time bidirectional communication for features like chat or live updates.
* **Lotshot Feature:** Use the `app.enableWebSockets(server)` method to initialize the `ExpressWebSocketProvider` (Socket.IO) on the existing HTTP server instance.

---

## 📉 Weakness Assessment

The framework exhibits several weaknesses, primarily due to its simplicity and direct implementation, which deviates from best practices in established frameworks:

  * **1. Non-Robust Dependency Injection (DI):**
      * The `SimpleDIContainer` is **extremely basic**. It lacks the ability to **auto-resolve** dependencies based on type (it only uses string tokens) and cannot handle **circular dependencies**.
      * The `Inject` decorator creates a **new** `SimpleDIContainer` instance on every decorated property access (`get: () => new SimpleDIContainer().resolve(token)`), leading to a **loss of state** and incorrect singleton behavior if the container isn't manually registered globally or passed around properly. This is a critical flaw in the provided `Inject` implementation.
      * The `resolveController` simply calls `new (ControllerClass as any)()`, bypassing the DI container for controllers themselves, which means the **`Inject` decorator won't work correctly** within controller constructors.
  * **2. Parameter Processing:**
      * The parameter processing logic (`wrappedHandler`) relies on the parameter indices being stored, which is fragile if parameters are reordered or if non-decorated parameters (like `req`, `res`, `next` sometimes seen in Express handlers) are needed. It also doesn't inject `req`, `res`, or `next` directly, which limits raw Express functionality.
  * **3. Global State and Scope:**
      * The framework registers routes directly to the Express application via the `App` class. It lacks a **module system** or hierarchical scoping, which makes organizing large applications difficult.
  * **4. Limited Error/Exception Handling:**
      * Exception handling is basic. The `filters` logic only handles exceptions inside the `wrappedHandler`. The global Express error handler in `ExpressHttpProvider` is a simple catch-all. More granular error handling (e.g., HTTP status mapping for specific exceptions) is missing.
  * **5. Middleware & Async Handling:**
      * Middleware functions are manually mapped and wrapped to ensure promises resolve (`...methodMiddleware.map(mw => async (req, res, next) => { ... })`). While necessary for async middleware, this adds verbosity and deviates from how standard Express handles synchronous middleware.

---

> updated Dec 2025
