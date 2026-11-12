import process from 'node:process';
export default {
  transpilePackages: ['@flagpole/shared', '@flagpole/evaluator'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL ?? 'http://localhost:4000'}/api/:path*`,
      },
    ];
  },
};
