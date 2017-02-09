import 'fetch-everywhere';
import { expect } from 'chai';
import sinon from 'sinon';
import * as fetchInterceptor from '../src/index';
import * as server from './server';

describe('fetch-intercept', function () {

  describe('refresh token is valid', () => {
    let accessToken = null;
    beforeEach(done => {
      fetchInterceptor.configure({
        refreshEndpoint: 'http://localhost:5000/token',
        onUnauthorized: () => {
          console.log('Refresh token is now unauthorized');
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

    it('should fetch multiple resources and retain order', function (done) {
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
  });

  describe('refresh token is invalid', () => {
    const onUnauthorizedSpy = sinon.spy();

    before(done => {
      fetchInterceptor.configure({
        refreshEndpoint: 'http://localhost:5000/token',
        onUnauthorized: onUnauthorizedSpy,
      });

      fetchInterceptor.authorize('invalid_refresh_token');

      server.start(done);
    });

    after(done => {
      server.stop(done);
    });

    it('should propagate 401 with invalid refresh token', function (done) {
      fetch('http://localhost:5000/401/1').then(()=> {
        done('Should not end up here');
      })
      .catch(() => {
        const tokens = fetchInterceptor.getAuthorization();

        expect(tokens.accessToken).to.be.null;
        expect(tokens.refreshToken).to.be.null;

        sinon.assert.calledOnce(onUnauthorizedSpy);

        done();
      });
    });
  });
});
