import 'fetch-everywhere';
import { expect } from 'chai';
import * as server from './server';
import { delayPromise } from './promiseHelpers';
import { formatBearer } from '../src/helpers/tokenFormatter';
import { ERROR_INVALID_CONFIG } from '../src/const';
import * as fetchInterceptor from '../src/index';

const emptyConfiguration = {
  prepareRefreshTokenRequest: () => {},
  shouldIntercept: request => false,
  getAccessTokenFromResponse: () => {},
  setRequestAuthorization: () => {}
};

describe('fetch-intercept', function () {
  describe('should validate config', () => {
    beforeEach(done => {
      server.start(done);
    });

    afterEach(done => {
      server.stop(done);
    });

    it('shouldIntercept is not set throws', () => {
      fetchInterceptor.configure({
        ...emptyConfiguration,
        shouldIntercept: null,
      });

      expect(() => fetch('http://localhost:5000/200')).to.throw(Error, ERROR_INVALID_CONFIG);
    });

    it('setRequestAuthorization is not set throws', () => {
      fetchInterceptor.configure({
        ...emptyConfiguration,
        setRequestAuthorization: null,
      });

      expect(() => fetch('http://localhost:5000/200')).to.throw(Error, ERROR_INVALID_CONFIG);
    });

    it('getAccessTokenFromResponse is not set throws', () => {
      fetchInterceptor.configure({
        ...emptyConfiguration,
        getAccessTokenFromResponse: null,
      });

      expect(() => fetch('http://localhost:5000/200')).to.throw(Error, ERROR_INVALID_CONFIG);
    });

    it('prepareRefreshTokenRequest is not set throws', () => {
      fetchInterceptor.configure({
        ...emptyConfiguration,
        prepareRefreshTokenRequest: null,
      });

      expect(() => fetch('http://localhost:5000/200')).to.throw(Error, ERROR_INVALID_CONFIG);
    });
  });

  describe('should not change default fetch behaviour', () => {

    describe('server is running', () => {
      beforeEach(done => {
        fetchInterceptor.configure({
          prepareRefreshTokenRequest: () => {},
          shouldIntercept: request => false,
          getAccessTokenFromResponse: response => {},
          setRequestAuthorization: (request, token) => {}
        });

        server.start(done);
      });
      afterEach(done => {
        server.stop(done);
      });

      it('fetches with success for 200 response', done => {
        fetch('http://localhost:5000/200').then(() => {
          done();
        }).catch(err => {
          done(err);
        })
      });

      it('fetches with success for 401 response', done => {
        fetch('http://localhost:5000/401/1').then(() => {
          done();
        }).catch(err => {
          done(err);
        })
      });
    });

    describe('server is not running', () => {
      it('fails on server not started', done => {
        fetch('http://localhost:5000/401/1').then(() => {
          done('Should not end here');
        }).catch(() => {
          done();
        })
      });
    });
  });

  describe('refresh token is valid', () => {
    let accessToken = null;

    beforeEach(done => {
      fetchInterceptor.configure({
        prepareRefreshTokenRequest: refreshToken =>
          new Request('http://localhost:5000/token', {
            headers: { authorization: `Bearer ${refreshToken}` }
          }),
        shouldIntercept: request => request.url.toString() !== 'http://localhost:5000/token',
        getAccessTokenFromResponse: response =>
          response.json().then(jsonData => jsonData ? jsonData.accessToken : null),
        setRequestAuthorization: (request, token) => {
          request.headers.set('authorization', formatBearer(token));
          return request;
        },
        shouldInvalidateAccessToken: response => response.headers.get('invalidates-token'),
      });

      fetchInterceptor.authorize('refresh_token');
      server.start(done);
    });

    afterEach(done => {
      server.stop(done);
    });

    it('should fetch successfully with access token valid', function (done) {
      fetch('http://localhost:5000/200', {
        headers: { authorization: `Bearer ${accessToken}` }
      })
      .then((response)=> {
        expect(response.status).to.be.equal(200);
        done();
      })
      .catch(error => {
        done(error);
      });
    });

    it('should fetch successfully with access token empty', function (done) {
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

    it('should fetch successfully when access token is invalidated from response', function (done) {
      // set expired access token
      fetchInterceptor.authorize('refresh_token', 'token2');

      fetch('http://localhost:5000/401/1?invalidate=true').then(response => {
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
        return { first: results[0], second: results[1], third: results[2] }
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
        return { first: results[0], second: results[1], third: results[2] }
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

    describe('request has own headers', () => {
      it('should keep existing headers on request', function (done) {
        fetch('http://localhost:5000/headers', {
          headers: {
            'x-header': 'x-value'
          }
        })
        .then(response => {
          expect(response.status).to.be.equal(200);
          return response.json();
        })
        .then(data => {
          expect(data['x-header']).to.exist;
          expect(data['x-header']).to.be.equal('x-value');
          done();
        })
        .catch(error => {
          done(error);
        });
      });

      it('should override authorization header', function (done) {
        fetchInterceptor.authorize('refresh_token', 'access_token');
        fetch('http://localhost:5000/headers', {
          headers: {
            'authorization': 'test-authorization'
          }
        })
          .then(response => {
            expect(response.status).to.be.equal(200);
            return response.json();
          })
          .then(data => {
            expect(data['authorization']).to.exist;
            expect(data['authorization']).to.be.equal('Bearer access_token');
            done();
          })
          .catch(error => {
            done(error);
          });
      });
    })
  });

  describe('refresh token is invalid', () => {
    beforeEach(done => {
      fetchInterceptor.configure({
        prepareRefreshTokenRequest: refreshToken =>
          new Request('http://localhost:5000/token', {
            headers: { authorization: `Bearer ${refreshToken}`}
          }),
        shouldIntercept: request => request.url.toString() !== 'http://localhost:5000/token',
        getAccessTokenFromResponse: response =>
          response.json().then(jsonData => jsonData ? jsonData.accessToken : null),
        setRequestAuthorization: (request, token) => {
          request.headers.set('authorization', formatBearer(token));
          return request;
        }
      });
      fetchInterceptor.authorize('invalid_refresh_token');

      server.start(done);
    });

    afterEach(done => {
      server.stop(done);
    });

    it('should propagate 401 when refresh token is invalid', function (done) {
      fetch('http://localhost:5000/401/1').then(response=> {
        const tokens = fetchInterceptor.getAuthorization();

        expect(response.status).to.be.equal(401);

        expect(tokens.accessToken).to.be.null;
        expect(tokens.refreshToken).to.be.null;

        done();
      })
      .catch((error) => {
        done(error);
      });
    });

    it('should propagate 401 for multiple requests when refresh token is invalid', function (done) {
      Promise.all([
        fetch('http://localhost:5000/401/1?duration=100'),
        fetch('http://localhost:5000/401/2?duration=300'),
        fetch('http://localhost:5000/401/3?duration=100'),
      ])
      .then(results => {
        return { first: results[0], second: results[1], third: results[2] }
      })
      .then(responses => {

        expect(responses.first.status).to.be.equal(401);
        expect(responses.second.status).to.be.equal(401);
        expect(responses.third.status).to.be.equal(401);

        done();
      })
      .catch(error => {
        done(error);
      });
    });
  });
});
