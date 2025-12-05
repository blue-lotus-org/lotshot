// lotshot.ts - The Core Decoupled API Framework
import 'reflect-metadata';
import express, { Request, Response, NextFunction, Router, Application as ExpressApp, RequestHandler } from 'express';
import { Server } from 'http';
import { validate, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Server as SocketIOServer } from 'socket.io';

// --- Metadata Keys ---
const ROUTE_METADATA_KEY = Symbol('routes');
const PARAM_METADATA_KEY = Symbol('params');
const BASE_PATH_METADATA_KEY = Symbol('basePath');
const MIDDLEWARE_METADATA_KEY = Symbol('middleware');
const EXCEPTION_FILTER_METADATA_KEY = Symbol('exceptionFilters');
const INJECTABLE_METADATA_KEY = Symbol('injectable');

// --- Types & Interfaces ---
export type MiddlewareFunction = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

interface RouteDefinition {
    path: string;
    method: 'get' | 'post' | 'put' | 'delete';
    methodName: string;
}

interface ParamDefinition {
    index: number;
    type: 'body' | 'query' | 'param';
    name?: string;
    validationClass?: Function;
}

interface ExceptionFilter {
    catch(exception: any, host: { req: Request; res: Response }): void;
}

export interface HttpProvider {
    getApp(): ExpressApp;
    listen(port: number, callback: () => void): Server;
    use(middleware: RequestHandler): void;
    registerRoute(method: RouteDefinition['method'], path: string, handler: RequestHandler): void;
    setBasePath(basePath: string, router: Router): void;
}

export interface WebSocketProvider {
    on(connection: string, callback: (socket: any) => void): void;
    emit(event: string, data: any): void;
}

export interface DIContainer {
    register<T>(token: string, value: T): void;
    resolve<T>(token: string): T;
    registerSingleton<T>(token: string, value: T): void;
}

// --- DI Container ---
export class SimpleDIContainer implements DIContainer {
    private services = new Map<string, any>();
    private singletons = new Map<string, any>();

    register<T>(token: string, value: T): void {
        this.services.set(token, value);
    }

    resolve<T>(token: string): T {
        if (this.singletons.has(token)) {
            return this.singletons.get(token);
        }
        const service = this.services.get(token);
        if (!service) {
            throw new Error(`Service ${token} not found.`);
        }
        return service;
    }

    registerSingleton<T>(token: string, value: T): void {
        this.singletons.set(token, value);
    }
}

// --- DI Decorators ---
export function Injectable() {
    return (target: any) => {
        Reflect.defineMetadata(INJECTABLE_METADATA_KEY, true, target);
    };
}

export function Inject(token: string) {
    return (target: any, propertyKey: string) => {
        const container = new SimpleDIContainer();
        Object.defineProperty(target, propertyKey, {
            get: () => container.resolve(token),
        });
    };
}

// --- Parameter Decorators ---
export function Body(ValidationClass?: Function) {
    return (target: any, methodName: string, index: number) => {
        const existingParams: ParamDefinition[] = Reflect.getOwnMetadata(PARAM_METADATA_KEY, target, methodName) || [];
        existingParams.push({ index, type: 'body', validationClass: ValidationClass });
        Reflect.defineMetadata(PARAM_METADATA_KEY, existingParams, target, methodName);
    };
}

export function Param(name: string, ValidationClass?: Function) {
    return (target: any, methodName: string, index: number) => {
        const existingParams: ParamDefinition[] = Reflect.getOwnMetadata(PARAM_METADATA_KEY, target, methodName) || [];
        existingParams.push({ index, type: 'param', name, validationClass: ValidationClass });
        Reflect.defineMetadata(PARAM_METADATA_KEY, existingParams, target, methodName);
    };
}

export function Query(name: string, ValidationClass?: Function) {
    return (target: any, methodName: string, index: number) => {
        const existingParams: ParamDefinition[] = Reflect.getOwnMetadata(PARAM_METADATA_KEY, target, methodName) || [];
        existingParams.push({ index, type: 'query', name, validationClass: ValidationClass });
        Reflect.defineMetadata(PARAM_METADATA_KEY, existingParams, target, methodName);
    };
}

