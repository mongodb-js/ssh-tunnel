import SSHTunnel from './index';

describe('SSHTunnel', () => {
  it('should be main export', () => {
    expect(new SSHTunnel()).toBeInstanceOf(SSHTunnel);
  });
});
