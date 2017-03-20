import 'fetch-everywhere';
import {expect} from 'chai';
import * as server from './helpers/server';
import {delayPromise} from './helpers/promiseHelpers';
import {formatBearer} from './helpers/tokenFormatter';
import {ERROR_INVALID_CONFIG} from '../src/const';
import * as fetchInterceptor from '../src/index';
import sinon from 'sinon';

const configuration = config => ({
  fetchRetryCount: 1,
  createAccessTokenRequest: refreshToken =>
    new Request('http://localhost:5000/token', {
      headers: {
        authorization: `Bearer ${refreshToken}`
      }
    }),
  shouldIntercept: request => request.url.toString() !== 'http://localhost:5000/token',
  parseAccessToken: response =>
    response.json().then(jsonData => jsonData ? jsonData.accessToken : null),
  authorizeRequest: (request, token) => {
    request.headers.set('authorization', formatBearer(token));
    return request;
  },
  onAccessTokenChange: null,
  onResponse: null,
  ...config,
});

describe('fetch-intercept', function () {
  describe('configure', () => {
    beforeEach(done => {
      server.start(done);
    });

    afterEach(done => {
      server.stop(done);
    });

    it('throws if shouldIntercept is not set', () => {
      const config = configuration({
        shouldIntercept: null,
      });

      expect(() => fetchInterceptor.configure(config)).to.throw(Error, ERROR_INVALID_CONFIG);
    });

    it('throws if authorizeRequest is not set', () => {
      const config = configuration({
        authorizeRequest: null,
      });

      expect(() => fetchInterceptor.configure(config)).to.throw(Error, ERROR_INVALID_CONFIG);
    });

    it('throws if parseAccessToken is not set', () => {
      const config = configuration({
        parseAccessToken: null,
      });

      expect(() => fetchInterceptor.configure(config)).to.throw(Error, ERROR_INVALID_CONFIG);
    });

    it('throws if createAccessTokenRequest is not set', () => {
      const config = configuration({
        createAccessTokenRequest: null,
      });

      expect(() => fetchInterceptor.configure(config)).to.throw(Error, ERROR_INVALID_CONFIG);
    });
  });

  describe('authorize', function() {
    it('sets authorization tokens', function() {
      fetchInterceptor.configure(configuration());
      fetchInterceptor.authorize('refreshToken', 'accessToken');

      const { refreshToken, accessToken } = fetchInterceptor.getAuthorization();
      expect('refreshToken', refreshToken);
      expect('accessToken', accessToken);
    });
  });

  describe('clear', function() {
    it('removes authorizaton tokens', function() {
      fetchInterceptor.configure(configuration());
      fetchInterceptor.authorize('refreshToken', 'accessToken');
      fetchInterceptor.clear();

      const { refreshToken, accessToken } = fetchInterceptor.getAuthorization();
      expect(refreshToken).to.be.null;
      expect(accessToken).to.be.null;
    });
  });

  describe('should not change default fetch behaviour', () => {
    describe('server is running', () => {
      beforeEach(done => {
        fetchInterceptor.configure(configuration());
        server.start(done);
      });

      afterEach(done => {
        server.stop(done);
      });

      it('fetch success for 200 response', done => {
        fetch('http://localhost:5000/200').then(() => {
          done();
        }).catch(err => {
          done(err);
        })
      });

      it('fetch success for 401 response', done => {
        fetch('http://localhost:5000/401/1').then(() => {
          done();
        }).catch(err => {
          done(err);
        })
      });
    });

    describe('server is not running', () => {
      it('fetch exception on network error', done => {
        fetchInterceptor.configure(configuration());

        fetch('http://localhost:5000/401/1').then(() => {
          done('Should not end here');
        }).catch(() => {
          done();
        })
      });

      it('fetch exception on network error with intercept disabled', done => {
        fetchInterceptor.configure(configuration({ shouldIntercept: () => false }));

        fetch('http://localhost:5000/401/1').then(() => {
          done('Should not end here');
        }).catch(() => {
          done();
        })
      });
    });
  });

  describe('request headers', () => {
    beforeEach(done => {
      fetchInterceptor.configure(configuration());
      fetchInterceptor.authorize('refresh_token', 'token2');

      server.start(done);
    });

    afterEach(done => {
      server.stop(done);
    });

    it('should keep existing headers on request', function (done) {
      fetch('http://localhost:5000/headers', {
        headers: {
          'x-header': 'x-value'
        }
      }).then(response => {
        expect(response.status).to.be.equal(200);
        return response.json();
      }).then(data => {
        expect(data['x-header']).to.exist;
        expect(data['x-header']).to.be.equal('x-value');
        done();
      }).catch(error => {
        done(error);
      });
    });

    it('should override authorization header', function (done) {
      fetch('http://localhost:5000/headers', {
        headers: {
          'authorization': 'test-authorization'
        }
      }).then(response => {
        expect(response.status).to.be.equal(200);
        return response.json();
      }).then(data => {
        expect(data['authorization']).to.exist;
        expect(data['authorization']).to.be.equal('Bearer token2');
        done();
      }).catch(error => {
        done(error);
      });
    });
  })

  describe('refresh token is valid', () => {
    beforeEach(done => {
      fetchInterceptor.configure(configuration());
      server.start(done);
    });

    afterEach(done => {
      server.stop(done);
    });

    it('should fetch successfully with access token empty', function (done) {
      fetchInterceptor.authorize('refresh_token');

      fetch('http://localhost:5000/401/1').then(response => {
        expect(response.status).to.be.equal(200);
        return response.json();
      })
      .then(data => {
        expect(data.value).to.be.equal('1');
        done();
      })
      .catch(error => {
        done(error);
      });
    });

    it('should fetch successfully with access token expired', function (done) {
      // set expired access token
      fetchInterceptor.authorize('refresh_token', 'token1');

      fetch('http://localhost:5000/401/1').then(response => {
        expect(response.status).to.be.equal(200);
        return response.json();
      })
        .then(data => {
          expect(data.value).to.be.equal('1');
          done();
        })
        .catch(error => {
          done(error);
        });
    });

    it('should fetch successfully with access token valid', function (done) {
      fetchInterceptor.authorize('refresh_token', 'token2');

      fetch('http://localhost:5000/200')
        .then((response) => {
          expect(response.status).to.be.equal(200);
          done();
        })
        .catch(error => {
          done(error);
        });
    });

    it('should fetch successfully when access token is invalidated from response', function (done) {
      // set expired access token
      fetchInterceptor.configure(configuration({ shouldInvalidateAccessToken: () => true }));
      fetchInterceptor.authorize('refresh_token', 'token2');

      fetch('http://localhost:5000/401/1').then(response => {
        expect(response.status).to.be.equal(200);
        return response.json();
      })
      .then(data => {
        expect(data.value).to.be.equal('1');
        done();
      })
      .catch(error => {
        done(error);
      });
    });

    it('should fetch multiple simultaneous requests successfully with access token expired', function (done) {
      // set expired access token
      fetchInterceptor.authorize('refresh_token', 'token1');

      Promise.all([
        fetch('http://localhost:5000/401/1?duration=100'),
        fetch('http://localhost:5000/401/2?duration=300'),
        fetch('http://localhost:5000/401/3?duration=100'),
      ])
        .then(results => {
          return {first: results[0], second: results[1], third: results[2]}
        })
        .then(responses => {
          expect(responses.first.status).to.be.equal(200);
          expect(responses.second.status).to.be.equal(200);
          expect(responses.third.status).to.be.equal(200);

          done();
        })
        .catch(error => {
          done(error);
        });
    });

    it('should fetch multiple requests successfully with access token expired', function (done) {
      // set expired access token
      fetchInterceptor.authorize('refresh_token', 'token1');

      Promise.all([
        fetch('http://localhost:5000/401/1?duration=100'),
        Promise.resolve(delayPromise(100)).then(() => fetch('http://localhost:5000/401/2?duration=300')),
        Promise.resolve(delayPromise(200)).then(() => fetch('http://localhost:5000/401/2?duration=100')),
      ])
        .then(results => {
          return {first: results[0], second: results[1], third: results[2]}
        })
        .then(responses => {

          expect(responses.first.status).to.be.equal(200);
          expect(responses.second.status).to.be.equal(200);
          expect(responses.third.status).to.be.equal(200);

          done();
        })
        .catch(error => {
          done(error);
        });
    });

    it('should stop after retry count is exceeded and resolve unauthorized', function(done) {
      const config = configuration({
        createAccessTokenRequest: refreshToken =>
          new Request('http://localhost:5000/token?invalid=true', {
            headers: {
              authorization: `Bearer ${refreshToken}`
            }
          }),
        fetchRetryCount: 5,
      });
      fetchInterceptor.configure(config);
      fetchInterceptor.authorize('refresh_token', 'token1');

      fetch('http://localhost:5000/401/1').then(response => {
        expect(response.status).to.be.equal(401);
        done();
      })
      .catch(error => {
        done(error);
      });
    });

    it('should stop after retry count is exceeded with onResponse called once', function(done) {
      const onResponse = sinon.spy();
      const config = configuration({
        createAccessTokenRequest: refreshToken =>
          new Request('http://localhost:5000/token?invalid=true', {
            headers: {
              authorization: `Bearer ${refreshToken}`
            }
          }),
        fetchRetryCount: 5,
        onResponse,
      });
      fetchInterceptor.configure(config);
      fetchInterceptor.authorize('refresh_token', 'token1');

      fetch('http://localhost:5000/401/1').then(response => {
        expect(response.status).to.be.equal(401);
        sinon.assert.calledOnce(onResponse);
        done();
      })
      .catch(error => {
        done(error);
      });
    });
  });

  describe('refresh token is invalid', () => {
    beforeEach(done => {
      fetchInterceptor.configure(configuration());
      fetchInterceptor.authorize('invalid_refresh_token');

      server.start(done);
    });

    afterEach(done => {
      server.stop(done);
    });

    it('should propagate 401 for single request', function (done) {
      fetch('http://localhost:5000/401/1').then(response => {
        const { refreshToken, accessToken } = fetchInterceptor.getAuthorization();

        expect(response.status).to.be.equal(401);

        expect(refreshToken).to.be.null;
        expect(accessToken).to.be.null;

        done();
      })
      .catch((error) => {
        done(error);
      });
    });

    it('should propagate 401 for multiple requests', function (done) {
      Promise.all([
        fetch('http://localhost:5000/401/1?duration=100'),
        fetch('http://localhost:5000/401/2?duration=300'),
        fetch('http://localhost:5000/401/3?duration=100'),
      ])
      .then(results => {
        return {first: results[0], second: results[1], third: results[2]}
      })
      .then(responses => {
        expect(responses.first.status).to.be.equal(401);
        expect(responses.second.status).to.be.equal(401);
        expect(responses.third.status).to.be.equal(401);

        const tokens = fetchInterceptor.getAuthorization();

        expect(tokens.accessToken).to.be.null;
        expect(tokens.refreshToken).to.be.null;

        done();
      })
      .catch(error => {
        done(error);
      });
    });
  });
});
