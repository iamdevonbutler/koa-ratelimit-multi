# koa-ratelimit-multi

Rate limiter middleware for koa - forked to allow multiple limits on a per path basis.

For use w/ Koa 2.0 and Node JS > 6.7.x.

Version 1.x is compatible w/ Koa 1.

## Installation

```javascript
$ npm install koa-ratelimit-mulit --save
```

## Example

```javascript
const ratelimit = require('koa-ratelimit-multi');
const redis = require('redis');
const Koa = require('koa');
const app = new Koa();

const db = redis.createClient();
app.use(ratelimit(db, [
  {
    // Catch all route.
    test: ['*']
    duration: 60000,
    max: 100,
    id: function (ctx) {
      return 'all'+ctx.ip;
    }
  },
  {
    test: ['/users/*'],
    duration: 1000,
    max: 100,
    id: function (ctx) {
      return 'auth'+ctx.ip;
    }
  },
  {
    // skip == true, wont limit this route
    skip: true
    test: ['/skip/this/route'],
    duration: 1000,
    max: 100,
    id: function (ctx) {
      return 'auth'+ctx.ip;
    }
  }
]));

app.listen(3000);
```

## Options

 - `test` {Array} array of Strings to match URL
 - `max` {Number} max requests within `duration` [2500]
 - `duration` {Number} of limit in milliseconds [3600000]
 - `id` {Function} id to compare requests [ip]
 - `skip` {Boolean} if path matches, and skip === true, don't ratelimit [false]

## Responses

Example 200 with header fields:

```
HTTP/1.1 200 OK
X-Powered-By: koa
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1384377793
Content-Type: text/plain; charset=utf-8
Content-Length: 6
Date: Wed, 13 Nov 2013 21:22:13 GMT
Connection: keep-alive

Stuff!
```

  Example 429 response:

```
HTTP/1.1 429 Too Many Requests
X-Powered-By: koa
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1384377716
Content-Type: text/plain; charset=utf-8
Content-Length: 39
Retry-After: 7
Date: Wed, 13 Nov 2013 21:21:48 GMT
Connection: keep-alive

Rate limit exceeded, retry in 8 seconds
```

## License

MIT