// --- Middleware Decorator ---
export function Use(...middleware: MiddlewareFunction[]) {
    return (target: any, methodName?: string) => {
        if (methodName) {
            const existingMiddleware = Reflect.getOwnMetadata(MIDDLEWARE_METADATA_KEY, target, methodName) || [];
            Reflect.defineMetadata(MIDDLEWARE_METADATA_KEY, [...existingMiddleware, ...middleware], target, methodName);
        } else {
            const existingMiddleware = Reflect.getOwnMetadata(MIDDLEWARE_METADATA_KEY, target.prototype) || [];
            Reflect.defineMetadata(MIDDLEWARE_METADATA_KEY, [...existingMiddleware, ...middleware], target.prototype);
        }
    };
}

// --- Exception Filter Decorator ---
export function UseFilter(...filters: ExceptionFilter[]) {
    return (target: any, methodName?: string) => {
        if (methodName) {
            const existingFilters = Reflect.getOwnMetadata(EXCEPTION_FILTER_METADATA_KEY, target, methodName) || [];
            Reflect.defineMetadata(EXCEPTION_FILTER_METADATA_KEY, [...existingFilters, ...filters], target, methodName);
        } else {
            const existingFilters = Reflect.getOwnMetadata(EXCEPTION_FILTER_METADATA_KEY, target.prototype) || [];
            Reflect.defineMetadata(EXCEPTION_FILTER_METADATA_KEY, [...existingFilters, ...filters], target.prototype);
        }
    };
}

// --- Controller Decorator ---
export function Controller(basePath: string = '') {
    return (target: Function) => {
        Reflect.defineMetadata(BASE_PATH_METADATA_KEY, basePath, target.prototype);
    };
}

// --- Route Decorators ---
function createMethodDecorator(method: RouteDefinition['method']) {
    return (path: string = '') => {
        return (target: any, methodName: string) => {
            const routes: RouteDefinition[] = Reflect.getOwnMetadata(ROUTE_METADATA_KEY, target.constructor) || [];
            routes.push({ path, method, methodName });
            Reflect.defineMetadata(ROUTE_METADATA_KEY, routes, target.constructor);
        };
    };
}

export const Get = createMethodDecorator('get');
export const Post = createMethodDecorator('post');
export const Put = createMethodDecorator('put');
export const Delete = createMethodDecorator('delete');

// --- Core Application Class ---
export class App {
    private provider: HttpProvider;
    private wsProvider?: WebSocketProvider;
    private diContainer: DIContainer;
    public server: Server | null = null;

    constructor(provider: HttpProvider, diContainer: DIContainer = new SimpleDIContainer()) {
        this.provider = provider;
        this.diContainer = diContainer;
        this.provider.use(express.json());
    }

