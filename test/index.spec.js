import 'fetch-everywhere';
import { expect } from 'chai';
import * as server from './helpers/server';
import config from './helpers/defaultConfigFactory';
import * as fetchInterceptor from '../src';

describe('index', function() {
  beforeEach(done => {
    fetchInterceptor.unload();
    server.start(done);
  });

  afterEach(done => {
    server.stop(done);
  });

  describe('configure', function() {
    it('should initialize interceptor', function (){
      fetchInterceptor.configure(config());

      expect(fetchInterceptor.isActive()).to.not.be.empty;
    });
  });

  describe('getAuthorization', function() {
    it('should return empty authorization', function (){
      fetchInterceptor.configure(config());

      const { refreshToken, accessToken } = fetchInterceptor.getAuthorization();

      expect(refreshToken).to.be.null;
      expect(accessToken).to.be.null;
    });

    it('should return empty authorization after clearing', function (){
      fetchInterceptor.configure(config());
      fetchInterceptor.authorize('refresh-token', 'access-token');
      fetchInterceptor.clear();

      const { refreshToken, accessToken } = fetchInterceptor.getAuthorization();

      expect(refreshToken).to.be.null;
      expect(accessToken).to.be.null;
    });

    it('should return authorization keys when authorized', function (){
      fetchInterceptor.configure(config());
      fetchInterceptor.authorize('refresh-token', 'access-token');

      const { refreshToken, accessToken } = fetchInterceptor.getAuthorization();

      expect(refreshToken).to.equal('refresh-token');
      expect(accessToken).to.equal('access-token');
    });
  });

  describe('unload', function() {
    it('should unload and detach interceptor', function (){
      fetchInterceptor.configure(config());
      fetchInterceptor.unload();

      expect(fetchInterceptor.isActive()).to.be.false;
    });
  });
});