import 'fetch-everywhere';
import { expect } from 'chai';
import { formatBearer, parseBearer } from '../../src/helpers/tokenFormatter';

describe('token formatter', () => {
  describe('formatBearer', () => {
    it ('should return null on empty value', () => {
      const result = formatBearer();
      expect(result).to.be.null;
    })

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


    it('should return null on invalid header value', () => {
      const result = parseBearer('bearer undefined');

      expect(result).to.be.null;
    });


    it('should return token value', () => {
      const result = parseBearer('bearer token');

      expect(result).to.not.be.null;
      expect(result).to.be.equal('token');
    });
  })
});