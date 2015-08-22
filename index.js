'use strict';

/**
 * Module dependencies.
 */

var debug = require('debug')('koa-ratelimit');
var Limiter = require('ratelimiter');
var ms = require('ms');
var thenify = require('thenify');
var _ = require('lodash');

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
    var id, opt;
    opt = getCurrentOpt(opts, this.request.url);

    opt.id = opt.id ? opt.id(this) : this.ip;
    if (!opt.id || opt.skip) return yield* next;

    var limiter  = new Limiter(opt);

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
  var currentOpt, optMatch, len = 0;
  opts.forEach(function(opt) {
    // Normalize input.
    opt.match = opt.match || [];
    // If `match` is empty -> match all routes.
    if (!opt.match.length && !currentOpt) {
      currentOpt = opt;
    }
    else {
      opt.match.forEach(function(path) {
        // If path === `/api/login` & matchAfter === true -> will match `/api/login/*``
        if (!optMatch && opt.matchAfter && ~currentUrl.indexOf(path) && path.length > len) {
          currentOpt =  opt;
          optMatch = true;
          len = path.length;
        }
        if (!optMatch && !opt.matchAfter && currentUrl === path) {
          currentOpt = opt;
          optMatch = true;
        }
      });
    }
  });
  return _.clone(currentOpt) || {};
};
