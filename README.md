# depinj-express
An integration of [depinj](https://github.com/sj-freitas/depinj) with [express](https://github.com/expressjs/express). 

## Usage

Installation
`npm install --save depinj-express`

Example
```js
import { Builder, Injector, ScopeType } from 'depinj-js';
import { toInjectedMiddleware } from 'depinj-express';
import { Router } from 'express';

class RequestsCounter {
  private track: number;

  constructor(initialState: number = 0) {
    this.track = initialState;
  }

  public increment(): void {
    this.track++;
  }

  public getValue(): number {
    return this.track;
  }
}

const incrementHandler = (counter) => (req, res, next) => {
    counter.increment();
    next();
}
const getValueHandler = (counter) => (req, res, next) => {
    res.json({ value: counter.getValue() });
    next();
}

// Registering instances
const builder = new Builder()
    .addType('RequestsCounter', RequestsCounter, [], ScopeType.SingleInstance)
    .add('IncrementingMiddleware', incrementHandler, ['Counter'], ScopeType.Transient);
    .add('GetValueMiddleware', getValueHandler, ['Counter'], ScopeType.Transient);

const registry = builder.build();

// Retrieving instances
const injector = new Injector(registry);
const counterHandler = toInjectedMiddleware(injector, 'IncrementingMiddleware');
const showCounterHandler = toInjectedMiddleware(injector, 'GetValueMiddleware');
const router = Router();

router.post('/counter', counterHandler);
router.get('/counter', showCounterHandler);
```

Check the [example repository](https://github.com/sj-freitas/depinj-express-example) for more use cases.

## How it works?
This works by injecting the dependency context to the express request, this means that it's the request that keeps the instances state. Also it ensures that the `onScopeEnd` function is called by binding it with the `res.on('finish)` event.

To inject a middleware to an `Injector`, all that's needed is for the middleware to be registered as a service, this means that the middleware needs to be in the `Register`. Once that is done, just call the function `toInjectedMiddleware` with the `Injector` instance and the service key. This function will return an express `handler`.
