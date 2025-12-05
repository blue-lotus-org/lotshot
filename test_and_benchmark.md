Simple Test & Benchmark

## **1. Writing Tests with Jest**

### **Install Jest and Related Packages**
```bash
npm install --save-dev jest ts-jest @types/jest supertest @types/supertest
```

### **Jest Configuration**
Add a `jest.config.js` file:
```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
};
```

### **Unit Tests**
#### **a. Test the DI Container**
```typescript
// di.container.test.ts
import { SimpleDIContainer } from '../lotshot';

describe('SimpleDIContainer', () => {
  let container: SimpleDIContainer;

  beforeEach(() => {
    container = new SimpleDIContainer();
  });

  it('should register and resolve a service', () => {
    const token = 'testService';
    const value = { name: 'test' };
    container.register(token, value);
    expect(container.resolve(token)).toEqual(value);
  });

  it('should throw an error if service not found', () => {
    const token = 'nonExistentService';
    expect(() => container.resolve(token)).toThrow();
  });

  it('should register and resolve a singleton', () => {
    const token = 'singletonService';
    const value = { name: 'singleton' };
    container.registerSingleton(token, value);
    expect(container.resolve(token)).toEqual(value);
  });
});
```

#### **b. Test the App Class**
```typescript
// app.test.ts
import { App, ExpressHttpProvider } from '../lotshot';
import request from 'supertest';

describe('App', () => {
  let app: App;
  let expressProvider: ExpressHttpProvider;

  beforeEach(() => {
    expressProvider = new ExpressHttpProvider();
    app = new App(expressProvider);
  });

  it('should register a controller', async () => {
    @Controller('/test')
    class TestController {
      @Get()
      getTest() {
        return { message: 'Hello, World!' };
      }
    }
    app.registerController(TestController);
    const server = app.getProviderApp();
    const response = await request(server).get('/test');
    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Hello, World!');
  });
});
```

#### **c. Test Middleware**
```typescript
// middleware.test.ts
import { Use, MiddlewareFunction } from '../lotshot';
import request from 'supertest';
import { App, ExpressHttpProvider } from '../lotshot';

describe('Middleware', () => {
  let app: App;
  let expressProvider: ExpressHttpProvider;

  beforeEach(() => {
    expressProvider = new ExpressHttpProvider();
    app = new App(expressProvider);
  });

  it('should apply middleware', async () => {
    const testMiddleware: MiddlewareFunction = (req, res, next) => {
      req['test'] = true;
      next();
    };

    @Controller('/test')
    @Use(testMiddleware)
    class TestController {
      @Get()
      getTest(req: any) {
        return { test: req.test };
      }
    }

    app.registerController(TestController);
    const server = app.getProviderApp();
    const response = await request(server).get('/test');
    expect(response.status).toBe(200);
    expect(response.body.test).toBe(true);
  });
});
```

#### **d. Test Validation**
```typescript
// validation.test.ts
import { Body, Post, Controller } from '../lotshot';
import { validate, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import request from 'supertest';
import { App, ExpressHttpProvider } from '../lotshot';

class TestDto {
  name: string;
}

describe('Validation', () => {
  let app: App;
  let expressProvider: ExpressHttpProvider;

  beforeEach(() => {
    expressProvider = new ExpressHttpProvider();
    app = new App(expressProvider);
  });

  it('should validate request body', async () => {
    @Controller('/test')
    class TestController {
      @Post()
      create(@Body(TestDto) body: TestDto) {
        return body;
      }
    }

    app.registerController(TestController);
    const server = app.getProviderApp();

    // Valid request
    const validResponse = await request(server)
      .post('/test')
      .send({ name: 'test' });
    expect(validResponse.status).toBe(200);

    // Invalid request
    const invalidResponse = await request(server)
      .post('/test')
      .send({});
    expect(invalidResponse.status).toBe(422);
  });
});
```

---

## **2. Benchmarking Lotshot vs. Fastify vs. NestJS**

### **Install Benchmarking Tools**
```bash
npm install --save-dev autocannon
```

### **Benchmark Script**
Create a `benchmark.ts` file:
```typescript
// benchmark.ts
import autocannon from 'autocannon';
import { App, ExpressHttpProvider } from './lotshot';
import { Controller, Get } from './lotshot';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import fastify from 'fastify';

// --- Lotshot ---
@Controller('/lotshot')
class LotshotController {
  @Get()
  getHello() {
    return { message: 'Hello from Lotshot!' };
  }
}

async function runLotshot() {
  const expressProvider = new ExpressHttpProvider();
  const app = new App(expressProvider);
  app.registerController(LotshotController);
  await app.listen(3000);
  console.log('Lotshot server running on port 3000');
}

// --- Fastify ---
async function runFastify() {
  const fastifyApp = fastify();
  fastifyApp.get('/fastify', () => ({ message: 'Hello from Fastify!' }));
  await fastifyApp.listen(3001);
  console.log('Fastify server running on port 3001');
}

// --- NestJS ---
@Controller('/nestjs')
class NestJSController {
  @Get()
  getHello() {
    return { message: 'Hello from NestJS!' };
  }
}

@Module({
  controllers: [NestJSController],
})
class AppModule {}

async function runNestJS() {
  const nestApp = await NestFactory.create(AppModule);
  await nestApp.listen(3002);
  console.log('NestJS server running on port 3002');
}

// --- Express ---
async function runExpress() {
  const expressApp = express();
  expressApp.get('/express', (req, res) => res.json({ message: 'Hello from Express!' }));
  expressApp.listen(3003, () => console.log('Express server running on port 3003'));
}

// --- Benchmark ---
async function benchmark(url: string, name: string) {
  const result = await autocannon({
    url,
    connections: 100,
    duration: 10,
  });
  console.log(`\n${name} Benchmark Results:`);
  console.log(`Requests/sec: ${result.requests.average}`);
  console.log(`Latency (avg): ${result.latency.average}ms`);
}

async function runBenchmarks() {
  await runLotshot();
  await runFastify();
  await runNestJS();
  await runExpress();

  // Wait for servers to start
  await new Promise((resolve) => setTimeout(resolve, 2000));

  await benchmark('http://localhost:3000/lotshot', 'Lotshot');
  await benchmark('http://localhost:3001/fastify', 'Fastify');
  await benchmark('http://localhost:3002/nestjs', 'NestJS');
  await benchmark('http://localhost:3003/express', 'Express');
}

runBenchmarks().catch(console.error);
```

### **Run the Benchmark**
```bash
npx ts-node benchmark.ts
```

---

## **3. Expected Benchmark Results**
| Framework  | Requests/sec | Latency (avg) |
|------------|--------------|---------------|
| **Fastify** | ~x0,000      | ~2ms          |
| **Lotshot** | ~x0,000      | ~3ms          |
| **Express** | ~x5,000      | ~4ms          |
| **NestJS**  | ~x0,000      | ~5ms          |

**Note**: Results may vary based on your machine and setup. Fastify is generally the fastest due to its lightweight design, while NestJS is slower due to its abstraction layers.

---

## **4. Summary**
- **Tests**: Use Jest and Supertest to write unit and integration tests.
- **Benchmark**: Use `autocannon` to compare performance with Fastify, NestJS, and Express.
- **Optimize**: If Lotshot is slower than expected, consider optimizing middleware and validation logic.

---

> Closed by mosi
