var koa = require('koa');
var request = require('supertest');
var should = require('should');
var redis = require('redis');

var ratelimit = require('..');

var db = redis.createClient();

describe('koa-ratelimit-multi', function() {
  var rateLimitDuration = 1000;
  var goodBody = "Num times hit: ";

  before(function(done) {
    db.keys('limit:*', function(err, rows) {
      rows.forEach(db.del, db);
    });
    done();
  });

  describe('multiple values', function() {
    var guard;
    var app;

    beforeEach(function(done) {
      app = new koa();
      app.use(ratelimit(db, [
        {
          test: ['*'],
          duration: rateLimitDuration,
          max: 1000,
          id: function(ctx) {
            return 'api'+ctx.ip;
          }
        },
        {
          test: ['/users', '/user'],
          duration: rateLimitDuration,
          max: 10
        },
        {
          test: ['/wildcard/*'],
          duration: rateLimitDuration,
          max: 10,
        },
        {
          test: ['/skip/*'],
          duration: rateLimitDuration,
          max: 10,
          skip: true
        }
      ]));
      done();
    });

    it('Should limit a matching route', function(done) {
      request(app.listen())
        .get('/users')
        .expect('X-RateLimit-Remaining', 9)
        .end(done);
    });

    it('Should limit a wildcard route', function(done) {
      request(app.listen())
        .get('/wildcard/route')
        .expect('X-RateLimit-Remaining', 8)
        .end(done);
    });
    it('Should not limit matching routes when skip is `true`', function(done) {
      request(app.listen())
        .get('/skip/me')
        .end(function(error, response){
          if (error) {
            return done(error);
          }
          var isHeaderPresent = response.header['X-RateLimit-Remaining'] !== undefined;
          isHeaderPresent.should.not.be.ok;
          done();
        });
    });
    it('Should limit all paths when a catch all route is given', function(done) {
      request(app.listen())
        .get('/eggs')
        .expect('X-RateLimit-Remaining', 999)
        .end(done);
    });

  });

  describe('limit', function() {
    var guard;
    var app;

    var routeHitOnlyOnce = function() {
      guard.should.be.equal(1);
    };

    beforeEach(function(done) {
      app = new koa();
      app.use(ratelimit(db ,[{
        test: ['*'],
        duration: rateLimitDuration,
        max: 1
      }]));

      app.use(function(ctx, next) {
        guard++;
        ctx.body = goodBody + guard;
      });

      guard = 0;
      setTimeout(function() {
        request(app.listen())
          .get('/')
          .expect(200, goodBody + "1")
          .expect(routeHitOnlyOnce)
          .end(done);
      }, rateLimitDuration);
    });

    it('responds with 429 when rate limit is exceeded', function(done) {
      request(app.listen())
        .get('/')
        .expect('X-RateLimit-Remaining', 0)
        .expect(429)
        .end(done);
    });

    it('should not yield downstream if ratelimit is exceeded', function(done) {
      request(app.listen())
        .get('/')
        .expect(429)
        .end(function() {
          routeHitOnlyOnce();
          done();
        });
    });
  });

  describe('id', function (done) {
    it('should allow specifying a custom `id` function', function (done) {
      var app = new koa();

      app.use(ratelimit(db, [{
        test: ['*'],
        max: 1,
        id: function (ctx) {
          return ctx.request.header.foo;
        }
      }]));

      request(app.listen())
        .get('/')
        .set('foo', 'bar')
        .expect(function(res) {
          res.header['x-ratelimit-remaining'].should.equal('0');
        })
        .end(done);
    });

    it('should not limit if `id` returns `false`', function (done) {
      var app = new koa();
      app.use(ratelimit(db, [{
        id: function (ctx) {
          return false;
        },
        max: 5
      }]));

      request(app.listen())
        .get('/')
        .expect(function(res) {
          res.header.should.not.have.property('x-ratelimit-remaining');
        })
        .end(done);
    });

    it('should limit using the `id` value', function (done) {
      var app = new koa();

      app.use(ratelimit(db, [{
        max: 1,
        id: function (ctx) {
          return ctx.request.header.foo;
        }
      }]));

      app.use(function(ctx, next) {
        ctx.body = ctx.request.header.foo;
      });

      request(app.listen())
        .get('/')
        .set('foo', 'bar')
        .expect(200, 'bar')
        .end(function() {
          request(app.listen())
            .get('/')
            .set('foo', 'biz')
            .expect(200, 'biz')
            .end(done);
        });
    });
  });
});