    public registerController(ControllerClass: Function) {
        const instance = this.resolveController(ControllerClass);
        const baseRouter = Router();
        const basePath: string = Reflect.getOwnMetadata(BASE_PATH_METADATA_KEY, ControllerClass.prototype) || '/';
        const classMiddleware: MiddlewareFunction[] = Reflect.getOwnMetadata(MIDDLEWARE_METADATA_KEY, ControllerClass.prototype) || [];
        baseRouter.use(...classMiddleware);

        const routes: RouteDefinition[] = Reflect.getOwnMetadata(ROUTE_METADATA_KEY, ControllerClass) || [];
        routes.forEach(route => {
            const fullPath = route.path;
            const handler = instance[route.methodName];
            if (typeof handler === 'function') {
                console.log(`[LOTSHOT] Registering ${route.method.toUpperCase()} ${basePath}${fullPath}`);
                const methodMiddleware: MiddlewareFunction[] = Reflect.getOwnMetadata(MIDDLEWARE_METADATA_KEY, ControllerClass.prototype, route.methodName) || [];
                const wrappedHandler = async (req: Request, res: Response, next: NextFunction) => {
                    try {
                        const paramDefs: ParamDefinition[] = Reflect.getOwnMetadata(PARAM_METADATA_KEY, ControllerClass.prototype, route.methodName) || [];
                        const args = [];
                        for (const param of paramDefs) {
                            let value: any;
                            if (param.type === 'body' || param.type === 'query' || param.type === 'param') {
                                const ValidationClass = param.validationClass;
                                let rawValue: any;
                                if (param.type === 'body') rawValue = req.body;
                                if (param.type === 'query') rawValue = req.query[param.name];
                                if (param.type === 'param') rawValue = req.params[param.name];

                                if (ValidationClass) {
                                    const instanceData = plainToInstance(ValidationClass, rawValue);
                                    const errors: ValidationError[] = await validate(instanceData);
                                    if (errors.length > 0) {
                                        return res.status(422).json({ detail: 'Validation Error', errors });
                                    }
                                    value = instanceData;
                                } else {
                                    value = rawValue;
                                }
                            }
                            args[param.index] = value;
                        }
                        const result = await handler.apply(instance, args);
                        if (!res.headersSent) {
                            res.json(result);
                        }
                    } catch (error) {
                        const filters: ExceptionFilter[] = Reflect.getOwnMetadata(EXCEPTION_FILTER_METADATA_KEY, ControllerClass.prototype, route.methodName) || [];
                        if (filters.length > 0) {
                            filters.forEach(filter => filter.catch(error, { req, res }));
                        } else {
                            res.status(500).json({ detail: 'Internal Server Error', message: error.message });
                        }
                    }
                };
                (baseRouter as any)[route.method](fullPath, ...methodMiddleware.map(mw => async (req, res, next) => {
                    try {
                        await Promise.resolve(mw(req, res, next));
                    } catch (err) {
                        next(err);
                    }
                }), wrappedHandler);
            } else {
                console.error(`[LOTSHOT ERROR] Method ${route.methodName} not found on controller.`);
            }
        });
        this.provider.setBasePath(basePath, baseRouter);
    }

    private resolveController(ControllerClass: Function) {
        const instance = new (ControllerClass as any)();
        return instance;
    }

    public async listen(port: number) {
        return new Promise<void>((resolve) => {
            this.server = this.provider.listen(port, () => {
                console.log(`\n🎉 Lotshot API Server running on http://localhost:${port}`);
                resolve();
            });
        });
    }

    public enableWebSockets(server: Server) {
        this.wsProvider = new ExpressWebSocketProvider(server);
    }

    public getProviderApp() {
        return this.provider.getApp();
    }

    public getWebSocketProvider(): WebSocketProvider | undefined {
        return this.wsProvider;
    }
}

// --- Concrete Express Implementation ---
export class ExpressHttpProvider implements HttpProvider {
    private app: ExpressApp;
    private server: Server | null = null;

    constructor() {
        this.app = express();
        this.app.use((err: any, req: Request, res: Response, next: NextFunction) => {
            if (err) {
                console.error('[EXPRESS ERROR]', err);
                res.status(500).json({ detail: 'Unhandled Server Error', message: err.message });
            } else {
                next();
            }
        });
    }

    public getApp(): ExpressApp {
        return this.app;
    }

    public listen(port: number, callback: () => void): Server {
        this.server = this.app.listen(port, callback);
        return this.server;
    }

    public use(middleware: RequestHandler): void {
        this.app.use(middleware);
    }

    public registerRoute(method: RouteDefinition['method'], path: string, handler: RequestHandler): void {
        (this.app as any)[method](path, handler);
    }

    public setBasePath(basePath: string, router: Router): void {
        this.app.use(basePath, router);
    }
}

// --- WebSocket Provider ---
export class ExpressWebSocketProvider implements WebSocketProvider {
    private io: SocketIOServer;

    constructor(server: Server) {
        this.io = new SocketIOServer(server);
    }

    public on(connection: string, callback: (socket: any) => void): void {
        this.io.on(connection, callback);
    }

    public emit(event: string, data: any): void {
        this.io.emit(event, data);
    }
}
