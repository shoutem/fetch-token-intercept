import 'fetch-everywhere';
import { expect } from 'chai';
import * as http from '../../src/services/http';

describe('services', () => {
  describe('http', () => {
    describe('isResponseOk', () => {
      it('should return false on empty response', () => {
        expect(http.isResponseOk(null)).to.be.false;
      });

      it('should return false on non-OK response', () => {
        expect(http.isResponseOk(new Response({}, { status: 401 }))).to.be.false;
      });

      it('should return true on OK response', () => {
        expect(http.isResponseOk(new Response({}, { status: 200 }))).to.be.true;
      });
    });

    describe('isResponseUnauthorized', () => {
      it('should return false on empty response', () => {
        expect(http.isResponseUnauthorized(null)).to.be.false;
      });

      it('should return false on authorized response', () => {
        expect(http.isResponseUnauthorized(new Response({}, { status: 200 }))).to.be.false;
      });

      it('should return true on unauthorized response', () => {
        expect(http.isResponseUnauthorized(new Response({}, { status: 401 }))).to.be.true;
      });
    });
  });
});

