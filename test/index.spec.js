import 'fetch-everywhere';
import { expect } from 'chai';
import * as server from './server';
import { delayPromise } from './promiseHelpers';
import { formatBearer } from '../src/helpers/tokenFormatter';
import * as fetchInterceptor from '../src/index';

describe('fetch-intercept', function () {

  describe('refresh token is valid', () => {
    let accessToken = null;
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

    describe('headers are set', () => {
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

    it('should propagate 401 with invalid refresh token', function (done) {
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

    it('should fetch multiple requests successfully with access token expired', function (done) {
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
