import { expect } from 'chai';
import { parseBearer } from '../../src/helpers/tokenFormatter';
import { formatBearer } from '../helpers/tokenFormatter';

describe('token formatter', () => {
  describe('formatBearer', () => {
    it('should return null on empty value', () => {
      const result = formatBearer();
      expect(result).to.be.null;
    });

    it('should return formatted value for header', () => {
      const result = formatBearer('token');

      expect(result).not.to.be.null;
      expect(result).to.be.equal('Bearer token');
    })
  });

  describe('parseBearer', () => {
    it('should return null on empty header value', () => {
      const result = parseBearer();

      expect(result).to.be.null;
    });

    it('should return null on invalid header parts', () => {
      const result = parseBearer('bearervalue');

      expect(result).to.be.null;
    });

    it('should return token value', () => {
      const result = parseBearer('Bearer token');

      expect(result).to.not.be.null;
      expect(result).to.be.equal('token');
    });
  })
});
