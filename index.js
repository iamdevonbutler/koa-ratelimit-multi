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
 * Expose `ratelimit()`.
 */

module.exports = ratelimit;

/**
 * Initialize ratelimit middleware with the given `opts`:
 *
 * - `duration` {Number} limit duration in milliseconds [1 hour]
 * - `max` {Number}  max requests per `id` [2500]
 * - `db` {connection} database connection
 * - `id` {Function} id to compare requests [ip]
 * - `skip` {Boolean} if path matches, and skip === true, don't ratelimit [false]
 * - `match` {Array} array of Strings to match URL [*]
 * - `matchAfter` {Boolean} if path matches the begining of the URL,
 *    match everything after [false]
 *
 * @param {Array of Object(s)} opts
 * @return {Function}
 * @api public
 */

function ratelimit(opts) {
  opts = opts || [];

  return function *(next){
    var opt = getCurrentOpt(opts, this.request.url);
    if (!opt || opt.skip) return yield* next;
    let id = opt.id ? opt.id(this) : this.ip;
    var limiter  = new Limiter(Object.assign({}, opt, {id: id}));

    // initialize limiter
    limiter.get = thenify(limiter.get);
    // check limit
    var limit = yield limiter.get();
    // check if current call is legit
    var remaining = limit.remaining > 0 ? limit.remaining - 1 : 0;

    // header fields
    this.set('X-RateLimit-Limit', limit.total);
    this.set('X-RateLimit-Remaining', remaining);
    this.set('X-RateLimit-Reset', limit.reset);

    debug('remaining %s/%s %s', remaining, limit.total, id);
    if (limit.remaining) return yield* next;

    var delta = (limit.reset * 1000) - Date.now() | 0;
    var after = limit.reset - (Date.now() / 1000) | 0;
    this.set('Retry-After', after);
    this.status = 429;
    this.body = 'Rate limit exceeded, retry in ' + ms(delta, { long: true });
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
