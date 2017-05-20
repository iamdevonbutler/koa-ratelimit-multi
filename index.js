'use strict';

/**
 * Module dependencies.
 */

const debug = require('debug')('koa-ratelimit-multi');
const Limiter = require('ratelimiter');
const ms = require('ms');
const thenify = require('thenify');
const wildcard = require('wildcard');

/**
 * @param {Object} db
 * @param {Array of Objects} opts
 *   `test` {Array} array of Strings to match URL
 *   `duration` {Number} limit duration in milliseconds [1 hour]
 *   `max` {Number}  max requests per `id` [2500]
 *   `id` {Function} id to compare requests [ip]
 *   `skip` {Boolean} if path matches, and skip === true, don't ratelimit [false]
 * @return {Function}
 * @api public
 */

module.exports = function ratelimit(db, opts = []) {
  if (!db) {
    throw 'You must supply a db object to koa-ratelimit-multi. Try redis.createClient().';
  }
  return async function (ctx, next){
    var opt = getCurrentOpt(opts, ctx.request.url);

    if (!opt || opt.skip) return await next();

    let id = opt.id ? opt.id.call(null, ctx) : ctx.ip;
    const obj = Object.assign({}, {db}, opt, {id});
    var limiter  = new Limiter(obj);

    // Initialize limiter.
    limiter.get = thenify(limiter.get);
    // Check limit.
    var limit = await limiter.get();
    // Check if current call is legit.
    var remaining = limit.remaining > 0 ? limit.remaining - 1 : 0;

    // Header fields.
    ctx.set('X-RateLimit-Limit', limit.total);
    ctx.set('X-RateLimit-Remaining', remaining);
    ctx.set('X-RateLimit-Reset', limit.reset);

    debug('remaining %s/%s %s', remaining, limit.total, id);
    if (limit.remaining) return await next();

    var delta = (limit.reset * 1000) - Date.now() | 0;
    var after = limit.reset - (Date.now() / 1000) | 0;
    ctx.set('Retry-After', after);
    ctx.status = 429;
    ctx.body = 'Rate limit exceeded, retry in ' + ms(delta, { long: true });
  }
}

function getCurrentOpt(opts, currentUrl) {
  var catchAll;
  // Itterate over each option.
  for (let i in opts) {
    let opt = opts[i];
    // Test each route against the current url.
    for (let ii in opt.test) {
      let test = opt.test[ii];
      // Save this badboy until the end.
      if (test === '*') {
        catchAll = opt;
      }
      else {
        if (wildcard(test, currentUrl)) {
          return opt;
        }
      }
    }
  }
  return catchAll ? catchAll : null;
};
